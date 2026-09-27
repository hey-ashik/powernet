<?php
/**
 * Dashboard box preferences (Manage Dashboard drawer)
 * GET  /api/dashboard/preferences  -> { voltage_phase, current_phase, power_phase }
 * POST /api/dashboard/preferences  <- same shape; each value 1-3 (phase shown on that box, every box always shows one)
 * No saved row (or an old "all off" 0) reads back as 1 (V1 / I1 / P1)
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
$fields = ['voltage_phase', 'current_phase', 'power_phase'];

try {
    $db = Connection::get();

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = Response::getJsonInput();
        $prefs = [];
        foreach ($fields as $field) {
            $value = filter_var($input[$field] ?? 1, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 3]]);
            if ($value === false) {
                Response::error("{$field} must be 1, 2 or 3.", 400);
            }
            $prefs[$field] = $value;
        }

        $stmt = $db->prepare("
            INSERT INTO dashboard_preferences (user_id, voltage_phase, current_phase, power_phase)
            VALUES (:user_id, :voltage_phase, :current_phase, :power_phase)
            ON DUPLICATE KEY UPDATE
                voltage_phase = VALUES(voltage_phase),
                current_phase = VALUES(current_phase),
                power_phase   = VALUES(power_phase)
        ");
        $stmt->execute(['user_id' => $userId] + $prefs);

        Response::success($prefs, 'Dashboard preferences saved.');
    }

    $stmt = $db->prepare("SELECT voltage_phase, current_phase, power_phase FROM dashboard_preferences WHERE user_id = :user_id LIMIT 1");
    $stmt->execute(['user_id' => $userId]);
    $row = $stmt->fetch() ?: [];

    $prefs = [];
    foreach ($fields as $field) {
        $prefs[$field] = max(1, (int)($row[$field] ?? 1));
    }
    Response::success($prefs, 'Dashboard preferences retrieved.');
} catch (Exception $e) {
    Response::error('Could not load dashboard preferences: ' . $e->getMessage(), 500);
}
