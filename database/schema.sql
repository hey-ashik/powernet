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

-- ==========================================================
-- Initial Hardware Seed (Device: pnw101)
-- ==========================================================

INSERT INTO `devices` (`id`, `user_id`, `device_id`, `device_name`, `status`, `created_at`)
VALUES (1, NULL, 'pnw101', 'Main Panel (pnw101)', 'offline', NOW())
ON DUPLICATE KEY UPDATE `status` = 'offline';

-- Seed initial telemetry samples for pnw101
INSERT INTO `telemetry` (`device_id`, `voltage`, `current`, `power`, `energy`, `temperature`, `recorded_at`) VALUES
('pnw101', 230.10, 4.65, 1.070, 12.380, 31.2, DATE_SUB(NOW(), INTERVAL 50 SECOND)),
('pnw101', 230.25, 4.70, 1.082, 12.395, 31.3, DATE_SUB(NOW(), INTERVAL 45 SECOND)),
('pnw101', 229.90, 4.80, 1.103, 12.410, 31.4, DATE_SUB(NOW(), INTERVAL 40 SECOND)),
('pnw101', 230.40, 4.75, 1.094, 12.425, 31.4, DATE_SUB(NOW(), INTERVAL 35 SECOND)),
('pnw101', 230.50, 4.82, 1.110, 12.440, 31.5, DATE_SUB(NOW(), INTERVAL 30 SECOND)),
('pnw101', 230.30, 4.78, 1.100, 12.455, 31.5, DATE_SUB(NOW(), INTERVAL 25 SECOND)),
('pnw101', 230.60, 4.85, 1.118, 12.470, 31.6, DATE_SUB(NOW(), INTERVAL 20 SECOND)),
('pnw101', 230.50, 4.82, 1.110, 12.485, 31.6, DATE_SUB(NOW(), INTERVAL 15 SECOND)),
('pnw101', 230.40, 4.80, 1.105, 12.495, 31.7, DATE_SUB(NOW(), INTERVAL 10 SECOND)),
('pnw101', 230.50, 4.82, 1.110, 12.500, 31.6, DATE_SUB(NOW(), INTERVAL 5 SECOND));
