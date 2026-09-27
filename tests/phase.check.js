// Self-check for phase readings (V1-V3 on /voltage, I1-I3 on /current, P1-P3 on /power): run `node tests/phase.check.js`
// Boots the local mock server and asserts the phase pages and the telemetry APIs carry voltage_1..3, current_1..3 and power_1..3.
const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');

const PORT = 4917;
const BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT } });
const get = async (p) => (await fetch(BASE + p)).text();

(async () => {
  for (let i = 0; i < 40; i++) { try { await get('/'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }

  const dashboard = await get('/dashboard');
  const latest = JSON.parse(await get('/api/telemetry/latest')).data;
  const log = JSON.parse(await get('/api/telemetry/logs?limit=1')).data[0];
  const day = JSON.parse(await get('/api/telemetry/history?range=7d')).data.points[0];

  for (const key of ['voltage', 'current', 'power']) {
    const page = await get(`/${key}`);
    for (const id of [`metric-${key}_1`, `metric-${key}_2`, `metric-${key}_3`, `data-unit="${key}_3"`, `data-metric="${key}_3"`, `data-view="${key}"`, 'href="/dashboard" class="logs-btn-icon"']) {
      assert(page.includes(id), `/${key} page missing ${id}`);
    }
    assert(dashboard.includes(`href="/${key}"`), `dashboard card should link to /${key}`);
    for (const n of [1, 2, 3]) {
      const k = `${key}_${n}`;
      assert(typeof latest[k] === 'number', `latest.${k}`);
      assert(typeof latest[`prev_${k}`] === 'number', `latest.prev_${k}`);
      assert(typeof log[k] === 'number', `logs[0].${k}`);
      assert(typeof day[`avg_${k}`] === 'number', `history.avg_${k}`);
    }
  }
  console.log('phase check (voltage + current + power): OK');
})().catch((e) => { console.error('phase check FAILED:', e.message); process.exitCode = 1; })
  .finally(() => server.kill());
