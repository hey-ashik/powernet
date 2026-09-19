/**
 * PowerNet Dashboard Controller
 * Handles user device locking, 10-second AJAX polling, telemetry rendering, dynamic charts & log tables
 * Device ID: pnw101 (Direct pairing & secure per-user locking)
 */

document.addEventListener('DOMContentLoaded', () => {
  Dashboard.init();
});

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

  async init() {
    this.loadUserProfile();
    this.updateDateRange();
    this.initEventListeners();
    this.initChartSwitchers();
    await this.checkUserDevices();

    // Sync devices on tab visibility change or window focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkUserDevices(true);
      }
    });
    window.addEventListener('focus', () => {
      this.checkUserDevices(true);
    });

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

    const points = this.historyData;
    const unit = this.powerUnit; // 'kw' or 'kwh'
    const range = this.powerRange;

    // Build buckets based on range
    let buckets = [];

    if (range === '1d') {
      // 24 hour buckets
      for (let h = 0; h < 24; h++) {
        const label = String(h).padStart(2, '0') + ':00';
        buckets.push({ label, value: 0 });
      }
      points.forEach(p => {
        const d = new Date(p.bucket_time);
        const h = d.getHours();
        if (h >= 0 && h < 24) {
          buckets[h].value += unit === 'kwh' ? Number(p.max_energy || 0) : Number(p.avg_power || 0);
          // ponytail: avg across samples sharing the same hour bucket; good enough for bar heights
        }
      });
    } else if (range === '7d') {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().substring(0, 10);
        buckets.push({ label: dayNames[d.getDay()], value: 0, key });
      }
      points.forEach(p => {
        const key = (p.bucket_time || '').substring(0, 10);
        const bucket = buckets.find(b => b.key === key);
        if (bucket) {
          bucket.value += unit === 'kwh' ? Number(p.max_energy || 0) : Number(p.avg_power || 0);
          bucket._count = (bucket._count || 0) + 1;
        }
      });
      // Average for kW
      if (unit === 'kw') buckets.forEach(b => { if (b._count > 1) b.value /= b._count; });
    } else if (range === '30d') {
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().substring(0, 10);
        const label = String(d.getDate()).padStart(2, '0');
        buckets.push({ label, value: 0, key });
      }
      points.forEach(p => {
        const key = (p.bucket_time || '').substring(0, 10);
        const bucket = buckets.find(b => b.key === key);
        if (bucket) {
          bucket.value += unit === 'kwh' ? Number(p.max_energy || 0) : Number(p.avg_power || 0);
          bucket._count = (bucket._count || 0) + 1;
        }
      });
      if (unit === 'kw') buckets.forEach(b => { if (b._count > 1) b.value /= b._count; });
    } else {
      // 12m — show month names
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const today = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = d.toISOString().substring(0, 7); // YYYY-MM
        buckets.push({ label: monthNames[d.getMonth()], value: 0, key });
      }
      points.forEach(p => {
        const key = (p.bucket_time || '').substring(0, 7);
        const bucket = buckets.find(b => b.key === key);
        if (bucket) {
          bucket.value += unit === 'kwh' ? Number(p.max_energy || 0) : Number(p.avg_power || 0);
          bucket._count = (bucket._count || 0) + 1;
        }
      });
      if (unit === 'kw') buckets.forEach(b => { if (b._count > 1) b.value /= b._count; });
    }

    // Calculate max for scaling
    const maxVal = Math.max(...buckets.map(b => b.value), 0.001);

    // Build Y-axis labels
    const yLabels = [];
    for (let i = 4; i >= 0; i--) {
      const v = (maxVal * i) / 4;
      yLabels.push(v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 1 ? 2 : 1));
    }

    let html = `<div class="chart-y-axis">${yLabels.map(l => `<span>${l}</span>`).join('')}</div>`;

    // Limit visible bars to avoid overcrowding
    const showEvery = buckets.length > 24 ? 2 : 1;

    buckets.forEach((b, idx) => {
      const pct = maxVal > 0 ? Math.round((b.value / maxVal) * 100) : 0;
      const showLabel = idx % showEvery === 0;
      html += `
        <div class="bar-column-group">
          <div class="bar-track">
            ${pct > 0 ? `<div class="bar-fill" style="height: ${Math.max(2, pct)}%;"></div>` : ''}
          </div>
          <span class="bar-label" ${!showLabel ? 'style="visibility:hidden;"' : ''}>${b.label}</span>
        </div>
      `;
    });

    chartContainer.innerHTML = html;
  },

  // ─── Waveform Chart ───────────────────────────────────────
  renderWaveformChart() {
    const container = document.getElementById('waveform-container');
    if (!container) return;

    const metric = this.waveMetric;
    const points = this.waveHistory[metric] || [];

    // Colors per metric
    const colors = {
      voltage: '#2563EB',
      current: '#F59E0B',
      power: '#8B5CF6',
      energy: '#10B981',
      temperature: '#EF4444'
    };
    const color = colors[metric] || '#8B5CF6';

    if (points.length < 2) {
      // Zero state
      const units = { voltage: 'V', current: 'A', power: 'kW', energy: 'kWh', temperature: '°C' };
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94A3B8;font-size:13px;flex-direction:column;gap:8px;">
          <i class="fa-solid fa-wave-square" style="font-size:28px;color:${color};opacity:0.4;"></i>
          <span>Waiting for live ${metric} data (${units[metric]})</span>
        </div>
      `;
      return;
    }

    // Scale: find max for the current metric
    const maxVal = Math.max(...points, 0.01) * 1.15;
    const width = 600;
    const height = 180;
    const stepX = width / (points.length - 1);

    let pathD = `M 0 ${height - (points[0] / maxVal) * (height - 30)}`;
    for (let i = 1; i < points.length; i++) {
      const xPrev = (i - 1) * stepX;
      const yPrev = height - (points[i - 1] / maxVal) * (height - 30);
      const xCurr = i * stepX;
      const yCurr = height - (points[i] / maxVal) * (height - 30);
      const xMid = (xPrev + xCurr) / 2;
      pathD += ` C ${xMid} ${yPrev}, ${xMid} ${yCurr}, ${xCurr} ${yCurr}`;
    }

    const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;
    const lastY = height - (points[points.length - 1] / maxVal) * (height - 30);

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;overflow:visible;">
        <defs>
          <linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <line x1="0" y1="30" x2="${width}" y2="30" stroke="#F1F5F9" stroke-width="1.5" stroke-dasharray="4,4" />
        <line x1="0" y1="90" x2="${width}" y2="90" stroke="#F1F5F9" stroke-width="1.5" stroke-dasharray="4,4" />
        <line x1="0" y1="150" x2="${width}" y2="150" stroke="#F1F5F9" stroke-width="1.5" stroke-dasharray="4,4" />
        <path d="${areaD}" fill="url(#waveGradient)" />
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" />
        <circle cx="${width}" cy="${lastY}" r="5" fill="${color}" stroke="#FFFFFF" stroke-width="2.5" />
      </svg>
    `;
  },

  pushWaveformPoint(data) {
    const maxPoints = 20;
    const fields = ['voltage', 'current', 'power', 'energy', 'temperature'];
    fields.forEach(f => {
      const val = Number(data[f] || 0);
      if (!this.waveHistory[f]) this.waveHistory[f] = [];
      this.waveHistory[f].push(val);
      if (this.waveHistory[f].length > maxPoints) this.waveHistory[f].shift();
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
        this.updateSidebarWidget(null);
        if (wasConnected || !isBackground) {
          this.renderZeroState();
        }
      }
    } catch (err) {
      if (!isBackground) {
        console.warn('Could not verify user devices:', err);
        this.hasDevice = false;
        this.updateSidebarWidget(null);
        this.renderZeroState();
      }
    }
  },

  updateSidebarWidget(device) {
    const titleEl = document.querySelector('.sidebar-widget .widget-title');
    const subEl = document.querySelector('.sidebar-widget .widget-sub');
    const btnEl = document.getElementById('btn-open-connect') || document.getElementById('btn-sidebar-connect');

    if (device) {
      if (titleEl) titleEl.textContent = device.device_name || `ESP32 (${device.device_id})`;
      if (subEl) subEl.innerHTML = `<span style="color:#16A34A;font-weight:700;">● Connected</span> &bull; ${device.device_id}`;
      if (btnEl) {
        btnEl.className = 'widget-btn connected';
        btnEl.setAttribute('title', 'Click to Disconnect');
        btnEl.style.background = '#16A34A';
        btnEl.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.35)';
        btnEl.innerHTML = `
          <span class="btn-label-connected"><i class="fa-solid fa-circle-check"></i> Connected</span>
          <span class="btn-label-disconnect"><i class="fa-solid fa-link-slash"></i> Disconnect</span>
        `;
      }
    } else {
      if (titleEl) titleEl.textContent = 'ESP32 DevKit V1';
      if (subEl) subEl.textContent = 'No device connected';
      if (btnEl) {
        btnEl.className = 'widget-btn';
        btnEl.removeAttribute('title');
        btnEl.style.background = 'var(--primary)';
        btnEl.style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.3)';
        btnEl.innerHTML = `<i class="fa-solid fa-link" style="margin-right:6px;"></i> Connect Device`;
      }
    }
  },

  async disconnectDevice(devId) {
    try {
      // 1. Immediately update UI state in REAL TIME
      this.hasDevice = false;
      this.activeDevice = null;
      this.activeDeviceId = null;
      this.updateSidebarWidget(null);
      this.renderZeroState();

      // 2. Call backend
      await API.request('/devices/remove.php', {
        method: 'POST',
        body: JSON.stringify({ device_id: devId })
      });
      API.showToast(`Device '${devId}' disconnected successfully.`, 'info');
    } catch (err) {
      API.showToast(err.message || 'Could not disconnect device', 'error');
      await this.checkUserDevices(true);
    }
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
    const elCumEnergy = document.getElementById('metric-cum-energy');
    if (elCumEnergy) elCumEnergy.textContent = '0.0';
    const elTemp = document.getElementById('metric-temperature');
    if (elTemp) elTemp.textContent = '--';
    const elCost = document.getElementById('kpi-est-cost');
    if (elCost) elCost.textContent = '$0.00';
    const elPeak = document.getElementById('kpi-peak-load');
    if (elPeak) elPeak.textContent = '0.000 kW';

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
            <span style="font-size: 12.5px; color: #64748B;">Click <strong>Connect Device</strong> on the bottom-left to link your ESP32 (pnw101).</span>
          </td>
        </tr>
      `;
    }
  },

  initEventListeners() {
    // Refresh button for logs
    const refreshLogsBtn = document.getElementById('btn-refresh-logs');
    if (refreshLogsBtn) {
      refreshLogsBtn.addEventListener('click', () => {
        refreshLogsBtn.style.transform = 'rotate(180deg)';
        if (this.hasDevice && this.activeDeviceId) {
          this.fetchLogs();
        }
        setTimeout(() => refreshLogsBtn.style.transform = '', 300);
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
        const devId = document.getElementById('input-device-id').value.trim();
        const devName = document.getElementById('input-device-name').value.trim();

        if (!devId) {
          API.showToast('Please enter a Device ID.', 'error');
          return;
        }

        const submitBtn = formConnect.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
        }

        try {
          const res = await API.request('/devices/connect.php', {
            method: 'POST',
            body: JSON.stringify({
              device_id: devId,
              device_name: devName
            })
          });

          // 1. Immediately update UI state in REAL TIME
          modal.classList.remove('active');
          this.hasDevice = true;
          this.activeDeviceId = devId;
          this.activeDevice = {
            device_id: devId,
            device_name: devName || `Main Panel (${devId})`
          };
          this.updateSidebarWidget(this.activeDevice);

          API.showToast(res.message || `Device '${devId}' connected successfully!`, 'success');

          // 2. Refresh telemetry & logs immediately
          await this.fetchLatestTelemetry();
          await this.fetchLogs();
          await this.fetchBarChartHistory();
          await this.checkUserDevices(true);
        } catch (err) {
          API.showToast(err.message, 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-link" style="margin-right: 8px;"></i> Connect ESP32';
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
      const res = await API.request(`/telemetry/logs.php?device_id=${this.activeDeviceId}&limit=6`);
      if (res && res.data) {
        this.renderLogsTable(res.data);
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
    const powerNum = (data.power !== undefined && data.power !== null) ? Number(data.power) : 0.0;
    if (elPower) elPower.textContent = powerNum.toFixed(3);

    // 4. Daily Energy
    const elEnergy = document.getElementById('metric-energy');
    const energyNum = (data.energy !== undefined && data.energy !== null) ? Number(data.energy) : 0.0;
    if (elEnergy) elEnergy.textContent = energyNum.toFixed(3);

    // 5. Cumulative Energy
    const elCumEnergy = document.getElementById('metric-cum-energy');
    if (elCumEnergy) elCumEnergy.textContent = energyNum.toFixed(1);

    // 6. Temperature
    const elTemp = document.getElementById('metric-temperature');
    if (elTemp) elTemp.textContent = (data.temperature !== undefined && data.temperature !== null) ? Number(data.temperature).toFixed(1) : '--';

    // 7. Cost estimation
    const elCost = document.getElementById('kpi-est-cost');
    if (elCost) {
      const cost = (energyNum * 0.34).toFixed(2);
      elCost.textContent = `$${cost}`;
    }

    // 8. Peak load
    const elPeak = document.getElementById('kpi-peak-load');
    if (elPeak) {
      elPeak.textContent = `${powerNum.toFixed(3)} kW`;
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

  renderDonuts(powerPct = 0, energyPct = 0) {
    const container1 = document.getElementById('donut-power-container');
    if (container1) {
      container1.innerHTML = `
        <svg viewBox="0 0 36 36" style="width:100%;height:100%;transform:rotate(-90deg);">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F1F5F9" stroke-width="5.5" />
          ${powerPct > 0 ? `
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F59E0B" stroke-width="5.5" stroke-dasharray="${powerPct}, 100" stroke-linecap="round" />
          ` : ''}
        </svg>
      `;
    }

    const container2 = document.getElementById('donut-energy-container');
    if (container2) {
      container2.innerHTML = `
        <svg viewBox="0 0 36 36" style="width:100%;height:100%;transform:rotate(-90deg);">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#F1F5F9" stroke-width="5.5" />
          ${energyPct > 0 ? `
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#2563EB" stroke-width="5.5" stroke-dasharray="${energyPct}, 100" stroke-linecap="round" />
          ` : ''}
        </svg>
      `;
    }
  },

  renderLogsTable(logs) {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:36px; color:#94A3B8;">
            <i class="fa-solid fa-satellite-dish" style="margin-right:8px; color:var(--primary);"></i>
            Connected to <strong>${this.activeDeviceId}</strong>. Waiting for new telemetry packets from ESP32...
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = logs.map(log => `
      <tr>
        <td>
          <div class="node-cell">
            <div class="node-avatar"><i class="fa-solid fa-bolt" style="font-size:14px;"></i></div>
            <div>
              <div class="node-name">${log.device_id || this.activeDeviceId}</div>
              <div class="node-loc">Phase L1 • Main Panel</div>
            </div>
          </div>
        </td>
        <td>${Number(log.voltage).toFixed(1)} V / ${Number(log.current).toFixed(2)} A</td>
        <td>${log.formatted_time || (log.recorded_at ? log.recorded_at.substring(11, 19) : '--:--:--')}</td>
        <td>
          <span class="status-pill ${log.status_type || 'success'}">
            ${log.status_badge || 'Normal'}
          </span>
        </td>
        <td class="price-power-cell">${Number(log.power).toFixed(3)} kW</td>
      </tr>
    `).join('');
  }
};
