<?php
/**
 * PowerNet Environment Loader
 * Loads key-value pairs from .env into getenv() and $_ENV
 */

declare(strict_types=1);

namespace PowerNet\Config;

class Env
{
    private static array $cache = [];
    private static bool $loaded = false;

    public static function load(?string $filePath = null): void
    {
        if (self::$loaded && $filePath === null) {
            return;
        }

        $filePath = $filePath ?? dirname(__DIR__, 2) . '/.env';

        if (!file_exists($filePath)) {
            return;
        }

        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }

            $key = trim(substr($line, 0, $pos));
            $value = trim(substr($line, $pos + 1));

            // Strip enclosing quotes
            if (
                (str_starts_with($value, '"') && str_ends_with($value, '"')) ||
                (str_starts_with($value, "'") && str_ends_with($value, "'"))
            ) {
                $value = substr($value, 1, -1);
            }

            self::$cache[$key] = $value;
            $_ENV[$key] = $value;
            putenv("{$key}={$value}");
        }

        self::$loaded = true;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        self::load();

        if (array_key_exists($key, self::$cache)) {
            return self::$cache[$key];
        }

        $env = getenv($key);
        if ($env !== false) {
            return $env;
        }

        return $_ENV[$key] ?? $default;
    }
}
