<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/middleware/auth.php';
require_once dirname(__DIR__, 2) . '/database/connection.php';

use PowerNet\Middleware\Response;
use PowerNet\Middleware\Auth;
use PowerNet\Database\Connection;

Response::init();

$user = Auth::requireAuth();
$deviceId = isset($_GET['device_id']) && !empty($_GET['device_id']) ? (string)$_GET['device_id'] : null;

$db = Connection::get();

if ($deviceId !== null) {
    $devStmt = $db->prepare("SELECT device_id FROM devices WHERE user_id = :user_id AND device_id = :device_id LIMIT 1");
    $devStmt->execute(['user_id' => $user['id'], 'device_id' => $deviceId]);
} else {
    $devStmt = $db->prepare("SELECT device_id FROM devices WHERE user_id = :user_id ORDER BY last_seen DESC, id ASC LIMIT 1");
    $devStmt->execute(['user_id' => $user['id']]);
}
$device = $devStmt->fetch();

if (!$device) {
    Response::error('Device not found', 404);
}

$stmt = $db->prepare("
    SELECT predicted_power, prediction_target_time, confidence_interval, model_version, created_at
    FROM predictions
    WHERE device_id = :device_id
    ORDER BY prediction_target_time DESC
    LIMIT 50
");
$stmt->execute(['device_id' => $device['device_id']]);
$history = $stmt->fetchAll();

Response::success([
    'device_id'   => $device['device_id'],
    'predictions' => $history
]);
