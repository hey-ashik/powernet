/**
 * PowerNet Local Development Server
 * Pure Node.js Standard Library (zero external dependencies)
 * Serves Clean URLs: /register, /login, /dashboard, etc.
 * Provides Local Mock Backend for /api/* & /backend/api/* endpoints
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

let localUser = {
  id: 1,
  name: 'Ashikul Islam',
  email: 'ashikulislam2070@gmail.com',
  email_verified: true
};

let localDevices = [];
let localTelemetry = [];

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
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

      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });

      if (apiRoute === '/api/auth/login') {
        const email = input.email || 'ashikulislam2070@gmail.com';
        const name = (localUser && localUser.email === email) ? localUser.name : 'Ashik Islam';
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
        const name = input.name || 'Ashik Islam';
        const email = input.email || 'ashikulislam2070@gmail.com';
        localUser = { id: 1, name, email, email_verified: false };

        res.end(JSON.stringify({
          success: true,
          message: 'Account registered successfully! Please check your email inbox to verify.',
          data: {
            user_id: 1,
            name: name,
            email: email,
            email_verified: false,
            verification_url: '/verify-email?token=pnet_test_token_2026'
          }
        }));
        return;
      }

      if (apiRoute === '/api/auth/verify-email') {
        if (localUser) localUser.email_verified = true;
        res.end(JSON.stringify({
          success: true,
          message: 'Email verified successfully. You may now log in.'
        }));
        return;
      }

      if (apiRoute === '/api/auth/forgot-password') {
        res.end(JSON.stringify({
          success: true,
          message: 'Password reset link has been sent to your email.'
        }));
        return;
      }

      if (apiRoute === '/api/auth/reset-password') {
        res.end(JSON.stringify({
          success: true,
          message: 'Password successfully reset! You can now log in.'
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
        const latest = (localTelemetry && localTelemetry.length > 0) ? localTelemetry[localTelemetry.length - 1] : null;
        res.end(JSON.stringify({
          success: true,
          data: latest || {
            device_id: queryDevId,
            voltage: 0.0,
            current: 0.0,
            power: 0.0,
            energy: 0.0,
            temperature: null,
            is_online: false,
            last_seen_relative: 'Waiting for device packets'
          }
        }));
        return;
      }

      if (apiRoute === '/api/telemetry/logs') {
        res.end(JSON.stringify({
          success: true,
          data: localTelemetry || []
        }));
        return;
      }

      if (apiRoute === '/api/telemetry/history') {
        const range = parsedUrl.searchParams.get('range') || '7d';
        res.end(JSON.stringify({
          success: true,
          data: { device_id: 'pnw101', range: range, points: [] }
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

      if (apiRoute === '/api/devices/remove') {
        const devId = input.device_id;
        localDevices = localDevices.filter(d => d.device_id !== devId);
        res.end(JSON.stringify({
          success: true,
          message: `Device '${devId}' disconnected successfully.`
        }));
        return;
      }

      if (apiRoute === '/api/devices/connect') {
        const devId = input.device_id || 'pnw101';
        const devName = input.device_name || 'Main Panel (' + devId + ')';
        if (!localDevices.find(d => d.device_id === devId)) {
          localDevices.push({
            id: 1,
            device_id: devId,
            device_name: devName,
            computed_status: 'online',
            status_display: 'Online',
            last_seen_relative: 'Just connected'
          });
        }
        res.end(JSON.stringify({
          success: true,
          message: `Device '${devId}' successfully connected and locked to your account!`
        }));
        return;
      }

      if (apiRoute === '/api/devices/remove') {
        const devId = input.device_id;
        localDevices = localDevices.filter(d => d.device_id !== devId);
        res.end(JSON.stringify({
          success: true,
          message: 'Device disconnected successfully!'
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
    '/verify-email': '/frontend/verify-email.html'
  };

  let filePath;
  if (routes[pathname]) {
    filePath = path.join(BASE_DIR, routes[pathname]);
  } else {
    filePath = path.join(BASE_DIR, pathname);
  }

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (!path.extname(pathname)) {
        filePath = path.join(BASE_DIR, 'frontend', 'dashboard.html');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
        return;
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`PowerNet Local Server active at http://localhost:${PORT}`);
  console.log(`Clean URLs: http://localhost:${PORT}/dashboard, http://localhost:${PORT}/register, http://localhost:${PORT}/login`);
});
