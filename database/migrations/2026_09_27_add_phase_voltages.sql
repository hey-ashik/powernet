-- Adds per-phase voltage columns to an existing telemetry table.
-- Run once in phpMyAdmin (Import tab) on databases created before this change.
-- Fresh installs already get these columns from database/schema.sql.
ALTER TABLE `telemetry`
    ADD COLUMN `voltage_1` DECIMAL(6, 2) NULL COMMENT 'Phase 1 Volts (V)' AFTER `voltage`,
    ADD COLUMN `voltage_2` DECIMAL(6, 2) NULL COMMENT 'Phase 2 Volts (V)' AFTER `voltage_1`,
    ADD COLUMN `voltage_3` DECIMAL(6, 2) NULL COMMENT 'Phase 3 Volts (V)' AFTER `voltage_2`;
