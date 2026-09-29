// Self-check for the dashboard and its phase pages: run `node tests/phase.check.js`
// Boots the local mock server and asserts:
// - /voltage-ll (V12 V23 V31), /voltage-ln (V1N V2N V3N), /current (I1-I3), /power (Average + P1-P3) and
//   /power-factor (Average + PF1-PF3) carry a card, chart buttons and a log column per reading; /voltage -> /voltage-ll
// - Average Power / Average PF read the stored total_power_kw / total_pf_iec columns
// - the dashboard boxes are Voltage, Current, Active Power, Power Factor, Frequency, Daily Energy (in that order)
// - the telemetry APIs return every reading the frontend reads (METRICS in dashboard.js, box views in api.js)
// - the Manage Dashboard preferences API defaults to Voltage LL / I1 / Average / Average, then saves, validates and reads back
const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const vm = require('vm');

const PORT = 4917;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, '..');
// Throwaway prefs file so the check starts from "nothing saved" and never touches the developer's local choice
const DASH_PREFS_FILE = path.join(os.tmpdir(), `pnet_dash_prefs_${process.pid}.json`);
const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT, DASH_PREFS_FILE } });
const get = async (p) => (await fetch(BASE + p)).text();

// The frontend's field names, read from the real scripts (browser globals stubbed)
const frontend = (() => {
  const ctx = { document: { addEventListener() {}, currentScript: null } };
  vm.createContext(ctx);
  for (const file of ['assets/js/api.js', 'assets/js/dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }
  return vm.runInContext('({ METRICS, DASH_SERIES, DASH_BOXES: API.DASH_BOXES, dashPages: API.dashPages, pageFile: (u) => API.pageFile(u) })', ctx);
})();

// Phase page -> its readings, in card / button / log column order
const PAGES = {
  '/voltage-ll': [1, 2, 3].map(n => `voltage_ll_v_${n}`),
  '/voltage-ln': [1, 2, 3].map(n => `voltage_ln_v_${n}`),
  '/current': [1, 2, 3].map(n => `phase_current_a_${n}`),
  '/power': ['total_power_kw', ...[1, 2, 3].map(n => `phase_power_kw_${n}`)],
  '/power-factor': ['total_pf_iec', ...[1, 2, 3].map(n => `phase_pf_iec_${n}`)]
};

(async () => {
  for (let i = 0; i < 40; i++) { try { await get('/'); break; } catch { await new Promise(r => setTimeout(r, 150)); } }

  const dashboard = await get('/dashboard');
  const latest = JSON.parse(await get('/api/telemetry/latest')).data;
  const log = JSON.parse(await get('/api/telemetry/logs?limit=1')).data[0];
  const days = JSON.parse(await get('/api/telemetry/history?range=7d')).data.points;
  const day = days[0];

  // Every reading the frontend shows comes back from latest / logs / history under the same name
  for (const k of Object.keys(frontend.METRICS)) {
    assert(typeof latest[k] === 'number', `latest.${k}`);
    assert(typeof latest[`prev_${k}`] === 'number', `latest.prev_${k}`);
    assert(typeof log[k] === 'number', `logs[0].${k}`);
    const historyField = frontend.METRICS[k].history || `avg_${k}`;
    assert(typeof day[historyField] === 'number', `history.${historyField}`);
  }
  for (const box of frontend.DASH_BOXES) {
    for (const view of box.views) {
      assert(frontend.METRICS[view.key], `${box.id} view ${view.id} reads unknown field ${view.key}`);
      assert(frontend.dashPages.includes(view.page), `${box.id} view ${view.id} opens unknown page ${view.page}`);
    }
  }
  for (const [id, s] of Object.entries(frontend.DASH_SERIES)) {
    assert(s.box ? frontend.DASH_BOXES.some(b => b.id === s.box) : frontend.METRICS[s.key], `DASH_SERIES.${id}`);
  }
  // Average views read the meter's stored value (database columns total_power_kw / total_pf_iec), not a computed mean
  const averageKey = (boxId) => frontend.DASH_BOXES.find(b => b.id === boxId).views.find(v => v.id === 'avg').key;
  assert.strictEqual(averageKey('power'), 'total_power_kw', 'Active Power Average should read total_power_kw');
  assert.strictEqual(averageKey('pf'), 'total_pf_iec', 'Power Factor Average should read total_pf_iec');
  assert.strictEqual(frontend.DASH_SERIES.kw.key, 'total_power_kw', 'Power Dynamics kW bars should average total_power_kw');

  // Phase pages: a card, delta badge, chart buttons and log column per reading
  for (const [page, keys] of Object.entries(PAGES)) {
    assert(frontend.dashPages.includes(page), `${page} missing from API.dashPages (router / polling)`);
    assert.strictEqual(frontend.pageFile(page), `/frontend${page}.html`, `router should fetch ${page} from its page file`);
    const html = await get(page);
    for (const k of keys) {
      assert(frontend.METRICS[k], `${page}: ${k} missing from METRICS`);
      for (const attr of [`id="metric-${k}"`, `id="delta-${k}"`, `data-unit="${k}"`, `data-metric="${k}"`]) {
        assert(html.includes(attr), `${page} missing ${attr}`);
      }
    }
    assert(html.includes(`data-cols="${keys.join(' ')}"`), `${page} logs should list ${keys.join(' ')}`);
    assert.strictEqual((html.match(/<th>/g) || []).length, 2 + keys.length, `${page} logs: Device, Time + one column per reading`);
    assert(html.includes('href="/dashboard" class="logs-btn-icon"'), `${page} missing back link`);
    assert(html.includes(`<main class="main-content" data-page="${page}">`), `${page} missing its data-page marker`);
    assert.strictEqual(await get(`/frontend${page}.html`), html, `${page}: the router's page file should be the same page`);
    for (const ref of html.match(/"\/assets\/(js|css)\/[^"]+"/g)) assert(ref.includes('?v='), `${page} asset not versioned: ${ref}`);
  }
  for (const suffix of ['LL', 'LN']) {
    assert((await get(`/voltage-${suffix.toLowerCase()}`)).includes(`<span class="unit-suffix">${suffix}</span>`), `/voltage-${suffix.toLowerCase()} unit should read V ${suffix}`);
  }
  const old = await fetch(BASE + '/voltage', { redirect: 'manual' });
  assert.strictEqual(old.status, 301, '/voltage should redirect');
  assert.strictEqual(old.headers.get('location'), '/voltage-ll', '/voltage should redirect to /voltage-ll');

  // Dashboard: box order, box links, no Temperature / Estimated Cost, Freq waveform button, PF / Hz log column
  const order = ['metric-voltage', 'metric-current', 'metric-power', 'metric-pf', 'metric-frequency', 'metric-energy']
    .map(id => dashboard.indexOf(`id="${id}"`));
  assert(order.every(i => i > 0), 'dashboard missing a box');
  assert(order.every((pos, i) => i === 0 || pos > order[i - 1]), 'dashboard boxes out of order');
  for (const [box, page] of [['voltage', '/voltage-ll'], ['current', '/current'], ['power', '/power'], ['pf', '/power-factor']]) {
    assert(dashboard.includes(`href="${page}" id="box-link-${box}"`), `dashboard ${box} box should open ${page}`);
    assert(dashboard.includes(`id="phase-tag-${box}"`), `dashboard missing phase-tag-${box}`);
  }
  for (const gone of ['metric-temperature', 'kpi-est-cost', 'data-metric="temperature"', '৳']) {
    assert(!dashboard.includes(gone), `dashboard should no longer show ${gone}`);
  }
  assert(dashboard.includes('data-metric="frequency"'), 'dashboard waveform missing Freq button');
  assert(dashboard.includes('<th>PF / Hz</th>'), 'dashboard logs missing PF / Hz column');
  // Every local JS/CSS link is versioned (?v=): Hostinger's CDN caches assets for 7 days, and a cached old api.js
  // next to a new dashboard.js crashes the dashboard on its loading shimmer
  for (const ref of dashboard.match(/"\/assets\/(js|css)\/[^"]+"/g)) assert(ref.includes('?v='), `dashboard asset not versioned: ${ref}`);

  // Manage Dashboard preferences: defaults / save / validate / read back
  const PREFS = '/api/dashboard/preferences';
  const post = (body) => fetch(BASE + PREFS, { method: 'POST', body: JSON.stringify(body) });
  const defaults = { voltage_view: 'll', current_view: '1', power_view: 'avg', pf_view: 'avg' };
  assert.deepStrictEqual(JSON.parse(await get(PREFS)).data, defaults, 'nothing saved -> Voltage LL / I1 / Average / Average');
  const want = { voltage_view: 'ln', current_view: '2', power_view: '3', pf_view: '1' };
  assert.deepStrictEqual((await (await post(want)).json()).data, want, 'POST prefs should echo saved values');
  assert.deepStrictEqual(JSON.parse(await get(PREFS)).data, want, 'GET prefs should read back saved values');
  for (const bad of [{ voltage_view: 'v1' }, { voltage_view: 1 }, { current_view: '4' }, { current_view: 0 }, { power_view: 'average' }, { pf_view: 1.5 }, { pf_view: true }]) {
    assert.strictEqual((await post({ ...want, ...bad })).status, 400, `prefs should reject ${JSON.stringify(bad)}`);
  }
  assert.deepStrictEqual(JSON.parse(await get(PREFS)).data, want, 'rejected POST must not change saved prefs');
  assert.deepStrictEqual((await (await post({ ...want, current_view: 3 })).json()).data.current_view, '3', 'numeric phase is accepted as its id');

  console.log('phase check (voltage LL/LN + current + power + power factor + dashboard boxes + prefs): OK');
})().catch((e) => { console.error('phase check FAILED:', e.message); process.exitCode = 1; })
  .finally(() => { server.kill(); fs.rmSync(DASH_PREFS_FILE, { force: true }); });
