<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/services/AuthService.php';

use PowerNet\Middleware\Response;
use PowerNet\Services\AuthService;

Response::init();

$token = (string)($_GET['token'] ?? '');
if (empty($token) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = Response::getJsonInput();
    $token = (string)($input['token'] ?? '');
}

$isBrowserRequest = isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'text/html') !== false;

try {
    $result = AuthService::verifyEmail($token);
    
    if ($isBrowserRequest || isset($_GET['redirect'])) {
        // Direct browser click from email: redirect straight to login with verified flag
        header('Location: /login?verified=1');
        exit;
    }
    
    Response::success($result, 'Email verification successful');
} catch (Exception $e) {
    if ($isBrowserRequest || isset($_GET['redirect'])) {
        header('Location: /login?error=' . urlencode($e->getMessage()));
        exit;
    }
    Response::error($e->getMessage(), 400);
}

