const fs = require('fs');
const assert = require('assert');

console.log('--- RUNNING TEST SUITE ---');

// 1. Devices page connect description
const devHtml = fs.readFileSync('frontend/devices.html', 'utf8');
assert(devHtml.includes('Enter your Device ID'), 'devices.html must include "Enter your Device ID"');
assert(!devHtml.includes('Enter your Device ID (e.g. <code>pnw101</code>)'), 'devices.html must not include old verbose prompt');
assert(devHtml.includes('<i class="fa-solid fa-wifi" style="font-size: 16px; color: #0F172A;"></i>'), 'devices.html Active Device header must have wifi icon');
console.log('✔ Test 1 passed: devices.html text and Active Device header icon updated.');

// 2. Devices.js empty state description and active card icon
const devJs = fs.readFileSync('assets/js/devices.js', 'utf8');
assert(devJs.includes('Connect your device above with Device ID to lock it to your account.'), 'devices.js must include updated empty state text');
assert(!devJs.includes('to lock it to your account and begin streaming telemetry.'), 'devices.js must not include old empty state text');
assert(devJs.includes('<i class="fa-solid fa-wifi" style="font-size: 20px; color: #0F172A;"></i>'), 'devices.js active device card must have fa-wifi icon');
assert(devJs.includes('class="card active-device-card"'), 'devices.js must add active-device-card class');
assert(devJs.includes('class="active-device-actions"'), 'devices.js must add active-device-actions class');
console.log('✔ Test 2 passed: devices.js empty state text, active device wifi icon, and class hooks updated.');

// 3 & 4. Dashboard.js cleared logs text & waiting text
const dashJs = fs.readFileSync('assets/js/dashboard.js', 'utf8');
assert(dashJs.includes('Event logs cleared. Waiting for new ...'), 'dashboard.js must include "Event logs cleared. Waiting for new ..."');
assert(!dashJs.includes('Telemetry event logs cleared. Waiting for new live packets...'), 'dashboard.js must not include old cleared logs text');
assert(!dashJs.includes('fa-trash-can'), 'dashboard.js must not include trash icon before cleared logs text');
assert(dashJs.includes('Connected to <strong>${this.activeDeviceId || \'Device\'}</strong>. Waiting for data...'), 'dashboard.js must include "Waiting for data..."');
assert(!dashJs.includes('Waiting for telemetry packets...'), 'dashboard.js must not include "Waiting for telemetry packets..."');
console.log('✔ Test 3 & 4 passed: dashboard.js cleared logs text (no icon) and waiting for data text updated.');

// 5. Responsive.css mobile 50% 50% action buttons
const respCss = fs.readFileSync('assets/css/responsive.css', 'utf8');
assert(respCss.includes('.active-device-card .active-device-actions'), 'responsive.css must target .active-device-actions');
assert(respCss.includes('.active-device-card .btn-device-analytics'), 'responsive.css must style .btn-device-analytics');
assert(respCss.includes('.active-device-card .btn-device-disconnect'), 'responsive.css must style .btn-device-disconnect');
assert(respCss.includes('width: 50% !important;'), 'responsive.css must set 50% width on small screens');
console.log('✔ Test 5 passed: responsive.css 50% 50% full-width action buttons configured for mobile.');

console.log('\n--- ALL UNIT TESTS PASSED SUCCESSFULLY ---');
