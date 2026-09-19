/**
 * PowerNet Devices Page Controller
 * Device ID: pnw101 (Direct pairing without tokens)
 */

document.addEventListener('DOMContentLoaded', () => {
  loadUserProfile();
  loadDevices();

  const connectForm = document.getElementById('form-connect-device-page');
  if (connectForm) {
    connectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const devId = document.getElementById('device_id').value.trim();
      const devName = document.getElementById('device_name').value.trim();

      try {
        const res = await API.request('/devices/connect.php', {
          method: 'POST',
          body: JSON.stringify({ device_id: devId, device_name: devName })
        });
        API.showToast(res.message || 'Device connected!', 'success');
        connectForm.reset();
        document.getElementById('device_id').value = 'pnw101';
        loadDevices();
      } catch (err) {
        API.showToast(err.message, 'error');
      }
    });
  }
});

function loadUserProfile() {
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
}

async function loadDevices() {
  const container = document.getElementById('devices-list');
  const widgetTitle = document.querySelector('.sidebar-widget .widget-title');
  const widgetSub = document.querySelector('.sidebar-widget .widget-sub');
  const widgetBtn = document.getElementById('btn-sidebar-connect');

  if (!container) return;

  try {
    const res = await API.request('/devices/list.php');
    if (res && res.data && res.data.length > 0) {
      const dev = res.data[0];
      if (widgetTitle) widgetTitle.textContent = dev.device_name || `ESP32 (${dev.device_id})`;
      if (widgetSub) widgetSub.innerHTML = `<span style="color:#16A34A;font-weight:700;">● Connected</span> &bull; ${dev.device_id}`;
      if (widgetBtn) {
        widgetBtn.className = 'widget-btn connected';
        widgetBtn.setAttribute('title', 'Click to Disconnect');
        widgetBtn.style.background = '#16A34A';
        widgetBtn.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.35)';
        widgetBtn.innerHTML = `
          <span class="btn-label-connected"><i class="fa-solid fa-circle-check"></i> Connected</span>
          <span class="btn-label-disconnect"><i class="fa-solid fa-link-slash"></i> Disconnect</span>
        `;
        widgetBtn.onclick = (e) => {
          e.preventDefault();
          removeDevice(dev.device_id);
        };
      }

      container.innerHTML = res.data.map(dev => `
        <div class="card" style="margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; border-radius: 20px; padding: 22px 26px; background: #FFFFFF; border: 1px solid var(--border-card); box-shadow: var(--shadow-card); flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 18px;">
            <div style="width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%); display: flex; align-items: center; justify-content: center; color: #2563EB; font-size: 22px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.12);">
              <i class="fa-solid fa-microchip"></i>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <h3 style="font-size: 17px; font-weight: 800; color: #0F172A; margin: 0;">${dev.device_name}</h3>
                <span style="font-size: 11.5px; background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; padding: 3px 10px; border-radius: 9999px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                  <i class="fa-solid fa-lock" style="font-size: 10px;"></i> Locked to your account
                </span>
              </div>
              <p style="font-size: 13.5px; color: #64748B; margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span>Device ID: <strong style="color: #0F172A;">${dev.device_id}</strong></span>
                <span style="color: #CBD5E1;">&bull;</span>
                <span style="display: inline-flex; align-items: center; gap: 5px; color: ${dev.computed_status === 'online' ? '#16A34A' : '#F59E0B'}; font-weight: 700;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${dev.computed_status === 'online' ? '#16A34A' : '#F59E0B'};"></span>
                  ${dev.status_display}
                </span>
                <span style="color: #CBD5E1;">&bull;</span>
                <span>${dev.last_seen_relative || '5s sync'}</span>
              </p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <a href="/dashboard" style="background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; border-radius: 9999px; padding: 8px 18px; font-size: 13.5px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 7px; transition: all 0.2s;">
              <i class="fa-solid fa-chart-pie"></i> View Telemetry
            </a>
            <button onclick="removeDevice('${dev.device_id}')" style="background: #FFF1F2; border: 1px solid #FECDD3; color: #E11D48; border-radius: 9999px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;">
              <i class="fa-solid fa-trash-can"></i> Disconnect
            </button>
          </div>
        </div>
      `).join('');
    } else {
      if (widgetTitle) widgetTitle.textContent = 'ESP32 DevKit V1';
      if (widgetSub) widgetSub.textContent = 'No device connected';
      if (widgetBtn) {
        widgetBtn.className = 'widget-btn';
        widgetBtn.removeAttribute('title');
        widgetBtn.style.background = 'var(--primary)';
        widgetBtn.style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.3)';
        widgetBtn.innerHTML = `<i class="fa-solid fa-link" style="margin-right:6px;"></i> Connect Device`;
        widgetBtn.onclick = (e) => {
          e.preventDefault();
          const inp = document.getElementById('device_id');
          if (inp) inp.focus();
        };
      }

      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 48px 24px; border-radius: 20px;">
          <div style="font-size: 40px; margin-bottom: 16px; color: var(--primary);"><i class="fa-solid fa-plug-circle-exclamation"></i></div>
          <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">No devices connected</h3>
          <p style="color: #64748B; font-size: 14px; margin-bottom: 0;">Connect your ESP32 device above with device ID <strong>pnw101</strong> to lock it to your account and begin streaming live telemetry.</p>
        </div>
      `;
    }

  } catch (err) {
    console.error(err);
  }
}

async function removeDevice(deviceId) {
  if (!confirm(`Are you sure you want to disconnect device ${deviceId}?`)) return;

  try {
    await API.request('/devices/remove.php', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId })
    });
    API.showToast('Device removed', 'success');
    loadDevices();
  } catch (err) {
    API.showToast(err.message, 'error');
  }
}
