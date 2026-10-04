<?php
/**
 * Dashboard box preferences (Manage Dashboard drawer)
 * GET  /api/dashboard/preferences  -> { voltage_view, current_view, power_view, pf_view }
 * POST /api/dashboard/preferences  <- same shape; each value one of that box's views (every box always shows one)
 *   voltage_view: ll | ln          (Voltage box: line to line V12 / line to neutral V1N)
 *   current_view: 1 | 2 | 3        (Current box: I1-I3)
 *   power_view:   avg | 1 | 2 | 3  (Active Power box: Average Power total_power_kw / P1-P3)
 *   pf_view:      avg | 1 | 2 | 3  (Power Factor box: Average PF total_pf_iec / PF1-PF3)
 * No saved row (or an unknown value) reads back as the box's default: ll / 1 / avg / avg
 */
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/middleware/auth.php';
require_once dirname(__DIR__, 2) . '/database/connection.php';

use PowerNet\Middleware\Response;
use PowerNet\Middleware\Auth;
use PowerNet\Database\Connection;

Response::init();

$user = Auth::requireAuth();
$userId = (int)$user['id'];
// Each box -> the views it can show; the first one is the default
$views = [
    'voltage_view' => ['ll', 'ln'],
    'current_view' => ['1', '2', '3'],
    'power_view'   => ['avg', '1', '2', '3'],
    'pf_view'      => ['avg', '1', '2', '3'],
];

try {
    $db = Connection::get();

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = Response::getJsonInput();
        $prefs = [];
        foreach ($views as $field => $allowed) {
            $value = $input[$field] ?? $allowed[0];
            $value = is_string($value) || is_int($value) ? (string)$value : '';
            if (!in_array($value, $allowed, true)) {
                Response::error("{$field} must be one of: " . implode(', ', $allowed) . '.', 400);
            }
            $prefs[$field] = $value;
        }

        $stmt = $db->prepare("
            INSERT INTO dashboard_preferences (user_id, voltage_view, current_view, power_view, pf_view)
            VALUES (:user_id, :voltage_view, :current_view, :power_view, :pf_view)
            ON DUPLICATE KEY UPDATE
                voltage_view = VALUES(voltage_view),
                current_view = VALUES(current_view),
                power_view   = VALUES(power_view),
                pf_view      = VALUES(pf_view)
        ");
        $stmt->execute(['user_id' => $userId] + $prefs);

        Response::success($prefs, 'Dashboard preferences saved.');
    }

    $stmt = $db->prepare("SELECT voltage_view, current_view, power_view, pf_view FROM dashboard_preferences WHERE user_id = :user_id LIMIT 1");
    $stmt->execute(['user_id' => $userId]);
    $row = $stmt->fetch() ?: [];

    $prefs = [];
    foreach ($views as $field => $allowed) {
        $value = (string)($row[$field] ?? '');
        $prefs[$field] = in_array($value, $allowed, true) ? $value : $allowed[0];
    }
    Response::success($prefs, 'Dashboard preferences retrieved.');
} catch (Exception $e) {
    Response::error('Could not load dashboard preferences: ' . $e->getMessage(), 500);
}
