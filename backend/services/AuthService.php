<?php
/**
 * PowerNet Authentication Service
 * User registration, password hashing, email verification, and password resets
 */

declare(strict_types=1);

namespace PowerNet\Services;

use PDO;
use Exception;
use PowerNet\Database\Connection;
use PowerNet\Middleware\Auth;
use PowerNet\Config\Env;

require_once dirname(__DIR__) . '/database/connection.php';
require_once dirname(__DIR__) . '/middleware/auth.php';
require_once __DIR__ . '/MailService.php';

class AuthService
{
    public static function register(string $name, string $email, string $password, string $confirmPassword): array
    {
        $name = trim($name);
        $email = strtolower(trim($email));

        if (empty($name) || strlen($name) < 2) {
            throw new Exception('Please enter a valid full name (minimum 2 characters).');
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new Exception('Please provide a valid email address.');
        }

        if (strlen($password) < 8) {
            throw new Exception('Password must be at least 8 characters long.');
        }

        if ($password !== $confirmPassword) {
            throw new Exception('Passwords do not match.');
        }

        $db = Connection::get();

        // Check unique email
        $checkStmt = $db->prepare("SELECT id, email_verified FROM users WHERE email = :email LIMIT 1");
        $checkStmt->execute(['email' => $email]);
        $existing = $checkStmt->fetch();

        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        if ($existing) {
            // If the account was pre-seeded (id 1) or is unverified, update password & resend verification
            if (!$existing['email_verified'] || (int)$existing['id'] === 1) {
                $db->beginTransaction();
                try {
                    $upd = $db->prepare("UPDATE users SET name = :name, password_hash = :password_hash, updated_at = NOW() WHERE id = :id");
                    $upd->execute([
                        'name'          => $name,
                        'password_hash' => $passwordHash,
                        'id'            => $existing['id']
                    ]);
                    $userId = (int)$existing['id'];

                    $token = bin2hex(random_bytes(32));
                    $tokenHash = hash('sha256', $token);
                    $expiresAt = date('Y-m-d H:i:s', time() + 86400);

                    $tokenStmt = $db->prepare("
                        INSERT INTO email_verifications (user_id, token_hash, expires_at, created_at)
                        VALUES (:user_id, :token_hash, :expires_at, NOW())
                    ");
                    $tokenStmt->execute([
                        'user_id'    => $userId,
                        'token_hash' => $tokenHash,
                        'expires_at' => $expiresAt
                    ]);

                    $db->commit();

                    MailService::sendVerificationEmail($email, $name, $token);
                    $appUrl = rtrim((string)Env::get('APP_URL', 'https://powernet.ashiik.com'), '/');
                    $verificationUrl = "{$appUrl}/verify-email?token=" . urlencode($token);

                    return [
                        'user_id'          => $userId,
                        'name'             => $name,
                        'email'            => $email,
                        'email_verified'   => (bool)$existing['email_verified'],
                        'verification_url' => $verificationUrl,
                        'message'          => 'Account updated! Verification email dispatched to your inbox.'
                    ];
                } catch (Exception $e) {
                    $db->rollBack();
                    throw $e;
                }
            } else {
                throw new Exception('An account with this email already exists. Please log in or use Forgot Password.');
            }
        }

        $db->beginTransaction();
        try {
            $insertStmt = $db->prepare("
                INSERT INTO users (name, email, password_hash, email_verified, created_at, updated_at)
                VALUES (:name, :email, :password_hash, 0, NOW(), NOW())
            ");
            $insertStmt->execute([
                'name'          => $name,
                'email'         => $email,
                'password_hash' => $passwordHash
            ]);
            $userId = (int)$db->lastInsertId();


            // Generate email verification token (one-time use, 24-hour expiration)
            $token = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $token);
            $expiresAt = date('Y-m-d H:i:s', time() + 86400);

            $tokenStmt = $db->prepare("
                INSERT INTO email_verifications (user_id, token_hash, expires_at, created_at)
                VALUES (:user_id, :token_hash, :expires_at, NOW())
            ");
            $tokenStmt->execute([
                'user_id'    => $userId,
                'token_hash' => $tokenHash,
                'expires_at' => $expiresAt
            ]);

            $db->commit();

            // Dispatch verification email
            MailService::sendVerificationEmail($email, $name, $token);

            $appUrl = rtrim((string)Env::get('APP_URL', 'https://powernet.ashiik.com'), '/');
            $verificationUrl = "{$appUrl}/verify-email?token=" . urlencode($token);

            return [
                'user_id'          => $userId,
                'name'             => $name,
                'email'            => $email,
                'email_verified'   => false,
                'verification_url' => $verificationUrl,
                'message'          => 'Account registered successfully! Please check your email inbox to verify your account.'
            ];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    public static function login(string $email, string $password): array
    {
        $email = strtolower(trim($email));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new Exception('Invalid email or password.');
        }

        $db = Connection::get();
        $stmt = $db->prepare("
            SELECT id, name, email, password_hash, email_verified 
            FROM users 
            WHERE email = :email 
            LIMIT 1
        ");
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            throw new Exception('Invalid email or password.');
        }

        if (isset($user['email_verified']) && !(bool)$user['email_verified']) {
            throw new Exception('Please verify your email address before signing in. Check your inbox.');
        }

        // Establish session
        Auth::startSession();
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['user_name'] = $user['name'];
        $_SESSION['user_email'] = $user['email'];

        $authToken = Auth::generateAuthToken((int)$user['id']);

        return [
            'token' => $authToken,
            'user'  => [
                'id'             => (int)$user['id'],
                'name'           => $user['name'],
                'email'          => $user['email'],
                'email_verified' => (bool)$user['email_verified']
            ]
        ];
    }

    public static function verifyEmail(string $token): array
    {
        if (empty($token) || strlen($token) < 16) {
            throw new Exception('Invalid or missing verification token.');
        }

        $db = Connection::get();
        $tokenHash = hash('sha256', $token);

        $stmt = $db->prepare("
            SELECT id, user_id, expires_at, used_at 
            FROM email_verifications 
            WHERE token_hash = :token_hash 
            LIMIT 1
        ");
        $stmt->execute(['token_hash' => $tokenHash]);
        $record = $stmt->fetch();

        if (!$record) {
            throw new Exception('Verification link is invalid or has already been used.');
        }

        if ($record['used_at'] !== null) {
            throw new Exception('This verification link has already been used.');
        }

        if (strtotime($record['expires_at']) < time()) {
            throw new Exception('Verification link has expired. Please request a new verification email.');
        }

        $db->beginTransaction();
        try {
            // Mark token as used
            $updateToken = $db->prepare("UPDATE email_verifications SET used_at = NOW() WHERE id = :id");
            $updateToken->execute(['id' => $record['id']]);

            // Update user verified flag
            $updateUser = $db->prepare("UPDATE users SET email_verified = 1, updated_at = NOW() WHERE id = :user_id");
            $updateUser->execute(['user_id' => $record['user_id']]);

            $db->commit();
            return ['message' => 'Email verified successfully. You may now log in.'];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    public static function resendVerification(string $email): array
    {
        $email = strtolower(trim($email));
        $db = Connection::get();

        $stmt = $db->prepare("SELECT id, name, email_verified FROM users WHERE email = :email LIMIT 1");
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if (!$user) {
            // Return generic message to avoid email enumeration
            return ['message' => 'If an account exists with that email, a verification link has been sent.'];
        }

        if ($user['email_verified']) {
            return ['message' => 'Your email address is already verified.'];
        }

        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $expiresAt = date('Y-m-d H:i:s', time() + 86400);

        $tokenStmt = $db->prepare("
            INSERT INTO email_verifications (user_id, token_hash, expires_at, created_at)
            VALUES (:user_id, :token_hash, :expires_at, NOW())
        ");
        $tokenStmt->execute([
            'user_id'    => $user['id'],
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt
        ]);

        MailService::sendVerificationEmail($email, $user['name'], $token);

        return ['message' => 'Verification link sent successfully. Please check your inbox.'];
    }

    public static function forgotPassword(string $email): array
    {
        $email = strtolower(trim($email));
        $db = Connection::get();

        $stmt = $db->prepare("SELECT id, name FROM users WHERE email = :email LIMIT 1");
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if ($user) {
            $token = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $token);
            $expiresAt = date('Y-m-d H:i:s', time() + 3600); // 1 hour

            $resetStmt = $db->prepare("
                INSERT INTO password_resets (user_id, token_hash, expires_at, created_at)
                VALUES (:user_id, :token_hash, :expires_at, NOW())
            ");
            $resetStmt->execute([
                'user_id'    => $user['id'],
                'token_hash' => $tokenHash,
                'expires_at' => $expiresAt
            ]);

            MailService::sendPasswordResetEmail($email, $user['name'], $token);
        }

        // Generic response prevents account enumeration
        return ['message' => 'If an account exists with that email, a password reset link has been dispatched.'];
    }

    public static function resetPassword(string $token, string $newPassword, string $confirmPassword): array
    {
        if ($newPassword !== $confirmPassword) {
            throw new Exception('Passwords do not match.');
        }

        if (strlen($newPassword) < 8) {
            throw new Exception('Password must be at least 8 characters long.');
        }

        $db = Connection::get();
        $tokenHash = hash('sha256', $token);

        $stmt = $db->prepare("
            SELECT id, user_id, expires_at, used_at 
            FROM password_resets 
            WHERE token_hash = :token_hash 
            LIMIT 1
        ");
        $stmt->execute(['token_hash' => $tokenHash]);
        $record = $stmt->fetch();

        if (!$record || $record['used_at'] !== null || strtotime($record['expires_at']) < time()) {
            throw new Exception('Password reset link is invalid or has expired.');
        }

        $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);

        $db->beginTransaction();
        try {
            $updateReset = $db->prepare("UPDATE password_resets SET used_at = NOW() WHERE id = :id");
            $updateReset->execute(['id' => $record['id']]);

            $updateUser = $db->prepare("UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE id = :id");
            $updateUser->execute([
                'hash' => $passwordHash,
                'id'   => $record['user_id']
            ]);

            $db->commit();
            return ['message' => 'Password reset successfully. You may now log in with your new password.'];
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
    }

    public static function logout(): void
    {
        Auth::startSession();
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $params["path"], $params["domain"],
                $params["secure"], $params["httponly"]
            );
        }
        session_destroy();
    }
}
