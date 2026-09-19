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
$limit = isset($_GET['limit']) ? min(100, max(5, (int)$_GET['limit'])) : 15;

try {
    $logs = TelemetryService::getLogs((int)$user['id'], $deviceId, $limit);
    Response::success($logs, 'Logs retrieved successfully');
} catch (Exception $e) {
    Response::error($e->getMessage(), 500);
}
