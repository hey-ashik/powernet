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
  historicalWaveData: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

  async init() {
    this.loadUserProfile();
    this.updateDateRange();
    this.initEventListeners();
    await this.checkUserDevices();

    // Start 10-second polling loop
    this.pollTimer = setInterval(() => {
      if (this.hasDevice && this.activeDeviceId) {
        this.fetchLatestTelemetry();
        this.fetchLogs();
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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    el.innerHTML = `<span>01.${month}.${year} - ${lastDay}.${month}.${year}</span><i class="fa-regular fa-calendar" style="margin-left: 6px; font-size: 13px;"></i>`;
  },

  async checkUserDevices() {
    try {
      const res = await API.request('/devices/list.php');
      if (res && res.data && res.data.length > 0) {
        // User has a connected device!
        this.hasDevice = true;
        this.activeDevice = res.data[0];
        this.activeDeviceId = res.data[0].device_id;
        this.updateSidebarWidget(this.activeDevice);
        await this.fetchLatestTelemetry();
        await this.fetchLogs();
      } else {
        // Brand new user — no devices linked, show clean zero state (NO demo data)
        this.hasDevice = false;
        this.activeDevice = null;
        this.activeDeviceId = null;
        this.updateSidebarWidget(null);
        this.renderZeroState();
      }
    } catch (err) {
      console.warn('Could not verify user devices:', err);
      this.hasDevice = false;
      this.updateSidebarWidget(null);
      this.renderZeroState();
    }
  },

  updateSidebarWidget(device) {
    const titleEl = document.querySelector('.sidebar-widget .widget-title');
    const subEl = document.querySelector('.sidebar-widget .widget-sub');
    const btnEl = document.getElementById('btn-open-connect');

    if (device) {
      if (titleEl) titleEl.textContent = device.device_name || 'ESP32 DevKit V1';
      if (subEl) subEl.innerHTML = `<span style="color:#16A34A;font-weight:700;">● Connected</span> &bull; ${device.device_id}`;
      if (btnEl) {
        btnEl.innerHTML = `<i class="fa-solid fa-circle-check" style="margin-right:6px;"></i> Connected`;
        btnEl.style.background = '#16A34A';
        btnEl.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.35)';
      }
    } else {
      if (titleEl) titleEl.textContent = 'ESP32 DevKit V1';
      if (subEl) subEl.textContent = 'No device connected';
      if (btnEl) {
        btnEl.innerHTML = `<i class="fa-solid fa-link" style="margin-right:6px;"></i> Connect Device`;
        btnEl.style.background = 'var(--primary)';
        btnEl.style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.3)';
      }
    }
  },

  renderZeroState() {
    // Reset top status badge
    const statusDot = document.getElementById('status-pulse-dot');
    const statusText = document.getElementById('status-text');
    const lastSeenText = document.getElementById('status-last-seen');
    if (statusDot) statusDot.className = 'pulse-dot offline';
    if (statusText) statusText.textContent = 'Disconnected';
    if (lastSeenText) lastSeenText.textContent = '• No Device Linked';

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

    // Empty Bar Chart (0% heights)
    this.renderBarChart(true);

    // Flat Waveform
    this.historicalWaveData = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
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
        if (this.hasDevice && this.activeDevice) {
          // Pre-populate with existing device ID
          const devIdInput = document.getElementById('input-device-id');
          if (devIdInput) devIdInput.value = this.activeDevice.device_id;
          const devNameInput = document.getElementById('input-device-name');
          if (devNameInput) devNameInput.value = this.activeDevice.device_name || '';
        }
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

        try {
          const res = await API.request('/devices/connect.php', {
            method: 'POST',
            body: JSON.stringify({
              device_id: devId,
              device_name: devName
            })
          });

          API.showToast(res.message || `Device '${devId}' connected successfully!`, 'success');
          modal.classList.remove('active');

          // Refresh device list and immediately show connected state + live data
          await this.checkUserDevices();
        } catch (err) {
          API.showToast(err.message, 'error');
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

    // 9. Status & Pulse
    const statusDot = document.getElementById('status-pulse-dot');
    const statusText = document.getElementById('status-text');
    const lastSeenText = document.getElementById('status-last-seen');

    if (isOnline) {
      if (statusDot) statusDot.className = 'pulse-dot';
      if (statusText) statusText.textContent = 'Online';
      if (lastSeenText) lastSeenText.textContent = `• ${data.last_seen_relative || '5s sync'}`;
    } else {
      if (statusDot) statusDot.className = 'pulse-dot offline';
      if (statusText) statusText.textContent = 'Connected';
      if (lastSeenText) lastSeenText.textContent = `• ${data.last_seen_relative || 'Awaiting ESP32 packets'}`;
    }

    // Update Donuts with real ratios
    const powerPct = Math.min(100, Math.round((powerNum / 6.0) * 100)); // out of 6kW max breaker
    const energyPct = Math.min(100, Math.round((energyNum / 25.0) * 100));
    this.renderDonuts(powerPct, energyPct);

    // Update Bar Chart
    this.renderBarChart(false, powerNum);

    // Shift Waveform
    if (powerNum > 0) {
      this.shiftWaveformData(powerNum);
    }
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

  renderBarChart(isZero = false, currentKw = 0) {
    const chartContainer = document.getElementById('bar-chart-container');
    if (!chartContainer) return;

    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let heights = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    if (!isZero && currentKw > 0) {
      // Dynamic bars based on telemetry
      const activeHeight = Math.min(95, Math.max(25, Math.round((currentKw / 4.0) * 100)));
      heights = [20, 25, 30, 35, 45, 50, 40, 35, 55, 60, 70, activeHeight];
    }

    let html = `
      <div class="chart-y-axis">
        <span>4.0k</span>
        <span>3.0k</span>
        <span>2.0k</span>
        <span>1.0k</span>
        <span>0</span>
      </div>
    `;

    months.forEach((m, idx) => {
      const h = heights[idx];
      html += `
        <div class="bar-column-group">
          <div class="bar-track">
            ${h > 0 ? `<div class="bar-fill" style="height: ${h}%;"></div>` : ''}
          </div>
          <span class="bar-label">${m}</span>
        </div>
      `;
    });

    chartContainer.innerHTML = html;
  },

  renderWaveformChart() {
    const container = document.getElementById('waveform-container');
    if (!container) return;

    const points = this.historicalWaveData;
    const maxVal = 450;
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

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:100%;overflow:visible;">
        <defs>
          <linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#C084FC" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#C084FC" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <line x1="0" y1="30" x2="${width}" y2="30" stroke="#F1F5F9" stroke-width="1.5" stroke-dasharray="4,4" />
        <line x1="0" y1="90" x2="${width}" y2="90" stroke="#F1F5F9" stroke-width="1.5" stroke-dasharray="4,4" />
        <line x1="0" y1="150" x2="${width}" y2="150" stroke="#F1F5F9" stroke-width="1.5" stroke-dasharray="4,4" />

        <path d="${areaD}" fill="url(#waveGradient)" />
        <path d="${pathD}" fill="none" stroke="#C084FC" stroke-width="4" stroke-linecap="round" />
        <circle cx="${width}" cy="${height - (points[points.length - 1] / maxVal) * (height - 30)}" r="6" fill="#A855F7" stroke="#FFFFFF" stroke-width="3" />
      </svg>
    `;
  },

  shiftWaveformData(latestKw) {
    const val = Math.min(440, Math.max(120, Math.round(latestKw * 280)));
    this.historicalWaveData.shift();
    this.historicalWaveData.push(val);
    this.renderWaveformChart();
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
