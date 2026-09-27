-- Adds per-phase active power columns to an existing telemetry table.
-- Run once in phpMyAdmin (Import tab) on databases created before this change,
-- after 2026_09_27_add_phase_voltages.sql and 2026_09_27_add_phase_currents.sql.
-- Fresh installs already get these columns from database/schema.sql.
ALTER TABLE `telemetry`
    ADD COLUMN `power_1` DECIMAL(8, 3) NULL COMMENT 'Phase 1 Active Power (kW)' AFTER `power`,
    ADD COLUMN `power_2` DECIMAL(8, 3) NULL COMMENT 'Phase 2 Active Power (kW)' AFTER `power_1`,
    ADD COLUMN `power_3` DECIMAL(8, 3) NULL COMMENT 'Phase 3 Active Power (kW)' AFTER `power_2`;
