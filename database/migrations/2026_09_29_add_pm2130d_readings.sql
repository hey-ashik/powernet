-- Upgrades an existing telemetry table for the Schneider PM2130D three-phase meter (ESP32 gateway):
--   voltage_ll_1..3          line-to-line voltages V12, V23, V31 (V)   (voltage_1..3 hold the line-to-neutral voltages)
--   power_factor, _1..3      total + per-phase power factor, IEC sign (-1..1)
--   frequency                Hz
--   sample_id                the gateway's per-sample id; UNIQUE so a sample sent over both MQTT and HTTPS is stored once
-- and lets voltage / current / power / energy / temperature be NULL: the meter has no temperature sensor, and a
-- reading the meter could not deliver is stored as NULL instead of a fake 0.
--
-- Run once in phpMyAdmin (Import tab) on databases created before this change.
-- Requires 2026_09_27_add_phase_readings.sql (voltage_1..3, current_1..3, power_1..3) to be applied first.
-- Not needed if the new backend already answered a request: connection.php adds these columns automatically,
-- and this file then stops with "Duplicate column name" (nothing is changed in that case).
-- Fresh installs already get these columns from database/schema.sql.
ALTER TABLE `telemetry`
    ADD COLUMN `sample_id` VARCHAR(64) NULL COMMENT 'Gateway sample id (MQTT + HTTPS copies stored once)' AFTER `device_id`,
    ADD COLUMN `voltage_ll_1` DECIMAL(6, 2) NULL COMMENT 'V12 - Line-to-Line L1-L2 Volts (V)' AFTER `voltage_3`,
    ADD COLUMN `voltage_ll_2` DECIMAL(6, 2) NULL COMMENT 'V23 - Line-to-Line L2-L3 Volts (V)' AFTER `voltage_ll_1`,
    ADD COLUMN `voltage_ll_3` DECIMAL(6, 2) NULL COMMENT 'V31 - Line-to-Line L3-L1 Volts (V)' AFTER `voltage_ll_2`,
    ADD COLUMN `power_factor` DECIMAL(4, 3) NULL COMMENT 'PF - Total Power Factor (-1..1)' AFTER `power_3`,
    ADD COLUMN `power_factor_1` DECIMAL(4, 3) NULL COMMENT 'PF1 - Phase 1 Power Factor (-1..1)' AFTER `power_factor`,
    ADD COLUMN `power_factor_2` DECIMAL(4, 3) NULL COMMENT 'PF2 - Phase 2 Power Factor (-1..1)' AFTER `power_factor_1`,
    ADD COLUMN `power_factor_3` DECIMAL(4, 3) NULL COMMENT 'PF3 - Phase 3 Power Factor (-1..1)' AFTER `power_factor_2`,
    ADD COLUMN `frequency` DECIMAL(5, 2) NULL COMMENT 'Hz - Frequency (Hz)' AFTER `power_factor_3`,
    MODIFY `voltage` DECIMAL(6, 2) NULL COMMENT 'V - Average Line-to-Neutral Volts (V)',
    MODIFY `voltage_1` DECIMAL(6, 2) NULL COMMENT 'V1 - Phase 1 Line-to-Neutral Volts (V)',
    MODIFY `voltage_2` DECIMAL(6, 2) NULL COMMENT 'V2 - Phase 2 Line-to-Neutral Volts (V)',
    MODIFY `voltage_3` DECIMAL(6, 2) NULL COMMENT 'V3 - Phase 3 Line-to-Neutral Volts (V)',
    MODIFY `current` DECIMAL(6, 2) NULL COMMENT 'I - Average Phase Amperes (A)',
    MODIFY `power` DECIMAL(8, 3) NULL COMMENT 'P - Total Active Power (kW)',
    MODIFY `energy` DECIMAL(10, 3) NULL COMMENT 'kWh - Cumulative Imported Energy (kWh)',
    MODIFY `temperature` DECIMAL(5, 2) NULL COMMENT 'Temp - Celsius (°C), NULL when the device has no sensor',
    ADD UNIQUE KEY `idx_telemetry_sample_id` (`sample_id`);
