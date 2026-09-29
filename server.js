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

// Dashboard box views (mirrors backend/api/dashboard/preferences.php and the dashboard_preferences SQL table):
// each box -> the views it can show; the first one is the default (Voltage LL / I1 / Average / Average)
const DASH_VIEWS = {
  voltage_view: ['ll', 'ln'],
  current_view: ['1', '2', '3'],
  power_view: ['avg', '1', '2', '3'],
  pf_view: ['avg', '1', '2', '3']
};
const DASH_PREFS_FILE = process.env.DASH_PREFS_FILE || path.join(__dirname, 'scratch', 'local_dashboard_prefs.json');
let localDashPrefs = Object.fromEntries(Object.entries(DASH_VIEWS).map(([key, views]) => [key, views[0]]));
try {
  if (fs.existsSync(DASH_PREFS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DASH_PREFS_FILE, 'utf8'));
    for (const [key, views] of Object.entries(DASH_VIEWS)) {
      if (views.includes(String(saved[key]))) localDashPrefs[key] = String(saved[key]);
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

// Mock Schneider PM2130D samples with the fields the PHP read APIs return (backend/services/TelemetryService.php):
// the telemetry columns (= ESP32 gateway JSON names) and the older names
const PHASES = [1, 2, 3];
const SAMPLE_EVERY_MS = 15000; // ESP32 gateway sample interval (SAMPLE_EVERY_MS in the firmware)
const READING_KEYS = [
  ...['voltage_ll_v', 'voltage_ln_v', 'phase_current_a', 'phase_power_kw'].flatMap(name => PHASES.map(n => `${name}_${n}`)),
  'total_power_kw',
  ...PHASES.map(n => `phase_pf_iec_${n}`),
  'total_pf_iec', 'frequency_hz', 'import_energy_kwh'
];
const LEGACY = {
  voltage_1: 'voltage_ln_v_1', voltage_2: 'voltage_ln_v_2', voltage_3: 'voltage_ln_v_3',
  current_1: 'phase_current_a_1', current_2: 'phase_current_a_2', current_3: 'phase_current_a_3',
  power_1: 'phase_power_kw_1', power_2: 'phase_power_kw_2', power_3: 'phase_power_kw_3',
  power: 'total_power_kw',
  energy: 'import_energy_kwh'
};
const round = (v, dp) => +v.toFixed(dp);
const jitter = (max) => (Math.random() * 2 - 1) * max;
const phaseMean = (row, name, dp) => {
  const vals = PHASES.map(n => row[`${name}_${n}`]).filter(v => v != null);
  return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, dp) : null;
};

function formatBdTime(ts) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
}

// One meter sample at time ts: 230 V line to neutral per phase, load following the hour of day.
// The import counter advances from prevEnergyKwh by the total power over the hours since the previous sample.
function meterSample(ts, prevEnergyKwh, hours) {
  const hour = new Date(ts).getHours();
  const loadFactor = hour >= 8 && hour <= 20 ? 0.7 + Math.random() * 0.3 : 0.2 + Math.random() * 0.2;
  const s = {};
  PHASES.forEach(n => {
    const vln = 230 + jitter(2.5);
    const amps = loadFactor * 4.5 + Math.random() * 0.8;
    const pf = 0.9 + Math.random() * 0.08;
    s[`voltage_ll_v_${n}`] = round(vln * Math.sqrt(3) + jitter(1), 2);
    s[`voltage_ln_v_${n}`] = round(vln, 2);
    s[`phase_current_a_${n}`] = round(amps, 3);
    s[`phase_power_kw_${n}`] = round((vln * amps * pf) / 1000, 3);
    s[`phase_pf_iec_${n}`] = round(pf, 3);
  });
  s.total_power_kw = round(PHASES.reduce((sum, n) => sum + s[`phase_power_kw_${n}`], 0), 3);
  s.total_pf_iec = phaseMean(s, 'phase_pf_iec', 3);
  s.frequency_hz = round(50 + jitter(0.05), 3);
  s.import_energy_kwh = round(prevEnergyKwh + s.total_power_kw * hours, 3);
  return s;
}

// A telemetry row as /api/telemetry/logs returns it: the sample plus TelemetryService::withLegacyNames and log fields
function telemetryRow(ts, sample, dev = { device_id: 'pnw101', device_name: 'Device' }) {
  const row = { device_id: dev.device_id, device_name: dev.device_name || 'Device', ...sample };
  Object.entries(LEGACY).forEach(([old, col]) => { row[old] = row[col] ?? null; });
  row.voltage = phaseMean(row, 'voltage_ln_v', 2);
  row.current = phaseMean(row, 'phase_current_a', 2);
  row.temperature = null;

  const power = row.total_power_kw;
  const [statusBadge, statusType] = power > 3.0 ? ['High Load', 'danger'] : power > 1.8 ? ['Moderate', 'warning']
    : power > 0.1 ? ['Normal', 'success'] : ['Standby', 'info'];
  const isoDate = new Date(ts).toISOString();
  return {
    ...row,
    is_online: true,
    status_badge: statusBadge,
    status_type: statusType,
    created_at: isoDate,
    recorded_at: isoDate,
    formatted_time: formatBdTime(ts)
  };
}

// One /api/telemetry/history bucket as TelemetryService::getHistory returns it, from a representative row
function historyPoint(bucket_time, row, sampleCount) {
  const p = { bucket_time, sample_count: sampleCount };
  READING_KEYS.forEach(k => { p[`avg_${k}`] = row[k]; });
  p.max_total_power_kw = p.max_power = round(row.total_power_kw * 1.25, 3);
  p.max_import_energy_kwh = p.max_energy = row.import_energy_kwh;
  Object.entries(LEGACY).forEach(([old, col]) => { if (old !== 'energy') p[`avg_${old}`] = row[col]; });
  p.avg_voltage = row.voltage;
  p.avg_current = row.current;
  p.avg_temperature = null;
  return p;
}

// Seed 24h of telemetry (one reading per 15 min = 96 points, newest first at index 0)
const localTelemetry = (() => {
  const points = [];
  const now = Date.now();
  let energy = 15520;
  for (let i = 95; i >= 0; i--) {
    const ts = now - i * 15 * 60 * 1000;
    const sample = meterSample(ts, energy, 0.25);
    energy = sample.import_energy_kwh;
    points.unshift(telemetryRow(ts, sample));
  }
  return points;
})();

// Real-Time Live Telemetry Streamer (every 15 seconds, like the ESP32 gateway: streams a new live packet)
setInterval(() => {
  if (!localDevices || localDevices.length === 0) return;
  const now = Date.now();
  const prevEnergy = localTelemetry.length > 0 ? Number(localTelemetry[0].import_energy_kwh) : 15520;
  localTelemetry.unshift(telemetryRow(now, meterSample(now, prevEnergy, SAMPLE_EVERY_MS / 3600000), localDevices[0]));
  if (localTelemetry.length > 150) localTelemetry.pop();
}, SAMPLE_EVERY_MS);

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

      if (apiRoute === '/api/dashboard/preferences') {
        if (req.method === 'POST') {
          const next = {};
          for (const [key, views] of Object.entries(DASH_VIEWS)) {
            const raw = input[key] ?? views[0];
            const value = typeof raw === 'string' || Number.isInteger(raw) ? String(raw) : '';
            if (!views.includes(value)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, message: `${key} must be one of: ${views.join(', ')}.` }));
              return;
            }
            next[key] = value;
          }
          localDashPrefs = next;
          try {
            fs.mkdirSync(path.dirname(DASH_PREFS_FILE), { recursive: true });
            fs.writeFileSync(DASH_PREFS_FILE, JSON.stringify(localDashPrefs, null, 2), 'utf8');
          } catch {}
        }
        res.end(JSON.stringify({ success: true, data: localDashPrefs }));
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
        if (latest && prev) {
          // prev_* of every reading (delta % badges), like TelemetryService::getLatest
          Object.keys(prev).forEach(k => { if (typeof prev[k] === 'number') latest[`prev_${k}`] = prev[k]; });
          latest.prev_temperature = null;
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
        const noon = new Date(now).setHours(12, 0, 0, 0);
        const liveRow = localTelemetry[0] || telemetryRow(noon, meterSample(noon, 15520, 0));
        // Representative row of a day / month: today is the live reading; the kWh counter runs back ~40 kWh per day
        const bucketRow = (daysAgo) => daysAgo === 0 ? liveRow
          : telemetryRow(noon, meterSample(noon, Math.max(0, liveRow.import_energy_kwh - daysAgo * 40), 0));

        if (range === '7d') {
          // 7 days in Bangladesh Time (Asia/Dhaka)
          for (let i = 6; i >= 0; i--) {
            const bucket_time = new Intl.DateTimeFormat('en-CA', { timeZone: BD_TZ }).format(new Date(now.getTime() - i * 86400000));
            historyPoints.push(historyPoint(bucket_time, bucketRow(i), 5760));
          }
        } else if (range === '30d') {
          // Days of current month in Bangladesh Time (Asia/Dhaka) up to today (no rows for future days, like the database)
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: BD_TZ,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
          }).formatToParts(now);
          const bdYear = parseInt(parts.find(p => p.type === 'year')?.value || now.getFullYear(), 10);
          const bdMonth = parseInt(parts.find(p => p.type === 'month')?.value || (now.getMonth() + 1), 10);
          const bdToday = parseInt(parts.find(p => p.type === 'day')?.value || now.getDate(), 10);

          for (let d = 1; d <= bdToday; d++) {
            const bucket_time = `${bdYear}-${String(bdMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            historyPoints.push(historyPoint(bucket_time, bucketRow(bdToday - d), 5760));
          }
        } else if (range === '12m') {
          // 12 months in Bangladesh Time (Asia/Dhaka)
          for (let i = 11; i >= 0; i--) {
            const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const bucket_time = new Intl.DateTimeFormat('en-CA', { timeZone: BD_TZ, year: 'numeric', month: '2-digit' }).format(targetDate);
            historyPoints.push(historyPoint(bucket_time, bucketRow(i * 30), 172800));
          }
        } else {
          // 24h default from local telemetry, oldest first
          [...localTelemetry].reverse().forEach(pt => historyPoints.push(historyPoint(pt.recorded_at, pt, 1)));
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

  // Old Phase Voltage URL -> line-to-line page (same 301 as .htaccess / nginx.conf)
  if (pathname === '/voltage' || pathname === '/voltage/') {
    res.writeHead(301, { Location: '/voltage-ll' });
    res.end();
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
    '/voltage-ll': '/frontend/voltage-ll.html',
    '/voltage-ln': '/frontend/voltage-ln.html',
    '/current': '/frontend/current.html',
    '/power': '/frontend/power.html',
    '/power-factor': '/frontend/power-factor.html',
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
