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

try {
    $devices = DeviceService::getUserDevices((int)$user['id']);
    Response::success($devices, 'Devices retrieved successfully');
} catch (Exception $e) {
    Response::error($e->getMessage(), 500);
}
