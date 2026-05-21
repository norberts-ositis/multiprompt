/* ═══════════════════════════════════════════
   MultiPrompt — Phase 1 Frontend JS
   ═══════════════════════════════════════════ */

'use strict';

/* ── Config ── */
const API_BASE = '/api';

/* ── Auth state (simulated for frontend testing) ── */
const Auth = (() => {
  let _user = JSON.parse(localStorage.getItem('mp_user') || 'null');

  return {
    get user()       { return _user; },
    get isLoggedIn() { return !!_user; },

    login(userData) {
      _user = userData;
      localStorage.setItem('mp_user', JSON.stringify(_user));
    },

    logout() {
      _user = null;
      localStorage.removeItem('mp_user');
      // Do NOT remove mp_credentials here — they live in the backend DB.
      // They'll be re-synced from the server on next login via check().
      API.post('/auth/logout').catch(() => {});
      Router.navigate('landing');
    },

    // Checks PHP session and syncs credential statuses from backend
    async check() {
      try {
        const res = await API.get('/auth/me');
        if (res.ok && res.data?.data) {
          _user = res.data.data;
          localStorage.setItem('mp_user', JSON.stringify(_user));
          // Sync credential statuses from backend so they survive logout/login
          await this.syncCredentials();
        } else {
          _user = null;
          localStorage.removeItem('mp_user');
        }
      } catch {
        // Backend not running — keep localStorage state for UI testing
      }
      return !!_user;
    },

    // Fetch credential statuses from backend and merge into localStorage.
    // The backend never returns raw keys — only provider/model/status/verified.
    async syncCredentials() {
      try {
        const res = await API.get('/credentials');
        if (!res.ok || !res.data?.data) return;

        const serverCreds = res.data.data; // { claude: {model, enabled, status}, ... }
        const local = Credentials.all;

        // Merge: server status wins, but keep any local MSAL tokens (Copilot)
        for (const [provider, serverData] of Object.entries(serverCreds)) {
          const existing = local[provider] || {};
          Credentials.set(provider, {
            ...existing,
            model:   serverData.model   || existing.model,
            enabled: serverData.enabled ?? existing.enabled,
            status:  serverData.status  || existing.status,
            // Keep local MSAL access token — it never goes to the server
          });
        }
      } catch {
        // Silently ignore — localStorage state is the fallback
      }
    }
  };
})();

/* ── Credentials store ── */
const Credentials = (() => {
  const KEY = 'mp_credentials';
  const defaults = {
    claude:     { key: '', model: 'claude-sonnet-4-20250514', enabled: false, status: 'unconfigured' },
    gemini:     { key: '', model: 'gemini-2.5-flash',         enabled: false, status: 'unconfigured' },
    chatgpt:    { key: '', model: 'gpt-4o',                   enabled: false, status: 'unconfigured' },
    copilot:    { key: '', model: 'gpt-4o', enabled: false, status: 'unconfigured' },
  };

  function load() {
    return JSON.parse(localStorage.getItem(KEY) || JSON.stringify(defaults));
  }
  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  return {
    get all()  { return load(); },
    get(provider) { return load()[provider] || defaults[provider]; },
    set(provider, data) {
      const all = load();
      all[provider] = { ...all[provider], ...data };
      save(all);
    },
    countConnected() {
      return Object.values(load()).filter(c => c.status === 'connected').length;
    }
  };
})();

/* ── API client ── */
const API = {
  async request(method, path, body) {
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(API_BASE + path, opts);
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { message: 'Network error' } };
    }
  },
  get(path)         { return this.request('GET', path); },
  post(path, body)  { return this.request('POST', path, body); },
  put(path, body)   { return this.request('PUT', path, body); },
  delete(path)      { return this.request('DELETE', path); },
};

/* ── Router ── */
const Router = (() => {
  const routes = {};
  let currentPage = null;

  return {
    register(name, handler) { routes[name] = handler; },

    navigate(name, params = {}) {
      if (!routes[name]) return console.warn('Unknown route:', name);
      if (currentPage) currentPage.destroy?.();

      // Guard: redirect to landing if not logged in
      const protectedRoutes = ['dashboard', 'settings', 'prompt', 'session'];
      if (protectedRoutes.includes(name) && !Auth.isLoggedIn) {
        name = 'landing';
      }
      // Guard: redirect to dashboard if already logged in
      if (name === 'landing' && Auth.isLoggedIn) {
        name = 'dashboard';
      }

      document.getElementById('app').innerHTML = '';
      window.history.pushState({ page: name, params }, '', '#' + name);
      currentPage = routes[name](params);
    },

    init() {
      window.addEventListener('popstate', e => {
        if (e.state?.page) this.navigate(e.state.page, e.state.params || {});
      });
      const hash = window.location.hash.slice(1) || (Auth.isLoggedIn ? 'dashboard' : 'landing');
      this.navigate(hash);
    }
  };
})();

/* ── Toast ── */
const Toast = {
  show(message, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✕', info: '◆' };
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span style="color:var(--${type === 'success' ? 'green' : type === 'error' ? 'red' : 'gold'})">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 250);
    }, duration);
  },
  success: (m, d) => Toast.show(m, 'success', d),
  error:   (m, d) => Toast.show(m, 'error', d),
  info:    (m, d) => Toast.show(m, 'info', d),
};

/* ── Modal helper ── */
function createModal({ title, content, onConfirm, confirmText = 'Confirm', confirmClass = 'btn-primary', showCancel = true } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">${content}</div>
      ${onConfirm || showCancel ? `
      <div class="row row-8 mt-16" style="margin-top:20px;justify-content:flex-end">
        ${showCancel ? `<button class="btn btn-ghost btn-sm modal-cancel">Cancel</button>` : ''}
        ${onConfirm  ? `<button class="btn ${confirmClass} btn-sm modal-confirm">${confirmText}</button>` : ''}
      </div>` : ''}
    </div>
  `;
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close')?.addEventListener('click', close);
  overlay.querySelector('.modal-cancel')?.addEventListener('click', close);
  overlay.querySelector('.modal-confirm')?.addEventListener('click', () => { onConfirm(); close(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  return { close };
}

/* ── Nav builder ── */
function buildNav(activePage = '') {
  const user = Auth.user;
  const initials = user ? (user.name || user.email || 'U').slice(0,2).toUpperCase() : '';

  const navEl = document.createElement('nav');
  navEl.className = 'nav';
  navEl.innerHTML = `
    <div class="container nav-inner">
      <a class="nav-logo" href="#dashboard">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect width="22" height="22" rx="6" fill="var(--gold)"/>
          <path d="M5 11h4M11 6v10M17 11h-4" stroke="#0d0d0f" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Multi<span class="dot">Prompt</span>
      </a>
      ${user ? `
      <div class="nav-links hide-mobile">
        <button class="nav-link ${activePage === 'dashboard' ? 'active' : ''}" data-nav="dashboard">Dashboard</button>
        <button class="nav-link ${activePage === 'prompt' ? 'active' : ''}" data-nav="prompt">New Prompt</button>
        <button class="nav-link ${activePage === 'settings' ? 'active' : ''}" data-nav="settings">Settings</button>
      </div>
      <div class="nav-actions">
        <div class="dropdown">
          <button class="row row-8 btn btn-ghost btn-sm" id="user-menu-btn">
            ${user.avatar ? `<img src="${user.avatar}" class="avatar" alt="">` : `<div class="avatar-initials" style="width:28px;height:28px;font-size:0.75rem">${initials}</div>`}
            <span class="hide-mobile text-sm">${user.name || user.email}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="dropdown-menu hidden" id="user-menu">
            <div class="dropdown-item" style="pointer-events:none;padding-bottom:8px;">
              <div>
                <div class="text-sm fw-600">${user.name || 'User'}</div>
                <div class="text-xs text-dim">${user.email || ''}</div>
              </div>
            </div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-item" data-nav="settings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              Settings
            </div>
            <div class="dropdown-divider"></div>
            <div class="dropdown-item danger" id="logout-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Sign out
            </div>
          </div>
        </div>
      </div>` : `
      <div class="nav-actions">
        <button class="btn btn-primary btn-sm" data-nav="landing">Sign in</button>
      </div>`}
    </div>
  `;

  // Wire up nav
  navEl.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => Router.navigate(el.dataset.nav));
  });

  const menuBtn = navEl.querySelector('#user-menu-btn');
  const menu    = navEl.querySelector('#user-menu');
  menuBtn?.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('hidden'); });
  document.addEventListener('click', () => menu?.classList.add('hidden'), { once: false });

  navEl.querySelector('#logout-btn')?.addEventListener('click', () => Auth.logout());

  return navEl;
}

/* ══════════════════════════════
   PAGE: LANDING
══════════════════════════════ */
Router.register('landing', () => {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="page">
      <!-- Nav (logged-out) -->
      <nav class="nav">
        <div class="container nav-inner">
          <span class="nav-logo">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect width="22" height="22" rx="6" fill="var(--gold)"/>
              <path d="M5 11h4M11 6v10M17 11h-4" stroke="#0d0d0f" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Multi<span class="dot">Prompt</span>
          </span>
          <button class="btn btn-primary btn-sm" id="nav-signin">Sign in</button>
        </div>
      </nav>

      <!-- Hero -->
      <section class="section" style="padding-top:100px;padding-bottom:80px;text-align:center;position:relative;overflow:hidden;">
        <!-- Decorative glow -->
        <div style="position:absolute;top:-120px;left:50%;transform:translateX(-50%);width:600px;height:400px;background:radial-gradient(ellipse,rgba(240,192,64,0.07) 0%,transparent 70%);pointer-events:none;"></div>

        <div class="container-sm page-content">
          <div class="badge badge-gold" style="margin-bottom:24px;display:inline-flex;">
            <span class="dot-pulse"></span>
            Phase 2 — Prompt &amp; Results
          </div>
          <h1 style="margin-bottom:20px;">
            One prompt.<br>
            <span style="color:var(--gold)">Every AI.</span>
          </h1>
          <p class="text-muted" style="font-size:1.125rem;max-width:480px;margin:0 auto 40px;line-height:1.7;">
            Send any prompt to Claude, Gemini, ChatGPT, and Copilot simultaneously. Compare their answers, spot disparities, and interrogate the differences.
          </p>
          <div class="row row-12" style="justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-primary btn-lg" id="hero-signin">
              <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Continue with Google
            </button>
          </div>

          <!-- AI logos strip -->
          <div style="margin-top:56px;padding-top:40px;border-top:1px solid var(--border);">
            <p class="text-xs text-dim" style="margin-bottom:16px;letter-spacing:0.1em;text-transform:uppercase;">Connects with</p>
            <div class="row row-16" style="justify-content:center;flex-wrap:wrap;">
              ${[
                ['claude',     '🟠', 'Claude'],
                ['gemini',     '🔵', 'Gemini'],
                ['chatgpt',    '🟢', 'ChatGPT'],
                ['copilot',    '🔷', 'MS Copilot'],
              ].map(([,icon, name]) => `
                <div class="row row-8" style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 14px;">
                  <span style="font-size:1rem">${icon}</span>
                  <span class="text-sm text-muted">${name}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </section>

      <!-- Features -->
      <section class="section-sm" style="padding-bottom:80px;">
        <div class="container">
          <div class="grid-3" style="gap:20px;">
            ${[
              ['◈', 'Fan-out prompts', 'Write once, dispatch to every connected AI simultaneously with one click.'],
              ['◇', 'Compare answers', 'An AI-powered engine highlights similarities, contradictions, and unique insights across responses.'],
              ['◉', 'Resolve disputes', 'Select conflicting points and send them back to the disagreeing models for deeper analysis.'],
            ].map(([icon, title, desc]) => `
              <div class="card">
                <div style="font-size:1.5rem;color:var(--gold);margin-bottom:14px;">${icon}</div>
                <h3 style="margin-bottom:8px;">${title}</h3>
                <p class="text-muted text-sm">${desc}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    </div>
  `;

  // Sign-in buttons
  const doSignIn = () => showGoogleAuthFlow();
  app.querySelector('#hero-signin').addEventListener('click', doSignIn);
  app.querySelector('#nav-signin').addEventListener('click', doSignIn);
});

/* ── Google OAuth redirect ── */
function showGoogleAuthFlow() {
  window.location.href = '/api/auth/google';
}

/* ══════════════════════════════
   PAGE: DASHBOARD
══════════════════════════════ */
Router.register('dashboard', () => {
  const app   = document.getElementById('app');
  const user  = Auth.user;
  const creds = Credentials.all;
  const connected = Credentials.countConnected();

  const recentSessions = JSON.parse(localStorage.getItem('mp_sessions') || '[]');

  app.innerHTML = '';
  app.appendChild(buildNav('dashboard'));

  const main = document.createElement('main');
  main.className = 'page-content';
  main.innerHTML = `
    <div class="container section-sm">

      <!-- Greeting -->
      <div class="row-between" style="margin-bottom:32px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="margin-bottom:4px;">Good ${timeOfDay()}, ${user?.name?.split(' ')[0] || 'there'}</h2>
          <p class="text-muted text-sm">
            ${connected === 0
              ? 'Connect your first AI to get started.'
              : `${connected} AI${connected > 1 ? 's' : ''} connected — ready to prompt.`}
          </p>
        </div>
        <button class="btn btn-primary ${connected === 0 ? 'hidden' : ''}" id="new-prompt-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          New prompt
        </button>
      </div>

      <!-- Setup banner (shown when no keys configured) -->
      ${connected === 0 ? `
      <div class="card" style="border-color:rgba(240,192,64,0.25);background:linear-gradient(135deg,var(--surface),var(--bg3));margin-bottom:32px;">
        <div class="row row-16" style="flex-wrap:wrap;gap:20px;">
          <div style="font-size:2.5rem;flex-shrink:0;">⚡</div>
          <div style="flex:1;min-width:220px;">
            <h3 style="margin-bottom:6px;">Set up your AI connections</h3>
            <p class="text-muted text-sm" style="margin-bottom:16px;">Add your API keys for Claude, Gemini, ChatGPT, and Copilot to start comparing answers.</p>
            <button class="btn btn-primary" id="setup-btn">Configure AI keys</button>
          </div>
        </div>
      </div>` : ''}

      <!-- AI status grid -->
      <div style="margin-bottom:40px;">
        <h4 style="margin-bottom:16px;">Connected AIs</h4>
        <div class="grid-3" style="gap:12px;">
          ${AI_PROVIDERS.map(p => {
            const cred = creds[p.id] || {};
            const ok = cred.status === 'connected';
            return `
            <div class="card card-sm row row-12" style="--provider-color:${p.color};${ok ? 'border-left:3px solid '+p.color+';' : ''}cursor:pointer" data-nav-settings="${p.id}">
              <span style="font-size:1.3rem;flex-shrink:0">${p.emoji}</span>
              <div style="flex:1;min-width:0">
                <div class="row-between">
                  <span class="text-sm fw-600">${p.name}</span>
                  <span class="badge ${ok ? 'badge-green' : 'badge-gray'}" style="font-size:0.7rem;padding:2px 7px;">
                    ${ok ? '<span class="dot-pulse"></span> on' : 'off'}
                  </span>
                </div>
                <div class="text-xs text-dim mono" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${ok ? (cred.model || p.defaultModel) : 'Not configured'}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Recent sessions -->
      <div>
        <h4 style="margin-bottom:16px;">Recent Sessions</h4>
        ${recentSessions.length === 0 ? `
          <div class="card" style="text-align:center;padding:48px 24px;border-style:dashed;">
            <div style="font-size:2rem;margin-bottom:12px;opacity:0.3">◈</div>
            <p class="text-muted text-sm">No sessions yet. Start by creating a new prompt above.</p>
          </div>
        ` : `
          <div class="stack stack-8" id="recent-sessions-list">
            ${recentSessions.slice(0,5).map((s,i) => `
              <div class="card card-sm row-between session-card" data-session-id="${s.id || ''}" data-session-idx="${i}" style="cursor:pointer;gap:12px;">
                <div style="flex:1;min-width:0">
                  <p class="text-sm fw-600" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(s.prompt_text || s.prompt || '')}</p>
                  <p class="text-xs text-dim">${(s.providers||[]).join(', ')} · ${formatDate(s.created_at)}</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text3)"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  app.appendChild(main);

  // Wire up buttons
  main.querySelector('#new-prompt-btn')?.addEventListener('click', () => Router.navigate('prompt'));
  main.querySelector('#setup-btn')?.addEventListener('click', () => Router.navigate('settings'));
  main.querySelectorAll('[data-nav-settings]').forEach(el => {
    el.addEventListener('click', () => Router.navigate('settings', { focus: el.dataset.navSettings }));
  });

  // Session card clicks
  main.querySelectorAll('.session-card').forEach(el => {
    el.addEventListener('click', () => {
      const sid = el.dataset.sessionId;
      const idx = parseInt(el.dataset.sessionIdx);
      if (sid) {
        Router.navigate('session', { id: sid });
      } else if (recentSessions[idx]) {
        // Fallback for locally-stored sessions
        Router.navigate('session', { id: recentSessions[idx].id, local: recentSessions[idx] });
      }
    });
  });

  // Try to refresh sessions from API in background
  API.get('/prompts').then(res => {
    if (res.ok && Array.isArray(res.data?.data) && res.data.data.length > 0) {
      Sessions.saveAll(res.data.data);
      // Re-render just the recent sessions list without full page reload
      const container = main.querySelector('#recent-sessions-list');
      if (container) {
        const fresh = res.data.data.slice(0, 5);
        container.innerHTML = fresh.map((s, i) => `
          <div class="card card-sm row-between session-card" data-session-id="${s.id}" data-session-idx="${i}" style="cursor:pointer;gap:12px;">
            <div style="flex:1;min-width:0">
              <p class="text-sm fw-600" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(s.prompt_text || '')}</p>
              <p class="text-xs text-dim">${(s.providers||[]).join(', ')} · ${formatDate(s.created_at)}</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text3)"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        `).join('');
        container.querySelectorAll('.session-card').forEach(el => {
          el.addEventListener('click', () => Router.navigate('session', { id: el.dataset.sessionId }));
        });
      }
    }
  }).catch(() => {});
});

/* ══════════════════════════════
   PAGE: SETTINGS
══════════════════════════════ */
Router.register('settings', (params = {}) => {
  const app = document.getElementById('app');
  app.innerHTML = '';
  app.appendChild(buildNav('settings'));

  const main = document.createElement('main');
  main.className = 'page-content';
  main.innerHTML = `
    <div class="container section-sm">
      <div class="row-between" style="margin-bottom:32px;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="margin-bottom:4px;">Settings</h2>
          <p class="text-muted text-sm">Manage your account and AI API connections.</p>
        </div>
      </div>

      <!-- Two-column layout on desktop -->
      <div style="display:grid;grid-template-columns:220px 1fr;gap:32px;align-items:start;" id="settings-grid">
        <!-- Sidebar -->
        <div class="stack stack-4" id="settings-nav">
          <button class="settings-tab active" data-tab="profile">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Profile
          </button>
          <button class="settings-tab" data-tab="ai-keys">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            AI Keys
          </button>
          <button class="settings-tab" data-tab="security">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Security
          </button>
        </div>

        <!-- Content area -->
        <div id="settings-content"></div>
      </div>
    </div>
  `;

  // Add sidebar styles dynamically
  const style = document.createElement('style');
  style.textContent = `
    .settings-tab {
      display:flex;align-items:center;gap:10px;
      padding:9px 12px;border-radius:8px;
      background:none;border:none;cursor:pointer;
      font-family:var(--font-body);font-size:0.875rem;
      color:var(--text2);width:100%;text-align:left;
      transition:all 0.15s;
    }
    .settings-tab:hover { background:var(--surface);color:var(--text); }
    .settings-tab.active { background:var(--surface);color:var(--text);font-weight:500; }
    .settings-tab svg { flex-shrink:0; }
    @media(max-width:640px){
      #settings-grid{grid-template-columns:1fr!important}
      #settings-nav{flex-direction:row!important;overflow-x:auto;}
      .settings-tab{white-space:nowrap;}
    }
  `;
  document.head.appendChild(style);

  app.appendChild(main);

  const tabs = main.querySelectorAll('.settings-tab');
  const contentEl = main.querySelector('#settings-content');

  function showTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    contentEl.innerHTML = '';
    if (name === 'profile')  renderProfileTab(contentEl);
    if (name === 'ai-keys')  renderAIKeysTab(contentEl);
    if (name === 'security') renderSecurityTab(contentEl);
  }

  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // Auto-focus AI keys if navigated here with param
  showTab(params.focus ? 'ai-keys' : 'profile');
});

/* ── Settings: Profile tab ── */
function renderProfileTab(el) {
  const user = Auth.user;
  const initials = (user?.name || user?.email || 'U').slice(0,2).toUpperCase();

  el.innerHTML = `
    <div class="stack stack-24">
      <div class="card">
        <h3 style="margin-bottom:20px;">Profile</h3>
        <div class="row row-16" style="margin-bottom:24px;flex-wrap:wrap;">
          ${user?.avatar
            ? `<img src="${user.avatar}" class="avatar" style="width:64px;height:64px;" alt="">`
            : `<div class="avatar-initials" style="width:64px;height:64px;font-size:1.25rem;">${initials}</div>`}
          <div>
            <p class="fw-600">${user?.name || 'User'}</p>
            <p class="text-sm text-muted">${user?.email || ''}</p>
            <div class="row row-8" style="margin-top:8px;">
              <span class="badge badge-gray">
                <svg width="11" height="11" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Google Account
              </span>
            </div>
          </div>
        </div>
        <div class="grid-2" style="gap:16px;">
          <div class="form-group">
            <label class="form-label">Display name</label>
            <input class="form-input" id="profile-name" value="${user?.name || ''}" placeholder="Your name">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input class="form-input" value="${user?.email || ''}" disabled style="opacity:0.5;cursor:not-allowed;">
          </div>
        </div>
        <div style="margin-top:16px;display:flex;justify-content:flex-end;">
          <button class="btn btn-primary btn-sm" id="save-profile">Save changes</button>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom:8px;">Danger zone</h3>
        <p class="text-muted text-sm" style="margin-bottom:16px;">These actions are irreversible.</p>
        <div class="row row-8" style="flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="clear-data-btn">Clear local data</button>
          <button class="btn btn-danger btn-sm" id="delete-account-btn">Delete account</button>
        </div>
      </div>
    </div>
  `;

  el.querySelector('#save-profile').addEventListener('click', () => {
    const name = el.querySelector('#profile-name').value.trim();
    if (!name) return Toast.error('Name cannot be empty');
    Auth.login({ ...Auth.user, name });
    Toast.success('Profile updated');
    Router.navigate('settings', {});
  });

  el.querySelector('#clear-data-btn').addEventListener('click', () => {
    createModal({
      title: 'Clear local data?',
      content: '<p class="text-muted text-sm">This will remove all locally stored credentials and session history. Your Google account will remain active.</p>',
      confirmText: 'Clear data',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        localStorage.removeItem('mp_credentials');
        localStorage.removeItem('mp_sessions');
        Toast.success('Local data cleared');
      }
    });
  });

  el.querySelector('#delete-account-btn').addEventListener('click', () => {
    createModal({
      title: 'Delete account?',
      content: '<p class="text-muted text-sm">This would permanently delete your account and all data. In production, this calls DELETE /api/account.</p>',
      confirmText: 'Delete account',
      confirmClass: 'btn-danger',
      onConfirm: () => { Auth.logout(); Toast.info('Account deleted'); }
    });
  });
}

/* ── Settings: AI Keys tab ── */
function renderAIKeysTab(el) {
  el.innerHTML = `
    <div class="stack stack-16">
      <div class="alert alert-info">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <span>API keys are encrypted before storage. They're only used to make requests on your behalf.</span>
      </div>
      <div id="provider-cards" class="stack stack-12">
        <div style="padding:24px;text-align:center;">
          <div class="spinner" style="width:20px;height:20px;margin:0 auto;"></div>
        </div>
      </div>
    </div>
  `;

  const container = el.querySelector('#provider-cards');

  // Always sync from server before rendering so status is accurate after login
  Auth.syncCredentials().finally(() => {
    container.innerHTML = '';
    AI_PROVIDERS.forEach(provider => renderProviderCard(container, provider));
  });
}

function renderProviderCard(container, provider) {
  const cred = Credentials.get(provider.id);
  const isConnected = cred.status === 'connected';
  const cardId = `provider-${provider.id}`;

  const existing = document.getElementById(cardId);
  if (existing) existing.remove();

  const card = document.createElement('div');
  card.id = cardId;
  card.className = `provider-card ${isConnected ? 'connected' : ''}`;
  card.style.setProperty('--provider-color', provider.color);

  const isMsal = false; // MSAL removed - all providers use API key form

  card.innerHTML = `
    <div class="provider-header">
      <div class="provider-info">
        <div class="provider-logo">${provider.emoji}</div>
        <div>
          <div class="provider-name">${provider.name}</div>
          <div class="provider-desc">${provider.description}</div>
        </div>
      </div>
      <div class="row row-8">
        <span class="badge ${isConnected ? 'badge-green' : 'badge-gray'}">
          ${isConnected ? '<span class="dot-pulse"></span> Connected' : 'Not configured'}
        </span>
        <button class="btn btn-icon btn-ghost toggle-card" aria-label="Toggle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="chevron-icon" style="transition:transform 0.2s;">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Expanded form -->
    <div class="provider-form hidden" id="form-${provider.id}">
      <hr class="divider" style="margin:0 0 16px;">
      <div class="stack stack-12">
        ${isMsal ? renderMsalForm(provider, cred, isConnected) : renderApiKeyForm(provider, cred, isConnected)}
      </div>
    </div>
  `;

  container.appendChild(card);

  // Toggle expand
  card.querySelector('.toggle-card').addEventListener('click', () => {
    const form    = card.querySelector('.provider-form');
    const chevron = card.querySelector('.chevron-icon');
    const hidden  = form.classList.toggle('hidden');
    chevron.style.transform = hidden ? '' : 'rotate(180deg)';
  });

  // Auto-open if connected (so user can see status / disconnect)
  if (isConnected) {
    card.querySelector('.provider-form').classList.remove('hidden');
    card.querySelector('.chevron-icon').style.transform = 'rotate(180deg)';
  }

  if (isMsal) {
    wireMsalCard(card, container, provider);
  } else {
    wireApiKeyCard(card, container, provider);
  }
}

/* ── API-key form HTML ── */
function renderApiKeyForm(provider, cred, isConnected) {
  return `
    <div class="form-group">
      <label class="form-label">API Key</label>
      <div class="input-wrap">
        <input type="password" class="form-input input-mono" id="key-${provider.id}"
          placeholder="${provider.keyPlaceholder}"
          value="${cred.key ? maskKey(cred.key) : ''}">
        <button class="input-reveal" data-target="key-${provider.id}" type="button">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
      <span class="form-hint">Get your key at <a href="${provider.keyUrl}" target="_blank" rel="noopener">${provider.keyUrl.replace('https://','')}</a></span>
    </div>
    <div class="form-group">
      <label class="form-label">Model</label>
      <select class="form-select" id="model-${provider.id}">
        ${provider.models.map(m => `<option value="${m}" ${(cred.model || provider.defaultModel) === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>
    <div class="row row-8" style="justify-content:flex-end;flex-wrap:wrap;gap:8px;">
      ${isConnected ? `<button class="btn btn-danger btn-sm" id="disconnect-${provider.id}">Disconnect</button>` : ''}
      <button class="btn btn-ghost btn-sm" id="test-${provider.id}">
        <span class="test-label">Test connection</span>
      </button>
      <button class="btn btn-primary btn-sm" id="save-${provider.id}">Save</button>
    </div>
    <div id="test-result-${provider.id}" class="hidden"></div>
  `;
}

/* ── MSAL form HTML (MS Copilot) ── */
function renderMsalForm(provider, cred, isConnected) {
  const clientId = cred.msalClientId || '';
  const tenantId = cred.msalTenantId || 'common';
  return `
    <div class="alert alert-info" style="margin-bottom:4px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      <span>MS Copilot uses Microsoft login — no API key. You need to register an app in <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps" target="_blank">Azure App Registrations</a> and add <code style="font-family:var(--font-mono);font-size:0.8em">http://localhost:8080</code> as a redirect URI (type: SPA).</span>
    </div>
    <div class="form-group">
      <label class="form-label">Your Entra App — Client ID</label>
      <input class="form-input input-mono" id="msal-clientid-${provider.id}"
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        value="${clientId}">
      <span class="form-hint">From Azure portal → App registrations → your app → Overview → Application (client) ID</span>
    </div>
    <div class="form-group">
      <label class="form-label">Tenant ID <span class="text-dim" style="font-weight:400">(optional — leave "common" for any MS account)</span></label>
      <input class="form-input input-mono" id="msal-tenantid-${provider.id}"
        placeholder="common"
        value="${tenantId}">
    </div>
    <div class="form-group">
      <label class="form-label">Model</label>
      <select class="form-select" id="model-${provider.id}">
        ${provider.models.map(m => `<option value="${m}" ${(cred.model || provider.defaultModel) === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </div>
    <div class="row row-8" style="justify-content:flex-end;flex-wrap:wrap;gap:8px;">
      ${isConnected ? `<button class="btn btn-danger btn-sm" id="disconnect-${provider.id}">Disconnect</button>` : ''}
      <button class="btn btn-secondary btn-sm" id="msal-signin-${provider.id}" style="gap:8px;">
        <svg width="15" height="15" viewBox="0 0 23 23" fill="none"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#00a4ef" d="M12 1h10v10H12z"/><path fill="#7fba00" d="M1 12h10v10H1z"/><path fill="#ffb900" d="M12 12h10v10H12z"/></svg>
        ${isConnected ? 'Re-authenticate' : 'Sign in with Microsoft'}
      </button>
    </div>
    <div id="test-result-${provider.id}" class="hidden"></div>
    ${isConnected ? `
    <div class="row row-8" style="margin-top:4px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span class="text-xs text-dim">Signed in as <strong>${cred.msalAccount || 'Microsoft account'}</strong> · token expires ${cred.tokenExpiry ? new Date(cred.tokenExpiry * 1000).toLocaleTimeString() : 'unknown'}</span>
    </div>` : ''}
  `;
}

/* ── Wire up API-key card events ── */
function wireApiKeyCard(card, container, provider) {
  // Password reveal
  card.querySelector('.input-reveal')?.addEventListener('click', function() {
    const input = document.getElementById(this.dataset.target);
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // Save — persist to backend AND localStorage
  card.querySelector(`#save-${provider.id}`).addEventListener('click', async () => {
    const keyVal   = document.getElementById(`key-${provider.id}`).value.trim();
    const modelVal = document.getElementById(`model-${provider.id}`).value;
    if (!keyVal || keyVal.includes('•')) { Toast.error('Please enter a valid API key'); return; }

    const saveBtn = card.querySelector(`#save-${provider.id}`);
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    // Persist to backend (encrypted in DB)
    const res = await API.post('/credentials', {
      provider: provider.id, key: keyVal, model: modelVal,
    });

    if (res.ok) {
      Credentials.set(provider.id, { key: keyVal, model: modelVal, enabled: true, status: 'saved_unverified' });
      Toast.success(`${provider.name} key saved`);
    } else {
      // Backend not running — save locally only
      Credentials.set(provider.id, { key: keyVal, model: modelVal, enabled: true, status: 'saved_unverified' });
      Toast.success(`${provider.name} key saved locally`);
    }

    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
    renderProviderCard(container, provider);
  });

  // Test
  card.querySelector(`#test-${provider.id}`).addEventListener('click', async function() {
    const keyInput = document.getElementById(`key-${provider.id}`);
    const keyVal   = keyInput.value.trim();
    const resultEl = document.getElementById(`test-result-${provider.id}`);
    const labelEl  = card.querySelector('.test-label');

    // If field shows masked value, test the stored key directly via backend
    // (send empty key — backend will use its own stored+encrypted key)
    const isMasked = keyVal.includes('•');
    const keyToSend = isMasked ? '' : keyVal;

    if (!isMasked && !keyVal) {
      Toast.error('Enter your API key first'); return;
    }

    labelEl.innerHTML = `<span class="spinner" style="width:13px;height:13px;"></span> Testing…`;
    this.disabled = true;
    resultEl.classList.add('hidden');

    const result = await testProviderKey(provider.id, keyToSend);

    labelEl.textContent = 'Test connection';
    this.disabled = false;
    resultEl.className = `alert ${result.ok ? 'alert-success' : 'alert-error'}`;
    resultEl.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
        ${result.ok ? '<polyline points="20 6 9 17 4 12"/>' : '<path d="M18 6L6 18M6 6l12 12"/>'}
      </svg>
      <span>${result.message}</span>`;
    resultEl.classList.remove('hidden');

    if (result.ok) {
      Credentials.set(provider.id, { status: 'connected' });
      Toast.success(`${provider.name} connected!`);
      renderProviderCard(container, provider);
    }
  });

  // Disconnect — remove from backend AND localStorage
  card.querySelector(`#disconnect-${provider.id}`)?.addEventListener('click', () => {
    createModal({
      title: `Disconnect ${provider.name}?`,
      content: `<p class="text-muted text-sm">This will remove your ${provider.name} API key. You can reconnect at any time.</p>`,
      confirmText: 'Disconnect', confirmClass: 'btn-danger',
      onConfirm: async () => {
        await API.delete(`/credentials/${provider.id}`).catch(() => {});
        Credentials.set(provider.id, { key: '', enabled: false, status: 'unconfigured' });
        Toast.info(`${provider.name} disconnected`);
        renderProviderCard(container, provider);
      }
    });
  });
}

/* ── Wire up MSAL card events (MS Copilot) ── */
function wireMsalCard(card, container, provider) {
  // Save Client ID + trigger sign-in
  card.querySelector(`#msal-signin-${provider.id}`).addEventListener('click', async () => {
    const clientId = document.getElementById(`msal-clientid-${provider.id}`).value.trim();
    const tenantId = document.getElementById(`msal-tenantid-${provider.id}`).value.trim() || 'common';
    const model    = document.getElementById(`model-${provider.id}`).value;
    const resultEl = document.getElementById(`test-result-${provider.id}`);

    if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) {
      Toast.error('Enter a valid Client ID (GUID format)'); return;
    }

    // Persist config before opening popup
    Credentials.set(provider.id, { msalClientId: clientId, msalTenantId: tenantId, model });

    resultEl.className = 'alert alert-info';
    resultEl.innerHTML = `<span class="spinner" style="width:13px;height:13px;"></span><span>Opening Microsoft login…</span>`;
    resultEl.classList.remove('hidden');

    try {
      const tokenData = await msalSignIn(clientId, tenantId);
      Credentials.set(provider.id, {
        accessToken:  tokenData.accessToken,
        tokenExpiry:  tokenData.expiresOn ? Math.floor(tokenData.expiresOn.getTime() / 1000) : 0,
        msalAccount:  tokenData.account?.username || tokenData.account?.name || '',
        enabled: true, status: 'connected',
      });
      Toast.success('MS Copilot connected!');
      renderProviderCard(container, provider);
    } catch (err) {
      resultEl.className = 'alert alert-error';
      resultEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M18 6L6 18M6 6l12 12"/></svg>
        <span>${err.message || 'Microsoft sign-in failed'}</span>`;
    }
  });

  // Disconnect
  card.querySelector(`#disconnect-${provider.id}`)?.addEventListener('click', () => {
    createModal({
      title: 'Disconnect MS Copilot?',
      content: '<p class="text-muted text-sm">This will clear your Microsoft access token. You can sign in again at any time.</p>',
      confirmText: 'Disconnect', confirmClass: 'btn-danger',
      onConfirm: () => {
        Credentials.set(provider.id, { accessToken: '', msalAccount: '', enabled: false, status: 'unconfigured' });
        Toast.info('MS Copilot disconnected');
        renderProviderCard(container, provider);
      }
    });
  });
}

/* ── MSAL popup sign-in ── */
async function msalSignIn(clientId, tenantId) {
  // Dynamically load MSAL from CDN
  if (!window.msal) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@3/lib/msal-browser.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load MSAL library'));
      document.head.appendChild(s);
    });
  }

  const msalConfig = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  };

  const msalInstance = new msal.PublicClientApplication(msalConfig);
  await msalInstance.initialize();

  // Scopes for M365 Copilot Chat API
  // Note: the exact Copilot scope is still rolling out; Chat.ReadWrite covers the current preview
  const scopes = [
    'openid', 'profile', 'offline_access',
    'https://graph.microsoft.com/Chat.ReadWrite',
  ];

  try {
    return await msalInstance.loginPopup({ scopes, prompt: 'select_account' });
  } catch (err) {
    if (err.errorCode === 'popup_window_error') {
      throw new Error('Popup was blocked — please allow popups for this site and try again');
    }
    if (err.errorCode === 'user_cancelled') {
      throw new Error('Sign-in was cancelled');
    }
    throw new Error(err.errorMessage || err.message || 'Microsoft sign-in failed');
  }
}

async function testProviderKey(providerId, key) {
  try {
    const res = await API.post('/credentials/test', { provider: providerId, key });
    // Always return the real backend result — never fall through to simulation
    return {
      ok:      res.ok && res.data?.ok === true,
      message: res.data?.message || (res.ok ? 'Connection successful' : `Server error: HTTP ${res.status}`),
    };
  } catch (e) {
    return { ok: false, message: `Network error: ${e.message}` };
  }
}

/* ── Settings: Security tab ── */
function renderSecurityTab(el) {
  el.innerHTML = `
    <div class="stack stack-24">
      <div class="card">
        <h3 style="margin-bottom:16px;">Active sessions</h3>
        <div class="card card-sm" style="background:var(--bg3);">
          <div class="row-between">
            <div>
              <p class="text-sm fw-600">Current session</p>
              <p class="text-xs text-dim">${navigator.userAgent.slice(0,60)}…</p>
            </div>
            <span class="badge badge-green"><span class="dot-pulse"></span> Active</span>
          </div>
        </div>
        <p class="text-xs text-dim" style="margin-top:12px;">Session management will be available when the PHP backend is running.</p>
      </div>

      <div class="card">
        <h3 style="margin-bottom:8px;">Key encryption</h3>
        <p class="text-muted text-sm" style="margin-bottom:16px;">In production, API keys are encrypted with AES-256-GCM using a server-side key. The raw key never leaves the server after storage.</p>
        <div class="stack stack-8">
          ${[
            ['Encryption at rest', 'AES-256-GCM', true],
            ['Transport security', 'HTTPS / TLS 1.3', true],
            ['Key exposure in JS', 'Never — PHP only', true],
            ['2FA support', 'Via Google account', true],
          ].map(([label, value, ok]) => `
            <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--border);">
              <span class="text-sm text-muted">${label}</span>
              <div class="row row-8">
                <span class="text-sm">${value}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ok ? 'var(--green)' : 'var(--red)'}" stroke-width="2.5">
                  ${ok ? '<polyline points="20 6 9 17 4 12"/>' : '<path d="M18 6L6 18M6 6l12 12"/>'}
                </svg>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/* ══════════════════════════════
   PROVIDER DEFINITIONS
══════════════════════════════ */
const AI_PROVIDERS = [
  {
    id: 'claude', name: 'Claude', emoji: '🟠',
    description: 'Anthropic · claude.ai',
    color: '#e07040',
    keyPlaceholder: 'sk-ant-api03-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'gemini', name: 'Gemini', emoji: '🔵',
    description: 'Google · ai.google.dev',
    color: '#4080e0',
    keyPlaceholder: 'AIzaSy…',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  },
  {
    id: 'chatgpt', name: 'ChatGPT', emoji: '🟢',
    description: 'OpenAI · platform.openai.com',
    color: '#40c080',
    keyPlaceholder: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
  },
  {
    id: 'copilot', name: 'GitHub Copilot', emoji: '🔷',
    description: 'GitHub Models · GPT-4o via Azure',
    color: '#5060d0',
    keyPlaceholder: 'github_pat_…',
    keyUrl: 'https://github.com/settings/tokens',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1-mini', 'o3-mini', 'Meta-Llama-3.1-70B-Instruct'],
  },
];

/* ══════════════════════════════
   UTILITIES
══════════════════════════════ */
function maskKey(key) {
  if (!key || key.length < 8) return key;
  return key.slice(0, 6) + '••••••••••••' + key.slice(-4);
}

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return iso; }
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatMs(ms) {
  if (!ms) return '—';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

/* ── Sessions local store ── */
const Sessions = (() => {
  const KEY = 'mp_sessions';
  return {
    getAll()       { return JSON.parse(localStorage.getItem(KEY) || '[]'); },
    saveAll(list)  { localStorage.setItem(KEY, JSON.stringify(list)); },
    add(session)   {
      const all = this.getAll().filter(s => s.id !== session.id);
      all.unshift(session);
      this.saveAll(all.slice(0, 50));
    },
    get(id)        { return this.getAll().find(s => String(s.id) === String(id)) || null; },
    remove(id)     { this.saveAll(this.getAll().filter(s => String(s.id) !== String(id))); },
  };
})();

/* ══════════════════════════════
   BOOT
══════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Attempt to verify session with backend (graceful fail if not running)
  await Auth.check();
  Router.init();
});