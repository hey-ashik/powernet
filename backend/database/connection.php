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

    // Telemetry table, identical to database/schema.sql: one row per Schneider PM2130D sample from the ESP32 gateway.
    // Column names = the ESP JSON names; each 3-value array becomes _1/_2/_3 (voltage_ll_v[0] -> voltage_ll_v_1).
    private const TELEMETRY_TABLE = "
        CREATE TABLE IF NOT EXISTS `telemetry` (
            `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            `device_id` VARCHAR(64) NOT NULL COMMENT 'device_id from the ESP (e.g. pnw101)',
            `sample_id` VARCHAR(64) NULL COMMENT 'sample_id from the ESP; unique, so an MQTT + HTTPS copy is stored once',
            `voltage_ll_v_1` DECIMAL(6, 2) NULL COMMENT 'VLL +0: V12 line-to-line L1-L2 (V)',
            `voltage_ll_v_2` DECIMAL(6, 2) NULL COMMENT 'VLL +2: V23 line-to-line L2-L3 (V)',
            `voltage_ll_v_3` DECIMAL(6, 2) NULL COMMENT 'VLL +4: V31 line-to-line L3-L1 (V)',
            `voltage_ln_v_1` DECIMAL(6, 2) NULL COMMENT 'VLN +0: V1N phase 1 line-to-neutral (V)',
            `voltage_ln_v_2` DECIMAL(6, 2) NULL COMMENT 'VLN +2: V2N phase 2 line-to-neutral (V)',
            `voltage_ln_v_3` DECIMAL(6, 2) NULL COMMENT 'VLN +4: V3N phase 3 line-to-neutral (V)',
            `phase_current_a_1` DECIMAL(7, 3) NULL COMMENT 'AMPS +0: I1 phase 1 current (A)',
            `phase_current_a_2` DECIMAL(7, 3) NULL COMMENT 'AMPS +2: I2 phase 2 current (A)',
            `phase_current_a_3` DECIMAL(7, 3) NULL COMMENT 'AMPS +4: I3 phase 3 current (A)',
            `phase_power_kw_1` DECIMAL(8, 3) NULL COMMENT 'KW +0: P1 phase 1 active power (kW)',
            `phase_power_kw_2` DECIMAL(8, 3) NULL COMMENT 'KW +2: P2 phase 2 active power (kW)',
            `phase_power_kw_3` DECIMAL(8, 3) NULL COMMENT 'KW +4: P3 phase 3 active power (kW)',
            `total_power_kw` DECIMAL(8, 3) NULL COMMENT 'KW +6: 4th kW value from the meter (kW)',
            `phase_pf_iec_1` DECIMAL(4, 3) NULL COMMENT 'PF +0: PF1 phase 1 power factor (-1..1)',
            `phase_pf_iec_2` DECIMAL(4, 3) NULL COMMENT 'PF +2: PF2 phase 2 power factor (-1..1)',
            `phase_pf_iec_3` DECIMAL(4, 3) NULL COMMENT 'PF +4: PF3 phase 3 power factor (-1..1)',
            `total_pf_iec` DECIMAL(4, 3) NULL COMMENT 'PF +6: 4th power factor value from the meter (-1..1)',
            `frequency_hz` DECIMAL(6, 3) NULL COMMENT 'HZ +0: frequency (Hz)',
            `import_energy_kwh` DECIMAL(12, 3) NULL COMMENT 'KWH +0: imported energy counter (kWh)',
            `recorded_at` DATETIME NOT NULL COMMENT 'timestamp_utc from the ESP (UTC)',
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY `idx_telemetry_sample_id` (`sample_id`),
            KEY `idx_telemetry_device_recorded` (`device_id`, `recorded_at`),
            KEY `idx_telemetry_recorded_at` (`recorded_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ";

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

        // 4. Ensure the telemetry table has the PM2130D gateway layout (column names = the ESP JSON names).
        //    A table in an older layout is kept as telemetry_old_backup (nothing is deleted) and a new empty table
        //    is created, the same as database/migrations/2026_09_29_pm2130d_telemetry_table.sql does
        try {
            try {
                $telCols = $db->query("SHOW COLUMNS FROM `telemetry`")->fetchAll(PDO::FETCH_COLUMN);
            } catch (PDOException $e) {
                $telCols = null; // no telemetry table yet
            }
            if ($telCols !== null && !in_array('voltage_ll_v_1', $telCols, true)) {
                $db->exec("RENAME TABLE `telemetry` TO `telemetry_old_backup`");
                error_log('PowerNet: old telemetry table renamed to telemetry_old_backup; new PM2130D telemetry table created');
                $telCols = null;
            }
            if ($telCols === null) {
                $db->exec(self::TELEMETRY_TABLE);
            }
        } catch (\Throwable $e) {
            error_log('PowerNet telemetry table check failed: ' . $e->getMessage());
        }

        // 5. Ensure dashboard_preferences table exists (Manage Dashboard phase switches)
        try {
            $db->exec("
                CREATE TABLE IF NOT EXISTS `dashboard_preferences` (
                    `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
                    `voltage_phase` TINYINT UNSIGNED NOT NULL DEFAULT 1,
                    `current_phase` TINYINT UNSIGNED NOT NULL DEFAULT 1,
                    `power_phase` TINYINT UNSIGNED NOT NULL DEFAULT 1,
                    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        } catch (\Throwable $e) {
            error_log('PowerNet dashboard_preferences table check failed: ' . $e->getMessage());
        }
    }
}

