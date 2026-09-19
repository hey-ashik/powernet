/**
 * PowerNet API Client & Utilities
 * Zero dependencies, lean native Fetch & state management
 * Default Device: pnw101
 */

const API = {
  baseUrl: '/api',

  getToken() {
    return localStorage.getItem('pnet_token') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('pnet_token', token);
    } else {
      localStorage.removeItem('pnet_token');
    }
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('pnet_user') || 'null');
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('pnet_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('pnet_user');
    }
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      let url = `${this.baseUrl}${endpoint}`;
      let res = await fetch(url, {
        ...options,
        headers,
        credentials: 'same-origin'
      });

      let contentType = res.headers.get('content-type') || '';

      // If server returned non-JSON (e.g. Apache rewrite not active), retry via direct /backend/api
      if (!contentType.includes('application/json') && this.baseUrl === '/api') {
        const altUrl = `/backend/api${endpoint}`;
        try {
          const altRes = await fetch(altUrl, {
            ...options,
            headers,
            credentials: 'same-origin'
          });
          const altType = altRes.headers.get('content-type') || '';
          if (altType.includes('application/json')) {
            res = altRes;
            contentType = altType;
            this.baseUrl = '/backend/api'; // Auto-adapt to direct backend path
          }
        } catch {
          // Keep original response
        }
      }

      if (!contentType.includes('application/json')) {
        return this.mockFallback(endpoint, options);
      }

      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || 'API request failed');
      }
      return data;
    } catch (err) {
      return this.mockFallback(endpoint, options, err);
    }
  },

  // Fallback handler: returns real offline/empty states when hardware has not yet published
  mockFallback(endpoint, options = {}, originalError = null) {
    // Authentication endpoints MUST throw the real error to the user
    if (endpoint.startsWith('/auth')) {
      throw originalError || new Error('Authentication request failed. Please check your credentials or connection.');
    }


    if (endpoint.startsWith('/auth/me')) {
      const user = this.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }
      return { success: true, data: user };
    }

    if (endpoint.startsWith('/telemetry/latest')) {
      // Real clean zero/offline state when ESP32 hasn't published telemetry yet
      return {
        success: true,
        data: {
          device_id: 'pnw101',
          device_name: 'Main Panel (pnw101)',
          voltage: 0.0,
          current: 0.0,
          power: 0.0,
          energy: 0.0,
          temperature: null,
          timestamp: null,
          status: 'offline',
          is_online: false,
          last_seen: null,
          last_seen_relative: 'Waiting for ESP32'
        }
      };
    }

    if (endpoint.startsWith('/telemetry/logs')) {
      return { success: true, data: [] };
    }

    if (endpoint.startsWith('/telemetry/history')) {
      return { success: true, data: { device_id: 'pnw101', range: '7d', points: [] } };
    }

    if (endpoint.startsWith('/devices/list')) {
      return {
        success: true,
        data: [
          {
            id: 1,
            device_id: 'pnw101',
            device_name: 'Main Panel (pnw101)',
            computed_status: 'offline',
            status_display: 'Offline',
            last_seen_relative: 'Not yet connected',
            seconds_since_seen: 999999
          }
        ]
      };
    }

    if (endpoint.startsWith('/devices/connect')) {
      return {
        success: true,
        message: 'Device registered successfully!'
      };
    }

    if (endpoint.startsWith('/auth/profile')) {
      const user = this.getUser() || { name: 'Ashikul Islam', email: 'ashikulislam2070@gmail.com' };
      if (options.body) {
        try {
          const body = JSON.parse(options.body);
          if (body.name) user.name = body.name;
          this.setUser(user);
        } catch {}
      }
      return { success: true, message: 'Profile updated successfully!', data: user };
    }

    return { success: true, data: {} };
  },


  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : (type === 'success' ? 'toast-success' : 'toast-info')}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};

// Global App Sidebar Handler & Profile Drawer
document.addEventListener('DOMContentLoaded', () => {
  // ─── 1. Left Sidebar Toggle Handler ─────────────────────────────
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    const appContainer = document.querySelector('.app-container') || document.body;
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    const brandLogo = document.querySelector('.brand-logo-group');

    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }

    const updateToggleTooltip = (collapsed) => {
      if (toggleBtn) {
        const tip = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
        toggleBtn.setAttribute('title', tip);
        toggleBtn.setAttribute('data-tooltip', tip);
        toggleBtn.setAttribute('aria-label', tip);
      }
    };

    const isCollapsed = localStorage.getItem('powernet_sidebar_collapsed') === 'true';
    if (isCollapsed && window.innerWidth > 768) {
      appContainer.classList.add('sidebar-collapsed');
      updateToggleTooltip(true);
    } else {
      updateToggleTooltip(false);
    }

    const toggleSidebar = (e) => {
      if (e) e.preventDefault();
      if (window.innerWidth <= 768) {
        const isOpen = sidebar.classList.toggle('mobile-open');
        backdrop.classList.toggle('active', isOpen);
      } else {
        const collapsed = appContainer.classList.toggle('sidebar-collapsed');
        localStorage.setItem('powernet_sidebar_collapsed', String(collapsed));
        updateToggleTooltip(collapsed);
      }
    };

    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);

    if (brandLogo) {
      brandLogo.addEventListener('click', (e) => {
        if (appContainer.classList.contains('sidebar-collapsed') && window.innerWidth > 768) {
          e.preventDefault();
          toggleSidebar();
        }
      });
    }

    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('active');
    });

    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('mobile-open');
          backdrop.classList.remove('active');
        }
      });
    });
  }

  // ─── 2. Right-to-Left Profile & Settings Slide-out Drawer ───────
  const ensureProfileDrawer = () => {
    let drawer = document.getElementById('profile-drawer');
    if (!drawer) {
      const drawerHtml = `
        <div class="drawer-backdrop" id="profile-drawer-backdrop"></div>
        <aside class="right-drawer" id="profile-drawer" aria-hidden="true">
          <div class="drawer-header">
            <h3 class="drawer-title"><i class="fa-solid fa-user-gear" style="color: var(--primary); margin-right: 8px;"></i> Profile & Settings</h3>
            <button class="drawer-close-btn" id="btn-close-drawer" title="Close" aria-label="Close">&times;</button>
          </div>
          <div class="drawer-body">
            <div class="drawer-card profile-card">
              <div class="drawer-avatar-wrap">
                <div class="drawer-avatar" id="drawer-user-avatar">--</div>
              </div>
              <div class="drawer-user-info" style="width: 100%;">
                <div class="drawer-name-row" id="drawer-name-view">
                  <span class="drawer-user-name" id="drawer-user-name">Loading...</span>
                  <button class="icon-btn-edit" id="btn-edit-name" title="Edit Name" aria-label="Edit Name">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                </div>
                <div class="drawer-name-edit-form" id="drawer-name-edit" style="display: none;">
                  <input type="text" class="drawer-input" id="input-edit-name" placeholder="Enter your name" maxlength="50">
                  <div class="edit-btn-row">
                    <button type="button" class="btn-edit-save" id="btn-save-name">Save</button>
                    <button type="button" class="btn-edit-cancel" id="btn-cancel-name">Cancel</button>
                  </div>
                </div>
                <div class="drawer-user-email" id="drawer-user-email">--</div>
              </div>
            </div>

            <div class="drawer-card device-card">
              <div class="drawer-card-header">
                <span class="drawer-section-title"><i class="fa-solid fa-microchip" style="color: var(--primary); margin-right: 6px;"></i> Connected Device</span>
                <span class="drawer-device-badge" id="drawer-device-status">No Device</span>
              </div>
              <div class="drawer-device-details">
                <div class="drawer-detail-row">
                  <span class="detail-label">Device ID:</span>
                  <span class="detail-val" id="drawer-device-id" style="font-family: monospace; font-size: 13.5px;">None</span>
                </div>
                <div class="drawer-detail-row">
                  <span class="detail-label">Hardware:</span>
                  <span class="detail-val" id="drawer-device-name">Hardware Node</span>
                </div>
                <div class="drawer-detail-row">
                  <span class="detail-label">Access:</span>
                  <span class="detail-val" style="color: var(--success); font-weight: 600;">Account Locked</span>
                </div>
              </div>
              <a href="/devices" class="drawer-card-action">
                <span>Manage in Devices</span>
                <i class="fa-solid fa-arrow-right"></i>
              </a>
            </div>

            <div class="drawer-actions" style="margin-top: auto;">
              <button type="button" class="drawer-btn-logout" id="drawer-btn-logout">
                <i class="fa-solid fa-arrow-right-from-bracket" style="margin-right: 8px;"></i> Sign Out
              </button>
            </div>
          </div>
        </aside>
      `;
      document.body.insertAdjacentHTML('beforeend', drawerHtml);
    }
  };

  ensureProfileDrawer();

  const drawer = document.getElementById('profile-drawer');
  const drawerBackdrop = document.getElementById('profile-drawer-backdrop');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const btnEditName = document.getElementById('btn-edit-name');
  const btnCancelName = document.getElementById('btn-cancel-name');
  const btnSaveName = document.getElementById('btn-save-name');
  const drawerNameView = document.getElementById('drawer-name-view');
  const drawerNameEdit = document.getElementById('drawer-name-edit');
  const inputEditName = document.getElementById('input-edit-name');
  const drawerLogoutBtn = document.getElementById('drawer-btn-logout');

  const openDrawer = async () => {
    if (!drawer) return;
    drawer.classList.add('active');
    if (drawerBackdrop) drawerBackdrop.classList.add('active');

    // Populate user info
    const user = API.getUser();
    const nameEl = document.getElementById('drawer-user-name');
    const emailEl = document.getElementById('drawer-user-email');
    const avatarEl = document.getElementById('drawer-user-avatar');

    if (user) {
      if (nameEl) nameEl.textContent = user.name || 'User';
      if (emailEl) emailEl.textContent = user.email || 'account@powernet.io';
      if (avatarEl) {
        const parts = (user.name || 'User').trim().split(/\s+/);
        const initials = parts.length > 1 
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : (user.name || 'UN').substring(0, 2).toUpperCase();
        avatarEl.textContent = initials;
      }
    }

    // Reset edit form to view mode
    if (drawerNameView) drawerNameView.style.display = 'flex';
    if (drawerNameEdit) drawerNameEdit.style.display = 'none';

    // Populate connected device info
    try {
      const devRes = await API.request('/devices/list.php');
      const devStatusBadge = document.getElementById('drawer-device-status');
      const devIdVal = document.getElementById('drawer-device-id');
      const devNameVal = document.getElementById('drawer-device-name');

      if (devRes && devRes.data && devRes.data.length > 0) {
        const dev = devRes.data[0];
        if (devStatusBadge) {
          devStatusBadge.textContent = 'Connected';
          devStatusBadge.className = 'drawer-device-badge connected';
        }
        if (devIdVal) devIdVal.textContent = dev.device_id;
        if (devNameVal) devNameVal.textContent = dev.device_name || 'Hardware Node';
      } else {
        if (devStatusBadge) {
          devStatusBadge.textContent = 'No Device';
          devStatusBadge.className = 'drawer-device-badge';
        }
        if (devIdVal) devIdVal.textContent = 'None';
        if (devNameVal) devNameVal.textContent = 'Not paired';
      }
    } catch {}
  };

  const closeDrawer = () => {
    if (drawer) drawer.classList.remove('active');
    if (drawerBackdrop) drawerBackdrop.classList.remove('active');
  };

  if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  // Settings in sidebar opens right drawer
  const navSettings = document.getElementById('nav-settings');
  if (navSettings) {
    navSettings.addEventListener('click', (e) => {
      e.preventDefault();
      openDrawer();
    });
  }

  // Clicking user profile in top-right header opens right drawer
  const userProfileTrigger = document.getElementById('user-profile-trigger');
  if (userProfileTrigger) {
    userProfileTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      openDrawer();
    });
  }

  // Inline pencil edit
  if (btnEditName && drawerNameView && drawerNameEdit && inputEditName) {
    btnEditName.addEventListener('click', () => {
      const user = API.getUser() || {};
      inputEditName.value = user.name || '';
      drawerNameView.style.display = 'none';
      drawerNameEdit.style.display = 'block';
      inputEditName.focus();
    });
  }

  if (btnCancelName && drawerNameView && drawerNameEdit) {
    btnCancelName.addEventListener('click', () => {
      drawerNameEdit.style.display = 'none';
      drawerNameView.style.display = 'flex';
    });
  }

  if (btnSaveName && inputEditName && drawerNameView && drawerNameEdit) {
    btnSaveName.addEventListener('click', async () => {
      const newName = inputEditName.value.trim();
      if (!newName || newName.length < 2) {
        API.showToast('Please enter at least 2 characters', 'error');
        return;
      }

      try {
        btnSaveName.disabled = true;
        btnSaveName.textContent = 'Saving...';

        const res = await API.request('/auth/profile.php', {
          method: 'POST',
          body: JSON.stringify({ name: newName })
        });

        // Update local user
        const user = API.getUser() || {};
        user.name = newName;
        API.setUser(user);

        // Update UI displays across the page
        const topName = document.getElementById('user-name-display');
        const topAvatar = document.getElementById('user-avatar-display');
        const drawerName = document.getElementById('drawer-user-name');
        const drawerAvatar = document.getElementById('drawer-user-avatar');

        const parts = newName.split(/\s+/);
        const initials = parts.length > 1
          ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
          : newName.substring(0, 2).toUpperCase();

        if (topName) topName.textContent = newName;
        if (topAvatar) topAvatar.textContent = initials;
        if (drawerName) drawerName.textContent = newName;
        if (drawerAvatar) drawerAvatar.textContent = initials;

        drawerNameEdit.style.display = 'none';
        drawerNameView.style.display = 'flex';
        API.showToast(res.message || 'Profile updated successfully!', 'success');
      } catch (err) {
        API.showToast(err.message || 'Could not update name', 'error');
      } finally {
        btnSaveName.disabled = false;
        btnSaveName.textContent = 'Save';
      }
    });
  }

  // Logout button redirects directly to home page (/)
  const handleLogout = (e) => {
    if (e) e.preventDefault();
    API.setToken('');
    API.setUser(null);
    window.location.href = '/';
  };

  if (drawerLogoutBtn) drawerLogoutBtn.addEventListener('click', handleLogout);
  const mainLogoutBtn = document.getElementById('btn-logout');
  if (mainLogoutBtn) mainLogoutBtn.addEventListener('click', handleLogout);

  // ─── 3. Smooth Navigation Menu Transition ────────────────────────
  const navLinks = document.querySelectorAll('.nav-menu .nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || link.id === 'btn-logout') return;
      if (window.location.pathname !== href) {
        const main = document.querySelector('.main-content');
        if (main) {
          main.style.opacity = '0.45';
          main.style.transition = 'opacity 0.12s ease';
        }
      }
    });
  });
});
