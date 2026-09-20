/**
 * PowerNet Dashboard Controller
 * Handles user device locking, 10-second AJAX polling, telemetry rendering, dynamic charts & log tables
 * Device ID: pnw101 (Direct pairing & secure per-user locking)
 */

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.replace(/\.html$/, '');
  if (path === '/dashboard' || path === '/analytics' || path === '/' || !path) {
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

function getBdCalendarDays(count = 7) {
  const list = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const target = new Date(now.getTime() - i * 86400000);
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: BD_TZ }).format(target);
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: BD_TZ, weekday: 'short' }).format(target).toUpperCase();
    const dayNum = new Intl.DateTimeFormat('en-US', { timeZone: BD_TZ, day: '2-digit' }).format(target);
    const tooltipDate = new Intl.DateTimeFormat('en-US', { timeZone: BD_TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(target);
    list.push({
      key,
      label: count === 7 ? dayName : dayNum,
      tooltipDate,
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

const WAVE_METRICS = {
  voltage: { name: 'Voltage', unit: 'V', color: '#2563EB', defaultMax: 250, decimals: 1 },
  current: { name: 'Current', unit: 'A', color: '#F59E0B', defaultMax: 12, decimals: 2 },
  power: { name: 'Power', unit: 'kW', color: '#8B5CF6', defaultMax: 4, decimals: 3 },
  energy: { name: 'Energy', unit: 'kWh', color: '#10B981', defaultMax: 5, decimals: 3 },
  temperature: { name: 'Temp', unit: '°C', color: '#EF4444', defaultMax: 60, decimals: 1 }
};

const Dashboard = {
  pollIntervalMs: 10000,
  pollTimer: null,
  activeDeviceId: null,
  activeDevice: null,
  hasDevice: false,

  // Chart state
  powerUnit: 'kw',     // 'kw' or 'kwh'
  powerRange: '7d',    // '7d', '30d', '12m'
  waveMetric: 'voltage', // 'voltage', 'current', 'power', 'energy', 'temperature'
  historyData: [],       // cached history points from API
  waveHistory: { voltage: [], current: [], power: [], energy: [], temperature: [] },
  prevTelemetry: null,   // tracks previous reading { voltage, current, temperature } for delta % calculation

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

    // Start 10-second polling loop
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
    const unit = this.powerUnit; // 'kw' or 'kwh'
    const range = this.powerRange; // '7d', '30d', '12m'

    let buckets = [];
    if (range === '7d') {
      buckets = getBdCalendarDays(7);
    } else if (range === '30d') {
      buckets = getBdCalendarDays(30);
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
        let rawVal = unit === 'kwh' ? Number(p.max_energy || p.energy || 0) : Number(p.avg_power || p.power || 0);
        if (unit === 'kw' && rawVal > 100) rawVal = rawVal / 1000;
        bucket.value += rawVal;
        bucket._count += 1;
      }
    });

    // Average for kW
    if (unit === 'kw') {
      buckets.forEach(b => {
        if (b._count > 1) b.value = b.value / b._count;
      });
    }

    // Calculate max for scaling
    const maxObserved = Math.max(...buckets.map(b => b.value), 0);
    const maxVal = maxObserved > 0 ? maxObserved * 1.15 : (unit === 'kwh' ? 10 : 3.0);

    // Build Y-axis labels (5 ticks from top down to 0)
    const yLabels = [];
    for (let i = 4; i >= 0; i--) {
      const v = (maxVal * i) / 4;
      yLabels.push(v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 1 ? 2 : 1));
    }

    const isScrollable = range === '30d';
    let html = `<div class="chart-y-axis">${yLabels.map(l => `<span>${l}</span>`).join('')}</div>`;
    html += `<div class="bar-chart-scroll-wrap ${isScrollable ? 'has-scroll' : ''}" id="bar-chart-scroll-wrap">`;
    html += `<div class="bar-chart-bars-track ${isScrollable ? 'is-30d' : ''}">`;

    // Limit visible labels on dense datasets
    const showEvery = buckets.length > 20 ? 3 : 1;
    const delayStep = range === '7d' ? 45 : (range === '30d' ? 18 : 35);

    buckets.forEach((b, idx) => {
      const pct = maxVal > 0 ? Math.min(100, Math.round((b.value / maxVal) * 100)) : 0;
      const showLabel = idx % showEvery === 0;
      const valDisplay = b.value.toFixed(unit === 'kwh' ? 2 : (b.value < 10 ? 2 : 1));
      const delayMs = idx * delayStep;

      html += `
        <div class="bar-column-group">
          <div class="bar-track" tabindex="0">
            <div class="bar-tooltip">
              <div class="bar-tooltip-date">${b.tooltipDate} (BST)</div>
              <div class="bar-tooltip-val">${valDisplay} ${unit.toUpperCase()}</div>
            </div>
            <div class="bar-fill" style="height: ${Math.max(3, pct)}%; animation-delay: ${delayMs}ms;"></div>
          </div>
          <span class="bar-label" ${!showLabel ? 'style="visibility:hidden;"' : ''}>${b.label}</span>
        </div>
      `;
    });

    html += `</div></div>`;
    chartContainer.innerHTML = html;

    // Scroll to the latest days (right side) when 30d is loaded
    if (range === '30d') {
      const scrollWrap = chartContainer.querySelector('.bar-chart-scroll-wrap');
      if (scrollWrap) {
        requestAnimationFrame(() => {
          scrollWrap.scrollLeft = scrollWrap.scrollWidth;
        });
      }
    }
  },

  // ─── Waveform Chart ───────────────────────────────────────
  renderWaveformChart() {
    const container = document.getElementById('waveform-container');
    if (!container) return;

    const metric = this.waveMetric;
    const cfg = WAVE_METRICS[metric] || WAVE_METRICS.voltage;
    const points = this.waveHistory[metric] || [];

    if (points.length < 2) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94A3B8;font-size:13px;flex-direction:column;gap:8px;">
          <i class="fa-brands fa-slack" style="font-size:28px;color:#0F172A;opacity:0.35;"></i>
          <span>Waiting for live ${cfg.name} telemetry (${cfg.unit})</span>
        </div>
      `;
      return;
    }

    // Scale calculation
    const values = points.map(p => p.val);
    const maxObserved = Math.max(...values, 0.01);
    const maxVal = Math.max(cfg.defaultMax, Math.ceil(maxObserved * 1.15));

    // 5 Y-axis tick values from max down to 0
    const yTicks = [maxVal, maxVal * 0.75, maxVal * 0.5, maxVal * 0.25, 0];
    const yLabels = yTicks.map((v, i) => {
      const str = v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(cfg.decimals === 0 ? 0 : (v < 10 ? 1 : 0));
      return i === 0 ? `${str} ${cfg.unit}` : str;
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
              <span>${cfg.name}:</span>
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
      tooltipNum.textContent = `${pt.val.toFixed(cfg.decimals)} ${cfg.unit}`;

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

  pushWaveformPoint(data) {
    const maxPoints = 20;
    const time = data.created_at || data.recorded_at || data.bucket_time || new Date().toISOString();
    const fields = ['voltage', 'current', 'power', 'energy', 'temperature'];
    fields.forEach(f => {
      let rawVal = Number(data[f] || 0);
      if (f === 'power' && rawVal > 100) rawVal = rawVal / 1000;
      if (!this.waveHistory[f]) this.waveHistory[f] = [];
      this.waveHistory[f].push({ val: rawVal, time });
      if (this.waveHistory[f].length > maxPoints) this.waveHistory[f].shift();
    });
    this.renderWaveformChart();
  },

  populateWaveformFromTelemetry(telemetryPoints) {
    if (!telemetryPoints || telemetryPoints.length === 0) return;
    // Reverse newest-first array so that earliest timestamp is on the left and newest is on the right
    const slice = [...telemetryPoints].reverse().slice(-20);
    const fields = ['voltage', 'current', 'power', 'energy', 'temperature'];
    fields.forEach(f => {
      this.waveHistory[f] = slice.map(p => {
        let rawVal = Number(p[f] || 0);
        if (f === 'power' && rawVal > 100) rawVal = rawVal / 1000;
        return {
          val: rawVal,
          time: p.created_at || p.recorded_at || p.bucket_time || new Date().toISOString()
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
    // 1. Status
    const statusDot = document.getElementById('status-pulse-dot');
    const statusText = document.getElementById('status-text');
    if (statusDot) statusDot.className = 'pulse-dot';
    if (statusText) statusText.textContent = 'Syncing...';

    // 2. Metrics shimmer helper
    const shimmer = (w = 64, h = 26) => `<span class="skeleton-shimmer" style="display:inline-block; width:${w}px; height:${h}px; vertical-align:middle; border-radius:6px;"></span>`;

    const vEl = document.getElementById('metric-voltage');
    if (vEl) vEl.innerHTML = shimmer(56, 30);
    const cEl = document.getElementById('metric-current');
    if (cEl) cEl.innerHTML = shimmer(56, 30);
    const pEl = document.getElementById('metric-power');
    if (pEl) pEl.innerHTML = shimmer(65, 24);
    const eEl = document.getElementById('metric-energy');
    if (eEl) eEl.innerHTML = shimmer(65, 24);
    const tEl = document.getElementById('metric-temperature');
    if (tEl) tEl.innerHTML = shimmer(48, 26);
    const costEl = document.getElementById('kpi-est-cost');
    if (costEl) costEl.innerHTML = shimmer(72, 24);

    // Shimmer delta footers
    const deltaV = document.getElementById('delta-voltage');
    if (deltaV) deltaV.innerHTML = shimmer(44, 16);
    const deltaC = document.getElementById('delta-current');
    if (deltaC) deltaC.innerHTML = shimmer(44, 16);
    const deltaT = document.getElementById('delta-temperature');
    if (deltaT) deltaT.innerHTML = shimmer(44, 16);

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
    const elEnergy = document.getElementById('metric-energy');
    if (elEnergy) elEnergy.textContent = '0.000';
    const elTemp = document.getElementById('metric-temperature');
    if (elTemp) elTemp.textContent = '--';
    const elCost = document.getElementById('kpi-est-cost');
    if (elCost) elCost.textContent = '0.00 ৳';

    // Reset deltas and cached previous telemetry
    this.prevTelemetry = null;
    const dv = document.getElementById('delta-voltage');
    if (dv) { dv.className = 'delta-neutral'; dv.innerHTML = '&rarr; 0.0%'; }
    const dc = document.getElementById('delta-current');
    if (dc) { dc.className = 'delta-neutral'; dc.innerHTML = '&rarr; 0.0%'; }
    const dt = document.getElementById('delta-temperature');
    if (dt) { dt.className = 'delta-neutral'; dt.innerHTML = '&rarr; 0.0%'; }

    // Empty Donuts (0%)
    this.renderDonuts(0, 0);

    // Empty Bar Chart
    this.historyData = [];
    this.renderBarChartFromHistory();

    // Flat Waveform
    this.waveHistory = { voltage: [], current: [], power: [], energy: [], temperature: [] };
    this.renderWaveformChart();

    // Clean empty logs table
    const tbody = document.getElementById('logs-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding: 40px 16px; color: #94A3B8;">
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
                <td colspan="5" style="text-align:center; padding:36px; color:#94A3B8;">
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
    }
  },

  async fetchLogs() {
    if (!this.activeDeviceId) return;
    try {
      const res = await API.request(`/telemetry/logs.php?device_id=${this.activeDeviceId}&limit=20`);
      if (res && res.data) {
        this.renderLogsTable(res.data);
        // Pre-populate waveform on load if not yet populated
        if ((!this.waveHistory.voltage || this.waveHistory.voltage.length < 2) && res.data.length > 0) {
          this.populateWaveformFromTelemetry(res.data);
        }
      }
    } catch (err) {
      console.warn('Could not fetch logs:', err);
    }
  },

  updateMetricCards(data) {
    const isOnline = Boolean(data.is_online);

    // 1. Voltage
    const elVoltage = document.getElementById('metric-voltage');
    if (elVoltage) elVoltage.textContent = (data.voltage !== undefined && data.voltage !== null) ? Number(data.voltage).toFixed(1) : '0.0';

    // 2. Current
    const elCurrent = document.getElementById('metric-current');
    if (elCurrent) elCurrent.textContent = (data.current !== undefined && data.current !== null) ? Number(data.current).toFixed(2) : '0.00';

    // 3. Active Power
    const elPower = document.getElementById('metric-power');
    let powerNum = (data.power !== undefined && data.power !== null) ? Number(data.power) : 0.0;
    if (powerNum > 100) powerNum = powerNum / 1000;
    if (elPower) elPower.textContent = powerNum.toFixed(3);

    // 4. Daily Energy
    const elEnergy = document.getElementById('metric-energy');
    const energyNum = (data.energy !== undefined && data.energy !== null) ? Number(data.energy) : 0.0;
    if (elEnergy) elEnergy.textContent = energyNum.toFixed(3);

    // 5. Temperature
    const elTemp = document.getElementById('metric-temperature');
    if (elTemp) elTemp.textContent = (data.temperature !== undefined && data.temperature !== null) ? Number(data.temperature).toFixed(1) : '--';

    // 6. Cost (Fixed 0.00 taka sign)
    const elCost = document.getElementById('kpi-est-cost');
    if (elCost) {
      elCost.textContent = '0.00 ৳';
    }

    // 7. Dynamic Real-Time Delta % Calculations based on previous values
    const currV = (data.voltage !== undefined && data.voltage !== null) ? Number(data.voltage) : null;
    const currC = (data.current !== undefined && data.current !== null) ? Number(data.current) : null;
    const currT = (data.temperature !== undefined && data.temperature !== null) ? Number(data.temperature) : null;

    let prevV = (this.prevTelemetry && this.prevTelemetry.voltage != null) ? this.prevTelemetry.voltage : (data.prev_voltage != null ? Number(data.prev_voltage) : null);
    let prevC = (this.prevTelemetry && this.prevTelemetry.current != null) ? this.prevTelemetry.current : (data.prev_current != null ? Number(data.prev_current) : null);
    let prevT = (this.prevTelemetry && this.prevTelemetry.temperature != null) ? this.prevTelemetry.temperature : (data.prev_temperature != null ? Number(data.prev_temperature) : null);

    this.updateDeltaBadge('delta-voltage', currV, prevV);
    this.updateDeltaBadge('delta-current', currC, prevC);
    this.updateDeltaBadge('delta-temperature', currT, prevT);

    // Save current readings as previous for the next real-time cycle
    if (currV !== null || currC !== null || currT !== null) {
      this.prevTelemetry = {
        voltage: currV,
        current: currC,
        temperature: currT
      };
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
    const powerPct = Math.min(100, Math.round((powerNum / 6.0) * 100)); // out of 6kW max breaker
    const energyPct = Math.min(100, Math.round((energyNum / 25.0) * 100));
    this.renderDonuts(powerPct, energyPct);

    // Push live data to waveform
    this.pushWaveformPoint(data);
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

  renderLogsTable(logs) {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:36px; color:#94A3B8;">
            <i class="fa-solid fa-satellite-dish" style="margin-right:8px; color:var(--primary);"></i>
            Connected to <strong>${this.activeDeviceId || 'Device'}</strong>. Waiting for data...
          </td>
        </tr>
      `;
      return;
    }

    const top20 = logs.slice(0, 20);

    tbody.innerHTML = top20.map(log => {
      let logPower = Number(log.power || 0);
      if (logPower > 100) logPower = logPower / 1000;
      let logEnergy = Number(log.energy || 0);

      // Device Name: if set show this, otherwise DEFAULT "Device"
      let devName = 'Device';
      if (log.device_name && log.device_name.trim()) {
        devName = log.device_name.trim();
      } else if (this.activeDevice && this.activeDevice.device_name && this.activeDevice.device_name.trim()) {
        devName = this.activeDevice.device_name.trim();
      }

      const devId = log.device_id || this.activeDeviceId || 'pnw101';

      // Bangladesh Standard Time (Asia/Dhaka) formatting
      let timeDisplay = '--:--:--';
      if (log.formatted_time && /[ap]m$/i.test(String(log.formatted_time).trim())) {
        timeDisplay = String(log.formatted_time).trim();
      } else {
        const rawTime = log.recorded_at || log.created_at || log.bucket_time || log.timestamp;
        if (rawTime) {
          timeDisplay = formatBdTime(rawTime, 'full');
        }
      }

      const statusType = log.status_type || (logPower > 3.0 ? 'danger' : (logPower > 1.8 ? 'warning' : 'success'));
      const statusBadge = log.status_badge || (logPower > 3.0 ? 'High Load' : (logPower > 1.8 ? 'Moderate' : 'Normal'));

      return `
        <tr>
          <td>
            <div class="node-cell">
              <div class="node-avatar"><i class="fa-solid fa-bolt" style="font-size:14px;"></i></div>
              <div>
                <div class="node-name">${devName}</div>
                <div class="node-loc" style="font-family: var(--font-mono, monospace); font-size: 11px; opacity: 0.85;">${devId}</div>
              </div>
            </div>
          </td>
          <td>
            <span style="font-weight: 600; color: #0F172A;">${timeDisplay}</span>
          </td>
          <td>${Number(log.voltage || 0).toFixed(1)} V / ${Number(log.current || 0).toFixed(2)} A</td>
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
          </td>
        </tr>
      `;
    }).join('');
  }
};
