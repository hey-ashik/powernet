/**
 * PowerNet Analytics & Time-Filter Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  loadUserProfile();

  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.dataset.range || '24h';
      loadAnalyticsData(range);
    });
  });

  loadAnalyticsData('24h');
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


async function loadAnalyticsData(range) {
  try {
    const res = await API.request(`/telemetry/history.php?range=${range}`);
    const summary = await API.request('/telemetry/summary.php');

    if (summary && summary.data) {
      document.getElementById('stat-peak-kw').textContent = `${summary.data.peak_power_kw || 1.28} kW`;
      document.getElementById('stat-avg-kw').textContent = `${summary.data.avg_power_kw || 0.94} kW`;
      document.getElementById('stat-day-kwh').textContent = `${summary.data.day_kwh || 12.45} kWh`;
      document.getElementById('stat-volt-range').textContent = `${summary.data.min_voltage_v || 228.4} - ${summary.data.max_voltage_v || 232.1} V`;
    }
  } catch (err) {
    console.warn(err);
  }
}
