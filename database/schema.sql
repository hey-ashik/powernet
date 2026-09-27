-- ==========================================================
-- PowerNet Database Schema
-- Hostinger Deployment: u697802579_powernetdb
-- Smart Electrical Energy Monitoring Platform
-- ==========================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(190) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `email_verified` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Devices Table (Simplified: Just Device ID, no token needed)
CREATE TABLE IF NOT EXISTS `devices` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NULL DEFAULT 1,
    `device_id` VARCHAR(64) NOT NULL,
    `device_name` VARCHAR(120) NOT NULL DEFAULT 'ESP32 Energy Monitor',
    `device_token_hash` VARCHAR(255) NULL DEFAULT NULL,
    `status` ENUM('online', 'offline', 'standby') NOT NULL DEFAULT 'offline',
    `last_seen` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `idx_devices_device_id` (`device_id`),
    KEY `idx_devices_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Telemetry Table
CREATE TABLE IF NOT EXISTS `telemetry` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `device_id` VARCHAR(64) NOT NULL,
    `voltage` DECIMAL(6, 2) NOT NULL COMMENT 'Volts (V)',
    `voltage_1` DECIMAL(6, 2) NULL COMMENT 'V1 - Phase 1 Volts (V)',
    `voltage_2` DECIMAL(6, 2) NULL COMMENT 'V2 - Phase 2 Volts (V)',
    `voltage_3` DECIMAL(6, 2) NULL COMMENT 'V3 - Phase 3 Volts (V)',
    `current` DECIMAL(6, 2) NOT NULL COMMENT 'Amperes (A)',
    `current_1` DECIMAL(6, 2) NULL COMMENT 'I1 - Phase 1 Amperes (A)',
    `current_2` DECIMAL(6, 2) NULL COMMENT 'I2 - Phase 2 Amperes (A)',
    `current_3` DECIMAL(6, 2) NULL COMMENT 'I3 - Phase 3 Amperes (A)',
    `power` DECIMAL(8, 3) NOT NULL COMMENT 'Active Power (kW)',
    `power_1` DECIMAL(8, 3) NULL COMMENT 'P1 - Phase 1 Active Power (kW)',
    `power_2` DECIMAL(8, 3) NULL COMMENT 'P2 - Phase 2 Active Power (kW)',
    `power_3` DECIMAL(8, 3) NULL COMMENT 'P3 - Phase 3 Active Power (kW)',
    `energy` DECIMAL(10, 3) NOT NULL COMMENT 'kWh - Cumulative Energy (kWh)',
    `temperature` DECIMAL(5, 2) NOT NULL COMMENT 'Temp - Celsius (°C)',
    `recorded_at` DATETIME NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_telemetry_device_recorded` (`device_id`, `recorded_at`),
    KEY `idx_telemetry_recorded_at` (`recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unit labels for the phase columns (phpMyAdmin shows them under each column name).
-- Needed on databases where the automatic upgrade in connection.php added these columns without a comment.
ALTER TABLE `telemetry`
    MODIFY `voltage_1` DECIMAL(6, 2) NULL COMMENT 'V1 - Phase 1 Volts (V)',
    MODIFY `voltage_2` DECIMAL(6, 2) NULL COMMENT 'V2 - Phase 2 Volts (V)',
    MODIFY `voltage_3` DECIMAL(6, 2) NULL COMMENT 'V3 - Phase 3 Volts (V)',
    MODIFY `current_1` DECIMAL(6, 2) NULL COMMENT 'I1 - Phase 1 Amperes (A)',
    MODIFY `current_2` DECIMAL(6, 2) NULL COMMENT 'I2 - Phase 2 Amperes (A)',
    MODIFY `current_3` DECIMAL(6, 2) NULL COMMENT 'I3 - Phase 3 Amperes (A)',
    MODIFY `power_1` DECIMAL(8, 3) NULL COMMENT 'P1 - Phase 1 Active Power (kW)',
    MODIFY `power_2` DECIMAL(8, 3) NULL COMMENT 'P2 - Phase 2 Active Power (kW)',
    MODIFY `power_3` DECIMAL(8, 3) NULL COMMENT 'P3 - Phase 3 Active Power (kW)';

-- 3b. Dashboard Box Preferences (Manage Dashboard drawer)
-- One row per user. Each column holds the ONE phase its dashboard box shows,
-- so "only one switch on per box" is enforced by the table shape itself.
CREATE TABLE IF NOT EXISTS `dashboard_preferences` (
    `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
    `voltage_phase` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Voltage box: 1-3 = V1-V3 (default V1)',
    `current_phase` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Current box: 1-3 = I1-I3 (default I1)',
    `power_phase` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Active Power box: 1-3 = P1-P3 (default P1)',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Email Verification Tokens
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

-- 5. Password Reset Tokens
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

-- 6. Future AI Load Predictions Table
CREATE TABLE IF NOT EXISTS `predictions` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `device_id` VARCHAR(64) NOT NULL,
    `predicted_power` DECIMAL(8, 3) NOT NULL COMMENT 'Predicted Load in kW',
    `prediction_target_time` DATETIME NOT NULL,
    `confidence_interval` DECIMAL(5, 2) NULL,
    `model_version` VARCHAR(32) NOT NULL DEFAULT 'xgb_v1.0',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_predictions_device_time` (`device_id`, `prediction_target_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initial Hardware Seed (Device: pnw101 - ready for first user claiming)
-- ==========================================================

INSERT INTO `devices` (`id`, `user_id`, `device_id`, `device_name`, `status`, `created_at`)
VALUES (1, NULL, 'pnw101', 'Main Panel (pnw101)', 'offline', NOW())
ON DUPLICATE KEY UPDATE `status` = 'offline';

-- Demo Telemetry (Device: pnw101) - Friday 25 Sep 2026 morning, 08:00-10:15 Bangladesh time (UTC+6),
-- one reading every 15 minutes (10 readings). Stored in UTC like real ESP32 data (02:00-04:15 UTC).
-- Units: V1-V3 in V, I1-I3 in A, P1-P3 in kW. Line values are the phase averages; P = V x I x 0.92 PF.
-- Inserted only if pnw101 has no readings in that window, so importing this file again never duplicates them.
-- ==========================================================

INSERT INTO `telemetry` (`device_id`, `voltage`, `voltage_1`, `voltage_2`, `voltage_3`,
    `current`, `current_1`, `current_2`, `current_3`, `power`, `power_1`, `power_2`, `power_3`,
    `energy`, `temperature`, `recorded_at`)
SELECT 'pnw101',
    ROUND((v1 + v2 + v3) / 3, 2), v1, v2, v3,
    ROUND((i1 + i2 + i3) / 3, 2), i1, i2, i3,
    ROUND((v1 * i1 + v2 * i2 + v3 * i3) * 0.92 / 3000, 3),
    ROUND(v1 * i1 * 0.92 / 1000, 3), ROUND(v2 * i2 * 0.92 / 1000, 3), ROUND(v3 * i3 * 0.92 / 1000, 3),
    energy, temp, TIMESTAMP('2026-09-25 02:00:00') + INTERVAL mins MINUTE
FROM (
              SELECT 0 AS mins, 231.8 AS v1, 230.9 AS v2, 232.4 AS v3, 1.42 AS i1, 1.18 AS i2, 1.65 AS i3, 0.212 AS energy, 27.4 AS temp
    UNION ALL SELECT  15, 231.2, 230.4, 231.9, 1.86, 1.52, 1.97, 0.478, 27.8
    UNION ALL SELECT  30, 230.7, 229.8, 231.3, 2.35, 2.04, 2.41, 0.842, 28.3
    UNION ALL SELECT  45, 230.1, 229.3, 230.8, 2.78, 2.46, 2.93, 1.296, 28.9
    UNION ALL SELECT  60, 229.6, 228.7, 230.2, 3.12, 2.89, 3.28, 1.843, 29.4
    UNION ALL SELECT  75, 229.2, 228.4, 229.9, 3.45, 3.17, 3.61, 2.478, 30.1
    UNION ALL SELECT  90, 228.8, 228.1, 229.5, 3.71, 3.42, 3.86, 3.176, 30.6
    UNION ALL SELECT 105, 229.1, 228.5, 229.8, 3.58, 3.30, 3.74, 3.861, 31.0
    UNION ALL SELECT 120, 229.5, 228.9, 230.1, 3.34, 3.09, 3.52, 4.502, 31.3
    UNION ALL SELECT 135, 229.9, 229.2, 230.6, 3.06, 2.81, 3.25, 5.093, 31.5
) AS demo
CROSS JOIN (SELECT COUNT(*) AS n FROM `telemetry` WHERE `device_id` = 'pnw101'
    AND `recorded_at` BETWEEN '2026-09-25 02:00:00' AND '2026-09-25 04:15:00') AS seen
WHERE seen.n = 0;

