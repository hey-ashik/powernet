<?php
/**
 * PowerNet API Response & Security Middleware
 */

declare(strict_types=1);

namespace PowerNet\Middleware;

class Response
{
    public static function init(): void
    {
        // Prevent caching of sensitive telemetry/auth responses
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('X-XSS-Protection: 1; mode=block');

        // Allow CORS if needed
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
        header("Access-Control-Allow-Origin: {$origin}");
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    public static function success(mixed $data = null, string $message = 'Success', int $statusCode = 200): void
    {
        http_response_code($statusCode);
        $payload = [
            'success' => true,
            'message' => $message
        ];
        if ($data !== null) {
            $payload['data'] = $data;
        }
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        exit;
    }

    public static function error(string $message = 'An error occurred', int $statusCode = 400, ?array $errors = null): void
    {
        http_response_code($statusCode);
        $payload = [
            'success' => false,
            'message' => $message
        ];
        if ($errors !== null) {
            $payload['errors'] = $errors;
        }
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        exit;
    }

    public static function getJsonInput(): array
    {
        $raw = file_get_contents('php://input');
        if (empty($raw)) {
            return $_POST ?? [];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
