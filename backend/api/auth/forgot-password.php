<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/services/AuthService.php';

use PowerNet\Middleware\Response;
use PowerNet\Services\AuthService;

Response::init();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$input = Response::getJsonInput();
$email = (string)($input['email'] ?? '');

if (empty($email)) {
    Response::error('Email is required', 400);
}

try {
    $result = AuthService::forgotPassword($email);
    Response::success($result);
} catch (Exception $e) {
    Response::error($e->getMessage(), 400);
}
