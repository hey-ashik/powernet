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
$name = (string)($input['name'] ?? '');
$email = (string)($input['email'] ?? '');
$password = (string)($input['password'] ?? '');
$confirmPassword = (string)($input['confirm_password'] ?? '');

try {
    $result = AuthService::register($name, $email, $password, $confirmPassword);
    Response::success($result, 'Registration successful', 201);
} catch (Exception $e) {
    Response::error($e->getMessage(), 400);
}
