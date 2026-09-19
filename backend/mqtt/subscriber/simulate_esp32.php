<?php
/**
 * PowerNet ESP32 Telemetry Simulator
 * Simulates ESP32 (Device ID: pnw101) publishing electrical telemetry
 *
 * Usage:
 *   php simulate_esp32.php
 */

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/config/env.php';
require_once dirname(__DIR__, 2) . '/services/TelemetryService.php';

use PowerNet\Config\Env;
use PowerNet\Services\TelemetryService;

Env::load();

$deviceId = 'pnw101'; // Default Device ID requested by user

echo "========================================================\n";
echo " PowerNet ESP32 Telemetry Simulator (Hostinger Ready)\n";
echo " Device ID:    {$deviceId} (No token needed)\n";
echo " Database:     " . Env::get('DB_NAME') . "\n";
echo " Host:         " . Env::get('DB_HOST') . "\n";
echo "========================================================\n";

$energy = 12.50;
$baseVoltage = 230.0;
$count = 0;

while (true) {
    $count++;
    // Generate realistic fluctuating AC electrical telemetry
    $voltage = round($baseVoltage + (mt_rand(-25, 25) / 10.0), 2); // 227.5V - 232.5V
    $current = round(4.6 + (mt_rand(-40, 60) / 100.0), 2);         // 4.2A - 5.2A
    $power = round(($voltage * $current * 0.95) / 1000.0, 3);      // kW (PF ~0.95)
    $energy += round($power * (5 / 3600.0), 4);                     // 5s energy accumulation
    $temperature = round(31.4 + (mt_rand(-6, 12) / 10.0), 1);     // 30.8°C - 32.6°C

    $payload = [
        'device_id'   => $deviceId,
        'voltage'     => $voltage,
        'current'     => $current,
        'power'       => $power,
        'energy'      => round($energy, 3),
        'temperature' => $temperature,
        'timestamp'   => date('c')
    ];

    echo sprintf(
        "[%s] #%d | Dev: %s | V: %.1fV | I: %.2fA | P: %.3fkW | E: %.3fkWh | Temp: %.1f°C\n",
        date('H:i:s'),
        $count,
        $deviceId,
        $voltage,
        $current,
        $power,
        $energy,
        $temperature
    );

    try {
        $res = TelemetryService::ingestMqttTelemetry($payload);
        echo "   -> Ingested into database successfully.\n";
    } catch (Throwable $e) {
        echo "   -> [Notice] " . $e->getMessage() . "\n";
    }

    sleep(5);
}
