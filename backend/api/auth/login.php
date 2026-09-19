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
$password = (string)($input['password'] ?? '');

try {
    $result = AuthService::login($email, $password);
    Response::success($result, 'Login successful');
} catch (Exception $e) {
    Response::error($e->getMessage(), 401);
}
