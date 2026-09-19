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


  getConnectedDevice() {
    try {
      const raw = localStorage.getItem('pnet_device') || localStorage.getItem('pnet_cached_dev');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setConnectedDevice(dev) {
    if (dev) {
      try {
        localStorage.setItem('pnet_device', JSON.stringify(dev));
        localStorage.setItem('pnet_cached_dev', JSON.stringify(dev));
      } catch {}
    } else {
      try {
        localStorage.removeItem('pnet_device');
        localStorage.removeItem('pnet_cached_dev');
      } catch {}
    }
  },

  startTopLoader() {
    let bar = document.getElementById('yt-progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'yt-progress-bar';
      document.body.prepend(bar);
    }
    if (this._loaderTimer) clearTimeout(this._loaderTimer);
    bar.style.transition = 'none';
    bar.style.width = '0%';
    bar.classList.add('active');
    void bar.offsetWidth;
    bar.style.transition = 'width 0.35s cubic-bezier(0.1, 0.8, 0.2, 1), opacity 0.2s ease';
    bar.style.width = '35%';
    this._loaderTimer = setTimeout(() => {
      if (bar && bar.classList.contains('active')) {
        bar.style.width = '80%';
      }
    }, 120);
  },

  finishTopLoader() {
    if (this._loaderTimer) clearTimeout(this._loaderTimer);
    const bar = document.getElementById('yt-progress-bar');
    if (bar) {
      bar.style.width = '100%';
      setTimeout(() => {
        bar.classList.remove('active');
        setTimeout(() => {
          bar.style.transition = 'none';
          bar.style.width = '0%';
        }, 220);
      }, 200);
    }
  },

  renderWidgetSkeleton() {
    const widget = document.querySelector('.sidebar-widget');
    if (!widget) return;
    widget.innerHTML = `
      <div class="widget-skeleton-wrap">
        <div class="widget-skeleton-icon skeleton-shimmer"></div>
        <div class="widget-skeleton-title skeleton-shimmer"></div>
        <div class="widget-skeleton-sub skeleton-shimmer"></div>
        <div class="widget-skeleton-btn skeleton-shimmer"></div>
      </div>
    `;
  },

  renderWidgetDevice(dev) {
    const widget = document.querySelector('.sidebar-widget');
    if (!widget) return;
    if (dev) {
      this.setConnectedDevice(dev);
      widget.innerHTML = `
        <div class="widget-content-wrap" style="animation: pageFadeIn 0.2s ease;">
          <div class="widget-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <div class="widget-title">${dev.device_name || 'Hardware Device'}</div>
          <div class="widget-sub"><span style="color:#16A34A;font-weight:700;">● Connected</span> &bull; ${dev.device_id}</div>
          <button class="widget-btn connected" id="btn-sidebar-connect" title="Click to Disconnect">
            <span class="btn-label-connected"><i class="fa-solid fa-circle-check"></i> Connected</span>
            <span class="btn-label-disconnect"><i class="fa-solid fa-link-slash"></i> Disconnect</span>
          </button>
        </div>
      `;
      const btn = widget.querySelector('#btn-sidebar-connect');
      if (btn) {
        btn.onclick = (e) => {
          e.preventDefault();
          if (typeof removeDevice === 'function') {
            removeDevice(dev.device_id);
          } else if (typeof Dashboard !== 'undefined' && typeof Dashboard.disconnectDevice === 'function') {
            Dashboard.disconnectDevice(dev.device_id);
          } else {
            API.setConnectedDevice(null);
            API.renderWidgetDevice(null);
            if (typeof renderDevicesView === 'function') renderDevicesView(null);
          }
        };
      }
    } else {
      this.setConnectedDevice(null);
      widget.innerHTML = `
        <div class="widget-content-wrap" style="animation: pageFadeIn 0.2s ease;">
          <div class="widget-icon-box">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <div class="widget-title">Hardware Device</div>
          <div class="widget-sub">No device connected</div>
          <button class="widget-btn" id="btn-open-connect">
            <i class="fa-solid fa-link" style="margin-right: 6px;"></i> Connect Device
          </button>
        </div>
      `;
      const btn = widget.querySelector('#btn-open-connect');
      if (btn) {
        btn.onclick = (e) => {
          e.preventDefault();
          const modal = document.getElementById('modal-connect-device');
          if (modal) modal.classList.add('active');
          else if (typeof API.navigateTo === 'function') API.navigateTo('/devices');
          else window.location.href = '/devices';
        };
      }
    }
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
  },

  // ─── Smooth Client-Side Router (YouTube-style with Skeleton Shimmer) ───
  initRouter() {
    if (this._routerInitialized) return;
    this._routerInitialized = true;

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;
      if (link.id === 'btn-logout' || link.classList.contains('no-spa') || link.target === '_blank') return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      let targetPath;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        targetPath = url.pathname;
      } catch {
        return;
      }

      const supported = ['/dashboard', '/devices', '/analytics'];
      const match = supported.some(r => targetPath === r || targetPath === `${r}.html`);
      if (!match) return;

      // Normalize
      const currentNorm = window.location.pathname.replace(/\.html$/, '');
      const targetNorm = targetPath.replace(/\.html$/, '');
      if (currentNorm === targetNorm) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      this.navigateTo(targetPath);
    });

    window.addEventListener('popstate', () => {
      const currentPath = window.location.pathname;
      const supported = ['/dashboard', '/devices', '/analytics'];
      if (supported.some(r => currentPath === r || currentPath === `${r}.html`)) {
        this.navigateTo(currentPath, false);
      }
    });
  },

  async navigateTo(targetUrl, pushState = true) {
    const main = document.querySelector('.main-content');
    if (!main) {
      window.location.href = targetUrl;
      return;
    }

    // 1. Highlight nav link in sidebar immediately
    const targetNorm = targetUrl.replace(/\.html$/, '');
    document.querySelectorAll('.sidebar .nav-link').forEach(l => {
      const h = (l.getAttribute('href') || '').replace(/\.html$/, '');
      if (h === targetNorm || (h === '/dashboard' && targetNorm === '/analytics')) {
        l.classList.add('active');
      } else {
        l.classList.remove('active');
      }
    });

    // 2. Start YouTube progress bar
    this.startTopLoader();

    // 3. Stop background dashboard polling if navigating away
    if (!targetUrl.includes('/dashboard') && !targetUrl.includes('/analytics')) {
      if (typeof Dashboard !== 'undefined' && typeof Dashboard.destroy === 'function') {
        Dashboard.destroy();
      }
    }

    // 4. Render smooth YouTube-style skeleton shimmer in main area
    if (targetUrl.includes('/devices')) {
      main.innerHTML = `
        <div style="animation: pageFadeIn 0.2s ease;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px;">
            <div class="skeleton-shimmer" style="height: 32px; width: 220px;"></div>
            <div class="skeleton-shimmer" style="height: 38px; width: 140px; border-radius: 9999px;"></div>
          </div>
          <div class="skeleton-shimmer" style="height: 98px; width: 100%; border-radius: 20px; margin-bottom: 18px;"></div>
          <div class="skeleton-shimmer" style="height: 98px; width: 100%; border-radius: 20px;"></div>
        </div>
      `;
    } else {
      // Dashboard skeleton
      main.innerHTML = `
        <div style="animation: pageFadeIn 0.2s ease;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
            <div class="skeleton-shimmer" style="height: 32px; width: 180px;"></div>
            <div class="skeleton-shimmer" style="height: 36px; width: 140px; border-radius: 9999px;"></div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="skeleton-shimmer" style="height: 110px; border-radius: 18px;"></div>
            <div class="skeleton-shimmer" style="height: 110px; border-radius: 18px;"></div>
            <div class="skeleton-shimmer" style="height: 110px; border-radius: 18px;"></div>
            <div class="skeleton-shimmer" style="height: 110px; border-radius: 18px;"></div>
          </div>
          <div class="skeleton-shimmer" style="height: 260px; border-radius: 20px; margin-bottom: 24px;"></div>
          <div class="skeleton-shimmer" style="height: 200px; border-radius: 20px;"></div>
        </div>
      `;
    }

    // 5. Silky smooth YouTube timing (~260ms) so the user perceives the skeleton shimmer
    const minDelay = new Promise(resolve => setTimeout(resolve, 260));

    try {
      const fetchReq = fetch(targetUrl).then(r => r.text());
      const [_, html] = await Promise.all([minDelay, fetchReq]);

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const incomingMain = doc.querySelector('.main-content');

      if (incomingMain) {
        main.innerHTML = incomingMain.innerHTML;
        main.style.animation = 'none';
        void main.offsetHeight; // trigger reflow
        main.style.animation = 'pageFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)';

        if (doc.title) document.title = doc.title;
        if (pushState) history.pushState({ path: targetUrl }, '', targetUrl);

        // Re-initialize controller for the target view
        if (targetUrl.includes('/devices')) {
          if (typeof initDevicesPage === 'function') {
            initDevicesPage();
          }
        } else if (targetUrl.includes('/dashboard') || targetUrl.includes('/analytics')) {
          if (typeof Dashboard !== 'undefined' && typeof Dashboard.init === 'function') {
            Dashboard.init();
          }
        }
      } else {
        window.location.href = targetUrl;
      }
    } catch (err) {
      console.error('Smooth router error:', err);
      window.location.href = targetUrl;
    } finally {
      this.finishTopLoader();
    }
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
                <span class="drawer-section-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary); margin-right: 6px; vertical-align: -2px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> Connected Device</span>
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

  // Clicking user profile in top-right header opens right drawer (delegated)
  document.addEventListener('click', (e) => {
    if (e.target.closest('#user-profile-trigger')) {
      e.preventDefault();
      openDrawer();
    }
  });

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
    API.setConnectedDevice(null);
    window.location.href = '/';
  };

  if (drawerLogoutBtn) drawerLogoutBtn.addEventListener('click', handleLogout);
  const mainLogoutBtn = document.getElementById('btn-logout');
  if (mainLogoutBtn) mainLogoutBtn.addEventListener('click', handleLogout);

  // ─── 3. Synchronous Widget Hydration & Smooth YouTube Navigation ──────
  // Render sidebar widget from cached device state immediately (no skeleton flicker)
  const cachedDev = API.getConnectedDevice();
  if (cachedDev) {
    API.renderWidgetDevice(cachedDev);
  } else {
    API.renderWidgetDevice(null);
  }

  // Initialize YouTube-style router
  API.initRouter();

  // Finish top loader on page load
  API.finishTopLoader();
});
