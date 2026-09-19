<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/middleware/auth.php';
require_once dirname(__DIR__, 2) . '/services/TelemetryService.php';

use PowerNet\Middleware\Response;
use PowerNet\Middleware\Auth;
use PowerNet\Services\TelemetryService;

Response::init();

$user = Auth::requireAuth();
$deviceId = isset($_GET['device_id']) && !empty($_GET['device_id']) ? (string)$_GET['device_id'] : null;
$range = (string)($_GET['range'] ?? '24h');

try {
    $history = TelemetryService::getHistory((int)$user['id'], $deviceId, $range);
    Response::success($history, 'Historical telemetry retrieved successfully');
} catch (Exception $e) {
    Response::error($e->getMessage(), 500);
}
