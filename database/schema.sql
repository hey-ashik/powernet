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
    `current` DECIMAL(6, 2) NOT NULL COMMENT 'Amperes (A)',
    `power` DECIMAL(8, 3) NOT NULL COMMENT 'Active Power (kW)',
    `energy` DECIMAL(10, 3) NOT NULL COMMENT 'Cumulative Energy (kWh)',
    `temperature` DECIMAL(5, 2) NOT NULL COMMENT 'Celsius (°C)',
    `recorded_at` DATETIME NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_telemetry_device_recorded` (`device_id`, `recorded_at`),
    KEY `idx_telemetry_recorded_at` (`recorded_at`)
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

