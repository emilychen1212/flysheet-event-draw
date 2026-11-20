/** 後台主程式：登入、版面、路由 */
import { api, cachedApi, login, logout, getToken, savedUser, saveUser } from '../../assets/js/api.js';
import { $, esc, toastErr, loadingHtml, ICON } from './ui.js';

const cfg = window.APP_CONFIG || {};
const root = document.getElementById('root');

export const app = {
  user: null,
  dirty: false,
  _settings: null,
  /** 系統設定（預設登記欄位、身分選項、個資聲明），同一次開頁只讀一次 */
  async settings(force) {
    if (!this._settings || force) this._settings = await (force ? api('settings.get') : cachedApi('settings.get', {}, 600000));
    return this._settings;
  },
  isAdmin() { return this.user && this.user.role === 'admin'; },
  go(hash) { location.hash = hash; }
};

/* ---------- 路由 ---------- */
const ROUTES = [
  [/^\/?$/, 'dashboard', 'home'],
  [/^\/events$/, 'events', 'event'],
  [/^\/events\/new$/, 'event-edit', 'event'],
  [/^\/events\/([\w]+)$/, 'event-edit', 'event'],
  [/^\/clients$/, 'clients', 'client'],
  [/^\/clients\/([\w]+)$/, 'client-detail', 'client'],
  [/^\/users$/, 'users', 'users', true],
  [/^\/settings$/, 'settings', 'settings', true]
];

let lastHash = location.hash;
let ignoreNext = false;
let cleanup = null;

async function route() {
  if (!app.user) return;
  if (ignoreNext) { ignoreNext = false; return; }
  if (app.dirty && location.hash !== lastHash) {
    if (!window.confirm('有尚未儲存的變更，確定要離開嗎？')) {
      ignoreNext = true;
      location.hash = lastHash;
      return;
    }
    app.dirty = false;
  }
  lastHash = location.hash;
  const [rawPath, qs] = location.hash.replace(/^#/, '').split('?');
  const path = decodeURIComponent(rawPath) || '/';
  app.query = new URLSearchParams(qs || '');
  const found = ROUTES.map((r) => [r, path.match(r[0])]).find((x) => x[1]);
  // 每次換頁都換一個新的容器，避免上一頁綁的事件留下來
  const old = $('#view');
  const main = old.cloneNode(false);
  old.replaceWith(main);
  document.querySelector('.app')?.classList.remove('nav-open');
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  if (!found) { main.innerHTML = '<div class="empty"><h3>找不到這個頁面</h3><p><a href="#/">回到總覽</a></p></div>'; return; }
  const [[, view, nav, adminOnly], m] = found;
  setActiveNav(nav);
  if (adminOnly && !app.isAdmin()) { main.innerHTML = '<div class="empty"><h3>此頁面僅限管理者</h3></div>'; return; }
  main.innerHTML = loadingHtml();
  window.scrollTo(0, 0);
  try {
    const mod = await import(`./views/${view}.js`);
    const r = await mod.render(main, m.slice(1), app);
    if (typeof r === 'function') cleanup = r;
  } catch (e) {
    if (e.code === 'AUTH') return showLogin(e.message);
    main.innerHTML = `<div class="empty"><h3>載入失敗</h3><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">重新整理</button></div>`;
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => {
  if (app.dirty) { e.preventDefault(); e.returnValue = ''; }
});

function setActiveNav(key) {
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
}

/* ---------- 版面 ---------- */
function renderShell() {
  const u = app.user;
  root.innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <a class="brand-logo" href="#/"><span class="mark">F</span><span class="name">飛資得<small>Event Draw</small></span></a>
      <nav class="nav">
        <a href="#/" data-nav="home">${ICON.home}總覽</a>
        <a href="#/events" data-nav="event">${ICON.event}專案活動</a>
        <a href="#/clients" data-nav="client">${ICON.client}客戶</a>
        ${app.isAdmin() ? `<div class="nav-label">管理者</div>
        <a href="#/users" data-nav="users">${ICON.users}使用者管理</a>
        <a href="#/settings" data-nav="settings">${ICON.settings}系統設定</a>` : ''}
      </nav>
      <div class="me">
        <div class="who">${esc(u.name || '使用者')} <span class="badge ${u.role === 'admin' ? 'orange' : 'navy'}" style="margin-left:4px">${u.role === 'admin' ? '管理者' : '業務'}</span></div>
        <div class="mail">${esc(u.email)}</div>
        <button class="btn sm on-dark" id="btnLogout">${ICON.logout}登出</button>
      </div>
    </aside>
    <div>
      <div class="topbar">
        <button class="btn icon on-dark" id="btnMenu" aria-label="選單">${ICON.menu}</button>
        <a class="brand-logo" href="#/"><span class="mark">F</span><span class="name">飛資得</span></a>
      </div>
      <main class="main" id="view"></main>
    </div>
  </div>`;
  $('#btnLogout').onclick = async () => {
    if (app.dirty && !window.confirm('有尚未儲存的變更，確定要登出嗎？')) return;
    app.dirty = false;
    await logout();
    app.user = null;
    showLogin();
  };
  $('#btnMenu').onclick = () => $('.app').classList.toggle('nav-open');
  $('.app').addEventListener('click', (e) => {
    if (e.target === $('.app') ) $('.app').classList.remove('nav-open');
  });
}

/* ---------- 登入 ---------- */
const ART_LOGIN = `<svg class="art" viewBox="0 0 420 320" fill="none" aria-hidden="true">
  <circle cx="250" cy="170" r="120" fill="#24376a"/>
  <g transform="translate(250 170)">
    ${Array.from({ length: 8 }, (_, i) => `<path d="M0 0L${(Math.cos((i * 45 - 90) * Math.PI / 180) * 96).toFixed(1)} ${(Math.sin((i * 45 - 90) * Math.PI / 180) * 96).toFixed(1)}A96 96 0 0 1 ${(Math.cos(((i + 1) * 45 - 90) * Math.PI / 180) * 96).toFixed(1)} ${(Math.sin(((i + 1) * 45 - 90) * Math.PI / 180) * 96).toFixed(1)}Z" fill="${['#f27a2b', '#fde9da', '#f8b07c', '#ffffff'][i % 4]}" stroke="#1b2a52" stroke-width="3"/>`).join('')}
    <circle r="16" fill="#1b2a52" stroke="#fff" stroke-width="4"/>
  </g>
  <path d="M250 40l-12 -22h24z" fill="#f27a2b" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="90" cy="80" r="6" fill="#f8b07c"/><circle cx="380" cy="60" r="4" fill="#fff" opacity=".6"/>
  <circle cx="120" cy="250" r="9" fill="#f27a2b"/><rect x="60" y="150" width="14" height="14" rx="3" fill="#fff" opacity=".5" transform="rotate(20 67 157)"/>
</svg>`;

function showLogin(message) {
  root.innerHTML = `
  <div class="login-page">
    <section class="login-art">
      <a class="brand-logo"><span class="mark">F</span><span class="name">飛資得醫學資訊<small>Event Draw</small></span></a>
      <div>
        <h1>擺攤抽獎，<br><em>一次管好</em>。</h1>
        <p>建立客戶與活動、設定獎池，現場掃 QR code 抽獎，結束後自動產出成果報表。</p>
      </div>
      ${ART_LOGIN}
    </section>
    <section class="login-box">
      <div class="inner">
        <h2>登入後台</h2>
        <p class="muted small" style="margin:0">請使用已開通的 Google 帳號登入</p>
        <div class="gsi" id="gsi"></div>
        <div id="loginMsg" class="small"></div>
      </div>
    </section>
  </div>`;
  const msg = $('#loginMsg');
  const setMsg = (t, bad) => { msg.innerHTML = t ? `<div class="notice ${bad ? 'danger' : ''}">${esc(t)}</div>` : ''; };
  if (message) setMsg(message, true);

  const onCredential = async (cred) => {
    setMsg('登入中…');
    try {
      app.user = await login(cred);
      start();
    } catch (e) { setMsg(e.message, true); }
  };

  if (cfg.DEV) {
    $('#gsi').innerHTML = `<div class="field"><label>本機測試登入（DEV）</label>
      <div style="display:flex;gap:8px"><input class="input" id="devEmail" value="admin@example.com"><button class="btn primary" id="devLogin">登入</button></div>
      <div class="hint">sales@example.com 是業務帳號</div></div>`;
    $('#devLogin').onclick = () => onCredential('dev:' + $('#devEmail').value.trim());
    return;
  }
  if (!cfg.GOOGLE_CLIENT_ID) { setMsg('尚未設定 GOOGLE_CLIENT_ID（config.js）', true); return; }
  const init = () => {
    if (!window.google || !google.accounts) return setTimeout(init, 150);
    google.accounts.id.initialize({ client_id: cfg.GOOGLE_CLIENT_ID, callback: (r) => onCredential(r.credential) });
    google.accounts.id.renderButton($('#gsi'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'zh-TW', width: 300 });
  };
  init();
}

/* ---------- 啟動 ---------- */
function start() {
  renderShell();
  lastHash = location.hash;
  route();
  // 背景先把常用資料載進來，切換頁面時就不用再等
  cachedApi('events.list').catch(() => {});
  cachedApi('clients.list').catch(() => {});
  app.settings().catch(() => {});
}

(async function boot() {
  if (!getToken()) return showLogin();
  const remembered = savedUser();
  if (remembered) {
    // 先用記住的登入者直接進後台，同時在背景確認登入是否還有效
    app.user = remembered;
    start();
    api('auth.me').then((u) => {
      saveUser(u);
      const changed = u.role !== app.user.role || u.name !== app.user.name;
      app.user = u;
      if (changed) start();
    }).catch((e) => { if (e.code === 'AUTH') { app.user = null; showLogin('登入已逾時，請重新登入'); } });
    return;
  }
  root.innerHTML = loadingHtml('確認登入狀態');
  try {
    app.user = await api('auth.me');
    saveUser(app.user);
    start();
  } catch (e) {
    showLogin(e.code === 'AUTH' ? '' : e.message);
  }
})();

window.addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.name === 'ApiError') toastErr(e.reason); });
