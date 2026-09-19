<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/middleware/auth.php';

use PowerNet\Middleware\Response;
use PowerNet\Middleware\Auth;

Response::init();

$user = Auth::requireAuth();

Response::success([
    'id'             => (int)$user['id'],
    'name'           => $user['name'],
    'email'          => $user['email'],
    'email_verified' => (bool)$user['email_verified'],
    'created_at'     => $user['created_at']
]);
