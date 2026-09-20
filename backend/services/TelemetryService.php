<?php
/**
 * PowerNet Telemetry Service
 * Ingestion, validation, real-time metrics, historical aggregation, and event logs
 * Simplified: Direct device_id ingestion without token overhead
 */

declare(strict_types=1);

namespace PowerNet\Services;

use PDO;
use Exception;
use PowerNet\Database\Connection;
use PowerNet\Config\Env;

require_once dirname(__DIR__) . '/database/connection.php';
require_once dirname(__DIR__) . '/config/env.php';

class TelemetryService
{
    public static function ingestMqttTelemetry(array $payload): array
    {
        // 1. Mandatory device identification
        if (empty($payload['device_id'])) {
            throw new Exception('Missing device_id in telemetry packet.');
        }

        $deviceId = trim((string)$payload['device_id']);

        $voltage = isset($payload['voltage']) ? (float)$payload['voltage'] : null;
        $current = isset($payload['current']) ? (float)$payload['current'] : null;
        $power   = isset($payload['power'])   ? (float)$payload['power']   : null;
        $energy  = isset($payload['energy'])  ? (float)$payload['energy']  : null;
        $temp    = isset($payload['temperature']) ? (float)$payload['temperature'] : null;

        if ($voltage === null || $current === null || $power === null || $energy === null || $temp === null) {
            throw new Exception('Incomplete telemetry measurements.');
        }

        // Physical bounds checking
        if ($voltage < 0 || $voltage > 500) {
            throw new Exception("Voltage reading out of plausible bounds: {$voltage}V");
        }
        if ($current < 0 || $current > 200) {
            throw new Exception("Current reading out of plausible bounds: {$current}A");
        }
        if ($power < 0 || $power > 100) {
            throw new Exception("Power reading out of plausible bounds: {$power}kW");
        }
        if ($temp < -40 || $temp > 120) {
            throw new Exception("Temperature reading out of plausible bounds: {$temp}°C");
        }

        $db = Connection::get();

        // 2. Find device or auto-provision if new
        $devStmt = $db->prepare("SELECT id, user_id FROM devices WHERE device_id = :device_id LIMIT 1");
        $devStmt->execute(['device_id' => $deviceId]);
        $device = $devStmt->fetch();

        $db->beginTransaction();
        try {
            if (!$device) {
                // Auto-provision device for default user (id=1) so telemetry is never lost
                $autoProv = $db->prepare("
                    INSERT INTO devices (user_id, device_id, device_name, status, last_seen, created_at, updated_at)
                    VALUES (1, :device_id, :device_name, 'online', NOW(), NOW(), NOW())
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

            // Authoritative timestamp
            $recordedAt = date('Y-m-d H:i:s');
            if (!empty($payload['timestamp'])) {
                $ts = strtotime((string)$payload['timestamp']);
                if ($ts !== false && abs(time() - $ts) <= 3600) {
                    $recordedAt = date('Y-m-d H:i:s', $ts);
                }
            }

            // Insert telemetry row
            $insStmt = $db->prepare("
                INSERT INTO telemetry (device_id, voltage, current, power, energy, temperature, recorded_at, created_at)
                VALUES (:device_id, :voltage, :current, :power, :energy, :temp, :recorded_at, NOW())
            ");
            $insStmt->execute([
                'device_id'   => $deviceId,
                'voltage'     => round($voltage, 2),
                'current'     => round($current, 2),
                'power'       => round($power, 3),
                'energy'      => round($energy, 3),
                'temp'        => round($temp, 2),
                'recorded_at' => $recordedAt
            ]);

            $db->commit();

            return [
                'status'    => 'accepted',
                'device_id' => $deviceId,
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
            SELECT voltage, current, power, energy, temperature, recorded_at
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
        $isOnline = $secondsSinceSeen !== null && $secondsSinceSeen <= $threshold;

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
                'status'             => 'offline',
                'is_online'          => false,
                'last_seen'          => $device['last_seen'],
                'last_seen_relative' => 'No data recorded yet'
            ];
        }

        return [
            'device_id'          => $device['device_id'],
            'device_name'        => $device['device_name'],
            'voltage'            => (float)$latest['voltage'],
            'prev_voltage'       => $prev ? (float)$prev['voltage'] : null,
            'current'            => (float)$latest['current'],
            'prev_current'       => $prev ? (float)$prev['current'] : null,
            'power'              => (float)$latest['power'],
            'energy'             => (float)$latest['energy'],
            'temperature'        => (float)$latest['temperature'],
            'prev_temperature'   => $prev ? (float)$prev['temperature'] : null,
            'timestamp'          => date('c', strtotime($latest['recorded_at'])),
            'status'             => $isOnline ? 'online' : 'offline',
            'is_online'          => $isOnline,
            'last_seen'          => $device['last_seen'],
            'last_seen_relative' => self::formatRelativeTime($secondsSinceSeen)
        ];
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
                ROUND(AVG(current), 2) as avg_current,
                ROUND(AVG(power), 3) as avg_power,
                ROUND(MAX(power), 3) as max_power,
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
                   t.voltage, t.current, t.power, t.energy, t.temperature, t.recorded_at
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
            $stmt = $db->prepare("DELETE FROM telemetry WHERE device_id = :device_id");
            return $stmt->execute(['device_id' => $deviceId]);
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
