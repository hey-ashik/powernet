-- Adds per-phase readings V1-V3, I1-I3, P1-P3 to an existing telemetry table.
-- kWh already exists as the `energy` column, so it is not added here.
-- Run once in phpMyAdmin (Import tab) on databases created before this change.
-- Fresh installs already get these columns from database/schema.sql.
ALTER TABLE `telemetry`
    ADD COLUMN `voltage_1` DECIMAL(6, 2) NULL COMMENT 'V1 - Phase 1 Volts (V)' AFTER `voltage`,
    ADD COLUMN `voltage_2` DECIMAL(6, 2) NULL COMMENT 'V2 - Phase 2 Volts (V)' AFTER `voltage_1`,
    ADD COLUMN `voltage_3` DECIMAL(6, 2) NULL COMMENT 'V3 - Phase 3 Volts (V)' AFTER `voltage_2`,
    ADD COLUMN `current_1` DECIMAL(6, 2) NULL COMMENT 'I1 - Phase 1 Amperes (A)' AFTER `current`,
    ADD COLUMN `current_2` DECIMAL(6, 2) NULL COMMENT 'I2 - Phase 2 Amperes (A)' AFTER `current_1`,
    ADD COLUMN `current_3` DECIMAL(6, 2) NULL COMMENT 'I3 - Phase 3 Amperes (A)' AFTER `current_2`,
    ADD COLUMN `power_1` DECIMAL(8, 3) NULL COMMENT 'P1 - Phase 1 Active Power (kW)' AFTER `power`,
    ADD COLUMN `power_2` DECIMAL(8, 3) NULL COMMENT 'P2 - Phase 2 Active Power (kW)' AFTER `power_1`,
    ADD COLUMN `power_3` DECIMAL(8, 3) NULL COMMENT 'P3 - Phase 3 Active Power (kW)' AFTER `power_2`;
