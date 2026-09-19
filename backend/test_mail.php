<?php
/**
 * PowerNet Mail Delivery Diagnostic Tool
 * Open in browser: https://powernet.ashiik.com/backend/test_mail.php
 */

declare(strict_types=1);

require_once __DIR__ . '/config/env.php';
require_once __DIR__ . '/services/MailService.php';

use PowerNet\Config\Env;
use PowerNet\Services\MailService;

header('Content-Type: text/html; charset=utf-8');

$targetEmail = $_GET['to'] ?? 'ashikulislam2070@gmail.com';
$smtpHost = (string)Env::get('MAIL_HOST', '');
$smtpPort = (string)Env::get('MAIL_PORT', '465');
$smtpUser = (string)Env::get('MAIL_USERNAME', '');
$smtpPassSet = !empty(Env::get('MAIL_PASSWORD', '')) ? 'Configured (YES)' : 'EMPTY (NO)';
$mailFrom = (string)Env::get('MAIL_FROM', '');

?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PowerNet Mail Diagnostic Tool</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background: #0F172A; color: #F8FAFC; padding: 40px 20px; }
    .card { max-width: 680px; margin: 0 auto; background: #1E293B; border-radius: 16px; padding: 32px; border: 1px solid #334155; }
    h1 { font-size: 22px; color: #38BDF8; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #334155; font-size: 14px; }
    th { color: #94A3B8; }
    .badge { padding: 4px 10px; border-radius: 9999px; font-weight: 700; font-size: 12px; }
    .badge-ok { background: #15803D; color: white; }
    .badge-warn { background: #B45309; color: white; }
    .btn { display: inline-block; background: #2563EB; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 700; border: none; cursor: pointer; }
    .result-box { margin-top: 24px; padding: 16px; border-radius: 12px; font-size: 14px; line-height: 1.6; }
    .result-success { background: rgba(22, 163, 74, 0.2); border: 1px solid #16A34A; color: #4ADE80; }
    .result-fail { background: rgba(220, 38, 38, 0.2); border: 1px solid #DC2626; color: #F87171; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚡ PowerNet Mail Delivery Diagnostic</h1>
    <p style="color: #94A3B8; font-size: 14px;">This tool tests whether Hostinger SMTP or PHP mail() is successfully reaching your inbox.</p>

    <table>
      <tr><th>Parameter</th><th>Value</th><th>Status</th></tr>
      <tr><td>MAIL_HOST</td><td><code><?= htmlspecialchars($smtpHost) ?></code></td><td><span class="badge <?= !empty($smtpHost) ? 'badge-ok' : 'badge-warn' ?>"><?= !empty($smtpHost) ? 'Configured' : 'Missing' ?></span></td></tr>
      <tr><td>MAIL_PORT</td><td><code><?= htmlspecialchars($smtpPort) ?></code></td><td><span class="badge badge-ok">OK</span></td></tr>
      <tr><td>MAIL_USERNAME</td><td><code><?= htmlspecialchars($smtpUser ?: '(empty)') ?></code></td><td><span class="badge <?= !empty($smtpUser) ? 'badge-ok' : 'badge-warn' ?>"><?= !empty($smtpUser) ? 'Set' : 'Empty' ?></span></td></tr>
      <tr><td>MAIL_PASSWORD</td><td><code><?= $smtpPassSet ?></code></td><td><span class="badge <?= $smtpPassSet !== 'EMPTY (NO)' ? 'badge-ok' : 'badge-warn' ?>"><?= $smtpPassSet !== 'EMPTY (NO)' ? 'Set' : 'Needs Password' ?></span></td></tr>
      <tr><td>MAIL_FROM</td><td><code><?= htmlspecialchars($mailFrom) ?></code></td><td><span class="badge badge-ok">OK</span></td></tr>
    </table>

    <form method="POST" style="margin: 24px 0;">
      <label style="display:block; font-size: 13.5px; margin-bottom: 8px; color: #CBD5E1;">Send Test Verification Email To:</label>
      <input type="email" name="test_email" value="<?= htmlspecialchars($targetEmail) ?>" required style="padding: 10px 14px; width: 65%; border-radius: 8px; border: 1px solid #475569; background: #0F172A; color: white; font-size: 14px; margin-right: 8px;">
      <button type="submit" class="btn">Send Test Email</button>
    </form>

    <?php
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $recipient = trim($_POST['test_email'] ?? $targetEmail);
        echo "<div style='margin-top: 20px; font-weight: 700;'>Attempting to dispatch test verification email to: " . htmlspecialchars($recipient) . "...</div>";

        $testToken = bin2hex(random_bytes(32));
        $sent = MailService::sendVerificationEmail($recipient, 'Ashik Islam', $testToken);

        if ($sent) {
            echo "<div class='result-box result-success'>";
            echo "<strong>✓ Test Email Dispatched Successfully!</strong><br>";
            echo "Please check your inbox (and Spam / Junk folder) at <strong>" . htmlspecialchars($recipient) . "</strong>.<br>";
            echo "Direct verification test URL: <a href='/verify-email?token={$testToken}' style='color: #60A5FA;'>/verify-email?token={$testToken}</a>";
            echo "</div>";
        } else {
            echo "<div class='result-box result-fail'>";
            echo "<strong>✕ Email Dispatch Failed</strong><br>";
            echo "Hostinger PHP mail() was unable to deliver. To fix this with 100% deliverability:<br>";
            echo "1. Go to Hostinger hPanel &rarr; <strong>Emails</strong> &rarr; Create <code>noreply@powernet.ashiik.com</code>.<br>";
            echo "2. Add the password to <code>.env</code> under <code>MAIL_PASSWORD</code>.<br>";
            echo "3. Alternatively, enter your Gmail address and 16-character App Password under <code>MAIL_USERNAME</code> and <code>MAIL_PASSWORD</code> in <code>.env</code>.";
            echo "</div>";
        }
    }
    ?>
  </div>
</body>
</html>
