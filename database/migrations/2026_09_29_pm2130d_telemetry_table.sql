-- New telemetry table for the Schneider PM2130D meter (ESP32 gateway), for databases created before this change.
-- Column names = the names in the ESP's JSON; each 3-value array becomes _1/_2/_3 (voltage_ll_v[0] -> voltage_ll_v_1).
--
-- Your old telemetry rows are NOT deleted: the old table is renamed to telemetry_old_backup.
-- Once the new readings look right on the dashboard you can remove it with:  DROP TABLE `telemetry_old_backup`;
--
-- Run once in phpMyAdmin (Import tab). Not needed if the new backend already answered a request: connection.php
-- makes the same change automatically, and this file then stops at the first line with
-- "Table 'telemetry_old_backup' already exists" (nothing is changed in that case).
-- Fresh installs get this table from database/schema.sql.
RENAME TABLE `telemetry` TO `telemetry_old_backup`;

CREATE TABLE `telemetry` (
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
