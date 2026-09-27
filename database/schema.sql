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

-- Demo Telemetry (Device: pnw101) - 10 daily readings with V1-V3 / I1-I3 / P1-P3, newest = today
-- Line values are the phase averages; P = V x I x 0.92 PF. Inserted only while pnw101 has no
-- per-phase readings yet, so importing this file again never duplicates them.
-- ==========================================================

INSERT INTO `telemetry` (`device_id`, `voltage`, `voltage_1`, `voltage_2`, `voltage_3`,
    `current`, `current_1`, `current_2`, `current_3`, `power`, `power_1`, `power_2`, `power_3`,
    `energy`, `temperature`, `recorded_at`)
SELECT 'pnw101',
    ROUND((v1 + v2 + v3) / 3, 2), v1, v2, v3,
    ROUND((i1 + i2 + i3) / 3, 2), i1, i2, i3,
    ROUND((v1 * i1 + v2 * i2 + v3 * i3) * 0.92 / 3000, 3),
    ROUND(v1 * i1 * 0.92 / 1000, 3), ROUND(v2 * i2 * 0.92 / 1000, 3), ROUND(v3 * i3 * 0.92 / 1000, 3),
    energy, temp, UTC_TIMESTAMP() - INTERVAL days_ago DAY
FROM (
              SELECT 9 AS days_ago, 229.4 AS v1, 231.2 AS v2, 228.7 AS v3, 3.12 AS i1, 2.84 AS i2, 3.46 AS i3, 3.215 AS energy, 31.2 AS temp
    UNION ALL SELECT 8, 230.1, 229.6, 231.8, 3.55, 3.02, 2.91,  6.480, 32.0
    UNION ALL SELECT 7, 231.3, 230.4, 229.2, 2.76, 3.38, 3.10,  9.842, 31.6
    UNION ALL SELECT 6, 228.9, 230.8, 230.3, 3.94, 3.21, 3.47, 13.517, 33.1
    UNION ALL SELECT 5, 230.6, 231.5, 229.9, 4.12, 3.66, 3.85, 17.690, 34.4
    UNION ALL SELECT 4, 229.8, 228.6, 230.7, 2.58, 2.93, 2.71, 20.476, 30.8
    UNION ALL SELECT 3, 231.9, 230.2, 231.1, 3.27, 3.49, 3.05, 23.902, 32.5
    UNION ALL SELECT 2, 230.4, 229.1, 230.9, 3.83, 3.14, 3.62, 27.681, 33.7
    UNION ALL SELECT 1, 229.2, 230.7, 228.8, 3.01, 2.87, 3.33, 30.894, 31.9
    UNION ALL SELECT 0, 230.8, 231.4, 230.1, 3.46, 3.72, 3.18, 34.512, 32.8
) AS demo
CROSS JOIN (SELECT COUNT(*) AS n FROM `telemetry` WHERE `device_id` = 'pnw101' AND `voltage_1` IS NOT NULL) AS seen
WHERE seen.n = 0;

