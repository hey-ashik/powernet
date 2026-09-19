<?php
/**
 * PowerNet Database Connection Manager
 * Secure PDO Singleton using .env configuration
 */

declare(strict_types=1);

namespace PowerNet\Database;

use PDO;
use PDOException;
use PowerNet\Config\Env;

require_once dirname(__DIR__) . '/config/env.php';

class Connection
{
    private static ?PDO $instance = null;

    public static function get(): PDO
    {
        if (self::$instance === null) {
            Env::load();

            $host = Env::get('DB_HOST', 'localhost');
            $port = (int) Env::get('DB_PORT', 3306);
            $dbName = Env::get('DB_NAME', 'powernet_db');
            $user = Env::get('DB_USER', 'root');
            $pass = Env::get('DB_PASSWORD', '');

            $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4";

            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];

            try {
                self::$instance = new PDO($dsn, $user, $pass, $options);
                self::ensureSchema(self::$instance);
            } catch (PDOException $e) {
                error_log("PowerNet Database Connection Error: " . $e->getMessage());
                http_response_code(500);
                echo json_encode([
                    'success' => false,
                    'message' => 'Service temporarily unavailable. Unable to connect to database.'
                ]);
                exit;
            }
        }

        return self::$instance;
    }

    /**
     * Self-healing migration ensures required columns & tables exist automatically
     */
    private static function ensureSchema(PDO $db): void
    {
        // 1. Ensure columns exist on users table
        try {
            $cols = $db->query("SHOW COLUMNS FROM `users`")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('name', $cols)) {
                $db->exec("ALTER TABLE `users` ADD COLUMN `name` VARCHAR(120) NOT NULL DEFAULT '' AFTER `id`");
                if (in_array('username', $cols)) {
                    $db->exec("UPDATE `users` SET `name` = `username` WHERE `name` = '' OR `name` IS NULL");
                }
            }
            if (!in_array('password_hash', $cols) && in_array('password', $cols)) {
                $db->exec("ALTER TABLE `users` ADD COLUMN `password_hash` VARCHAR(255) NOT NULL DEFAULT '' AFTER `email`");
                $db->exec("UPDATE `users` SET `password_hash` = `password` WHERE `password_hash` = '' OR `password_hash` IS NULL");
            }
            if (!in_array('email_verified', $cols)) {
                $db->exec("ALTER TABLE `users` ADD COLUMN `email_verified` TINYINT(1) NOT NULL DEFAULT 0 AFTER `password_hash`");
            }
        } catch (\Throwable $e) {
            // Safe to ignore
        }

        // 2. Ensure columns exist on devices table
        try {
            $devCols = $db->query("SHOW COLUMNS FROM `devices`")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('last_seen', $devCols)) {
                $db->exec("ALTER TABLE `devices` ADD COLUMN `last_seen` DATETIME NULL AFTER `status`");
            }
            // Free up pnw101 if it was assigned to default placeholder user
            $u1 = $db->query("SELECT id, email FROM `users` WHERE id = 1 LIMIT 1")->fetch();
            if (!$u1 || (strpos($u1['email'], 'ashikul') === false && strpos($u1['email'], 'ashik') === false)) {
                $db->exec("UPDATE `devices` SET `user_id` = NULL WHERE `device_id` = 'pnw101' AND `user_id` = 1");
            }
        } catch (\Throwable $e) {
            // Safe to ignore
        }


        // 2. Ensure email_verifications table exists
        try {
            $db->exec("
                CREATE TABLE IF NOT EXISTS `email_verifications` (
                    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    `user_id` INT UNSIGNED NOT NULL,
                    `token_hash` VARCHAR(64) NOT NULL,
                    `expires_at` DATETIME NOT NULL,
                    `used_at` DATETIME NULL,
                    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY `idx_email_verif_token` (`token_hash`),
                    KEY `idx_email_verif_user` (`user_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        } catch (\Throwable $e) {
            // Table already exists, safe to ignore
        }

        // 3. Ensure password_resets table exists
        try {
            $db->exec("
                CREATE TABLE IF NOT EXISTS `password_resets` (
                    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    `user_id` INT UNSIGNED NOT NULL,
                    `token_hash` VARCHAR(64) NOT NULL,
                    `expires_at` DATETIME NOT NULL,
                    `used_at` DATETIME NULL,
                    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    KEY `idx_pwd_resets_token` (`token_hash`),
                    KEY `idx_pwd_resets_user` (`user_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        } catch (\Throwable $e) {
            // Table already exists, safe to ignore
        }
    }
}

