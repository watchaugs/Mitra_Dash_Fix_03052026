/**
 * MITRA Dashboard — Frontend API Client
 * Drop this file alongside the dashboard HTML (or include via <script>).
 * It replaces all hard-coded dummy data with live API calls.
 *
 * Usage: Include BEFORE the closing </body> tag in index.html
 *   <script src="api-client.js"></script>
 */

// ── Configuration ─────────────────────────────────────────────────────────────
const API_BASE = window.location.origin + '/api';

// ── Auth State ────────────────────────────────────────────────────────────────
const Auth = (() => {
  let _token   = localStorage.getItem('mitra_access_token');
  let _refresh = localStorage.getItem('mitra_refresh_token');
  let _user    = JSON.parse(localStorage.getItem('mitra_user') || 'null');

  function set(data) {
    _token   = data.access_token;
    _refresh = data.refresh_token;
    _user    = data.user;
    localStorage.setItem('mitra_access_token',  _token);
    localStorage.setItem('mitra_refresh_token', _refresh);
    localStorage.setItem('mitra_user', JSON.stringify(_user));
  }

  function clear() {
    _token = _refresh = _user = null;
    localStorage.removeItem('mitra_access_token');
    localStorage.removeItem('mitra_refresh_token');
    localStorage.removeItem('mitra_user');
  }

  function token()   { return _token; }
  function user()    { return _user; }
  function isAdmin() { return _user?.role === 'master_admin'; }
  function hasPerm(p){ return _user?.permissions?.[p] || isAdmin(); }
  function loggedIn(){ return !!_token; }

  return { set, clear, token, user, isAdmin, hasPerm, loggedIn };
})();

// ── Core HTTP Client ──────────────────────────────────────────────────────────
async function apiRequest(method, path, body = null, isFormData = false) {
  const headers = { Authorization: `Bearer ${Auth.token()}` };
  if (!isFormData && body) headers['Content-Type'] = 'application/json';

  const opts = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);

  let res = await fetch(API_BASE + path, opts);

  // Auto-refresh token on 401
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers.Authorization = `Bearer ${Auth.token()}`;
      res = await fetch(API_BASE + path, { ...opts, headers });
    } else {
      showLoginModal();
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API request failed');
  }

  // Handle file downloads
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('spreadsheetml') || ct.includes('text/csv') || ct.includes('octet-stream')) {
    return res.blob();
  }
  return res.json();
}

async function tryRefreshToken() {
  const refresh = localStorage.getItem('mitra_refresh_token');
  if (!refresh) return false;
  try {
    const res  = await fetch(`${API_BASE}/auth/refresh`, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ refresh_token: refresh })
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('mitra_access_token', data.access_token);
    return true;
  } catch { return false; }
}

const api = {
  get   : (path)         => apiRequest('GET',    path),
  post  : (path, body)   => apiRequest('POST',   path, body),
  put   : (path, body)   => apiRequest('PUT',    path, body),
  del   : (path)         => apiRequest('DELETE', path),
  upload: (path, formData) => apiRequest('POST', path, formData, true)
};

// ── Download Helper ────────────────────────────────────────────────────────────
async function downloadFile(path, filename) {
  showToast('Preparing download…');
  try {
    const blob = await apiRequest('GET', path);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Download failed: ' + err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LOGIN MODAL
// ════════════════════════════════════════════════════════════════════════════
function injectLoginModal() {
  if (document.getElementById('login-modal-bg')) return;
  const html = `
  <div id="login-modal-bg" style="
    position:fixed;inset:0;background:rgba(7,9,15,.95);z-index:9999;
    display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)">
    <div style="background:#0f172a;border:1px solid #1e2d4a;border-radius:16px;
      padding:36px;width:90%;max-width:400px;box-shadow:0 24px 60px rgba(0,0,0,.6)">
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:48px;height:48px;border-radius:12px;
          background:linear-gradient(135deg,#10b981,#06b6d4);
          display:flex;align-items:center;justify-content:center;
          font-family:'Syne',sans-serif;font-weight:800;color:#fff;
          font-size:20px;margin:0 auto 12px">M</div>
        <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:#f1f5f9">
          MITRA Dashboard</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px">
          Government School AR Platform · Sign In</div>
      </div>
      <div id="login-error" style="display:none;margin-bottom:14px;padding:10px 14px;
        background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);
        border-radius:8px;color:#fca5a5;font-size:13px"></div>
      <div style="margin-bottom:14px">
        <label style="font-size:12px;color:#94a3b8;font-weight:500;display:block;margin-bottom:5px">
          Email / Username</label>
        <input id="li-email" type="email" placeholder="admin@mitra.gov.in"
          style="width:100%;padding:10px 12px;background:#111827;border:1px solid #1e2d4a;
          border-radius:9px;color:#f1f5f9;font-size:13px;outline:none;
          font-family:'DM Sans',sans-serif"
          onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <div style="margin-bottom:20px">
        <label style="font-size:12px;color:#94a3b8;font-weight:500;display:block;margin-bottom:5px">
          Password</label>
        <input id="li-pass" type="password" placeholder="••••••••"
          style="width:100%;padding:10px 12px;background:#111827;border:1px solid #1e2d4a;
          border-radius:9px;color:#f1f5f9;font-size:13px;outline:none;
          font-family:'DM Sans',sans-serif"
          onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <button id="li-btn" onclick="doLogin()" style="width:100%;padding:11px;
        background:#6366f1;color:#fff;border:none;border-radius:9px;
        font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;cursor:pointer">
        Sign In
      </button>
      <div style="text-align:center;margin-top:14px;font-size:11px;color:#475569">
        Access restricted to authorised MITRA personnel only
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function showLoginModal() {
  injectLoginModal();
  document.getElementById('login-modal-bg').style.display = 'flex';
}

function hideLoginModal() {
  const el = document.getElementById('login-modal-bg');
  if (el) el.style.display = 'none';
}

async function doLogin() {
  const email = document.getElementById('li-email').value.trim();
  const pass  = document.getElementById('li-pass').value;
  const btn   = document.getElementById('li-btn');
  const errEl = document.getElementById('login-error');
  if (!email || !pass) { showLoginError('Please enter email and password'); return; }

  btn.disabled    = true;
  btn.textContent = 'Signing in…';

  try {
    const data = await fetch(`${API_BASE}/auth/login`, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ email, password: pass })
    }).then(r => r.json());

    if (data.error) { showLoginError(data.error); return; }

    Auth.set(data);
    hideLoginModal();
    applyPermissions();
    loadDashboardData();
    showToast(`Welcome back, ${data.user.name}!`);
  } catch (err) {
    showLoginError('Connection failed. Check server.');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Sign In';
  }
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

async function doLogout() {
  try { await api.post('/auth/logout', {}); } catch {}
  Auth.clear();
  showLoginModal();
  showToast('Signed out');
}

// ════════════════════════════════════════════════════════════════════════════
// PERMISSION-BASED UI CONTROL
// ════════════════════════════════════════════════════════════════════════════
function applyPermissions() {
  const u = Auth.user();
  if (!u) return;

  // Update topbar display
  const pill   = document.querySelector('.pill.admin');
  const avatar = document.querySelector('.avatar-btn');
  if (pill)   pill.textContent = u.role.replace(/_/g, ' ').toUpperCase();
  if (avatar) { avatar.textContent = u.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase(); }

  // Hide Advertisement tab for non-admins without perm
  const adNavBtn = document.getElementById('ad-nav-btn');
  const adSbBtn  = document.getElementById('ad-sb-btn');
  if (adNavBtn && !Auth.hasPerm('manage_ads') && !Auth.isAdmin()) {
    adNavBtn.style.display = 'none';
    if (adSbBtn) adSbBtn.style.display = 'none';
  }

  // Add logout to avatar
  const avatarBtn = document.querySelector('.avatar-btn');
  if (avatarBtn && !avatarBtn._logoutBound) {
    avatarBtn._logoutBound = true;
    avatarBtn.title = `${u.name} — Click to sign out`;
    avatarBtn.style.cursor = 'pointer';
    avatarBtn.addEventListener('click', () => {
      if (confirm(`Sign out as ${u.name}?`)) doLogout();
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LIVE DATA LOADERS
// ════════════════════════════════════════════════════════════════════════════

// ── Dashboard KPIs ────────────────────────────────────────────────────────────
async function loadDashboardData() {
  try {
    const data = await api.get('/dashboard/summary');
    const set  = (id, val) => { const el = document.querySelector(id); if (el) el.textContent = val; };
    // Map to existing stat cards (update inner sc-val elements)
    const cards = document.querySelectorAll('.sc .sc-val');
    if (cards[0]) cards[0].textContent = data.active_students?.toLocaleString('en-IN') || '—';
    if (cards[1]) cards[1].textContent = data.live_apps || '—';
    if (cards[2]) cards[2].textContent = data.active_geofences || '—';
    if (cards[3]) cards[3].textContent = data.user_accounts?.toLocaleString('en-IN') || '—';
  } catch (err) {
    console.warn('Dashboard summary:', err.message);
  }
}

// ── Ad Analytics — load live data into dashboard charts ──────────────────────
async function loadAdAnalytics(filters = {}) {
  if (!Auth.hasPerm('manage_ads') && !Auth.hasPerm('view_analytics')) return;
  try {
    const qs   = new URLSearchParams({ days: 30, ...filters }).toString();
    const data = await api.get(`/ads/analytics/overview?${qs}`);

    // KPI cards (ad section)
    const scVals = document.querySelectorAll('#ad-dashboard .sc .sc-val');
    if (scVals[0]) scVals[0].textContent = parseInt(data.kpi.total_impressions).toLocaleString('en-IN');
    if (scVals[1]) scVals[1].textContent = parseInt(data.kpi.unique_viewers).toLocaleString('en-IN');
    if (scVals[2]) scVals[2].textContent = (data.kpi.avg_view_seconds || 0) + 's';
    if (scVals[3]) scVals[3].textContent = (data.kpi.completion_rate || 0) + '%';
    if (scVals[4]) scVals[4].textContent = (data.kpi.repeat_views || 0) + 'x';
    if (scVals[5]) scVals[5].textContent = (data.kpi.ctr || 0) + '%';

    // Update live charts if Chart.js instances exist
    updateChartData('chart-ad-hourly',
      data.hourly.map(r => r.hour_of_day + ':00'),
      [data.hourly.map(r => parseInt(r.impressions))]);

    updateChartData('chart-ad-state',
      data.by_state.map(r => r.state),
      [data.by_state.map(r => parseInt(r.impressions)),
       data.by_state.map(r => parseFloat(r.completion_rate))]);

    updateChartData('chart-ad-classroom',
      data.by_class.map(r => r.class_grade),
      [data.by_class.map(r => parseInt(r.impressions))]);

    updateChartData('chart-ad-age',
      data.by_age.map(r => r.age_group),
      [data.by_age.map(r => parseInt(r.impressions))]);

    updateChartData('chart-ad-subject',
      data.by_subject.map(r => r.subject),
      [data.by_subject.map(r => parseInt(r.impressions))]);

    updateChartData('chart-ad-language',
      data.by_language.map(r => r.language),
      [data.by_language.map(r => parseInt(r.impressions))]);

    updateChartData('chart-ad-dayofweek',
      ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
      [data.by_dow.map(r => parseInt(r.impressions)),
       data.by_dow.map(r => parseFloat(r.completion_rate))]);

    updateChartData('chart-ad-mediatype',
      data.by_media.map(r => r.media_type),
      [data.by_media.map(r => parseFloat(r.completion_rate)),
       data.by_media.map(r => parseFloat(r.ctr))]);

    if (data.funnel) {
      const f = data.funnel;
      updateChartData('chart-ad-funnel',
        ['Delivered','Started','Halfway','¾ Done','Completed'],
        [[f.delivered, f.started, f.halfway, f.three_quarters, f.completed].map(v => parseInt(v||0))]);
    }

    updateChartData('chart-ad-repeat',
      data.repeat_dist.map(r => `Viewed ${r.repeat_count}x`),
      [data.repeat_dist.map(r => parseInt(r.viewers))]);

    // Granular table
    if (data.granular) renderGranularTable(data.granular);

  } catch (err) {
    console.warn('Ad analytics load error:', err.message);
  }
}

// ── Replay Analytics ──────────────────────────────────────────────────────────
async function loadReplayAnalytics(filters = {}) {
  if (!Auth.hasPerm('replay_analytics') && !Auth.isAdmin()) return;
  try {
    const qs   = new URLSearchParams({ days: 30, ...filters }).toString();
    const data = await api.get(`/analytics/replay?${qs}`);

    const sc = document.querySelectorAll('#an-replay .sc .sc-val');
    if (sc[0]) sc[0].textContent = parseInt(data.kpi.total_replays||0).toLocaleString('en-IN');
    if (sc[1]) sc[1].textContent = data.kpi.avg_replays_per_student || '—';
    if (sc[3]) sc[3].textContent = parseInt(data.kpi.repeat_sessions||0).toLocaleString('en-IN');

    if (data.by_module?.length) {
      updateChartData('chart-replay-detail',
        data.by_module.slice(0,8).map(r => r.topic || 'Unknown'),
        [data.by_module.slice(0,8).map(r => parseFloat(r.avg_replays))]);
    }
    if (data.by_state?.length) {
      updateChartData('chart-replay-state',
        data.by_state.map(r => r.state),
        [data.by_state.map(r => parseFloat(r.avg_replays)),
         data.by_state.map(r => parseFloat(r.repeat_pct))]);
    }
  } catch (err) {
    console.warn('Replay analytics:', err.message);
  }
}

// ── Render granular table ──────────────────────────────────────────────────────
function renderGranularTable(rows) {
  const tbody = document.querySelector('#ad-granular-table tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.slice(0, 20).map(r => `
    <tr>
      <td>${r.state||'—'}</td><td>${r.district||'—'}</td>
      <td>${r.class_grade||'—'}</td><td>${r.age_group||'—'}</td>
      <td>${r.subject_context||'—'}</td><td>${r.app_language||'—'}</td>
      <td>${parseInt(r.impressions).toLocaleString('en-IN')}</td>
      <td>${parseInt(r.unique_viewers).toLocaleString('en-IN')}</td>
      <td>${r.avg_view_sec||'—'}s</td>
      <td>${r.completion_pct||'—'}%</td>
      <td>${r.repeat_views||'—'}x</td>
      <td>${r.skip_rate||'—'}%</td>
      <td>${r.ctr||'—'}%</td>
    </tr>
  `).join('');
}

// ── Chart.js live update helper ────────────────────────────────────────────────
function updateChartData(canvasId, labels, datasetsData) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  // Find the Chart.js instance attached to this canvas
  const chartInst = Chart.getChart(canvas);
  if (!chartInst) return;
  if (labels) chartInst.data.labels = labels;
  datasetsData.forEach((d, i) => {
    if (chartInst.data.datasets[i]) chartInst.data.datasets[i].data = d;
  });
  chartInst.update('none');   // 'none' = no animation on data update
}

// ════════════════════════════════════════════════════════════════════════════
// WIRE UP EXPORT BUTTONS TO REAL API
// ════════════════════════════════════════════════════════════════════════════
function exportAdData(fmt) {
  const m = document.getElementById('ad-export-menu');
  if (m) m.style.display = 'none';
  const camp = document.getElementById('adb-campaign')?.value || '';
  const qs   = new URLSearchParams({ format: fmt, days: 30, ...(camp ? { campaign_id: camp } : {}) });
  downloadFile(`/ads/analytics/export?${qs}`, `MITRA_Ad_Analytics_${todayStr()}.${fmt}`);
}

function exportAdGranular(fmt) {
  const camp = document.getElementById('adb-campaign')?.value || '';
  const qs   = new URLSearchParams({ format: fmt, days: 30, ...(camp ? { campaign_id: camp } : {}) });
  downloadFile(`/ads/analytics/granular/export?${qs}`, `MITRA_Ad_Granular_${todayStr()}.${fmt}`);
}

function filterAdDashboard() {
  const filters = {};
  const camp = document.getElementById('adb-campaign')?.value;
  const state = document.getElementById('adb-state')?.value;
  const cls   = document.getElementById('adb-class')?.value;
  const subj  = document.getElementById('adb-subject')?.value;
  const lang  = document.getElementById('adb-lang')?.value;
  if (camp)  filters.campaign_id = camp;
  if (state) filters.state = state;
  if (cls)   filters.class_grade = cls;
  if (subj)  filters.subject = subj;
  if (lang)  filters.language = lang;
  loadAdAnalytics(filters);
  showToast('Analytics refreshed');
}

function resetAdFilters() {
  ['adb-campaign','adb-state','adb-district','adb-class','adb-subject','adb-lang','adb-period']
    .forEach(id => { const el = document.getElementById(id); if (el) el.selectedIndex = 0; });
  loadAdAnalytics();
  showToast('Filters reset');
}

// Wire replay filter
function filterReplayData() {
  const filters = {};
  const state = document.getElementById('rp-state')?.value;
  const dist  = document.getElementById('rp-district')?.value;
  const cls   = document.getElementById('rp-class')?.value;
  const subj  = document.getElementById('rp-subject')?.value;
  if (state) filters.state = state;
  if (dist)  filters.district = dist;
  if (cls)   filters.class_grade = cls;
  if (subj)  filters.subject = subj;
  loadReplayAnalytics(filters);
  const lbl = document.getElementById('rp-filter-label');
  if (lbl) lbl.textContent = `Showing: ${state||'All States'} · ${dist||'All Districts'} · ${cls||'All Classes'} · ${subj||'All Subjects'}`;
  showToast('Replay data refreshed');
}

// ── Ad campaign save / publish  ───────────────────────────────────────────────
async function saveAdCampaign() {
  try {
    const name       = document.querySelector('#ad-upload .inp')?.value;
    const media_type = detectMediaType(document.getElementById('ad-file-input')?.files?.[0]);
    const campaign   = await api.post('/ads', { name: name || 'New Campaign', media_type: media_type || 'image' });
    showToast(`Campaign "${campaign.name}" saved (ID: ${campaign.id.slice(0,8)})`);
  } catch (err) { showToast('Save failed: ' + err.message); }
}

async function publishAdCampaign() {
  showToast('Publishing campaign…');
  // In a real integration, store campaign ID after creation, then:
  // await api.post(`/ads/${campaignId}/publish`, {});
  showToast('Campaign published to target apps!');
}

function scheduleAdCampaign() { showToast('Campaign scheduled'); }

function detectMediaType(file) {
  if (!file) return 'image';
  if (/\.(mp4|webm|ogg)$/i.test(file.name)) return 'video';
  if (/\.gif$/i.test(file.name)) return 'gif';
  return 'image';
}

// ── Unity asset targeting save ────────────────────────────────────────────────
async function saveUnityTargeting(assetId) {
  try {
    const getChecked = cls => [...document.querySelectorAll('.' + cls)]
      .filter(c => c.checked).map(c => c.nextElementSibling?.textContent?.trim());
    const body = {
      target_apps      : getChecked('uapp-cb'),
      target_classes   : getChecked('ucls-cb'),
      target_subjects  : getChecked('usub-cb'),
      target_states    : [...document.getElementById('ut-state')?.selectedOptions||[]].map(o=>o.value),
      target_districts : [...document.getElementById('ut-district')?.selectedOptions||[]].map(o=>o.value)
    };
    await api.put(`/unity/assets/${assetId}`, body);
    showToast('Publishing config saved & applied');
  } catch (err) { showToast('Failed: ' + err.message); }
}

// ── Create user ───────────────────────────────────────────────────────────────
async function createUser() {
  const n    = document.getElementById('nu-name')?.value;
  const e    = document.getElementById('nu-email')?.value;
  const p    = document.getElementById('nu-pass')?.value;
  const role = document.getElementById('nu-role')?.value;
  if (!n) { showToast('Please enter a name'); return; }
  try {
    await api.post('/users', {
      full_name : n, email: e, password: p, role,
      perm_publish_apps    : document.getElementById('p-publish')?.checked,
      perm_upload_unity    : document.getElementById('p-unity')?.checked,
      perm_manage_geo      : document.getElementById('p-geo')?.checked,
      perm_view_analytics  : document.getElementById('p-analytics')?.checked,
      perm_create_users    : document.getElementById('p-users')?.checked,
      perm_edit_curriculum : document.getElementById('p-curr')?.checked,
      perm_approve_content : document.getElementById('p-approve')?.checked,
      perm_export_data     : document.getElementById('p-export')?.checked,
      perm_manage_ads      : document.getElementById('p-ads')?.checked,
      perm_replay_analytics: document.getElementById('p-replay')?.checked,
      assigned_state: document.getElementById('nu-state')?.value
    });
    closeModal('modal-new-user');
    showToast(`User ${n} created successfully`);
    ['nu-name','nu-email','nu-pass'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  } catch (err) { showToast('Error: ' + err.message); }
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE NAVIGATION HOOK — trigger data loads on tab switches
// ════════════════════════════════════════════════════════════════════════════
const _nativeSwitchAdTab = window.switchAdTab;
window.switchAdTab = function(tabId, btn) {
  if (typeof _nativeSwitchAdTab === 'function') _nativeSwitchAdTab(tabId, btn);
  if (tabId === 'dashboard') loadAdAnalytics();
};

// Hook into showPage to load live data
const _nativeShowPage = window.showPage;
window.showPage = function(pageId, topBtn, sbBtn) {
  if (typeof _nativeShowPage === 'function') _nativeShowPage(pageId, topBtn, sbBtn);
  if (pageId === 'advertisements') loadAdAnalytics();
  if (pageId === 'analytics')      loadReplayAnalytics();
};

// ════════════════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════════════════
function todayStr() { return new Date().toISOString().slice(0, 10); }

document.addEventListener('DOMContentLoaded', () => {
  if (Auth.loggedIn()) {
    applyPermissions();
    loadDashboardData();
  } else {
    showLoginModal();
  }
});
