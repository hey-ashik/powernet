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
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');

        // Controlled CORS: Only allow trusted origins with credentials
        $rawOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://powernet.ashiik.com',
            'https://powernet.ashik.com'
        ];

        if (class_exists('PowerNet\Config\Env')) {
            $appUrl = \PowerNet\Config\Env::get('APP_URL');
            if ($appUrl && !in_array($appUrl, $allowedOrigins, true)) {
                $allowedOrigins[] = rtrim($appUrl, '/');
            }
        }

        if (!empty($rawOrigin)) {
            $normalizedOrigin = rtrim($rawOrigin, '/');
            if (in_array($normalizedOrigin, $allowedOrigins, true)) {
                header("Access-Control-Allow-Origin: {$rawOrigin}");
                header('Access-Control-Allow-Credentials: true');
            }
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Device-Secret');

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

        // Sanitize 500 internal errors in production to prevent leaking database/server details
        if ($statusCode >= 500) {
            error_log("PowerNet Internal Error: {$message}");
            if (class_exists('PowerNet\Config\Env') && \PowerNet\Config\Env::get('APP_ENV') === 'production') {
                $message = 'An internal server error occurred. Please try again later.';
            }
        }

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
