<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/middleware/auth.php';
require_once dirname(__DIR__, 2) . '/services/DeviceService.php';

use PowerNet\Middleware\Response;
use PowerNet\Middleware\Auth;
use PowerNet\Services\DeviceService;

Response::init();

$user = Auth::requireAuth();
$deviceId = (string)($_GET['device_id'] ?? '');

if (empty($deviceId)) {
    Response::error('Device ID is required', 400);
}

try {
    $status = DeviceService::getDeviceStatus((int)$user['id'], $deviceId);
    Response::success($status, 'Status retrieved successfully');
} catch (Exception $e) {
    Response::error($e->getMessage(), 404);
}
