<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/middleware/auth.php';
require_once dirname(__DIR__, 2) . '/services/DeviceService.php';

use PowerNet\Middleware\Response;
use PowerNet\Middleware\Auth;
use PowerNet\Services\DeviceService;

Response::init();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$user = Auth::requireAuth();
$input = Response::getJsonInput();
$deviceId = (string)($input['device_id'] ?? '');

if (empty($deviceId)) {
    Response::error('Device ID is required', 400);
}

try {
    $removed = DeviceService::removeDevice((int)$user['id'], $deviceId);
    if ($removed) {
        Response::success(null, 'Device removed successfully');
    } else {
        Response::error('Device not found or not owned by you', 404);
    }
} catch (Exception $e) {
    Response::error($e->getMessage(), 500);
}
