<?php
/**
 * PowerNet Authentication & Authorization Middleware
 */

declare(strict_types=1);

namespace PowerNet\Middleware;

use PDO;
use PowerNet\Database\Connection;
use PowerNet\Config\Env;

require_once dirname(__DIR__) . '/database/connection.php';
require_once dirname(__DIR__) . '/middleware/cors.php';

class Auth
{
    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            $lifetime = (int) Env::get('SESSION_LIFETIME', 86400);
            $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);

            session_set_cookie_params([
                'lifetime' => $lifetime,
                'path'     => '/',
                'domain'   => '',
                'secure'   => $isHttps,
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
            session_start();
        }
    }

    public static function user(): ?array
    {
        self::startSession();

        // Check PHP Session first
        if (!empty($_SESSION['user_id'])) {
            $db = Connection::get();
            $stmt = $db->prepare("SELECT id, name, email, email_verified, created_at FROM users WHERE id = :id LIMIT 1");
            $stmt->execute(['id' => $_SESSION['user_id']]);
            $user = $stmt->fetch();
            if ($user) {
                return $user;
            }
        }

        // Check Authorization header for Bearer token fallback
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($authHeader, 'Bearer ')) {
            $token = trim(substr($authHeader, 7));
            // Token format: base64_encode(user_id:hmac)
            $decoded = base64_decode($token, true);
            if ($decoded && str_contains($decoded, ':')) {
                [$userId, $hash] = explode(':', $decoded, 2);
                $secret = Env::get('APP_SECRET', 'powernet_secret_key');
                if (hash_equals(hash_hmac('sha256', (string)$userId, $secret), $hash)) {
                    $db = Connection::get();
                    $stmt = $db->prepare("SELECT id, name, email, email_verified, created_at FROM users WHERE id = :id LIMIT 1");
                    $stmt->execute(['id' => (int)$userId]);
                    $user = $stmt->fetch();
                    if ($user) {
                        return $user;
                    }
                }
            }
        }

        return null;
    }

    public static function requireAuth(): array
    {
        $user = self::user();
        if (!$user) {
            Response::error('Authentication required. Please login.', 401);
        }
        return $user;
    }

    public static function verifyDeviceOwnership(int $userId, string $deviceId): ?array
    {
        $db = Connection::get();
        $stmt = $db->prepare("SELECT * FROM devices WHERE user_id = :user_id AND device_id = :device_id LIMIT 1");
        $stmt->execute([
            'user_id'   => $userId,
            'device_id' => $deviceId
        ]);
        $device = $stmt->fetch();
        return $device ?: null;
    }

    public static function generateAuthToken(int $userId): string
    {
        $secret = Env::get('APP_SECRET', 'powernet_secret_key');
        $hash = hash_hmac('sha256', (string)$userId, $secret);
        return base64_encode("{$userId}:{$hash}");
    }
}
