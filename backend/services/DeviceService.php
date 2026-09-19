<?php
/**
 * PowerNet Device Management Service
 * Simplified: Direct Device ID pairing without token complexity
 */

declare(strict_types=1);

namespace PowerNet\Services;

use PDO;
use Exception;
use PowerNet\Database\Connection;
use PowerNet\Config\Env;

require_once dirname(__DIR__) . '/database/connection.php';
require_once dirname(__DIR__) . '/config/env.php';

class DeviceService
{
    public static function connectDevice(int $userId, string $deviceId, string $deviceName = ''): array
    {
        $deviceId = trim($deviceId);

        if (empty($deviceId) || strlen($deviceId) < 3) {
            throw new Exception('Invalid Device ID. Please enter a valid identifier (e.g. pnw101).');
        }

        $db = Connection::get();

        // Check if device already exists
        $stmt = $db->prepare("SELECT id, user_id, device_id, device_name, status, last_seen FROM devices WHERE device_id = :device_id LIMIT 1");
        $stmt->execute(['device_id' => $deviceId]);
        $device = $stmt->fetch();

        if ($device) {
            // Check if device is already locked to another user
            if ($device['user_id'] !== null && (int)$device['user_id'] !== 0 && (int)$device['user_id'] !== $userId) {
                throw new Exception("Device '{$deviceId}' is already locked to another user account. Another user cannot use this device.");
            }

            // Assign and lock device to current user
            $name = !empty($deviceName) ? trim($deviceName) : $device['device_name'];
            $update = $db->prepare("UPDATE devices SET user_id = :user_id, device_name = :device_name, updated_at = NOW() WHERE id = :id");
            $update->execute(['user_id' => $userId, 'device_name' => $name, 'id' => $device['id']]);

            return [
                'device_id'   => $device['device_id'],
                'device_name' => $name,
                'status'      => 'connected',
                'message'     => "Device '{$deviceId}' successfully connected and locked to your account!"
            ];
        }

        // Provision/Register new device directly with user_id
        $name = !empty($deviceName) ? trim($deviceName) : "ESP32 Monitor ({$deviceId})";
        $insert = $db->prepare("
            INSERT INTO devices (user_id, device_id, device_name, status, created_at, updated_at)
            VALUES (:user_id, :device_id, :device_name, 'offline', NOW(), NOW())
        ");
        $insert->execute([
            'user_id'     => $userId,
            'device_id'   => $deviceId,
            'device_name' => $name
        ]);

        return [
            'device_id'   => $deviceId,
            'device_name' => $name,
            'message'     => "Device '{$deviceId}' successfully connected!"
        ];
    }

    public static function getUserDevices(int $userId): array
    {
        $db = Connection::get();
        $threshold = (int) Env::get('DEVICE_OFFLINE_THRESHOLD', 30);

        $stmt = $db->prepare("
            SELECT id, device_id, device_name, last_seen, created_at,
                   CASE 
                       WHEN last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) <= :threshold 
                       THEN 'online' 
                       ELSE 'offline' 
                   END AS computed_status,
                   TIMESTAMPDIFF(SECOND, last_seen, NOW()) as seconds_since_seen
            FROM devices 
            WHERE user_id = :user_id 
            ORDER BY id ASC
        ");
        $stmt->execute([
            'user_id'   => $userId,
            'threshold' => $threshold
        ]);
        $devices = $stmt->fetchAll();

        foreach ($devices as &$dev) {
            $dev['status_display'] = $dev['computed_status'] === 'online' ? 'Online' : 'Offline';
            $dev['last_seen_relative'] = self::formatRelativeTime($dev['seconds_since_seen']);
        }

        return $devices;
    }

    public static function getDeviceStatus(int $userId, string $deviceId): array
    {
        $db = Connection::get();
        $threshold = (int) Env::get('DEVICE_OFFLINE_THRESHOLD', 30);

        $stmt = $db->prepare("
            SELECT id, device_id, device_name, last_seen,
                   CASE 
                       WHEN last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) <= :threshold 
                       THEN 'online' 
                       ELSE 'offline' 
                   END AS computed_status,
                   TIMESTAMPDIFF(SECOND, last_seen, NOW()) as seconds_since_seen
            FROM devices 
            WHERE user_id = :user_id AND device_id = :device_id
            LIMIT 1
        ");
        $stmt->execute([
            'user_id'   => $userId,
            'device_id' => $deviceId,
            'threshold' => $threshold
        ]);
        $device = $stmt->fetch();

        if (!$device) {
            throw new Exception('Device not found or not registered to your account.');
        }

        return [
            'device_id'           => $device['device_id'],
            'device_name'         => $device['device_name'],
            'status'              => $device['computed_status'],
            'is_online'           => $device['computed_status'] === 'online',
            'last_seen'           => $device['last_seen'],
            'last_seen_relative'  => self::formatRelativeTime($device['seconds_since_seen']),
            'seconds_since_seen'  => $device['seconds_since_seen']
        ];
    }

    public static function removeDevice(int $userId, string $deviceId): bool
    {
        $db = Connection::get();
        $stmt = $db->prepare("UPDATE devices SET user_id = NULL, updated_at = NOW() WHERE user_id = :user_id AND device_id = :device_id");
        $stmt->execute([
            'user_id'   => $userId,
            'device_id' => $deviceId
        ]);
        return $stmt->rowCount() > 0;
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
