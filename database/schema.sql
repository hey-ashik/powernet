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
-- One row per sample from the Schneider PM2130D three-phase meter, sent by the ESP32 gateway every 15 s.
-- Column names = the names in the ESP's JSON; each 3-value array becomes _1/_2/_3 (voltage_ll_v[0] -> voltage_ll_v_1).
-- The comment on each column is the Serial Monitor line the value comes from ("VLL +0" = first VLL line, ...).
-- 19 readings: 3 L-L voltages, 3 L-N voltages, 3 currents, 3 + 1 kW, 3 + 1 power factors, frequency, kWh.
-- Every reading is nullable: NULL = the meter gave no valid value (e.g. power factor while no current flows).
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3b. Dashboard Box Preferences (Manage Dashboard drawer)
-- One row per user. Each column holds the ONE view its dashboard box shows,
-- so "only one switch on per box" is enforced by the table shape itself.
-- Allowed values are checked by backend/api/dashboard/preferences.php; the defaults are the dashboard's defaults.
CREATE TABLE IF NOT EXISTS `dashboard_preferences` (
    `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
    `voltage_view` VARCHAR(3) NOT NULL DEFAULT 'll' COMMENT 'Voltage box: ll = line to line (V12), ln = line to neutral (V1N)',
    `current_view` VARCHAR(3) NOT NULL DEFAULT '1' COMMENT 'Current box: 1-3 = I1-I3',
    `power_view` VARCHAR(3) NOT NULL DEFAULT 'avg' COMMENT 'Active Power box: avg = Average Power (total_power_kw), 1-3 = P1-P3',
    `pf_view` VARCHAR(3) NOT NULL DEFAULT 'avg' COMMENT 'Power Factor box: avg = Average PF (total_pf_iec), 1-3 = PF1-PF3',
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

