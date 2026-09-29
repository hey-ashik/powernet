/**
 * PowerNet Dashboard Controller
 * Handles user device locking, 15-second AJAX polling, telemetry rendering, dynamic charts & log tables
 * Device ID: pnw101 (Direct pairing & secure per-user locking)
 */

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.replace(/\.html$/, '').replace(/(.)\/$/, '$1');
  // A server that doesn't list this page yet answers with its dashboard.html fallback: load the page's own file
  // instead of showing the dashboard under this URL (<main data-page> names the page that was served)
  const servedPage = document.querySelector('.main-content')?.dataset.page;
  if (servedPage && API.dashPages.includes(path) && servedPage !== path) {
    API.navigateTo(path, false);
    return;
  }
  if (API.dashPages.includes(path) || path === '/' || !path) {
    Dashboard.init();
  }
});

// ─── Bangladesh Timezone (Asia/Dhaka, UTC+6) Helpers ─────────────────────────
const BD_TZ = 'Asia/Dhaka';

function formatBdTime(dateInput, mode = 'short') {
  if (!dateInput) return '--:--';
  let input = dateInput;
  if (typeof input === 'string') {
    if (/[ap]m$/i.test(input.trim())) return input.trim();
    if (input.includes(' ') && !input.includes('T') && !input.includes('+') && !input.endsWith('Z')) {
      // MySQL UTC DATETIME string (e.g. "2026-09-20 17:01:24") -> parse as UTC so Asia/Dhaka converts to Bangladesh Time (+6h)
      input = input.replace(' ', 'T') + 'Z';
    }
  }
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput : '--:--';

  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: BD_TZ,
      hour: '2-digit',
      minute: '2-digit',
      second: mode === 'full' ? '2-digit' : undefined,
      hour12: true
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

function formatBdLogDate(dateInput) {
  if (!dateInput) return '';
  let input = dateInput;
  if (typeof input === 'string') {
    if (input.includes(' ') && !input.includes('T') && !input.includes('+') && !input.endsWith('Z')) {
      input = input.replace(' ', 'T') + 'Z';
    }
  }
  const d = (input instanceof Date) ? input : new Date(input);
  if (isNaN(d.getTime())) return '';

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BD_TZ,
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).formatToParts(d);
    const day = parts.find(p => p.type === 'day')?.value || d.getDate();
    let month = parts.find(p => p.type === 'month')?.value || 'Sept';
    if (month.toLowerCase() === 'sep') month = 'Sept';
    const year = parts.find(p => p.type === 'year')?.value || d.getFullYear();
    return `${day}${month} ${year}`;
  } catch {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()}${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}

function getBdCalendarDays(count = 7) {
  if (count !== 7) {
    return getBdMonthDays();
  }
  const list = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const target = new Date(now.getTime() - i * 86400000);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: BD_TZ }).format(target);
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: BD_TZ, weekday: 'short' }).format(target).toUpperCase();
    const tooltipDate = new Intl.DateTimeFormat('en-US', { timeZone: BD_TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(target);
    list.push({
      key,
      label: dayName,
      tooltipDate,
      value: 0,
      _count: 0
    });
  }
  return list;
}

function getBdMonthDays() {
  const list = [];
  const now = new Date();
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
    const key = `${bdYear}-${mStr}-${dStr}`;

    const target = new Date(Date.UTC(bdYear, bdMonth - 1, d, 12, 0, 0));
    const tooltipDate = new Intl.DateTimeFormat('en-US', {
      timeZone: BD_TZ,
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }).format(target);

    list.push({
      key,
      dayNum: d,
      label: String(d),
      tooltipDate,
      isToday: d === bdToday,
      isFuture: d > bdToday,
      value: 0,
      _count: 0
    });
  }
  return list;
}

function getBdCalendarMonths(count = 12) {
  const list = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: BD_TZ, year: 'numeric', month: '2-digit' }).format(target);
    const monthName = new Intl.DateTimeFormat('en-US', { timeZone: BD_TZ, month: 'short' }).format(target).toUpperCase();
    const tooltipDate = new Intl.DateTimeFormat('en-US', { timeZone: BD_TZ, month: 'long', year: 'numeric' }).format(target);
    list.push({
      key,
      label: monthName,
      tooltipDate,
      value: 0,
      _count: 0
    });
  }
  return list;
}

// Phase 1 / 2 / 3 chart colors, and the phase-average color
const PHASE_COLORS = ['#EF4444', '#F59E0B', '#2563EB'];
const AVG_COLOR = '#8B5CF6';
const phaseMetrics = (field, sym, cfg) => Object.fromEntries([1, 2, 3].map(n => [
  `${field}_${n}`, { name: `${sym}${n}`, color: PHASE_COLORS[n - 1], ...cfg }
]));

// Every reading the dashboard pages show, keyed by its telemetry API field (= telemetry column / ESP JSON name;
// total_power_kw / total_pf_iec = the meter's 4th kW / PF value, shown as the "Average" view).
// name = chart button / tooltip label, suffix = text after the unit (V LL).
// Chart scale: defaultMax (grows with the data) or fixedMax (power factor never exceeds 1).
const METRICS = {
  ...phaseMetrics('voltage_ll_v', 'V', { unit: 'V', suffix: 'LL', defaultMax: 450, decimals: 1 }),
  ...phaseMetrics('voltage_ln_v', 'V', { unit: 'V', suffix: 'LN', defaultMax: 250, decimals: 1 }),
  ...phaseMetrics('phase_current_a', 'I', { unit: 'A', defaultMax: 12, decimals: 2 }),
  total_power_kw: { name: 'Avg', label: 'Average Power', unit: 'kW', color: AVG_COLOR, defaultMax: 4, decimals: 3 },
  ...phaseMetrics('phase_power_kw', 'P', { unit: 'kW', defaultMax: 4, decimals: 3 }),
  total_pf_iec: { name: 'Avg', label: 'Average PF', unit: '', color: AVG_COLOR, fixedMax: 1, decimals: 3 },
  ...phaseMetrics('phase_pf_iec', 'PF', { unit: '', fixedMax: 1, decimals: 3 }),
  frequency_hz: { name: 'Freq', label: 'Frequency', unit: 'Hz', color: '#EF4444', defaultMax: 60, decimals: 2 },
  // history: the 7D / 30D / 12M bars read the counter's highest value per day / month
  import_energy_kwh: { name: 'kWh', label: 'Energy', unit: 'kWh', color: '#10B981', defaultMax: 5, decimals: 3, history: 'max_import_energy_kwh' }
};

// Dashboard chart buttons -> the reading they plot, in the dashboard's own chart colors.
// box: follows the view picked for that box in Manage Dashboard (Voltage LL -> V12, Power Average -> total_power_kw ...)
const DASH_SERIES = {
  voltage:   { box: 'voltage', name: 'Voltage', color: '#2563EB' },
  current:   { box: 'current', name: 'Current', color: '#F59E0B' },
  power:     { box: 'power', name: 'Power', color: '#8B5CF6' },
  energy:    { key: 'import_energy_kwh', name: 'Energy', color: '#10B981' },
  frequency: { key: 'frequency_hz', name: 'Frequency', color: '#EF4444' },
  // Power Dynamics bars: kW = daily / monthly average of the stored Average Power, kWh = energy counter
  kw:        { key: 'total_power_kw', name: 'Average Power', color: '#2563EB' },
  kwh:       { key: 'import_energy_kwh', name: 'Energy', color: '#10B981' }
};

const Dashboard = {
  pollIntervalMs: 15000, // matches the ESP32 gateway's 15-second sample interval
  pollTimer: null,
  activeDeviceId: null,
  activeDevice: null,
  hasDevice: false,

  // Chart state
  powerUnit: 'kw',     // bar chart: dashboard 'kw' / 'kwh', or the reading a phase-page button shows (voltage_ll_v_1 ...)
  powerRange: '7d',    // '7d', '30d', '12m'
  waveMetric: 'voltage', // waveform: dashboard 'voltage' / 'current' / 'power' / 'energy' / 'frequency', or a phase-page reading
  historyData: [],       // cached history points from API
  waveHistory: {},       // { telemetry field: [{ val, time }] } for every METRICS reading
  prevTelemetry: null,   // tracks previous reading of every METRICS field for delta % calculation
  lastTelemetry: null,   // latest reading, re-rendered when a Manage Dashboard switch changes
  prefs: null,           // { voltage_view, current_view, power_view, pf_view }: view each box shows (Voltage LL / I1 / Average / Average until changed)

  async init() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // 1. Synchronous device state hydration: NO FLICKER
    const cachedDev = API.getConnectedDevice();
    const statusDot = document.getElementById('status-pulse-dot');
    const statusText = document.getElementById('status-text');

    if (cachedDev) {
      this.hasDevice = true;
      this.activeDevice = cachedDev;
      this.activeDeviceId = cachedDev.device_id;
      if (statusDot) statusDot.className = 'pulse-dot';
      if (statusText) statusText.textContent = 'Connected';
      API.renderWidgetDevice(cachedDev);
      this.showSkeletonLoading();
    } else {
      this.hasDevice = false;
      this.activeDevice = null;
      this.activeDeviceId = null;
      if (statusDot) statusDot.className = 'pulse-dot offline';
      if (statusText) statusText.textContent = 'Disconnected';
      API.renderWidgetDevice(null);
    }

    const activeBtn = (id) => document.querySelector(`#${id} .sw-btn.active`)?.dataset || {};
    this.powerUnit = activeBtn('power-unit-switcher').unit || 'kw';
    this.powerRange = activeBtn('power-range-switcher').range || '7d';
    this.waveMetric = activeBtn('waveform-metric-switcher').metric || 'voltage';

    // View shown on the Voltage / Current / Active Power / Power Factor boxes: cached first, then the database copy
    this.prefs = API.getDashPrefs();
    this.renderBoxViews();
    API.loadDashPrefs().then(prefs => this.applyBoxPrefs(prefs)).catch(() => {});

    this.loadUserProfile();
    this.updateDateRange();
    this.initEventListeners();
    this.initChartSwitchers();
    await this.checkUserDevices();

    if (this.hasDevice && this.activeDeviceId) {
      await Promise.all([
        this.fetchLatestTelemetry(),
        this.fetchLogs(),
        this.fetchBarChartHistory()
      ]);
    } else {
      this.renderZeroState();
    }

    // Attach visibility/focus listeners only once
    if (!this._visibilityBound) {
      this._visibilityBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkUserDevices(true);
        }
      });
      window.addEventListener('focus', () => {
        this.checkUserDevices(true);
      });
    }

    // Start 15-second polling loop: every reading is re-fetched from the database
    this.pollTimer = setInterval(async () => {
      this.updateDateRange(); // Automatically syncs today's date across midnight
      await this.checkUserDevices(true);
      if (this.hasDevice && this.activeDeviceId) {
        await this.fetchLatestTelemetry();
        await this.fetchLogs();
      }
    }, this.pollIntervalMs);
  },

  destroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  // ─── Manage Dashboard box views ───────────────────────────
  // Telemetry field a dashboard box shows: boxKey('voltage') -> 'voltage_ll_v_1' (Voltage LL) or 'voltage_ln_v_1' (LN)
  boxKey(boxId) {
    return API.dashView(boxId, this.prefs).key;
  },

  // Chart button -> { key, display config }: dashboard buttons (DASH_SERIES) or a phase-page reading (METRICS field)
  series(id) {
    const dash = DASH_SERIES[id];
    if (!dash && !METRICS[id]) return this.series('voltage'); // unknown button (stale page markup)
    if (!dash) return { key: id, label: METRICS[id].name, ...METRICS[id] };
    const view = dash.box ? API.dashView(dash.box, this.prefs) : null;
    const key = view ? view.key : dash.key;
    return { ...METRICS[key], key, color: dash.color, label: view ? `${dash.name} (${view.tag})` : dash.name };
  },

  // Box title tags "(LL)" / "(I1)" / "(Average)", the Voltage box's "V LL" unit and the page each box opens
  renderBoxViews() {
    API.DASH_BOXES.forEach(({ id }) => {
      const view = API.dashView(id, this.prefs);
      const tag = document.getElementById(`phase-tag-${id}`);
      if (tag) tag.textContent = `(${view.tag})`;
      const link = document.getElementById(`box-link-${id}`);
      if (link) link.setAttribute('href', view.page);
    });
    const suffix = document.getElementById('unit-suffix-voltage');
    if (suffix) suffix.textContent = METRICS[this.boxKey('voltage')].suffix;
  },

  // Called when a switch changes: re-render the boxes and waveform from the last reading (no new poll)
  applyBoxPrefs(prefs) {
    if (JSON.stringify(prefs) === JSON.stringify(this.prefs)) return;
    this.prefs = prefs;
    if (!document.getElementById('metric-voltage')) return; // not on the dashboard page
    this.renderBoxViews();
    if (this.lastTelemetry) this.updateMetricCards(this.lastTelemetry, false);
    this.renderWaveformChart();
  },

  loadUserProfile() {
    const user = API.getUser();
    const nameEl = document.getElementById('user-name-display');
    const avatarEl = document.getElementById('user-avatar-display');

    if (user && user.name) {
      if (nameEl) nameEl.textContent = user.name;
      if (avatarEl) {
        const parts = user.name.trim().split(/\s+/);
        const initials = parts.length > 1 
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : user.name.substring(0, 2).toUpperCase();
        avatarEl.textContent = initials;
      }
    } else {
      API.request('/auth/me.php')
        .then(res => {
          if (res && res.data && res.data.name) {
            API.setUser(res.data);
            if (nameEl) nameEl.textContent = res.data.name;
            if (avatarEl) {
              const parts = res.data.name.trim().split(/\s+/);
              const initials = parts.length > 1 
                ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                : res.data.name.substring(0, 2).toUpperCase();
              avatarEl.textContent = initials;
            }
          }
        })
        .catch(() => {
          window.location.href = '/login';
        });
    }
  },

  updateDateRange() {
    const el = document.getElementById('dashboard-date-range');
    if (!el) return;
    try {
      // Calculate today's date in Bangladesh timezone (Asia/Dhaka, UTC+6)
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dhaka',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).formatToParts(new Date());

      const day = parts.find(p => p.type === 'day')?.value || '01';
      const month = parts.find(p => p.type === 'month')?.value || '01';
      const year = parts.find(p => p.type === 'year')?.value || '2026';
      const bdDate = `${day}.${month}.${year}`;

      el.innerHTML = `<span>${bdDate}</span><i class="fa-regular fa-calendar" style="margin-left: 6px; font-size: 13px;"></i>`;
    } catch {
      const now = new Date();
      const bdDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
      el.innerHTML = `<span>${bdDate}</span><i class="fa-regular fa-calendar" style="margin-left: 6px; font-size: 13px;"></i>`;
    }
  },

  // ─── Chart Switcher Wiring ────────────────────────────────
  initChartSwitchers() {
    // Power unit switcher (kW / kWh)
    const unitSwitcher = document.getElementById('power-unit-switcher');
    if (unitSwitcher) {
      unitSwitcher.addEventListener('click', (e) => {
        const btn = e.target.closest('.sw-btn');
        if (!btn || btn.classList.contains('active')) return;
        unitSwitcher.querySelectorAll('.sw-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.powerUnit = btn.dataset.unit;
        this.renderBarChartFromHistory();
      });
    }

    // Power time range switcher (7D / 30D / 12M)
    const rangeSwitcher = document.getElementById('power-range-switcher');
    if (rangeSwitcher) {
      rangeSwitcher.addEventListener('click', (e) => {
        const btn = e.target.closest('.sw-btn');
        if (!btn || btn.classList.contains('active')) return;
        rangeSwitcher.querySelectorAll('.sw-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.powerRange = btn.dataset.range;
        this.fetchBarChartHistory();
      });
    }

    // Waveform metric switcher
    const metricSwitcher = document.getElementById('waveform-metric-switcher');
    if (metricSwitcher) {
      metricSwitcher.addEventListener('click', (e) => {
        const btn = e.target.closest('.sw-btn');
        if (!btn || btn.classList.contains('active')) return;
        metricSwitcher.querySelectorAll('.sw-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.waveMetric = btn.dataset.metric;
        this.renderWaveformChart();
      });
    }
  },

  // ─── History Fetch for Bar Chart ──────────────────────────
  async fetchBarChartHistory() {
    if (!this.activeDeviceId) {
      this.historyData = [];
      this.renderBarChartFromHistory();
      return;
    }

    // Show skeleton
    const container = document.getElementById('bar-chart-container');
    if (container) container.innerHTML = '<div class="skeleton-chart"></div>';

    // Map UI range to API range
    const rangeMap = { '7d': '7d', '30d': '30d', '12m': '12m' };
    const apiRange = rangeMap[this.powerRange] || '7d';

    try {
      const res = await API.request(`/telemetry/history.php?device_id=${this.activeDeviceId}&range=${apiRange}`);
      this.historyData = (res && res.data && res.data.points) ? res.data.points : [];
    } catch {
      this.historyData = [];
    }
    this.renderBarChartFromHistory();
  },

  // ─── Render Bar Chart from History ────────────────────────
  renderBarChartFromHistory() {
    const chartContainer = document.getElementById('bar-chart-container');
    if (!chartContainer) return;

    const points = this.historyData || [];
    const s = this.series(this.powerUnit); // dashboard kW (average power) / kWh, or a phase-page button (V1, I2, Avg, PF3 ...)
    const range = this.powerRange; // '7d', '30d', '12m'
    const unitLabel = s.unit;
    const historyField = s.history || `avg_${s.key}`; // per-day / per-month average, or the kWh counter's highest value

    let buckets = [];
    if (range === '7d') {
      buckets = getBdCalendarDays(7);
    } else if (range === '30d') {
      buckets = getBdMonthDays();
    } else if (range === '12m') {
      buckets = getBdCalendarMonths(12);
    } else {
      // 24h fallback
      const now = new Date();
      for (let h = 23; h >= 0; h--) {
        const t = new Date(now.getTime() - h * 3600000);
        const label = new Intl.DateTimeFormat('en-US', { timeZone: BD_TZ, hour: '2-digit', hour12: false }).format(t) + ':00';
        const key = t.toISOString().substring(0, 13);
        buckets.push({ key, label, tooltipDate: formatBdTime(t, 'short'), value: 0, _count: 0 });
      }
    }

    // Map history points into date buckets
    points.forEach(p => {
      let pointKey = '';
      const timeStr = p.bucket_time || p.created_at || p.recorded_at || '';
      if (range === '12m') {
        if (timeStr.length >= 7 && !timeStr.includes('T')) {
          pointKey = timeStr.substring(0, 7);
        } else {
          try {
            pointKey = new Intl.DateTimeFormat('en-CA', { timeZone: BD_TZ, year: 'numeric', month: '2-digit' }).format(new Date(timeStr));
          } catch {
            pointKey = timeStr.substring(0, 7);
          }
        }
      } else {
        if (timeStr.length === 10 && !timeStr.includes('T') && !timeStr.includes(':')) {
          pointKey = timeStr;
        } else {
          try {
            pointKey = new Intl.DateTimeFormat('en-CA', { timeZone: BD_TZ }).format(new Date(timeStr));
          } catch {
            pointKey = timeStr.substring(0, 10);
          }
        }
      }

      const bucket = buckets.find(b => b.key === pointKey);
      if (bucket) {
        const rawVal = Number(p[historyField] || 0);
        bucket.value = s.history ? Math.max(bucket.value, rawVal) : bucket.value + rawVal;
        bucket._count += 1;
      }
    });

    // Average readings (kW, voltage, current, PF ...); the kWh counter keeps its highest value
    if (!s.history) {
      buckets.forEach(b => {
        if (b._count > 1) b.value = b.value / b._count;
      });
    }

    // Calculate max for scaling
    const maxObserved = Math.max(...buckets.map(b => b.value), 0);
    const maxVal = s.fixedMax || (maxObserved > 0 ? maxObserved * 1.15 : s.defaultMax);

    // Build Y-axis labels (5 ticks from top down to 0)
    const yLabels = [];
    for (let i = 4; i >= 0; i--) {
      const v = (maxVal * i) / 4;
      yLabels.push(v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 1 ? 2 : 1));
    }

    let html = `<div class="chart-y-axis">${yLabels.map(l => `<span>${l}</span>`).join('')}</div>`;
    html += `<div class="bar-chart-scroll-wrap" id="bar-chart-scroll-wrap">`;
    html += `<div class="bar-chart-bars-track ${range === '30d' ? 'is-30d' : ''}">`;

    // Visible labels configuration
    const showEvery = 1;
    const delayStep = range === '7d' ? 45 : (range === '30d' ? 18 : 35);
    const metricLabel = s.label;
    const dotColor = s.color;

    buckets.forEach((b, idx) => {
      const pct = maxVal > 0 ? Math.min(100, Math.round((b.value / maxVal) * 100)) : 0;
      const showLabel = idx % showEvery === 0;
      const valDisplay = `${b.value.toFixed(s.history ? 2 : (b.value < 10 ? 2 : 1))} ${unitLabel}`.trim();
      const delayMs = idx * delayStep;

      let alignClass = '';
      if (idx === 0 || idx === 1) {
        alignClass = ' align-left';
      } else if (idx === buckets.length - 1 || idx === buckets.length - 2) {
        alignClass = ' align-right';
      }

      html += `
        <div class="bar-column-group">
          <div class="bar-track" tabindex="0" role="button" aria-label="${b.tooltipDate}: ${valDisplay}">
            <div class="bar-tooltip${alignClass}">
              <div class="bar-tooltip-date">${b.tooltipDate} (BST)</div>
              <div class="bar-tooltip-val">
                <span class="bar-tooltip-dot" style="background:${dotColor};"></span>
                <span>${metricLabel}:</span>
                <strong style="color:#FFFFFF;">${valDisplay}</strong>
              </div>
            </div>
            <div class="bar-fill" style="height: ${Math.max(3, pct)}%; animation-delay: ${delayMs}ms;"></div>
          </div>
          <span class="bar-label" ${!showLabel ? 'style="visibility:hidden;"' : ''}>${b.label}</span>
        </div>
      `;
    });

    html += `</div></div>`;
    chartContainer.innerHTML = html;
  },

  // ─── Waveform Chart ───────────────────────────────────────
  renderWaveformChart() {
    const container = document.getElementById('waveform-container');
    if (!container) return;

    const metric = this.waveMetric;
    // Dashboard Voltage / Current / Power buttons follow the view chosen for that box (e.g. Voltage (LL) plots V12)
    const cfg = this.series(metric);
    const points = this.waveHistory[cfg.key] || [];

    if (points.length < 2) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94A3B8;font-size:13px;flex-direction:column;gap:8px;">
          <i class="fa-brands fa-slack" style="font-size:28px;color:#0F172A;opacity:0.35;"></i>
          <span>Waiting for live ${cfg.label} telemetry${cfg.unit ? ` (${cfg.unit})` : ''}</span>
        </div>
      `;
      return;
    }

    // Scale calculation
    const values = points.map(p => p.val);
    const maxObserved = Math.max(...values, 0.01);
    const maxVal = cfg.fixedMax || Math.max(cfg.defaultMax, Math.ceil(maxObserved * 1.15));

    // 5 Y-axis tick values from max down to 0
    const yTicks = [maxVal, maxVal * 0.75, maxVal * 0.5, maxVal * 0.25, 0];
    const yLabels = yTicks.map((v, i) => {
      const str = v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(cfg.decimals === 0 ? 0 : (v > 0 && v < 1 ? 2 : (v < 10 ? 1 : 0)));
      return i === 0 ? `${str} ${cfg.unit}`.trim() : str;
    });

    // SVG parameters
    const svgW = 600;
    const svgH = 180;
    const yTop = 15;
    const yBottom = 165;
    const plotH = yBottom - yTop; // 150
    const stepX = svgW / (points.length - 1);

    // Build smooth bezier curve
    const firstVal = points[0].val;
    const firstY = yBottom - Math.max(0, Math.min(1, firstVal / maxVal)) * plotH;
    let pathD = `M 0 ${firstY.toFixed(1)}`;

    for (let i = 1; i < points.length; i++) {
      const prevVal = points[i - 1].val;
      const currVal = points[i].val;
      const xPrev = (i - 1) * stepX;
      const yPrev = yBottom - Math.max(0, Math.min(1, prevVal / maxVal)) * plotH;
      const xCurr = i * stepX;
      const yCurr = yBottom - Math.max(0, Math.min(1, currVal / maxVal)) * plotH;
      const xMid = (xPrev + xCurr) / 2;
      pathD += ` C ${xMid.toFixed(1)} ${yPrev.toFixed(1)}, ${xMid.toFixed(1)} ${yCurr.toFixed(1)}, ${xCurr.toFixed(1)} ${yCurr.toFixed(1)}`;
    }

    const areaD = `${pathD} L ${svgW} ${yBottom} L 0 ${yBottom} Z`;
    const lastVal = points[points.length - 1].val;
    const lastY = yBottom - Math.max(0, Math.min(1, lastVal / maxVal)) * plotH;

    // 5 Horizontal grid lines
    const gridYLines = [
      yTop,
      yTop + plotH * 0.25,
      yTop + plotH * 0.5,
      yTop + plotH * 0.75,
      yBottom
    ];

    // 5 X-axis time ticks in Bangladesh Time
    const xTickIndices = [
      0,
      Math.round((points.length - 1) * 0.25),
      Math.round((points.length - 1) * 0.5),
      Math.round((points.length - 1) * 0.75),
      points.length - 1
    ];
    const xLabels = xTickIndices.map(idx => formatBdTime(points[idx].time, 'short'));

    container.innerHTML = `
      <div class="waveform-visual">
        <div class="waveform-y-axis">
          ${yLabels.map(l => `<span>${l}</span>`).join('')}
        </div>
        <div class="waveform-plot-area" id="waveform-plot-area">
          <svg id="waveform-svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
            <defs>
              <linearGradient id="waveGradient-${metric}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.28"/>
                <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            ${gridYLines.map(y => `
              <line x1="0" y1="${y}" x2="${svgW}" y2="${y}" stroke="${y === yBottom ? '#E2E8F0' : '#F1F5F9'}" stroke-width="${y === yBottom ? '1.5' : '1.2'}" stroke-dasharray="${y === yBottom ? 'none' : '4,4'}" />
            `).join('')}
            <path d="${areaD}" fill="url(#waveGradient-${metric})" />
            <path d="${pathD}" fill="none" stroke="${cfg.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="${svgW}" cy="${lastY.toFixed(1)}" r="5.5" fill="${cfg.color}" stroke="#FFFFFF" stroke-width="2.5" />
            <line id="waveform-crosshair" x1="0" y1="${yTop}" x2="0" y2="${yBottom}" stroke="${cfg.color}" stroke-width="1.5" stroke-dasharray="3,3" opacity="0" style="transition: opacity 0.15s ease;" />
            <circle id="waveform-hover-dot" cx="0" cy="0" r="6" fill="${cfg.color}" stroke="#FFFFFF" stroke-width="2.5" opacity="0" style="transition: opacity 0.15s ease;" />
          </svg>

          <div class="waveform-tooltip" id="waveform-tooltip">
            <div class="waveform-tooltip-time" id="waveform-tooltip-time">--:--:-- (BST)</div>
            <div class="waveform-tooltip-val">
              <span class="waveform-tooltip-dot" style="background:${cfg.color};"></span>
              <span>${cfg.label}:</span>
              <strong id="waveform-tooltip-num" style="color:#FFFFFF;">--</strong>
            </div>
          </div>

          <div class="waveform-x-axis">
            ${xLabels.map(l => `<span>${l}</span>`).join('')}
            <span class="waveform-tz-badge" title="Bangladesh Standard Time (UTC+6)">BST (UTC+6)</span>
          </div>
        </div>
      </div>
    `;

    // Interactive pointer hover bindings
    const plotArea = document.getElementById('waveform-plot-area');
    const crosshair = document.getElementById('waveform-crosshair');
    const hoverDot = document.getElementById('waveform-hover-dot');
    const tooltip = document.getElementById('waveform-tooltip');
    const tooltipTime = document.getElementById('waveform-tooltip-time');
    const tooltipNum = document.getElementById('waveform-tooltip-num');

    if (!plotArea || !crosshair || !hoverDot || !tooltip) return;

    const handlePointerMove = (clientX) => {
      const rect = plotArea.getBoundingClientRect();
      const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const ratio = relX / rect.width;
      const idx = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
      const pt = points[idx];
      if (!pt) return;

      const ptX = (idx * stepX);
      const ptY = yBottom - Math.max(0, Math.min(1, pt.val / maxVal)) * plotH;

      crosshair.setAttribute('x1', ptX.toFixed(1));
      crosshair.setAttribute('x2', ptX.toFixed(1));
      crosshair.setAttribute('opacity', '0.75');

      hoverDot.setAttribute('cx', ptX.toFixed(1));
      hoverDot.setAttribute('cy', ptY.toFixed(1));
      hoverDot.setAttribute('opacity', '1');

      const bdFull = formatBdTime(pt.time, 'full');
      tooltipTime.textContent = `${bdFull} (BST)`;
      tooltipNum.textContent = `${pt.val.toFixed(cfg.decimals)} ${cfg.unit}`.trim();

      const pctX = (idx / (points.length - 1)) * 100;
      const pctY = ((ptY / svgH) * (rect.height - 30) / rect.height) * 100;
      tooltip.style.left = `${pctX}%`;
      tooltip.style.top = `${pctY}%`;

      let alignClass = '';
      if (pctX < 18) alignClass = ' align-left';
      else if (pctX > 82) alignClass = ' align-right';
      tooltip.className = `waveform-tooltip visible${alignClass}`;
    };

    const handlePointerLeave = () => {
      crosshair.setAttribute('opacity', '0');
      hoverDot.setAttribute('opacity', '0');
      tooltip.classList.remove('visible');
    };

    plotArea.addEventListener('mousemove', (e) => handlePointerMove(e.clientX));
    plotArea.addEventListener('mouseleave', handlePointerLeave);

    plotArea.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) handlePointerMove(e.touches[0].clientX);
    }, { passive: true });
    plotArea.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) handlePointerMove(e.touches[0].clientX);
    }, { passive: true });
    plotArea.addEventListener('touchend', handlePointerLeave);
  },

  initZeroWaveform(count = 10) {
    const now = Date.now();
    const fields = Object.keys(METRICS);
    fields.forEach(f => {
      this.waveHistory[f] = [];
      for (let i = count - 1; i >= 0; i--) {
        const t = new Date(now - i * this.pollIntervalMs).toISOString();
        this.waveHistory[f].push({ val: 0, time: t });
      }
    });
    this.renderWaveformChart();
  },

  pushWaveformPoint(data, isLive = true) {
    const maxPoints = 20;
    const nowIso = new Date().toISOString();
    const fields = Object.keys(METRICS);

    if (!isLive) {
      // Telemetry stopped: push 0 values at current Bangladesh time
      fields.forEach(f => {
        if (!this.waveHistory[f]) this.waveHistory[f] = [];
        this.waveHistory[f].push({ val: 0, time: nowIso });
        if (this.waveHistory[f].length > maxPoints) this.waveHistory[f].shift();
      });
      this.renderWaveformChart();
      return;
    }

    // Active real-time data from database
    let time = data.timestamp || data.recorded_at || data.created_at || nowIso;
    fields.forEach(f => {
      const rawVal = Number(data[f] || 0);
      if (!this.waveHistory[f]) this.waveHistory[f] = [];
      this.waveHistory[f].push({ val: rawVal, time });
      if (this.waveHistory[f].length > maxPoints) this.waveHistory[f].shift();
    });
    this.renderWaveformChart();
  },

  populateWaveformFromTelemetry(telemetryPoints) {
    if (!telemetryPoints || telemetryPoints.length === 0) {
      this.initZeroWaveform();
      return;
    }

    // Check if the latest telemetry record is from the past (> 60s ago)
    const latest = telemetryPoints[0];
    let latestTimeStr = latest.recorded_at || latest.created_at || latest.timestamp || '';
    if (typeof latestTimeStr === 'string' && latestTimeStr.includes(' ') && !latestTimeStr.includes('T') && !latestTimeStr.includes('+') && !latestTimeStr.endsWith('Z')) {
      latestTimeStr = latestTimeStr.replace(' ', 'T') + 'Z';
    }
    const latestMs = new Date(latestTimeStr).getTime();
    const ageSec = !isNaN(latestMs) ? (Date.now() - latestMs) / 1000 : 999;

    if (ageSec > 60) {
      // Telemetry stopped in the past: initialize 0 baseline at current Bangladesh time
      this.initZeroWaveform();
      return;
    }

    // Reverse newest-first array so that earliest timestamp is on the left and newest is on the right
    const slice = [...telemetryPoints].reverse().slice(-20);
    const fields = Object.keys(METRICS);
    fields.forEach(f => {
      this.waveHistory[f] = slice.map(p => {
        return {
          val: Number(p[f] || 0),
          time: p.recorded_at || p.created_at || p.timestamp || new Date().toISOString()
        };
      });
    });
    this.renderWaveformChart();
  },

  // ─── Device Check & Sidebar ───────────────────────────────
  async checkUserDevices(isBackground = false) {
    try {
      const res = await API.request('/devices/list.php');
      if (res && res.data && res.data.length > 0) {
        const dev = res.data[0];
        const wasUnconnected = !this.hasDevice || this.activeDeviceId !== dev.device_id;
        this.hasDevice = true;
        this.activeDevice = dev;
        this.activeDeviceId = dev.device_id;
        API.setConnectedDevice(dev);

        const statusDot = document.getElementById('status-pulse-dot');
        const statusText = document.getElementById('status-text');
        if (statusDot) statusDot.className = 'pulse-dot';
        if (statusText) statusText.textContent = 'Connected';

        this.updateSidebarWidget(this.activeDevice);

        if (wasUnconnected || !isBackground) {
          await this.fetchLatestTelemetry();
          await this.fetchLogs();
          await this.fetchBarChartHistory();
        }
      } else {
        const wasConnected = this.hasDevice;
        this.hasDevice = false;
        this.activeDevice = null;
        this.activeDeviceId = null;
        API.setConnectedDevice(null);

        const statusDot = document.getElementById('status-pulse-dot');
        const statusText = document.getElementById('status-text');
        if (statusDot) statusDot.className = 'pulse-dot offline';
        if (statusText) statusText.textContent = 'Disconnected';

        this.updateSidebarWidget(null);
        if (wasConnected || !isBackground) {
          this.renderZeroState();
        }
      }
    } catch (err) {
      if (!isBackground) {
        console.warn('Could not verify user devices:', err);
      }
    }
  },

  updateSidebarWidget(device) {
    API.renderWidgetDevice(device);
  },

  showSkeletonLoading() {
    // 1. Status: only Connected or Disconnected
    const statusDot = document.getElementById('status-pulse-dot');
    const statusText = document.getElementById('status-text');
    if (this.hasDevice) {
      if (statusDot) statusDot.className = 'pulse-dot';
      if (statusText) statusText.textContent = 'Connected';
    } else {
      if (statusDot) statusDot.className = 'pulse-dot offline';
      if (statusText) statusText.textContent = 'Disconnected';
    }

    // 2. Metrics shimmer helper
    const shimmer = (w = 64, h = 26) => `<span class="skeleton-shimmer" style="display:inline-block; width:${w}px; height:${h}px; vertical-align:middle; border-radius:6px;"></span>`;

    const vEl = document.getElementById('metric-voltage');
    if (vEl) vEl.innerHTML = shimmer(56, 30);
    const cEl = document.getElementById('metric-current');
    if (cEl) cEl.innerHTML = shimmer(56, 30);
    const pEl = document.getElementById('metric-power');
    if (pEl) pEl.innerHTML = shimmer(65, 24);
    const pfEl = document.getElementById('metric-pf');
    if (pfEl) pfEl.innerHTML = shimmer(56, 30);
    const hzEl = document.getElementById('metric-frequency');
    if (hzEl) hzEl.innerHTML = shimmer(72, 24);
    const eEl = document.getElementById('metric-energy');
    if (eEl) eEl.innerHTML = shimmer(65, 24);
    Object.keys(METRICS).forEach(k => {
      const el = document.getElementById(`metric-${k}`);
      if (el) el.innerHTML = shimmer(56, 30);
      const d = document.getElementById(`delta-${k}`);
      if (d) d.innerHTML = shimmer(44, 16);
    });

    // Shimmer delta footers
    const deltaV = document.getElementById('delta-voltage');
    if (deltaV) deltaV.innerHTML = shimmer(44, 16);
    const deltaC = document.getElementById('delta-current');
    if (deltaC) deltaC.innerHTML = shimmer(44, 16);
    const deltaPf = document.getElementById('delta-pf');
    if (deltaPf) deltaPf.innerHTML = shimmer(44, 16);

    // 3. Donut placeholders
    const donutP = document.getElementById('donut-power-container');
    if (donutP) donutP.innerHTML = `<div class="skeleton-shimmer" style="width:72px; height:72px; border-radius:50%;"></div>`;
    const donutE = document.getElementById('donut-energy-container');
    if (donutE) donutE.innerHTML = `<div class="skeleton-shimmer" style="width:72px; height:72px; border-radius:50%;"></div>`;

    // 4. Visual Charts
    const barWrap = document.getElementById('bar-chart-container');
    if (barWrap) barWrap.innerHTML = `<div class="skeleton-chart"></div>`;
    const waveWrap = document.getElementById('waveform-container');
    if (waveWrap) waveWrap.innerHTML = `<div class="skeleton-chart"></div>`;

    // 5. Logs Table
    const logsBody = document.getElementById('telemetry-log-rows');
    if (logsBody) {
      logsBody.innerHTML = `
        <tr><td colspan="5" style="padding:14px;"><div class="skeleton-shimmer" style="height:22px; width:100%;"></div></td></tr>
        <tr><td colspan="5" style="padding:14px;"><div class="skeleton-shimmer" style="height:22px; width:100%;"></div></td></tr>
        <tr><td colspan="5" style="padding:14px;"><div class="skeleton-shimmer" style="height:22px; width:100%;"></div></td></tr>
      `;
    }
  },

  disconnectDevice(devId) {
    API.disconnectCurrentDevice(devId);
  },

  renderZeroState() {
    // Reset top status badge: only Connected or Disconnected
    const statusDot = document.getElementById('status-pulse-dot');
    const statusText = document.getElementById('status-text');
    if (statusDot) statusDot.className = 'pulse-dot offline';
    if (statusText) statusText.textContent = 'Disconnected';

    // Zero out all metric cards
    const elVoltage = document.getElementById('metric-voltage');
    if (elVoltage) elVoltage.textContent = '0.0';
    const elCurrent = document.getElementById('metric-current');
    if (elCurrent) elCurrent.textContent = '0.00';
    const elPower = document.getElementById('metric-power');
    if (elPower) elPower.textContent = '0.000';
    const elPf = document.getElementById('metric-pf');
    if (elPf) elPf.textContent = '0.000';
    const elHz = document.getElementById('metric-frequency');
    if (elHz) elHz.textContent = '0.00';
    const elEnergy = document.getElementById('metric-energy');
    if (elEnergy) elEnergy.textContent = '0.000';

    // Reset deltas and cached previous telemetry
    this.prevTelemetry = null;
    this.lastTelemetry = null;
    const dv = document.getElementById('delta-voltage');
    if (dv) { dv.className = 'delta-neutral'; dv.innerHTML = '&rarr; 0.0%'; }
    const dc = document.getElementById('delta-current');
    if (dc) { dc.className = 'delta-neutral'; dc.innerHTML = '&rarr; 0.0%'; }
    const dpf = document.getElementById('delta-pf');
    if (dpf) { dpf.className = 'delta-neutral'; dpf.innerHTML = '&rarr; 0.0%'; }
    Object.keys(METRICS).forEach(k => {
      const el = document.getElementById(`metric-${k}`);
      if (el) el.textContent = (0).toFixed(METRICS[k].decimals);
      const d = document.getElementById(`delta-${k}`);
      if (d) { d.className = 'delta-neutral'; d.innerHTML = '&rarr; 0.0%'; }
    });

    // Empty Donuts (0%)
    this.renderDonuts(0, 0);

    // Empty Bar Chart
    this.historyData = [];
    this.renderBarChartFromHistory();

    // Flat Waveform
    this.waveHistory = {};
    this.renderWaveformChart();

    // Clean empty logs table
    const tbody = document.getElementById('logs-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${this.logColspan()}" style="text-align:center; padding: 40px 16px; color: #94A3B8;">
            <i class="fa-solid fa-plug-circle-xmark" style="font-size: 30px; margin-bottom: 10px; display: block; color: #CBD5E1;"></i>
            No telemetry data yet.<br>
            <span style="font-size: 13px; color: #64748B;">Connect your device</span>
          </td>
        </tr>
      `;
    }
  },

  initEventListeners() {
    // Refresh button for logs: rotate ONLY the inside arrow icon
    const refreshLogsBtn = document.getElementById('btn-refresh-logs');
    if (refreshLogsBtn) {
      refreshLogsBtn.addEventListener('click', () => {
        const icon = refreshLogsBtn.querySelector('i');
        if (icon) {
          icon.classList.remove('spin-icon');
          void icon.offsetWidth; // trigger reflow for smooth re-trigger
          icon.classList.add('spin-icon');
          setTimeout(() => icon.classList.remove('spin-icon'), 600);
        }
        if (this.hasDevice && this.activeDeviceId) {
          this.fetchLogs();
        }
      });
    }

    // Clear logs button
    const clearLogsBtn = document.getElementById('btn-clear-logs');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to clear telemetry event logs?')) return;
        try {
          clearLogsBtn.disabled = true;
          await API.request('/telemetry/clear-logs.php', {
            method: 'POST',
            body: JSON.stringify({ device_id: this.activeDeviceId })
          });
          const tbody = document.getElementById('logs-table-body');
          if (tbody) {
            tbody.innerHTML = `
              <tr>
                <td colspan="${this.logColspan()}" style="text-align:center; padding:36px; color:#94A3B8;">
                  Event logs cleared. Waiting for new ...
                </td>
              </tr>
            `;
          }
          API.showToast('Telemetry event logs cleared successfully.', 'info');
        } catch (err) {
          API.showToast(err.message || 'Could not clear logs', 'error');
        } finally {
          clearLogsBtn.disabled = false;
        }
      });
    }

    // Modal controls for Connect Device
    const btnOpenConnect = document.getElementById('btn-open-connect');
    const modal = document.getElementById('modal-connect-device');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const formConnect = document.getElementById('form-connect-device');

    if (btnOpenConnect && modal) {
      btnOpenConnect.addEventListener('click', () => {
        if (this.hasDevice && this.activeDeviceId) {
          // Device is already connected: prompt to disconnect in real time
          if (confirm(`Disconnect device '${this.activeDeviceId}' from your account?`)) {
            this.disconnectDevice(this.activeDeviceId);
          }
          return;
        }

        // Open connect modal
        const devIdInput = document.getElementById('input-device-id');
        if (devIdInput) devIdInput.value = 'pnw101';
        modal.classList.add('active');
      });
    }

    if (btnCloseModal && modal) {
      btnCloseModal.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (formConnect) {
      formConnect.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!API.isLoggedIn()) {
          API.showToast('Please log in first. You must be logged in to connect a device.', 'error');
          setTimeout(() => { window.location.href = '/login'; }, 1000);
          return;
        }

        const devId = document.getElementById('input-device-id').value.trim();
        const devName = document.getElementById('input-device-name').value.trim();

        if (!devId) {
          API.showToast('Enter Correct Device ID', 'error');
          return;
        }

        const submitBtn = formConnect.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="margin-right: 8px;"></i> Connecting...';
        }

        try {
          const [res] = await Promise.all([
            API.request('/devices/connect.php', {
              method: 'POST',
              body: JSON.stringify({
                device_id: devId,
                device_name: devName
              })
            }),
            new Promise(r => setTimeout(r, 550))
          ]);

          const deviceToken = (res.data && res.data.device_token) || res.device_token || `pnet_dtk_${devId}`;
          API.setDeviceToken(deviceToken);

          // 1. Immediately update UI state in REAL TIME
          modal.classList.remove('active');
          this.hasDevice = true;
          this.activeDeviceId = devId;
          this.activeDevice = {
            id: 1,
            device_id: devId,
            device_name: devName || 'Device',
            device_token: deviceToken,
            computed_status: 'online',
            status_display: 'Online',
            last_seen_relative: 'Just connected'
          };
          API.setConnectedDevice(this.activeDevice);
          this.updateSidebarWidget(this.activeDevice);

          const statusDot = document.getElementById('status-pulse-dot');
          const statusText = document.getElementById('status-text');
          if (statusDot) statusDot.className = 'pulse-dot';
          if (statusText) statusText.textContent = 'Connected';

          API.showToast('Device connected successfully', 'success');

          // 2. Refresh telemetry & logs immediately
          await this.fetchLatestTelemetry();
          await this.fetchLogs();
          await this.fetchBarChartHistory();
          await this.checkUserDevices(true);
        } catch (err) {
          const rawMsg = err.message || '';
          const popupMsg = rawMsg.toLowerCase().includes('log in')
            ? rawMsg
            : 'Enter Correct Device ID';
          API.showToast(popupMsg, 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-link" style="margin-right: 8px;"></i> Connect Device';
          }
        }
      });
    }
  },

  async fetchLatestTelemetry() {
    if (!this.activeDeviceId) return;
    try {
      const res = await API.request(`/telemetry/latest.php?device_id=${this.activeDeviceId}`);
      if (res && res.data) {
        this.updateMetricCards(res.data);
      }
    } catch (err) {
      console.warn('Could not fetch latest telemetry:', err);
      this.updateMetricCards({}); // no reading: show 0 instead of leaving the loading shimmer
    }
  },

  async fetchLogs() {
    if (!this.activeDeviceId) return;
    try {
      const res = await API.request(`/telemetry/logs.php?device_id=${this.activeDeviceId}&limit=20`);
      if (res && res.data) {
        this.renderLogsTable(res.data);
        // Pre-populate waveform on load if not yet populated (every field is filled together)
        if ((this.waveHistory.frequency_hz || []).length < 2 && res.data.length > 0) {
          this.populateWaveformFromTelemetry(res.data);
        }
      }
    } catch (err) {
      console.warn('Could not fetch logs:', err);
      this.renderLogsTable([]);
    }
  },

  // isNewReading = false re-renders the last reading after a Manage Dashboard switch change
  // (no waveform point is pushed and the previous-reading baseline is left untouched)
  updateMetricCards(data, isNewReading = true) {
    if (isNewReading) this.lastTelemetry = data;
    let isLive = Boolean(data.is_online);

    // Check freshness: if timestamp is older than 35s or offline, data has stopped
    const timeStr = data.recorded_at || data.timestamp || null;
    if (timeStr) {
      let parseStr = timeStr;
      if (typeof parseStr === 'string' && parseStr.includes(' ') && !parseStr.includes('T') && !parseStr.includes('+') && !parseStr.endsWith('Z')) {
        parseStr = parseStr.replace(' ', 'T') + 'Z';
      }
      const recordMs = new Date(parseStr).getTime();
      if (!isNaN(recordMs) && (Date.now() - recordMs) > 35000) {
        isLive = false;
      }
    }

    // Voltage / Current / Active Power / Power Factor boxes show the view picked in Manage Dashboard
    // (default: Voltage LL phase 1 = V12, I1, Average Power total_power_kw, Average PF total_pf_iec)
    const vKey = this.boxKey('voltage');
    const cKey = this.boxKey('current');
    const pKey = this.boxKey('power');
    const pfKey = this.boxKey('pf');

    // Every reading (null when telemetry stopped or not measured), kept as the baseline for the next delta %
    const reading = {};
    Object.keys(METRICS).forEach(k => {
      reading[k] = isLive && data[k] != null ? Number(data[k]) : null;
    });
    const prevOf = (k) => (isNewReading && this.prevTelemetry && this.prevTelemetry[k] != null)
      ? this.prevTelemetry[k]
      : (data[`prev_${k}`] != null ? Number(data[`prev_${k}`]) : null);
    // When telemetry stops a box shows 0 (0.0 V, 0.00 A, 0.000 kW ...)
    const showValue = (elId, key, decimals) => {
      const el = document.getElementById(elId);
      if (el) el.textContent = (reading[key] ?? 0).toFixed(decimals);
    };

    // 1-5. Voltage, Current, Active Power, Power Factor, Frequency
    showValue('metric-voltage', vKey, 1);
    showValue('metric-current', cKey, 2);
    showValue('metric-power', pKey, 3);
    showValue('metric-pf', pfKey, 3);
    showValue('metric-frequency', 'frequency_hz', 2);
    const powerNum = reading[pKey] ?? 0;

    // 6. Daily Energy (Cumulative meter reading; the API keeps the last reading while offline)
    const elEnergy = document.getElementById('metric-energy');
    const energyNum = data.import_energy_kwh != null ? Number(data.import_energy_kwh) : 0.0;
    if (elEnergy) elEnergy.textContent = energyNum.toFixed(3);

    // 7. Dynamic Real-Time Delta % Calculations based on previous values
    this.updateDeltaBadge('delta-voltage', reading[vKey], prevOf(vKey));
    this.updateDeltaBadge('delta-current', reading[cKey], prevOf(cKey));
    this.updateDeltaBadge('delta-pf', reading[pfKey], prevOf(pfKey));

    // Phase-page cards: one per reading, e.g. metric-voltage_ll_v_2 / delta-total_pf_iec (no-ops elsewhere)
    Object.keys(METRICS).forEach(k => {
      const el = document.getElementById(`metric-${k}`);
      if (el) el.textContent = (reading[k] ?? 0).toFixed(METRICS[k].decimals);
      this.updateDeltaBadge(`delta-${k}`, reading[k], prevOf(k));
    });

    // Save current readings as previous for the next real-time cycle
    if (isNewReading && isLive && Object.values(reading).some(v => v !== null)) {
      this.prevTelemetry = reading;
    }

    // 9. Status & Pulse: only Connected or Disconnected
    const statusDot = document.getElementById('status-pulse-dot');
    const statusText = document.getElementById('status-text');

    if (this.hasDevice) {
      if (statusDot) statusDot.className = 'pulse-dot';
      if (statusText) statusText.textContent = 'Connected';
    } else {
      if (statusDot) statusDot.className = 'pulse-dot offline';
      if (statusText) statusText.textContent = 'Disconnected';
    }

    // Update Donuts with real ratios
    const powerPct = isLive ? Math.min(100, Math.round((powerNum / 6.0) * 100)) : 0;
    const energyPct = isLive ? Math.min(100, Math.round((energyNum / 25.0) * 100)) : 0;
    this.renderDonuts(powerPct, energyPct);

    // Push live data to waveform (streams 0 when telemetry stopped)
    if (isNewReading) this.pushWaveformPoint(data, isLive);
  },

  updateDeltaBadge(elementId, curr, prev) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (curr == null || isNaN(curr)) {
      el.className = 'delta-neutral';
      el.innerHTML = '&rarr; 0.0%';
      return;
    }

    // If no previous reading is available yet, display neutral/nominal
    if (prev == null || isNaN(prev) || Number(prev) === 0) {
      el.className = 'delta-up';
      el.innerHTML = '&uarr; 0.0%';
      return;
    }

    const c = Number(curr);
    const p = Number(prev);
    const diff = c - p;
    const pct = (diff / p) * 100;
    const absPct = Math.abs(pct).toFixed(1);

    if (pct > 0.04) {
      el.className = 'delta-up';
      el.innerHTML = `&uarr; ${absPct}%`;
    } else if (pct < -0.04) {
      el.className = 'delta-down';
      el.innerHTML = `&darr; ${absPct}%`;
    } else {
      el.className = 'delta-up';
      el.innerHTML = `&uarr; 0.0%`;
    }
  },

  renderDonuts(powerPct = 0, energyPct = 0) {
    this.animateDonut('donut-power-container', 'donut-power-circle', 'donut-power-percent', powerPct, '#F59E0B');
    this.animateDonut('donut-energy-container', 'donut-energy-circle', 'donut-energy-percent', energyPct, '#2563EB');
  },

  animateDonut(containerId, circleId, numId, targetPct, color) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const C = 226.19; // 2 * PI * 36
    const clampedPct = Math.max(0, Math.min(100, Math.round(targetPct)));
    const targetOffset = +(C * (1 - clampedPct / 100)).toFixed(2);

    let circle = document.getElementById(circleId);
    let numEl = document.getElementById(numId);

    if (!circle || !numEl) {
      // Build DOM structure with 0% initial offset for fluid entrance animation
      container.innerHTML = `
        <svg class="donut-svg" viewBox="0 0 92 92">
          <circle class="donut-bg-circle" cx="46" cy="46" r="36" fill="none" />
          <circle class="donut-progress-circle" id="${circleId}"
                  cx="46" cy="46" r="36" fill="none"
                  stroke="${color}"
                  stroke-dasharray="${C}"
                  stroke-dashoffset="${C}" />
        </svg>
        <div class="donut-center-badge">
          <span class="donut-percent-num" id="${numId}">0</span><span class="donut-percent-sign">%</span>
        </div>
      `;
      circle = document.getElementById(circleId);
      numEl = document.getElementById(numId);

      // Trigger smooth opening animation
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (circle) circle.style.strokeDashoffset = targetOffset;
          if (clampedPct > 0) {
            this.animateCounter(numEl, 0, clampedPct, 1200);
          }
        }, 40);
      });
    } else {
      // Existing element: smooth transition as live values increase or decrease
      const currentPct = parseInt(numEl.textContent, 10) || 0;
      circle.style.strokeDashoffset = targetOffset;
      if (currentPct !== clampedPct) {
        this.animateCounter(numEl, currentPct, clampedPct, 900);
      }
    }
  },

  animateCounter(el, start, end, duration = 900) {
    if (!el) return;
    if (start === end) {
      el.textContent = end;
      return;
    }
    const startTime = performance.now();
    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutCubic: fast start, soft settle
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * ease);
      el.textContent = current;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = end;
      }
    };
    requestAnimationFrame(step);
  },

  // Columns in the logs table: 5 on the dashboard, 5 or 6 on the phase pages (placeholder rows span all of them)
  logColspan() {
    return document.querySelectorAll('.logs-table thead th').length || 5;
  },

  renderLogsTable(logs) {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${this.logColspan()}" style="text-align:center; padding:36px; color:#94A3B8;">
            <i class="fa-solid fa-satellite-dish" style="margin-right:8px; color:var(--primary);"></i>
            Connected to <strong>${this.activeDeviceId || 'Device'}</strong>. Waiting for data...
          </td>
        </tr>
      `;
      return;
    }

    const top20 = logs.slice(0, 20);
    // Phase pages list their readings in data-cols (e.g. "voltage_ll_v_1 voltage_ll_v_2 voltage_ll_v_3"): one column each,
    // in place of the dashboard's PF / Hz, Power / Energy and Status columns
    const phaseCols = (tbody.dataset.cols || '').split(/\s+/).filter(k => METRICS[k]);
    const fmt = (log, k) => log[k] != null ? Number(log[k]).toFixed(METRICS[k].decimals) : '--';

    tbody.innerHTML = top20.map(log => {
      // Power / Energy column: stored Average Power (total_power_kw) and the kWh counter
      const logPower = Number(log.total_power_kw || 0);
      const logEnergy = Number(log.import_energy_kwh || 0);

      // Device Name: if set show this, otherwise DEFAULT "Device"
      let devName = 'Device';
      if (log.device_name && log.device_name.trim()) {
        devName = log.device_name.trim();
      } else if (this.activeDevice && this.activeDevice.device_name && this.activeDevice.device_name.trim()) {
        devName = this.activeDevice.device_name.trim();
      }

      const devId = log.device_id || this.activeDeviceId || 'pnw101';

      // Bangladesh Standard Time (Asia/Dhaka) formatting
      const rawTime = log.recorded_at || log.created_at || log.bucket_time || log.timestamp;
      let timeDisplay = '--:--:--';
      if (log.formatted_time && /[ap]m$/i.test(String(log.formatted_time).trim())) {
        timeDisplay = String(log.formatted_time).trim();
      } else if (rawTime) {
        timeDisplay = formatBdTime(rawTime, 'full');
      }
      const dateDisplay = formatBdLogDate(rawTime || new Date());

      // Status comes from the API (total active power); fallback uses the same thresholds
      const totalPower = Number(log.total_power_kw || 0);
      const statusType = log.status_type || (totalPower > 3.0 ? 'danger' : (totalPower > 1.8 ? 'warning' : 'success'));
      const statusBadge = log.status_badge || (totalPower > 3.0 ? 'High Load' : (totalPower > 1.8 ? 'Moderate' : 'Normal'));

      return `
        <tr>
          <td>
            <div class="node-cell">
              <div class="node-avatar"><i class="fa-solid fa-bolt" style="font-size:14px;"></i></div>
              <div>
                <div class="node-name">${API.escapeHtml(devName)}</div>
                <div class="node-loc" style="font-family: var(--font-mono, monospace); font-size: 11px; opacity: 0.85;">${API.escapeHtml(devId)}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="display:inline-flex; align-items:baseline; gap:6px; white-space:nowrap;">
              <span style="font-weight: 600; color: #0F172A;">${timeDisplay}</span>
              ${dateDisplay ? `<span style="font-size: 11.5px; font-weight: 500; color: var(--text-muted, #64748B);">(${dateDisplay})</span>` : ''}
            </div>
          </td>
          ${phaseCols.length ? phaseCols.map(k => `<td>${log[k] != null ? `${fmt(log, k)} ${METRICS[k].unit}`.trim() : '--'}</td>`).join('') : `
          <td>${fmt(log, 'total_pf_iec')} PF / ${fmt(log, 'frequency_hz')} Hz</td>
          <td>
            <div class="price-power-cell" style="display:flex; align-items:baseline; gap:6px;">
              <span>${logPower.toFixed(3)} kW</span>
              <span style="font-size:11.5px; font-weight:500; color:var(--text-muted);">(${logEnergy.toFixed(2)} kWh)</span>
            </div>
          </td>
          <td>
            <span class="status-pill ${statusType}">
              ${statusBadge}
            </span>
          </td>`}
        </tr>
      `;
    }).join('');
  }
};
