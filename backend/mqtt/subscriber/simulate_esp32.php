<?php
/**
 * PowerNet ESP32 Telemetry Simulator
 * Simulates the ESP32 PM2130D gateway (Device ID: pnw101): the same JSON packet shape as
 * "Updated ESP Code/espcode.ino" (voltage_ll_v, voltage_ln_v, phase_current_a, phase_power_kw, phase_pf_iec arrays,
 * total_power_kw, total_pf_iec, frequency_hz, import_energy_kwh), one sample every 15 seconds
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
$sampleEverySeconds = 15; // ESP SAMPLE_EVERY_MS

echo "========================================================\n";
echo " PowerNet ESP32 Telemetry Simulator (Hostinger Ready)\n";
echo " Device ID:    {$deviceId} (No token needed)\n";
echo " Database:     " . Env::get('DB_NAME') . "\n";
echo " Host:         " . Env::get('DB_HOST') . "\n";
echo "========================================================\n";

$energy = 12.50;
$bootNonce = dechex(mt_rand(0x10000000, 0x7fffffff));
$count = 0;

while (true) {
    $count++;
    // Generate realistic fluctuating three-phase telemetry: 230 V line-to-neutral, ~4.6 A and PF ~0.95 per phase
    $ln = $ll = $amps = $pf = $kw = [];
    for ($i = 0; $i < 3; $i++) {
        $ln[$i] = round(230.0 + mt_rand(-25, 25) / 10.0, 2);                  // 227.5V - 232.5V
        $ll[$i] = round($ln[$i] * sqrt(3) + mt_rand(-10, 10) / 10.0, 2);     // ~398V line to line
        $amps[$i] = round(4.6 + mt_rand(-40, 60) / 100.0, 3);                 // 4.2A - 5.2A
        $pf[$i] = round(0.95 + mt_rand(-30, 30) / 1000.0, 3);                 // 0.92 - 0.98
        $kw[$i] = round($ln[$i] * $amps[$i] * $pf[$i] / 1000.0, 3);           // kW
    }
    $totalKw = round(array_sum($kw), 3);
    $energy += $totalKw * ($sampleEverySeconds / 3600.0);

    $payload = [
        'device_id'         => $deviceId,
        'sample_id'         => "{$deviceId}-{$bootNonce}-{$count}",
        'timestamp_utc'     => gmdate('Y-m-d\TH:i:s\Z'),
        'voltage_ll_v'      => $ll,
        'voltage_ln_v'      => $ln,
        'phase_current_a'   => $amps,
        'phase_power_kw'    => $kw,
        'phase_pf_iec'      => $pf,
        'total_power_kw'    => $totalKw,
        'total_pf_iec'      => round(array_sum($pf) / 3, 3),
        'frequency_hz'      => round(50.0 + mt_rand(-50, 50) / 1000.0, 3),   // 49.95Hz - 50.05Hz
        'import_energy_kwh' => round($energy, 3),
    ];

    echo sprintf(
        "[%s] #%d | Dev: %s | VLL: %.1fV | VLN: %.1fV | I: %.2fA | P: %.3fkW | PF: %.3f | %.3fHz | E: %.3fkWh\n",
        date('H:i:s'),
        $count,
        $deviceId,
        $ll[0],
        $ln[0],
        $amps[0],
        $totalKw,
        $payload['total_pf_iec'],
        $payload['frequency_hz'],
        $payload['import_energy_kwh']
    );

    try {
        $res = TelemetryService::ingestMqttTelemetry($payload);
        echo "   -> Ingested into database successfully.\n";
    } catch (Throwable $e) {
        echo "   -> [Notice] " . $e->getMessage() . "\n";
    }

    sleep($sampleEverySeconds);
}
