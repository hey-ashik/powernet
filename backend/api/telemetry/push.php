<?php
/**
 * PowerNet Direct HTTP Telemetry Ingestion Endpoint
 * Enables ESP32 to push telemetry directly via HTTPS POST
 * Ideal for shared hosting environments like Hostinger
 *
 * Endpoint: POST /api/telemetry/push.php (or /api/telemetry/push)
 */

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/services/TelemetryService.php';

use PowerNet\Middleware\Response;
use PowerNet\Services\TelemetryService;

Response::init();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed. Use POST.', 405);
}

$input = Response::getJsonInput();

if (empty($input)) {
    Response::error('Empty telemetry payload.', 400);
}

try {
    $result = TelemetryService::ingestMqttTelemetry($input);
    Response::success($result, 'Telemetry stored successfully');
} catch (Exception $e) {
    Response::error($e->getMessage(), 400);
}
