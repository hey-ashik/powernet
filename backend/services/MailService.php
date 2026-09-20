<?php
/**
 * PowerNet High-Deliverability Mail Service
 * Supports Direct Authenticated SMTP (Hostinger / Gmail / Brevo / Mailtrap)
 * and Fallback RFC-Compliant Native Mail with Multipart Anti-Spam Headers
 */

declare(strict_types=1);

namespace PowerNet\Services;

use PowerNet\Config\Env;
use Exception;

class MailService
{
    public static function sendVerificationEmail(string $toEmail, string $name, string $token): bool
    {
        $appUrl = rtrim((string)Env::get('APP_URL', 'https://powernet.ashiik.com'), '/');
        $verificationUrl = "{$appUrl}/verify-email?token=" . urlencode($token);

        $subject = "Verify your PowerNet account";

        // 1. Clean Plain Text (Crucial for 0 spam score across Gmail / Outlook)
        $plainText = "Hello {$name},\n\n"
            . "Please verify your PowerNet account by opening this link:\n"
            . "{$verificationUrl}\n\n"
            . "This link is valid for 24 hours.\n"
            . "If you did not register for PowerNet, you can safely ignore this message.\n\n"
            . "PowerNet Energy Team\n"
            . "https://powernet.ashiik.com";

        // 2. Ultra-clean, to-the-point HTML template (No spammy markup)
        $html = "
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset='UTF-8'>
          <meta name='viewport' content='width=device-width, initial-scale=1.0'>
          <title>{$subject}</title>
        </head>
        <body style='margin: 0; padding: 32px 16px; background-color: #F4F5F9; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;'>
          <div style='max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; padding: 36px 28px; border: 1px solid #E2E8F0; box-shadow: 0 4px 20px rgba(0,0,0,0.04);'>
            <div style='margin-bottom: 24px;'>
              <span style='font-size: 22px; font-weight: 800; color: #0F172A; letter-spacing: -0.5px;'>Power<span style='color: #2563EB;'>Net</span></span>
            </div>
            
            <h1 style='font-size: 20px; font-weight: 700; color: #0F172A; margin: 0 0 12px 0;'>Confirm your email address</h1>
            
            <p style='font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;'>
              Hi " . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . ",<br>
              Tap the button below to verify your email and activate your PowerNet monitoring account.
            </p>
            
            <div style='margin: 28px 0;'>
              <a href='{$verificationUrl}' style='display: inline-block; background-color: #2563EB; color: #FFFFFF; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);'>
                Verify Email
              </a>
            </div>
            
            <hr style='border: none; border-top: 1px solid #F1F5F9; margin: 28px 0;'>
            
            <p style='font-size: 12px; color: #94A3B8; margin: 0;'>
              This link expires in 24 hours. If you didn't create an account, you can disregard this email.
            </p>
          </div>
        </body>
        </html>";

        return self::dispatch($toEmail, $subject, $plainText, $html);
    }

    public static function sendPasswordResetEmail(string $toEmail, string $name, string $token): bool
    {
        $appUrl = rtrim((string)Env::get('APP_URL', 'https://powernet.ashiik.com'), '/');
        $resetUrl = "{$appUrl}/reset-password?token=" . urlencode($token);

        $subject = "Reset your PowerNet password";

        $plainText = "Hello {$name},\n\n"
            . "We received a request to reset your PowerNet password:\n"
            . "{$resetUrl}\n\n"
            . "This link is valid for 1 hour.\n"
            . "If you did not request this, please ignore this email.\n\n"
            . "PowerNet Energy Team";

        $html = "
        <!DOCTYPE html>
        <html>
        <head><meta charset='UTF-8'></head>
        <body style='margin: 0; padding: 32px 16px; background-color: #F4F5F9; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;'>
          <div style='max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; padding: 36px 28px; border: 1px solid #E2E8F0;'>
            <div style='margin-bottom: 24px;'>
              <span style='font-size: 22px; font-weight: 800; color: #0F172A;'>Power<span style='color: #2563EB;'>Net</span></span>
            </div>
            <h1 style='font-size: 20px; font-weight: 700; color: #0F172A; margin: 0 0 12px 0;'>Reset your password</h1>
            <p style='font-size: 15px; color: #475569; line-height: 1.6;'>
              Hi " . htmlspecialchars($name, ENT_QUOTES, 'UTF-8') . ",<br>
              Click below to set a new password for your account.
            </p>
            <div style='margin: 28px 0;'>
              <a href='{$resetUrl}' style='display: inline-block; background-color: #0F172A; color: #FFFFFF; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);'>
                Reset Password
              </a>
            </div>
            <hr style='border: none; border-top: 1px solid #F1F5F9; margin: 28px 0;'>
            <p style='font-size: 12px; color: #94A3B8; margin: 0;'>
              This link is valid for 1 hour.
            </p>
          </div>
        </body>
        </html>";

        return self::dispatch($toEmail, $subject, $plainText, $html);
    }

    private static function dispatch(string $to, string $subject, string $plainText, string $html): bool
    {
        $smtpHost = trim((string)Env::get('MAIL_HOST', ''));
        $smtpUser = trim((string)Env::get('MAIL_USERNAME', ''));
        $smtpPass = trim((string)Env::get('MAIL_PASSWORD', ''));
        $smtpPort = (int)Env::get('MAIL_PORT', 465);

        // Always log for transparency and immediate local verification
        self::logEmail($to, $subject, $plainText);

        // 1. If SMTP is configured, use native authenticated SMTP (Highest Inbox deliverability)
        if (!empty($smtpHost) && $smtpHost !== 'localhost' && !empty($smtpUser)) {
            try {
                $sent = self::sendViaSmtp($smtpHost, $smtpPort, $smtpUser, $smtpPass, $to, $subject, $plainText, $html);
                if ($sent) {
                    return true;
                }
            } catch (Exception $e) {
                error_log("PowerNet SMTP Error: " . $e->getMessage());
            }
        }

        // 2. Fallback to PHP native mail() with full anti-spam RFC headers
        return self::sendViaPhpMail($to, $subject, $plainText, $html);
    }

    /**
     * Sends email via pure PHP native SMTP socket (SSL/TLS)
     * Compatible with Hostinger (smtp.hostinger.com:465), Gmail, Brevo, SendGrid
     */
    private static function sendViaSmtp(
        string $host,
        int $port,
        string $username,
        string $password,
        string $to,
        string $subject,
        string $plainText,
        string $html
    ): bool {
        $fromEmail = Env::get('MAIL_FROM', $username);
        $fromName = Env::get('MAIL_FROM_NAME', 'PowerNet');

        $isSsl = ($port === 465);
        $protocol = $isSsl ? "ssl" : "tcp";

        $context = stream_context_create([
            'ssl' => [
                'verify_peer'       => false,
                'verify_peer_name'  => false,
                'allow_self_signed' => true,
                'SNI_enabled'       => true,
                'peer_name'         => $host
            ]
        ]);

        $socket = @stream_socket_client("{$protocol}://{$host}:{$port}", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
        if (!$socket) {
            throw new Exception("Cannot connect to SMTP server {$host}:{$port} - {$errstr} ({$errno})");
        }

        stream_set_timeout($socket, 15);

        // Helper to read multi-line SMTP responses
        $readResponse = function() use ($socket): string {
            $response = '';
            while ($line = fgets($socket, 512)) {
                $response .= $line;
                if (strlen($line) >= 4 && substr($line, 3, 1) === ' ') {
                    break;
                }
            }
            return $response;
        };

        $res = $readResponse();
        if (!str_starts_with($res, '220')) {
            throw new Exception("SMTP Greeting failed: " . $res);
        }

        // Send EHLO
        fputs($socket, "EHLO powernet.ashiik.com\r\n");
        $res = $readResponse();

        // STARTTLS if port 587
        if ($port === 587) {
            fputs($socket, "STARTTLS\r\n");
            $res = $readResponse();
            if (!str_starts_with($res, '220')) {
                throw new Exception("STARTTLS failed: " . $res);
            }
            stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            fputs($socket, "EHLO powernet.ashiik.com\r\n");
            $res = $readResponse();
        }

        // AUTH LOGIN
        fputs($socket, "AUTH LOGIN\r\n");
        $res = $readResponse();
        if (!str_starts_with($res, '334')) {
            throw new Exception("AUTH LOGIN rejected: " . $res);
        }

        fputs($socket, base64_encode($username) . "\r\n");
        $res = $readResponse();
        if (!str_starts_with($res, '334')) {
            throw new Exception("Username rejected: " . $res);
        }

        fputs($socket, base64_encode($password) . "\r\n");
        $res = $readResponse();
        if (!str_starts_with($res, '235')) {
            throw new Exception("SMTP Password rejected: " . $res);
        }

        // MAIL FROM & RCPT TO
        fputs($socket, "MAIL FROM: <{$fromEmail}>\r\n");
        $res = $readResponse();
        if (!str_starts_with($res, '250')) {
            throw new Exception("MAIL FROM rejected: " . $res);
        }

        fputs($socket, "RCPT TO: <{$to}>\r\n");
        $res = $readResponse();
        if (!str_starts_with($res, '250')) {
            throw new Exception("RCPT TO rejected: " . $res);
        }

        // DATA
        fputs($socket, "DATA\r\n");
        $res = $readResponse();
        if (!str_starts_with($res, '354')) {
            throw new Exception("DATA initiation rejected: " . $res);
        }

        $boundary = "----=_PowerNet_" . md5((string)microtime());
        $domain = parse_url(Env::get('APP_URL', 'https://powernet.ashiik.com'), PHP_URL_HOST) ?: 'powernet.ashiik.com';
        $messageId = "<" . md5(uniqid((string)time())) . "@" . $domain . ">";
        $date = date('r');

        $headers  = "Date: {$date}\r\n";
        $headers .= "From: {$fromName} <{$fromEmail}>\r\n";
        $headers .= "To: <{$to}>\r\n";
        $headers .= "Subject: {$subject}\r\n";
        $headers .= "Message-ID: {$messageId}\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
        $headers .= "X-Mailer: PowerNet Mailer 1.0\r\n";

        $body  = "--{$boundary}\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= "{$plainText}\r\n\r\n";
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= "{$html}\r\n\r\n";
        $body .= "--{$boundary}--\r\n";

        fputs($socket, $headers . "\r\n" . $body . "\r\n.\r\n");
        $finalRes = $readResponse();

        fputs($socket, "QUIT\r\n");
        fclose($socket);

        $success = str_starts_with($finalRes, '250');
        self::logStatus($to, $success ? 'SMTP SUCCESS' : 'SMTP FAILED: ' . trim($finalRes));
        return $success;
    }

    /**
     * Fallback standard mail() with full anti-spam headers
     */
    private static function sendViaPhpMail(string $to, string $subject, string $plainText, string $html): bool
    {
        $fromEmail = Env::get('MAIL_FROM', 'noreply@powernet.ashiik.com');
        $fromName = Env::get('MAIL_FROM_NAME', 'PowerNet');

        $boundary = "==_PowerNet_Multipart_" . md5((string)microtime());
        $messageId = "<" . md5(uniqid((string)time())) . "@" . (parse_url(Env::get('APP_URL', 'powernet.ashiik.com'), PHP_URL_HOST) ?: 'powernet.ashiik.com') . ">";

        $headers  = "From: {$fromName} <{$fromEmail}>\r\n";
        $headers .= "Reply-To: {$fromEmail}\r\n";
        $headers .= "Return-Path: {$fromEmail}\r\n";
        $headers .= "Date: " . date('r') . "\r\n";
        $headers .= "Message-ID: {$messageId}\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
        $headers .= "X-Mailer: PowerNet PHP Mailer\r\n";
        $headers .= "Auto-Submitted: auto-generated\r\n";

        $body  = "--{$boundary}\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= "{$plainText}\r\n\r\n";
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n";
        $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
        $body .= "{$html}\r\n\r\n";
        $body .= "--{$boundary}--\r\n";

        // -f parameter forces valid envelope sender on Hostinger sendmail
        $additionalParams = "-f" . escapeshellarg($fromEmail);

        $sent = @mail($to, $subject, $body, $headers, $additionalParams);
        if (!$sent) {
            // Some shared hosting configurations disallow 5th parameter (-f)
            $sent = @mail($to, $subject, $body, $headers);
        }

        self::logStatus($to, $sent ? 'PHP mail() SUCCESS' : 'PHP mail() FAILED');
        return $sent;
    }

    private static function logStatus(string $to, string $status): void
    {
        $logDir = dirname(__DIR__, 2) . '/logs';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0777, true);
        }
        @file_put_contents("{$logDir}/mail.log", "[" . date('Y-m-d H:i:s') . "] {$to} -> {$status}\n", FILE_APPEND);
    }

    private static function logEmail(string $to, string $subject, string $plainText): void
    {
        $logDir = dirname(__DIR__, 2) . '/logs';
        if (!is_dir($logDir)) {
            @mkdir($logDir, 0777, true);
        }
        $entry = sprintf(
            "[%s] TO: %s | SUBJECT: %s\n%s\n%s\n",
            date('Y-m-d H:i:s'),
            $to,
            $subject,
            $plainText,
            str_repeat('-', 50)
        );
        @file_put_contents("{$logDir}/mail.log", $entry, FILE_APPEND);
    }
}
