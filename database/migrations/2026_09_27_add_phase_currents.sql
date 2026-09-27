-- Adds per-phase current columns to an existing telemetry table.
-- Run once in phpMyAdmin (Import tab) on databases created before this change,
-- after 2026_09_27_add_phase_voltages.sql.
-- Fresh installs already get these columns from database/schema.sql.
ALTER TABLE `telemetry`
    ADD COLUMN `current_1` DECIMAL(6, 2) NULL COMMENT 'Phase 1 Amperes (A)' AFTER `current`,
    ADD COLUMN `current_2` DECIMAL(6, 2) NULL COMMENT 'Phase 2 Amperes (A)' AFTER `current_1`,
    ADD COLUMN `current_3` DECIMAL(6, 2) NULL COMMENT 'Phase 3 Amperes (A)' AFTER `current_2`;
