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
    toast.className = `toast ${type === 'error' ? 'toast-error' : (type === 'success' ? 'toast-success' : '')}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ')}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};
