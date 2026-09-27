// Self-check for phase readings (V1-V3 on /voltage, I1-I3 on /current, P1-P3 on /power): run `node tests/phase.check.js`
// Boots the local mock server and asserts the phase pages and telemetry APIs carry voltage_1..3, current_1..3 and power_1..3,
// and that the Manage Dashboard preferences API defaults to V1 / I1 / P1, then saves, validates and reads back the per-box phase choice.
const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = 4917;
const BASE = `http://localhost:${PORT}`;
// Throwaway prefs file so the check starts from "nothing saved" and never touches the developer's local choice
const DASH_PREFS_FILE = path.join(os.tmpdir(), `pnet_dash_prefs_${process.pid}.json`);
const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, DASH_PREFS_FILE } });
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
  // Manage Dashboard: box titles carry a phase tag, and the preferences API defaults / saves / validates / reads back
  for (const key of ['voltage', 'current', 'power']) {
    assert(dashboard.includes(`id="phase-tag-${key}"`), `dashboard missing phase-tag-${key}`);
  }
  const PREFS = '/api/dashboard/preferences';
  const post = (body) => fetch(BASE + PREFS, { method: 'POST', body: JSON.stringify(body) });
  assert.deepStrictEqual(JSON.parse(await get(PREFS)).data, { voltage_phase: 1, current_phase: 1, power_phase: 1 }, 'nothing saved -> V1 / I1 / P1');
  const want = { voltage_phase: 2, current_phase: 1, power_phase: 3 };
  assert.deepStrictEqual((await (await post(want)).json()).data, want, 'POST prefs should echo saved values');
  assert.deepStrictEqual(JSON.parse(await get(PREFS)).data, want, 'GET prefs should read back saved values');
  for (const bad of [{ voltage_phase: 4 }, { current_phase: 0 }, { current_phase: -1 }, { power_phase: 1.5 }, { voltage_phase: 'x' }]) {
    assert.strictEqual((await post({ ...want, ...bad })).status, 400, `prefs should reject ${JSON.stringify(bad)}`);
  }
  assert.deepStrictEqual(JSON.parse(await get(PREFS)).data, want, 'rejected POST must not change saved prefs');

  console.log('phase check (voltage + current + power + dashboard prefs): OK');
})().catch((e) => { console.error('phase check FAILED:', e.message); process.exitCode = 1; })
  .finally(() => { server.kill(); fs.rmSync(DASH_PREFS_FILE, { force: true }); });
