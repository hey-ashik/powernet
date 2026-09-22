/**
 * PowerNet Local Development Server
 * Pure Node.js Standard Library (zero external dependencies)
 * Serves Clean URLs: /register, /login, /dashboard, etc.
 * Provides Local Mock Backend for /api/* & /backend/api/* endpoints
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const crypto = require('crypto');

// Parse .env dynamically if present into process.env
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {}

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

let localUser = {
  id: 1,
  name: 'Ashikul Islam',
  email: 'ashikulislam2070@gmail.com',
  email_verified: true
};

const pendingVerifications = {};
const pendingResets = {};

/**
 * Native Hostinger Authenticated SMTP Dispatcher
 * Pure Node.js standard library (TLS Socket over Port 465)
 */
function sendSmtpEmail({ to, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const host = process.env.MAIL_HOST || 'smtp.hostinger.com';
    const port = parseInt(process.env.MAIL_PORT || '465', 10);
    const user = process.env.MAIL_USERNAME || 'noreply@powernet.ashiik.com';
    const pass = process.env.MAIL_PASSWORD || '';
    const from = process.env.MAIL_FROM ? `PowerNet <${process.env.MAIL_FROM}>` : `PowerNet <${user}>`;

    const socket = tls.connect(port, host, { servername: host }, () => {});

    socket.setTimeout(20000, () => {
      socket.destroy();
      reject(new Error('SMTP timeout'));
    });

    let buffer = '';
    let state = 'INIT';

    function sendCmd(cmd) {
      socket.write(cmd + '\r\n');
    }

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line) continue;
        const code = line.substring(0, 3);
        const isLast = line.charAt(3) !== '-';
        if (!isLast) continue;

        if (state === 'INIT' && code === '220') {
          state = 'EHLO';
          sendCmd('EHLO powernet.ashiik.com');
        } else if (state === 'EHLO' && code === '250') {
          state = 'AUTH_LOGIN';
          sendCmd('AUTH LOGIN');
        } else if (state === 'AUTH_LOGIN' && code === '334') {
          state = 'AUTH_USER';
          sendCmd(Buffer.from(user).toString('base64'));
        } else if (state === 'AUTH_USER' && code === '334') {
          state = 'AUTH_PASS';
          sendCmd(Buffer.from(pass).toString('base64'));
        } else if (state === 'AUTH_PASS' && code === '235') {
          state = 'MAIL_FROM';
          sendCmd(`MAIL FROM:<${user}>`);
        } else if (state === 'MAIL_FROM' && code === '250') {
          state = 'RCPT_TO';
          sendCmd(`RCPT TO:<${to}>`);
        } else if (state === 'RCPT_TO' && code === '250') {
          state = 'DATA';
          sendCmd('DATA');
        } else if (state === 'DATA' && code === '354') {
          state = 'BODY';
          const boundary = '----=_PowerNet_' + Date.now();
          const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@powernet.ashiik.com>`;
          const headers = [
            `Date: ${new Date().toUTCString()}`,
            `From: ${from}`,
            `To: ${to}`,
            `Subject: ${subject}`,
            `Message-ID: ${messageId}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            `X-Mailer: PowerNet Mailer`
          ].join('\r\n');

          const body = [
            `--${boundary}`,
            `Content-Type: text/plain; charset=UTF-8`,
            `Content-Transfer-Encoding: 7bit`,
            '',
            text,
            '',
            `--${boundary}`,
            `Content-Type: text/html; charset=UTF-8`,
            `Content-Transfer-Encoding: 7bit`,
            '',
            html,
            '',
            `--${boundary}--`
          ].join('\r\n');

          socket.write(headers + '\r\n\r\n' + body + '\r\n.\r\n');
        } else if (state === 'BODY') {
          if (code === '250') {
            state = 'QUIT';
            sendCmd('QUIT');
            resolve(true);
          } else {
            reject(new Error('SMTP DATA failed: ' + line));
          }
        }
      }
    });

    socket.on('error', reject);
  });
}

function getVerificationHtml(name, verificationUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1.0'>
  <title>Verify your PowerNet account</title>
</head>
<body style='margin: 0; padding: 32px 16px; background-color: #F4F5F9; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;'>
  <div style='max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; padding: 36px 28px; border: 1px solid #E2E8F0; box-shadow: 0 4px 20px rgba(0,0,0,0.04);'>
    <div style='margin-bottom: 24px;'>
      <span style='font-size: 22px; font-weight: 800; color: #0F172A; letter-spacing: -0.5px;'>Power<span style='color: #2563EB;'>Net</span></span>
    </div>
    
    <h1 style='font-size: 20px; font-weight: 700; color: #0F172A; margin: 0 0 12px 0;'>Confirm your email address</h1>
    
    <p style='font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;'>
      Hi ${name},<br>
      Tap the button below to verify your email and activate your PowerNet monitoring account.
    </p>
    
    <div style='margin: 28px 0;'>
      <a href='${verificationUrl}' style='display: inline-block; background-color: #2563EB; color: #FFFFFF; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);'>
        Verify Email
      </a>
    </div>
    
    <hr style='border: none; border-top: 1px solid #F1F5F9; margin: 28px 0;'>
    
    <p style='font-size: 12px; color: #94A3B8; margin: 0;'>
      This link expires in 24 hours. If you didn't create an account, you can disregard this email.
    </p>
  </div>
</body>
</html>`;
}

function getPasswordResetHtml(name, resetUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset='UTF-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1.0'>
  <title>Reset your PowerNet password</title>
</head>
<body style='margin: 0; padding: 32px 16px; background-color: #F4F5F9; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;'>
  <div style='max-width: 500px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; padding: 36px 28px; border: 1px solid #E2E8F0; box-shadow: 0 4px 20px rgba(0,0,0,0.04);'>
    <div style='margin-bottom: 24px;'>
      <span style='font-size: 22px; font-weight: 800; color: #0F172A;'>Power<span style='color: #2563EB;'>Net</span></span>
    </div>
    <h1 style='font-size: 20px; font-weight: 700; color: #0F172A; margin: 0 0 12px 0;'>Reset your password</h1>
    <p style='font-size: 15px; color: #475569; line-height: 1.6;'>
      Hi ${name},<br>
      Click below to set a new password for your account.
    </p>
    <div style='margin: 28px 0;'>
      <a href='${resetUrl}' style='display: inline-block; background-color: #0F172A; color: #FFFFFF; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);'>
        Reset Password
      </a>
    </div>
    <hr style='border: none; border-top: 1px solid #F1F5F9; margin: 28px 0;'>
    <p style='font-size: 12px; color: #94A3B8; margin: 0;'>
      This link is valid for 1 hour. If you did not request a password reset, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;
}

// Master IoT Device Registry (Simulates provisioned devices in database)
// user_id === null: Available to be claimed/connected
// user_id !== null: In use by that user account
let hardwareRegistry = [
  { device_id: 'pnw101', device_name: 'Device', user_id: null },
  { device_id: 'pnw105', device_name: 'Device', user_id: null },
  { device_id: 'pnw107', device_name: 'Device', user_id: 2 }, // Already in DB / claimed
  { device_id: 'pnw202', device_name: 'Main Distribution Sub-Meter', user_id: 3 }, // In use
  { device_id: 'pnw303', device_name: 'Solar Phase Inverter', user_id: 4 } // In use
];

const DEVICES_FILE = path.join(__dirname, 'scratch', 'local_devices.json');
let localDevices = [];
try {
  if (fs.existsSync(DEVICES_FILE)) {
    localDevices = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    if (Array.isArray(localDevices) && localDevices.length > 0) {
      localDevices.forEach(d => {
        const reg = hardwareRegistry.find(r => r.device_id.toLowerCase() === d.device_id.toLowerCase());
        if (reg) reg.user_id = 1;
      });
    }
  }
} catch {}

function saveLocalDevices() {
  try {
    const dir = path.dirname(DEVICES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(localDevices, null, 2), 'utf8');
  } catch {}
}

// Seed 24h of telemetry (one reading per 15 min = 96 points, newest first at index 0)
const localTelemetry = (() => {
  const points = [];
  const now = Date.now();
  for (let i = 0; i <= 95; i++) {
    const ts = now - i * 15 * 60 * 1000;
    const hour = new Date(ts).getHours();
    // Simulate realistic load curve: low at night, peak midday
    const loadFactor = hour >= 8 && hour <= 20 ? 0.7 + Math.random() * 0.3 : 0.2 + Math.random() * 0.2;
    const voltage = +(218 + Math.random() * 6).toFixed(1);
    const current = +(loadFactor * 11 + Math.random() * 1.5).toFixed(2);
    const pf = 0.92 + Math.random() * 0.06;
    const powerKw = +((voltage * current * pf) / 1000).toFixed(3);
    const energyKwh = +(loadFactor * 3.2 + (95 - i) * 0.02 + 1.8).toFixed(3);
    const tempC = +(28 + loadFactor * 12 + Math.random() * 2).toFixed(1);
    const isoDate = new Date(ts).toISOString();
    
    // Bangladesh Time (Asia/Dhaka, UTC+6) formatted time
    let formattedBdTime = '--:--:--';
    try {
      formattedBdTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(new Date(ts));
    } catch {
      formattedBdTime = new Date(ts).toLocaleTimeString();
    }

    let statusBadge = 'Normal';
    let statusType = 'success';
    if (powerKw > 3.0) {
      statusBadge = 'High Load';
      statusType = 'danger';
    } else if (powerKw > 1.8) {
      statusBadge = 'Moderate';
      statusType = 'warning';
    } else if (powerKw < 0.2) {
      statusBadge = 'Standby';
      statusType = 'info';
    }

    points.push({
      device_id: 'pnw101',
      device_name: 'Device',
      voltage: voltage,
      current: current,
      power: powerKw,
      avg_power: powerKw,
      energy: energyKwh,
      max_energy: energyKwh,
      temperature: tempC,
      avg_temperature: tempC,
      is_online: true,
      status_badge: statusBadge,
      status_type: statusType,
      last_seen_relative: i === 0 ? 'Just now' : `${i * 15}m ago`,
      created_at: isoDate,
      recorded_at: isoDate,
      bucket_time: isoDate,
      formatted_time: formattedBdTime
    });
  }
  return points;
})();

// Real-Time Live Telemetry Streamer (every 10 seconds: streams new live packet in Bangladesh Time)
setInterval(() => {
  if (!localDevices || localDevices.length === 0) return;
  const dev = localDevices[0];
  const now = Date.now();
  const hour = new Date(now).getHours();
  const loadFactor = hour >= 8 && hour <= 20 ? 0.7 + Math.random() * 0.3 : 0.2 + Math.random() * 0.2;

  // Real-time subtle fluctuation from previous reading
  const prevV = localTelemetry.length > 0 ? Number(localTelemetry[0].voltage || 219.6) : 219.6;
  const vDelta = +(Math.random() * 1.6 - 0.8).toFixed(1);
  let voltage = +(prevV + vDelta).toFixed(1);
  if (voltage < 215.0) voltage = 216.5;
  if (voltage > 228.0) voltage = 226.5;

  const prevC = localTelemetry.length > 0 ? Number(localTelemetry[0].current || 9.06) : 9.06;
  const cDelta = +(Math.random() * 0.4 - 0.2).toFixed(2);
  let current = +(prevC + cDelta).toFixed(2);
  if (current < 1.0) current = 2.5;
  if (current > 25.0) current = 22.0;

  const pf = 0.92 + Math.random() * 0.06;
  const powerKw = +((voltage * current * pf) / 1000).toFixed(3);

  const prevEnergy = localTelemetry.length > 0 ? Number(localTelemetry[0].energy || 2.5) : 2.5;
  const energyKwh = +(prevEnergy + (powerKw * 10) / 3600).toFixed(3);

  const prevT = localTelemetry.length > 0 ? Number(localTelemetry[0].temperature || 37.9) : 37.9;
  const tDelta = +(Math.random() * 0.6 - 0.3).toFixed(1);
  let tempC = +(prevT + tDelta).toFixed(1);
  if (tempC < 25.0) tempC = 26.5;
  if (tempC > 65.0) tempC = 60.0;
  const isoDate = new Date(now).toISOString();

  let formattedBdTime = '--:--:--';
  try {
    formattedBdTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(now));
  } catch {
    formattedBdTime = new Date(now).toLocaleTimeString();
  }

  let statusBadge = 'Normal';
  let statusType = 'success';
  if (powerKw > 3.0) {
    statusBadge = 'High Load';
    statusType = 'danger';
  } else if (powerKw > 1.8) {
    statusBadge = 'Moderate';
    statusType = 'warning';
  } else if (powerKw < 0.2) {
    statusBadge = 'Standby';
    statusType = 'info';
  }

  const packet = {
    device_id: dev.device_id,
    device_name: dev.device_name || 'Device',
    voltage: voltage,
    current: current,
    power: powerKw,
    avg_power: powerKw,
    energy: energyKwh,
    max_energy: energyKwh,
    temperature: tempC,
    avg_temperature: tempC,
    is_online: true,
    status_badge: statusBadge,
    status_type: statusType,
    last_seen_relative: 'Just now',
    created_at: isoDate,
    recorded_at: isoDate,
    bucket_time: isoDate,
    formatted_time: formattedBdTime
  };

  localTelemetry.unshift(packet);
  if (localTelemetry.length > 150) localTelemetry.pop();
}, 10000);

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = parsedUrl.pathname;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle local API endpoints (/api/... or /backend/api/...)
  if (pathname.startsWith('/api/') || pathname.startsWith('/backend/api/')) {
    const apiRoute = pathname.replace(/^\/backend/, '').replace(/\.php$/, '');

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let input = {};
      try { input = JSON.parse(body); } catch {}

      res.setHeader('Content-Type', 'application/json; charset=UTF-8');

      if (apiRoute === '/api/auth/login') {
        const email = (input.email || 'ashikulislam2070@gmail.com').toLowerCase().trim();
        
        // Enforce email verification if user was registered but unverified
        if (localUser && localUser.email.toLowerCase() === email && localUser.email_verified === false) {
          res.statusCode = 400;
          res.end(JSON.stringify({
            success: false,
            message: 'Please verify your email address before signing in. Check your inbox.'
          }));
          return;
        }

        const name = (localUser && localUser.email.toLowerCase() === email) ? localUser.name : 'Ashik Islam';
        localUser = { id: 1, name, email, email_verified: true };

        res.end(JSON.stringify({
          success: true,
          message: 'Login successful',
          data: {
            token: 'pnet_local_token_' + Date.now(),
            user: localUser
          }
        }));
        return;
      }

      if (apiRoute === '/api/auth/register') {
        const name = input.name || 'PowerNet User';
        const email = (input.email || 'ashikulislam2070@gmail.com').toLowerCase().trim();
        localUser = { id: 1, name, email, email_verified: false };

        const token = crypto.randomBytes(24).toString('hex');
        pendingVerifications[token] = { email, name, expiresAt: Date.now() + 86400000 };

        const hostHeader = req.headers['host'] || `localhost:${PORT}`;
        const protocol = req.headers['x-forwarded-proto'] || (hostHeader.includes('localhost') ? 'http' : 'https');
        const verificationUrl = `${protocol}://${hostHeader}/verify-email?token=${token}`;

        // Send real email via Hostinger Authenticated SMTP (background async)
        sendSmtpEmail({
          to: email,
          subject: 'Verify your PowerNet account',
          text: `Hello ${name},\n\nPlease verify your PowerNet account by opening this link:\n${verificationUrl}\n\nThis link is valid for 24 hours.\n\nPowerNet Energy Team`,
          html: getVerificationHtml(name, verificationUrl)
        }).then(() => {
          console.log(`[SMTP SUCCESS] Verification email delivered to ${email}`);
        }).catch((err) => {
          console.error(`[SMTP ERROR] Verification email to ${email} failed:`, err.message);
        });

        res.end(JSON.stringify({
          success: true,
          message: 'Account registered successfully! Please check your email inbox to verify.',
          data: {
            user_id: 1,
            name: name,
            email: email,
            email_verified: false,
            verification_url: verificationUrl
          }
        }));
        return;
      }

      if (apiRoute === '/api/auth/verify-email') {
        const token = parsedUrl.searchParams.get('token') || '';
        if (localUser) {
          localUser.email_verified = true;
        }
        if (token && pendingVerifications[token]) {
          delete pendingVerifications[token];
        }
        res.end(JSON.stringify({
          success: true,
          message: 'Email verified successfully. You may now log in.'
        }));
        return;
      }

      if (apiRoute === '/api/auth/forgot-password') {
        const email = (input.email || '').toLowerCase().trim();
        const name = (localUser && localUser.email.toLowerCase() === email) ? localUser.name : 'PowerNet User';

        const token = crypto.randomBytes(24).toString('hex');
        pendingResets[token] = { email, expiresAt: Date.now() + 3600000 };

        const hostHeader = req.headers['host'] || `localhost:${PORT}`;
        const protocol = req.headers['x-forwarded-proto'] || (hostHeader.includes('localhost') ? 'http' : 'https');
        const resetUrl = `${protocol}://${hostHeader}/reset-password?token=${token}`;

        // Send real email via Hostinger Authenticated SMTP (background async)
        if (email) {
          sendSmtpEmail({
            to: email,
            subject: 'Reset your PowerNet password',
            text: `Hello ${name},\n\nWe received a request to reset your PowerNet password:\n${resetUrl}\n\nThis link is valid for 1 hour.\n\nPowerNet Energy Team`,
            html: getPasswordResetHtml(name, resetUrl)
          }).then(() => {
            console.log(`[SMTP SUCCESS] Password reset email delivered to ${email}`);
          }).catch((err) => {
            console.error(`[SMTP ERROR] Reset email to ${email} failed:`, err.message);
          });
        }

        res.end(JSON.stringify({
          success: true,
          message: 'If your email is registered, a password reset link has been dispatched to your inbox.'
        }));
        return;
      }

      if (apiRoute === '/api/auth/reset-password') {
        const token = input.token || '';
        if (localUser) {
          localUser.password_updated = true;
        }
        if (token && pendingResets[token]) {
          delete pendingResets[token];
        }
        res.end(JSON.stringify({
          success: true,
          message: 'Password reset successfully! You can now log in with your new password.'
        }));
        return;
      }

      if (apiRoute === '/api/auth/me') {
        res.end(JSON.stringify({
          success: true,
          data: localUser
        }));
        return;
      }

      if (apiRoute === '/api/auth/profile') {
        if (input && input.name) localUser.name = input.name.trim();
        if (input && input.email) localUser.email = input.email.trim();
        res.end(JSON.stringify({
          success: true,
          message: 'Profile updated successfully!',
          data: localUser
        }));
        return;
      }

      if (apiRoute === '/api/telemetry/latest') {
        const queryDevId = parsedUrl.searchParams.get('device_id') || 'pnw101';
        const latest = (localTelemetry && localTelemetry.length > 0) ? { ...localTelemetry[0] } : null;
        const prev = (localTelemetry && localTelemetry.length > 1) ? localTelemetry[1] : null;
        if (latest) {
          if (prev) {
            latest.prev_voltage = prev.voltage;
            latest.prev_current = prev.current;
            latest.prev_temperature = prev.temperature;
          }
          if (latest.is_online === false) {
            latest.voltage = 0.0;
            latest.current = 0.0;
            latest.power = 0.0;
            latest.temperature = 0.0;
            latest.prev_voltage = 0.0;
            latest.prev_current = 0.0;
            latest.prev_temperature = 0.0;
          }
        }
        res.end(JSON.stringify({
          success: true,
          data: latest || {
            device_id: queryDevId,
            device_name: (localDevices.find(d => d.device_id === queryDevId)?.device_name) || 'Device',
            voltage: 0.0,
            prev_voltage: 0.0,
            current: 0.0,
            prev_current: 0.0,
            power: 0.0,
            energy: 0.0,
            temperature: null,
            prev_temperature: null,
            is_online: false,
            last_seen_relative: 'Waiting for device packets'
          }
        }));
        return;
      }

      if (apiRoute === '/api/telemetry/logs') {
        const limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
        const topLogs = (localTelemetry || []).slice(0, limit);

        res.end(JSON.stringify({
          success: true,
          data: topLogs
        }));
        return;
      }

      if (apiRoute === '/api/telemetry/clear-logs' || apiRoute === '/api/telemetry/clear') {
        localTelemetry.length = 0;
        res.end(JSON.stringify({
          success: true,
          message: 'Telemetry logs cleared successfully.'
        }));
        return;
      }

      if (apiRoute === '/api/telemetry/history') {
        const range = parsedUrl.searchParams.get('range') || '7d';
        const BD_TZ = 'Asia/Dhaka';
        const now = new Date();
        const historyPoints = [];

        if (range === '7d') {
          // 7 days in Bangladesh Time (Asia/Dhaka)
          for (let i = 6; i >= 0; i--) {
            const targetDate = new Date(now.getTime() - i * 86400000);
            const bucket_time = new Intl.DateTimeFormat('en-CA', { timeZone: BD_TZ }).format(targetDate);
            const loadFactor = 0.6 + Math.random() * 0.35;
            const isToday = (i === 0);
            const livePower = localTelemetry.length > 0 ? Number(localTelemetry[0].power) : 2.155;
            const liveEnergy = localTelemetry.length > 0 ? Number(localTelemetry[0].energy) : 3.450;
            historyPoints.push({
              bucket_time,
              avg_power: isToday ? livePower : +(1.9 + loadFactor * 1.5).toFixed(3),
              max_power: isToday ? +(livePower * 1.25).toFixed(3) : +(3.2 + loadFactor * 1.6).toFixed(3),
              max_energy: isToday ? liveEnergy : +(14 + loadFactor * 10).toFixed(2),
              avg_voltage: +(220 + Math.random() * 4).toFixed(1),
              avg_current: +(7 + loadFactor * 5).toFixed(2),
              avg_temperature: +(34 + Math.random() * 4).toFixed(1),
              sample_count: 96
            });
          }
        } else if (range === '30d') {
          // Days of current month in Bangladesh Time (Asia/Dhaka) starting from 1
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: BD_TZ,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
          }).formatToParts(now);
          const bdYear = parseInt(parts.find(p => p.type === 'year')?.value || now.getFullYear(), 10);
          const bdMonth = parseInt(parts.find(p => p.type === 'month')?.value || (now.getMonth() + 1), 10);
          const bdToday = parseInt(parts.find(p => p.type === 'day')?.value || now.getDate(), 10);
          const daysInMonth = new Date(bdYear, bdMonth, 0).getDate();
          const totalDays = Math.max(30, daysInMonth);

          for (let d = 1; d <= totalDays; d++) {
            const mStr = String(bdMonth).padStart(2, '0');
            const dStr = String(d).padStart(2, '0');
            const bucket_time = `${bdYear}-${mStr}-${dStr}`;
            const isToday = (d === bdToday);
            const isFuture = (d > bdToday);
            const loadFactor = 0.5 + Math.random() * 0.45;
            const livePower = localTelemetry.length > 0 ? Number(localTelemetry[0].power) : 2.155;
            const liveEnergy = localTelemetry.length > 0 ? Number(localTelemetry[0].energy) : 3.450;
            historyPoints.push({
              bucket_time,
              avg_power: isFuture ? 0 : (isToday ? livePower : +(1.7 + loadFactor * 1.6).toFixed(3)),
              max_power: isFuture ? 0 : (isToday ? +(livePower * 1.25).toFixed(3) : +(3.0 + loadFactor * 1.8).toFixed(3)),
              max_energy: isFuture ? 0 : (isToday ? liveEnergy : +(12 + loadFactor * 12).toFixed(2)),
              avg_voltage: isFuture ? 0 : +(220 + Math.random() * 4).toFixed(1),
              avg_current: isFuture ? 0 : +(6.5 + loadFactor * 5.5).toFixed(2),
              avg_temperature: isFuture ? 0 : +(33 + Math.random() * 5).toFixed(1),
              sample_count: isFuture ? 0 : 96
            });
          }
        } else if (range === '12m') {
          // 12 months in Bangladesh Time (Asia/Dhaka)
          for (let i = 11; i >= 0; i--) {
            const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const bucket_time = new Intl.DateTimeFormat('en-CA', { timeZone: BD_TZ, year: 'numeric', month: '2-digit' }).format(targetDate);
            const loadFactor = 0.65 + Math.random() * 0.3;
            historyPoints.push({
              bucket_time,
              avg_power: +(2.1 + loadFactor * 1.1).toFixed(3),
              max_power: +(4.5 + Math.random() * 1.2).toFixed(3),
              max_energy: +(380 + loadFactor * 190).toFixed(2),
              avg_voltage: +(221 + Math.random() * 3).toFixed(1),
              sample_count: 2880
            });
          }
        } else {
          // 24h default from local telemetry
          localTelemetry.forEach(pt => historyPoints.push(pt));
        }

        res.end(JSON.stringify({
          success: true,
          data: { device_id: 'pnw101', range: range, points: historyPoints }
        }));
        return;
      }

      if (apiRoute === '/api/devices/list') {
        res.end(JSON.stringify({
          success: true,
          data: localDevices
        }));
        return;
      }

      if (apiRoute === '/api/devices/connect') {
        // 1. Enforce user login: without login they cannot connect device
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!token && !localUser) {
          res.end(JSON.stringify({
            success: false,
            message: 'Unauthorized. Please log in to connect a device.'
          }));
          return;
        }

        const devId = (input.device_id || '').trim();
        const devName = input.device_name && input.device_name.trim() ? input.device_name.trim() : 'Device';

        if (!devId) {
          res.end(JSON.stringify({
            success: false,
            message: 'Enter Correct Device ID'
          }));
          return;
        }

        const devIdLower = devId.toLowerCase();

        const currentUserId = localUser ? localUser.id : 1;

        // 2. Check if device is claimed / in-use by ANOTHER user account
        const claimedByOther = hardwareRegistry.find(
          d => d.device_id.toLowerCase() === devIdLower && d.user_id !== null && d.user_id !== currentUserId
        );

        if (claimedByOther) {
          res.end(JSON.stringify({
            success: false,
            message: 'Enter Correct Device ID'
          }));
          return;
        }

        // Release any previous device this user had connected (1 device per user)
        hardwareRegistry.forEach(d => {
          if (d.user_id === currentUserId && d.device_id.toLowerCase() !== devIdLower) {
            d.user_id = null;
          }
        });

        // 3. Connect device (add to registry if brand new, or claim if available)
        let registryEntry = hardwareRegistry.find(d => d.device_id.toLowerCase() === devIdLower);
        if (!registryEntry) {
          registryEntry = { device_id: devId, device_name: devName, user_id: currentUserId };
          hardwareRegistry.push(registryEntry);
        } else {
          registryEntry.user_id = currentUserId;
          registryEntry.device_name = devName;
        }

        const connectedDev = {
          id: 1,
          device_id: registryEntry.device_id,
          device_name: devName,
          computed_status: 'online',
          status_display: 'Online',
          last_seen_relative: 'Just connected'
        };

        localDevices = [connectedDev];
        saveLocalDevices();

        // Update telemetry data so stream is tied to the connected device
        if (localTelemetry && localTelemetry.length > 0) {
          localTelemetry.forEach(pt => {
            pt.device_id = registryEntry.device_id;
            pt.device_name = devName;
          });
        }

        res.end(JSON.stringify({
          success: true,
          message: 'Device connected successfully',
          data: connectedDev
        }));
        return;
      }

      if (apiRoute === '/api/devices/remove') {
        const devId = (input.device_id || '').trim();
        localDevices = localDevices.filter(d => d.device_id.toLowerCase() !== devId.toLowerCase());
        saveLocalDevices();
        const reg = hardwareRegistry.find(d => d.device_id.toLowerCase() === devId.toLowerCase());
        if (reg) {
          reg.user_id = null; // Release claim so it can be reconnected
        }
        res.end(JSON.stringify({
          success: true,
          message: `Device '${devId}' disconnected successfully.`
        }));
        return;
      }

      // Default API response
      res.end(JSON.stringify({ success: true, data: {} }));
    });
    return;
  }

  // Clean URL Routing mappings for frontend HTML pages
  const routes = {
    '/': '/frontend/index.html',
    '/register': '/frontend/register.html',
    '/login': '/frontend/login.html',
    '/dashboard': '/frontend/dashboard.html',
    '/devices': '/frontend/devices.html',
    '/analytics': '/frontend/analytics.html',
    '/forgot-password': '/frontend/forgot-password.html',
    '/reset-password': '/frontend/reset-password.html',
    '/verify-email': '/frontend/verify-email.html',
    '/favicon.ico': '/assets/images/favicon.ico',
    '/favicon.svg': '/assets/images/favicon.svg'
  };

  let filePath;
  if (routes[pathname]) {
    filePath = path.join(BASE_DIR, routes[pathname]);
  } else {
    // Sanitize pathname to prevent directory traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    filePath = path.join(BASE_DIR, safePath);
  }

  // Security check: Only allow static serving from frontend/ and assets/, plus root favicon
  const resolvedPath = path.resolve(filePath);
  const allowedRoots = [
    path.resolve(BASE_DIR, 'frontend'),
    path.resolve(BASE_DIR, 'assets')
  ];

  const isAllowed = allowedRoots.some(root => resolvedPath.startsWith(root)) ||
    resolvedPath === path.resolve(BASE_DIR, 'favicon.ico') ||
    resolvedPath === path.resolve(BASE_DIR, 'favicon.svg');

  // Explicitly deny sensitive files and internal directories
  const deniedPatterns = [
    /^\.env/i,
    /\/\.env/i,
    /\.git/i,
    /server\.js$/i,
    /\.sql$/i,
    /\.log$/i,
    /\.md$/i,
    /database/i,
    /backend/i,
    /esp32/i,
    /logs/i,
    /scratch/i,
    /skills-lock\.json$/i
  ];

  const isDenied = deniedPatterns.some(pat => pat.test(resolvedPath) || pat.test(pathname));
  if (isDenied) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('403 Forbidden');
    return;
  }

  if (!isAllowed) {
    if (!path.extname(pathname) && !pathname.startsWith('/.')) {
      filePath = path.join(BASE_DIR, 'frontend', 'dashboard.html');
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }
  }

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (!path.extname(pathname)) {
        filePath = path.join(BASE_DIR, 'frontend', 'dashboard.html');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('500 Server Error');
        return;
      }

      // Add security headers to all static file responses
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`PowerNet Local Server active at http://localhost:${PORT}`);
  console.log(`Clean URLs: http://localhost:${PORT}/dashboard, http://localhost:${PORT}/register, http://localhost:${PORT}/login`);
});
