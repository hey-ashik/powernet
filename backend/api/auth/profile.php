<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/middleware/cors.php';
require_once dirname(__DIR__, 2) . '/middleware/auth.php';
require_once dirname(__DIR__, 2) . '/database/connection.php';

use PowerNet\Middleware\Response;
use PowerNet\Middleware\Auth;
use PowerNet\Database\Connection;

Response::init();

$user = Auth::requireAuth();

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$name = trim($input['name'] ?? '');

if (empty($name) || strlen($name) < 2) {
    Response::error('Name must be at least 2 characters.', 400);
}

try {
    $db = Connection::get();
    $stmt = $db->prepare("UPDATE users SET name = :name, updated_at = NOW() WHERE id = :id");
    $stmt->execute([
        'name' => $name,
        'id'   => $user['id']
    ]);

    Response::success([
        'id'    => (int)$user['id'],
        'name'  => $name,
        'email' => $user['email']
    ], 'Profile updated successfully.');
} catch (Exception $e) {
    Response::error('Could not update profile: ' . $e->getMessage(), 500);
}
