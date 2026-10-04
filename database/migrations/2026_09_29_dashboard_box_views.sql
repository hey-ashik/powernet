-- Manage Dashboard box views, for databases whose dashboard_preferences table still has the older phase layout
-- (voltage_phase / current_phase / power_phase).
--   voltage_view: ll | ln          (Voltage box: line to line V12 / line to neutral V1N)
--   current_view: 1 | 2 | 3        (Current box: I1-I3; each user's current choice is kept)
--   power_view:   avg | 1 | 2 | 3  (Active Power box: Average Power total_power_kw / P1-P3)
--   pf_view:      avg | 1 | 2 | 3  (new Power Factor box: Average PF total_pf_iec / PF1-PF3)
-- Voltage and Active Power start on the new defaults (Voltage LL, Average).
--
-- Run once in phpMyAdmin (Import tab). Not needed if the new backend already answered a request: connection.php
-- makes the same change automatically, and this file then stops at the first line with
-- "Duplicate column name 'voltage_view'" (nothing is changed in that case).
-- Fresh installs get this table from database/schema.sql.
ALTER TABLE `dashboard_preferences`
    ADD COLUMN `voltage_view` VARCHAR(3) NOT NULL DEFAULT 'll' COMMENT 'Voltage box: ll = line to line (V12), ln = line to neutral (V1N)' AFTER `user_id`,
    ADD COLUMN `current_view` VARCHAR(3) NOT NULL DEFAULT '1' COMMENT 'Current box: 1-3 = I1-I3' AFTER `voltage_view`,
    ADD COLUMN `power_view` VARCHAR(3) NOT NULL DEFAULT 'avg' COMMENT 'Active Power box: avg = Average Power (total_power_kw), 1-3 = P1-P3' AFTER `current_view`,
    ADD COLUMN `pf_view` VARCHAR(3) NOT NULL DEFAULT 'avg' COMMENT 'Power Factor box: avg = Average PF (total_pf_iec), 1-3 = PF1-PF3' AFTER `power_view`;

UPDATE `dashboard_preferences` SET `current_view` = CAST(`current_phase` AS CHAR) WHERE `current_phase` IN (1, 2, 3);

ALTER TABLE `dashboard_preferences`
    DROP COLUMN `voltage_phase`,
    DROP COLUMN `current_phase`,
    DROP COLUMN `power_phase`;
