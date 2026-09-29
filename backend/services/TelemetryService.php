<?php
/**
 * PowerNet Telemetry Service
 * Ingestion, validation, real-time metrics, historical aggregation, and event logs
 * Simplified: Direct device_id ingestion without token overhead
 */

declare(strict_types=1);

namespace PowerNet\Services;

use PDO;
use PDOException;
use Exception;
use PowerNet\Database\Connection;
use PowerNet\Config\Env;

require_once dirname(__DIR__) . '/database/connection.php';
require_once dirname(__DIR__) . '/config/env.php';

class TelemetryService
{
    // Every reading column of the telemetry table: [min, max, decimals, unit]. All are nullable:
    // NULL = not measured (the PM2130D has no temperature sensor; PF is undefined with no load; a failed Modbus group).
    // voltage_1..3 = line-to-neutral V1N-V3N, voltage_ll_1..3 = line-to-line V12/V23/V31,
    // power / power_factor = the meter's total (4th) value, voltage / current = average of the measured phases.
    private const READINGS = [
        'voltage'        => [0, 500, 2, 'V'],
        'voltage_1'      => [0, 500, 2, 'V'],
        'voltage_2'      => [0, 500, 2, 'V'],
        'voltage_3'      => [0, 500, 2, 'V'],
        'voltage_ll_1'   => [0, 900, 2, 'V'],
        'voltage_ll_2'   => [0, 900, 2, 'V'],
        'voltage_ll_3'   => [0, 900, 2, 'V'],
        'current'        => [0, 200, 2, 'A'],
        'current_1'      => [0, 200, 2, 'A'],
        'current_2'      => [0, 200, 2, 'A'],
        'current_3'      => [0, 200, 2, 'A'],
        'power'          => [-100, 100, 3, 'kW'],
        'power_1'        => [-100, 100, 3, 'kW'],
        'power_2'        => [-100, 100, 3, 'kW'],
        'power_3'        => [-100, 100, 3, 'kW'],
        'power_factor'   => [-1, 1, 3, ''],
        'power_factor_1' => [-1, 1, 3, ''],
        'power_factor_2' => [-1, 1, 3, ''],
        'power_factor_3' => [-1, 1, 3, ''],
        'frequency'      => [40, 70, 2, 'Hz'],
        'energy'         => [0, 9999999, 3, 'kWh'],
        'temperature'    => [-40, 120, 2, '°C'],
    ];

    // PM2130D gateway packet: [phase 1, phase 2, phase 3] arrays -> {column}_1..3
    private const PHASE_ARRAYS = [
        'voltage_ln_v'    => 'voltage',
        'voltage_ll_v'    => 'voltage_ll',
        'phase_current_a' => 'current',
        'phase_power_kw'  => 'power',
        'phase_pf_iec'    => 'power_factor',
    ];

    // Packet keys accepted for a column, first non-null wins (flat firmware names, then PM2130D gateway names)
    private const ALIASES = [
        'power'        => ['power', 'power_kw', 'total_power_kw'],
        'power_factor' => ['power_factor', 'total_pf_iec'],
        'frequency'    => ['frequency', 'frequency_hz'],
        'energy'       => ['energy', 'energy_kwh', 'import_energy_kwh'],
    ];

    // Readings added for the three-phase meter; the latest API returns null for them when not measured or offline
    private const METER_KEYS = ['voltage_ll_1', 'voltage_ll_2', 'voltage_ll_3', 'power_factor', 'power_factor_1', 'power_factor_2', 'power_factor_3', 'frequency'];

    /**
     * Maps a telemetry packet onto the telemetry-table reading columns.
     * Accepts the PM2130D gateway packet (voltage_ln_v, phase_current_a, total_power_kw, import_energy_kwh ...)
     * and the older flat packet (voltage, voltage_1, current, power_kw, energy_kwh, temperature ...).
     */
    private static function readingsFromPayload(array $payload): array
    {
        foreach (self::PHASE_ARRAYS as $src => $base) {
            if (isset($payload[$src]) && is_array($payload[$src])) {
                foreach ([1, 2, 3] as $n) {
                    $payload["{$base}_{$n}"] = $payload[$src][$n - 1] ?? null;
                }
            }
        }

        $row = [];
        foreach (self::READINGS as $col => [$min, $max, $dp, $unit]) {
            $val = null;
            foreach (self::ALIASES[$col] ?? [$col] as $key) {
                if (isset($payload[$key]) && is_numeric($payload[$key])) {
                    $val = (float)$payload[$key];
                    break;
                }
            }
            if ($val !== null && ($val < $min || $val > $max)) {
                throw new Exception("Reading {$col} out of plausible bounds: {$val}{$unit}");
            }
            $row[$col] = $val === null ? null : round($val, $dp);
        }

        // Line voltage / current the dashboard shows: average of the measured phases when the packet has no line value
        foreach (['voltage', 'current'] as $base) {
            $phases = array_filter([$row["{$base}_1"], $row["{$base}_2"], $row["{$base}_3"]], fn($v) => $v !== null);
            if ($row[$base] === null && $phases) {
                $row[$base] = round(array_sum($phases) / count($phases), 2);
            }
        }

        $voltages = [$row['voltage'], $row['voltage_ll_1'], $row['voltage_ll_2'], $row['voltage_ll_3']];
        if (count(array_filter($voltages, fn($v) => $v !== null)) === 0) {
            throw new Exception('Incomplete telemetry measurements: no voltage reading in packet.');
        }

        return $row;
    }

    public static function ingestMqttTelemetry(array $payload): array
    {
        // 1. Mandatory device identification
        if (empty($payload['device_id'])) {
            throw new Exception('Missing device_id in telemetry packet.');
        }

        $deviceId = trim((string)$payload['device_id']);
        if (!preg_match('/^[a-zA-Z0-9_-]{3,32}$/', $deviceId)) {
            throw new Exception('Invalid device_id format.');
        }

        $readings = self::readingsFromPayload($payload);

        // Gateway sample id ("pnw101-3bef6c9a-28"): the same sample arriving over MQTT and HTTPS is stored once
        $sampleId = isset($payload['sample_id']) && is_string($payload['sample_id']) && preg_match('/^[A-Za-z0-9_.:-]{1,64}$/', $payload['sample_id'])
            ? $payload['sample_id']
            : null;

        $db = Connection::get();

        // 2. Find device or auto-provision if new
        $devStmt = $db->prepare("SELECT id, user_id FROM devices WHERE device_id = :device_id LIMIT 1");
        $devStmt->execute(['device_id' => $deviceId]);
        $device = $devStmt->fetch();

        $db->beginTransaction();
        try {
            if (!$device) {
                // Auto-provision device with NULL user_id so it can be claimed by any user account
                $autoProv = $db->prepare("
                    INSERT INTO devices (user_id, device_id, device_name, status, last_seen, created_at, updated_at)
                    VALUES (NULL, :device_id, :device_name, 'online', NOW(), NOW(), NOW())
                ");
                $autoProv->execute([
                    'device_id'   => $deviceId,
                    'device_name' => "ESP32 ({$deviceId})"
                ]);
            } else {
                // Update device status and last_seen
                $upStmt = $db->prepare("UPDATE devices SET status = 'online', last_seen = NOW(), updated_at = NOW() WHERE id = :id");
                $upStmt->execute(['id' => $device['id']]);
            }

            // Authoritative timestamp in UTC for database storage: the device's NTP time
            // (PM2130D gateway: timestamp_utc, older firmware: timestamp or epoch) when within a day of server time
            $recordedAt = gmdate('Y-m-d H:i:s');
            $ts = false;
            foreach (['timestamp_utc', 'timestamp'] as $key) {
                if (!empty($payload[$key]) && is_string($payload[$key])) {
                    $ts = strtotime($payload[$key]);
                    break;
                }
            }
            if ($ts === false && !empty($payload['epoch']) && (int)$payload['epoch'] > 1000000000) {
                $ts = (int)$payload['epoch'];
            }
            if ($ts !== false && abs(time() - $ts) <= 86400) {
                $recordedAt = gmdate('Y-m-d H:i:s', $ts);
            }

            // Insert telemetry row (column names come from the READINGS constant, never from the packet)
            $cols = array_keys($readings);
            $insStmt = $db->prepare("
                INSERT INTO telemetry (device_id, sample_id, " . implode(', ', $cols) . ", recorded_at, created_at)
                VALUES (:device_id, :sample_id, :" . implode(', :', $cols) . ", :recorded_at, NOW())
            ");
            $status = 'accepted';
            try {
                $insStmt->execute([
                    'device_id'   => $deviceId,
                    'sample_id'   => $sampleId,
                    'recorded_at' => $recordedAt
                ] + $readings);
            } catch (PDOException $e) {
                // 1062 = duplicate sample_id: this sample was already stored via the other transport (MQTT / HTTPS)
                if ($sampleId === null || (int)($e->errorInfo[1] ?? 0) !== 1062) {
                    throw $e;
                }
                $status = 'duplicate';
            }

            $db->commit();

            return [
                'status'    => $status,
                'device_id' => $deviceId,
                'sample_id' => $sampleId,
                'timestamp' => $recordedAt
            ];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    public static function getLatest(int $userId, ?string $deviceId = null): ?array
    {
        $db = Connection::get();
        $threshold = (int) Env::get('DEVICE_OFFLINE_THRESHOLD', 30);

        // Find device owned by this user
        if ($deviceId !== null) {
            $devStmt = $db->prepare("SELECT id, device_id, device_name, last_seen FROM devices WHERE user_id = :user_id AND device_id = :device_id LIMIT 1");
            $devStmt->execute(['user_id' => $userId, 'device_id' => $deviceId]);
        } else {
            $devStmt = $db->prepare("SELECT id, device_id, device_name, last_seen FROM devices WHERE user_id = :user_id ORDER BY last_seen DESC, id ASC LIMIT 1");
            $devStmt->execute(['user_id' => $userId]);
        }
        $device = $devStmt->fetch();

        if (!$device) {
            return null;
        }

        $telStmt = $db->prepare("
            SELECT " . implode(', ', array_keys(self::READINGS)) . ", recorded_at
            FROM telemetry
            WHERE device_id = :device_id
            ORDER BY recorded_at DESC, id DESC
            LIMIT 2
        ");
        $telStmt->execute(['device_id' => $device['device_id']]);
        $rows = $telStmt->fetchAll();
        $latest = $rows[0] ?? null;
        $prev = $rows[1] ?? null;

        $secondsSinceSeen = $device['last_seen'] ? (time() - strtotime($device['last_seen'])) : null;
        $telemetryAge = ($latest && !empty($latest['recorded_at'])) ? (time() - strtotime($latest['recorded_at'])) : null;
        $isOnline = $secondsSinceSeen !== null && $secondsSinceSeen <= $threshold && ($telemetryAge === null || $telemetryAge <= $threshold);

        $phaseOut = [];
        foreach (['voltage_1', 'voltage_2', 'voltage_3', 'current_1', 'current_2', 'current_3', 'power_1', 'power_2', 'power_3'] as $k) {
            $phaseOut[$k]         = ($isOnline && $latest && $latest[$k] !== null) ? (float)$latest[$k] : 0.0;
            $phaseOut["prev_{$k}"] = ($isOnline && $prev && $prev[$k] !== null) ? (float)$prev[$k] : 0.0;
        }
        // Three-phase meter readings (V12/V23/V31, PF, Hz): null rather than a misleading 0 when not measured or offline
        foreach (self::METER_KEYS as $k) {
            $phaseOut[$k]          = ($isOnline && $latest && $latest[$k] !== null) ? (float)$latest[$k] : null;
            $phaseOut["prev_{$k}"] = ($isOnline && $prev && $prev[$k] !== null) ? (float)$prev[$k] : null;
        }

        if (!$latest) {
            return [
                'device_id'          => $device['device_id'],
                'device_name'        => $device['device_name'],
                'voltage'            => 0.0,
                'prev_voltage'       => 0.0,
                'current'            => 0.0,
                'prev_current'       => 0.0,
                'power'              => 0.0,
                'energy'             => 0.0,
                'temperature'        => 0.0,
                'prev_temperature'   => 0.0,
                'timestamp'          => null,
                'recorded_at'        => null,
                'status'             => 'offline',
                'is_online'          => false,
                'last_seen'          => $device['last_seen'],
                'last_seen_relative' => 'No data recorded yet'
            ] + $phaseOut;
        }

        return [
            'device_id'          => $device['device_id'],
            'device_name'        => $device['device_name'],
            'voltage'            => $isOnline ? (float)$latest['voltage'] : 0.0,
            'prev_voltage'       => ($isOnline && $prev) ? (float)$prev['voltage'] : 0.0,
            'current'            => $isOnline ? (float)$latest['current'] : 0.0,
            'prev_current'       => ($isOnline && $prev) ? (float)$prev['current'] : 0.0,
            'power'              => $isOnline ? (float)$latest['power'] : 0.0,
            'energy'             => (float)$latest['energy'],
            // null (dashboard shows "--") for devices without a temperature sensor such as the PM2130D meter
            'temperature'        => ($isOnline && $latest['temperature'] !== null) ? (float)$latest['temperature'] : null,
            'prev_temperature'   => ($isOnline && $prev && $prev['temperature'] !== null) ? (float)$prev['temperature'] : null,
            'timestamp'          => date('c', strtotime($latest['recorded_at'])),
            'recorded_at'        => $latest['recorded_at'],
            'status'             => $isOnline ? 'online' : 'offline',
            'is_online'          => $isOnline,
            'last_seen'          => $device['last_seen'],
            'last_seen_relative' => self::formatRelativeTime($secondsSinceSeen)
        ] + $phaseOut;
    }

    public static function getHistory(int $userId, ?string $deviceId = null, string $range = '24h'): array
    {
        $db = Connection::get();

        if ($deviceId !== null) {
            $devStmt = $db->prepare("SELECT device_id FROM devices WHERE user_id = :user_id AND device_id = :device_id LIMIT 1");
            $devStmt->execute(['user_id' => $userId, 'device_id' => $deviceId]);
        } else {
            $devStmt = $db->prepare("SELECT device_id FROM devices WHERE user_id = :user_id ORDER BY last_seen DESC, id ASC LIMIT 1");
            $devStmt->execute(['user_id' => $userId]);
        }
        $device = $devStmt->fetch();

        if (!$device) {
            return [];
        }

        $targetDeviceId = $device['device_id'];

        switch ($range) {
            case '1h':
                $intervalQuery = "recorded_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)";
                $groupBy = "%Y-%m-%d %H:%i:00";
                break;
            case '6h':
                $intervalQuery = "recorded_at >= DATE_SUB(NOW(), INTERVAL 6 HOUR)";
                $groupBy = "%Y-%m-%d %H:%i:00";
                break;
            case '7d':
                $intervalQuery = "recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
                $groupBy = "%Y-%m-%d";
                break;
            case '30d':
                $intervalQuery = "recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
                $groupBy = "%Y-%m-%d";
                break;
            case '12m':
                $intervalQuery = "recorded_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)";
                $groupBy = "%Y-%m";
                break;
            case '24h':
            default:
                $intervalQuery = "recorded_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)";
                $groupBy = "%Y-%m-%d %H:00:00";
                break;
        }

        $query = "
            SELECT 
                DATE_FORMAT(recorded_at, '{$groupBy}') as bucket_time,
                ROUND(AVG(voltage), 2) as avg_voltage,
                ROUND(AVG(voltage_1), 2) as avg_voltage_1,
                ROUND(AVG(voltage_2), 2) as avg_voltage_2,
                ROUND(AVG(voltage_3), 2) as avg_voltage_3,
                ROUND(AVG(voltage_ll_1), 2) as avg_voltage_ll_1,
                ROUND(AVG(voltage_ll_2), 2) as avg_voltage_ll_2,
                ROUND(AVG(voltage_ll_3), 2) as avg_voltage_ll_3,
                ROUND(AVG(current), 2) as avg_current,
                ROUND(AVG(current_1), 2) as avg_current_1,
                ROUND(AVG(current_2), 2) as avg_current_2,
                ROUND(AVG(current_3), 2) as avg_current_3,
                ROUND(AVG(power), 3) as avg_power,
                ROUND(AVG(power_1), 3) as avg_power_1,
                ROUND(AVG(power_2), 3) as avg_power_2,
                ROUND(AVG(power_3), 3) as avg_power_3,
                ROUND(MAX(power), 3) as max_power,
                ROUND(AVG(power_factor), 3) as avg_power_factor,
                ROUND(AVG(power_factor_1), 3) as avg_power_factor_1,
                ROUND(AVG(power_factor_2), 3) as avg_power_factor_2,
                ROUND(AVG(power_factor_3), 3) as avg_power_factor_3,
                ROUND(AVG(frequency), 2) as avg_frequency,
                ROUND(MAX(energy), 3) as max_energy,
                ROUND(AVG(temperature), 2) as avg_temperature,
                COUNT(*) as sample_count
            FROM telemetry
            WHERE device_id = :device_id AND {$intervalQuery}
            GROUP BY bucket_time
            ORDER BY bucket_time ASC
            LIMIT 400
        ";

        $stmt = $db->prepare($query);
        $stmt->execute(['device_id' => $targetDeviceId]);
        $rows = $stmt->fetchAll();

        return [
            'device_id' => $targetDeviceId,
            'range'     => $range,
            'points'    => $rows
        ];
    }

    public static function getSummary(int $userId, ?string $deviceId = null): array
    {
        $db = Connection::get();

        if ($deviceId !== null) {
            $devStmt = $db->prepare("SELECT device_id FROM devices WHERE user_id = :user_id AND device_id = :device_id LIMIT 1");
            $devStmt->execute(['user_id' => $userId, 'device_id' => $deviceId]);
        } else {
            $devStmt = $db->prepare("SELECT device_id FROM devices WHERE user_id = :user_id ORDER BY last_seen DESC, id ASC LIMIT 1");
            $devStmt->execute(['user_id' => $userId]);
        }
        $device = $devStmt->fetch();

        if (!$device) {
            return [];
        }

        $targetDeviceId = $device['device_id'];

        $stmt = $db->prepare("
            SELECT 
                ROUND(MAX(power), 3) as peak_power,
                ROUND(AVG(power), 3) as avg_power,
                ROUND(MIN(voltage), 2) as min_voltage,
                ROUND(MAX(voltage), 2) as max_voltage,
                ROUND(AVG(temperature), 1) as avg_temp,
                ROUND(AVG(power_factor), 3) as avg_pf,
                ROUND(AVG(frequency), 2) as avg_hz,
                ROUND(MAX(energy) - MIN(energy), 3) as day_kwh,
                COUNT(*) as total_samples
            FROM telemetry
            WHERE device_id = :device_id AND recorded_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ");
        $stmt->execute(['device_id' => $targetDeviceId]);
        $data = $stmt->fetch();

        return [
            'device_id'      => $targetDeviceId,
            'peak_power_kw'  => (float)($data['peak_power'] ?? 0),
            'avg_power_kw'   => (float)($data['avg_power'] ?? 0),
            'min_voltage_v'  => (float)($data['min_voltage'] ?? 0),
            'max_voltage_v'  => (float)($data['max_voltage'] ?? 0),
            'avg_temp_c'     => (float)($data['avg_temp'] ?? 0),
            'avg_power_factor' => isset($data['avg_pf']) ? (float)$data['avg_pf'] : null,
            'avg_frequency_hz' => isset($data['avg_hz']) ? (float)$data['avg_hz'] : null,
            'day_kwh'        => (float)($data['day_kwh'] ?? 0),
            'samples_today'  => (int)($data['total_samples'] ?? 0)
        ];
    }

    public static function getLogs(int $userId, ?string $deviceId = null, int $limit = 20): array
    {
        $db = Connection::get();

        if ($deviceId !== null) {
            $devStmt = $db->prepare("SELECT device_id FROM devices WHERE user_id = :user_id AND device_id = :device_id LIMIT 1");
            $devStmt->execute(['user_id' => $userId, 'device_id' => $deviceId]);
        } else {
            $devStmt = $db->prepare("SELECT device_id FROM devices WHERE user_id = :user_id ORDER BY last_seen DESC, id ASC LIMIT 1");
            $devStmt->execute(['user_id' => $userId]);
        }
        $device = $devStmt->fetch();

        if (!$device) {
            return [];
        }

        $stmt = $db->prepare("
            SELECT t.id, t.device_id, COALESCE(NULLIF(d.device_name, ''), 'Device') as device_name,
                   t.sample_id, t." . implode(', t.', array_keys(self::READINGS)) . ", t.recorded_at
            FROM telemetry t
            LEFT JOIN devices d ON t.device_id = d.device_id
            WHERE t.device_id = :device_id
            ORDER BY t.recorded_at DESC, t.id DESC
            LIMIT :limit
        ");
        $stmt->bindValue(':device_id', $device['device_id'], PDO::PARAM_STR);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $logs = $stmt->fetchAll();

        $bdTz = new \DateTimeZone('Asia/Dhaka');
        foreach ($logs as &$log) {
            $power = (float)$log['power'];
            if ($power > 3.0) {
                $log['status_badge'] = 'High Load';
                $log['status_type']  = 'danger';
            } elseif ($power > 1.8) {
                $log['status_badge'] = 'Moderate';
                $log['status_type']  = 'warning';
            } elseif ($power > 0.1) {
                $log['status_badge'] = 'Normal';
                $log['status_type']  = 'success';
            } else {
                $log['status_badge'] = 'Standby';
                $log['status_type']  = 'info';
            }
            try {
                $dt = new \DateTime($log['recorded_at'], new \DateTimeZone('UTC'));
                $dt->setTimezone($bdTz);
                $log['formatted_time'] = $dt->format('h:i:s A');
                $log['formatted_date'] = $dt->format('d M, Y');
            } catch (\Throwable $e) {
                $log['formatted_time'] = date('h:i:s A', strtotime($log['recorded_at']));
                $log['formatted_date'] = date('d M, Y', strtotime($log['recorded_at']));
            }
        }

        return $logs;
    }

    public static function clearLogs(int $userId, ?string $deviceId = null): bool
    {
        $db = Connection::get();
        if ($deviceId !== null) {
            $stmt = $db->prepare("DELETE t FROM telemetry t JOIN devices d ON t.device_id = d.device_id WHERE t.device_id = :device_id AND d.user_id = :user_id");
            return $stmt->execute([
                'device_id' => $deviceId,
                'user_id'   => $userId
            ]);
        }
        $stmt = $db->prepare("DELETE t FROM telemetry t JOIN devices d ON t.device_id = d.device_id WHERE d.user_id = :user_id");
        return $stmt->execute(['user_id' => $userId]);
    }

    private static function formatRelativeTime(?int $seconds): string
    {
        if ($seconds === null) {
            return 'Never seen';
        }
        if ($seconds < 5) {
            return 'Just now';
        }
        if ($seconds < 60) {
            return "{$seconds}s ago";
        }
        $minutes = (int)floor($seconds / 60);
        if ($minutes < 60) {
            return "{$minutes}m ago";
        }
        $hours = (int)floor($minutes / 60);
        return "{$hours}h ago";
    }
}
