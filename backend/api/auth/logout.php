<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/services/AuthService.php';

use PowerNet\Middleware\Response;
use PowerNet\Services\AuthService;

Response::init();

AuthService::logout();
Response::success(null, 'Logged out successfully');
