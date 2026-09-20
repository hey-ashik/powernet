/**
 * PowerNet Devices Page Controller
 * Device ID: pnw101 (Direct pairing without tokens)
 */

function initDevicesPage() {
  loadUserProfile();

  // 1. Synchronous state hydration: NO FLICKER
  const cachedDev = API.getConnectedDevice();
  renderDevicesView(cachedDev);

  // 2. Fetch fresh server data in background
  loadDevices();

  // 3. Attach form handler
  const connectForm = document.getElementById('form-connect-device-page');
  if (connectForm && !connectForm.dataset.bound) {
    connectForm.dataset.bound = 'true';
    connectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const devId = document.getElementById('device_id').value.trim();
      const devName = document.getElementById('device_name').value.trim();

      try {
        const res = await API.request('/devices/connect.php', {
          method: 'POST',
          body: JSON.stringify({ device_id: devId, device_name: devName })
        });
        const newDev = {
          id: 1,
          device_id: devId,
          device_name: devName || 'Device',
          computed_status: 'online',
          status_display: 'Online',
          last_seen_relative: 'Just connected'
        };
        API.setConnectedDevice(newDev);
        renderDevicesView(newDev);
        API.showToast('Device connected successfully', 'success');
        connectForm.reset();
        const idField = document.getElementById('device_id');
        if (idField) idField.value = 'pnw101';
      } catch (err) {
        API.showToast(err.message, 'error');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.replace(/\.html$/, '');
  if (path === '/devices') {
    initDevicesPage();
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

function renderDevicesView(dev) {
  const container = document.getElementById('devices-list');
  const connectCard = document.getElementById('card-connect-device');

  if (dev) {
    if (connectCard) connectCard.style.display = 'none';
    if (container) {
        const cleanName = (dev.device_name && dev.device_name.trim() && !dev.device_name.startsWith('Main Panel') && dev.device_name !== 'Hardware Device') ? dev.device_name.trim() : 'Device';
        container.innerHTML = `
        <div class="card" style="margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; border-radius: 20px; padding: 22px 26px; background: #FFFFFF; border: 1px solid #E2E8F0; box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.05); flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 18px;">
            <div style="width: 52px; height: 52px; border-radius: 14px; background: #F8FAFC; border: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: center; color: #0F172A; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <h3 style="font-size: 17px; font-weight: 800; color: #0F172A; margin: 0;">${cleanName}</h3>
                <span style="font-size: 11.5px; background: #F1F5F9; color: #0F172A; border: 1px solid #E2E8F0; padding: 3px 10px; border-radius: 9999px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                  <i class="fa-solid fa-lock" style="font-size: 10px;"></i> Locked
                </span>
              </div>
              <p style="font-size: 13px; color: #64748B; margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 500;">
                <span>ID: <strong style="color: #0F172A; font-family: var(--font-mono, monospace); font-weight: 700;">${dev.device_id || 'pnw101'}</strong></span>
                <span style="color: #CBD5E1;">|</span>
                <span style="color: #0F172A; font-weight: 700;">${dev.status_display || (dev.computed_status === 'online' ? 'Online' : 'Offline')}</span>
                <span style="color: #CBD5E1;">|</span>
                <span>${dev.last_seen_relative || 'Just connected'}</span>
              </p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <a href="/dashboard" class="btn-device-analytics" style="background: #0F172A; color: #FFFFFF; border: 1px solid #0F172A; border-radius: 9999px; padding: 8px 22px; font-size: 13.5px; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 12px rgba(15, 23, 42, 0.16);">Analytics</a>
            <button onclick="removeDevice('${dev.device_id}')" class="btn-device-disconnect" style="background: #FFFFFF; border: 1px solid #E2E8F0; color: #0F172A; border-radius: 9999px; padding: 8px 20px; font-size: 13.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);">Disconnect</button>
          </div>
        </div>
      `;
    }
    API.renderWidgetDevice(dev);
  } else {
    if (connectCard) connectCard.style.display = 'block';
    if (container) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 48px 24px; border-radius: 20px;">
          <div style="font-size: 40px; margin-bottom: 16px; color: #0F172A;"><i class="fa-solid fa-plug-circle-exclamation"></i></div>
          <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">No devices connected</h3>
          <p style="color: #64748B; font-size: 14px; margin-bottom: 0;">Connect your device above with Device ID <strong>pnw101</strong> to lock it to your account and begin streaming telemetry.</p>
        </div>
      `;
    }
    API.renderWidgetDevice(null);
  }
}

async function loadDevices() {
  try {
    const res = await API.request('/devices/list.php');
    if (res && res.data && res.data.length > 0) {
      const dev = res.data[0];
      API.setConnectedDevice(dev);
      renderDevicesView(dev);
    } else {
      API.setConnectedDevice(null);
      renderDevicesView(null);
    }
  } catch (err) {
    console.error(err);
  }
}

function removeDevice(deviceId) {
  API.disconnectCurrentDevice(deviceId);
}
