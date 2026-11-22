/** 後台共用小元件 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** HTML 跳脫：所有使用者資料放進 innerHTML 前都要經過這裡 */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 提示訊息 ---------- */
let toastBox;
export function toast(msg, type = 'ok', ms = 3200) {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('role', 'status');
    document.body.appendChild(toastBox);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  toastBox.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, type === 'err' ? Math.max(ms, 5000) : ms);
}
export const toastErr = (e) => toast(e && e.message ? e.message : String(e), 'err');

/* ---------- 對話框 ---------- */
/**
 * modal({ title, body: html字串, actions: [{label, kind, value, onClick}] })
 * onClick 回傳 false 不關閉；可回傳 Promise（期間按鈕會轉圈）。回傳 Promise<被按下的 value>
 */
export function modal({ title, body = '', actions = [{ label: '確定', kind: 'primary', value: true }], onOpen, width }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${width ? `style="width:min(${width}px,100%)"` : ''}>
      <h2>${esc(title)}</h2><div class="body">${body}</div><div class="foot"></div></div>`;
    const foot = $('.foot', back);
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.kind || '');
      b.textContent = a.label;
      b.onclick = async () => {
        if (!a.onClick) return close(a.value);
        b.classList.add('busy');
        try {
          const r = await a.onClick(back);
          if (r !== false) close(a.value === undefined ? r : a.value);
        } catch (e) { toastErr(e); } finally { b.classList.remove('busy'); }
      };
      foot.appendChild(b);
    });
    const onKey = (e) => { if (e.key === 'Escape') close(undefined); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(undefined); });
    document.body.appendChild(back);
    if (onOpen) onOpen(back);
    const first = $('input, select, textarea', back);
    if (first) first.focus();
  });
}

export function confirmBox(message, { title = '請確認', ok = '確定', danger = false } = {}) {
  return modal({
    title,
    body: `<p style="margin:0">${esc(message)}</p>`,
    actions: [{ label: '取消', kind: 'ghost', value: false }, { label: ok, kind: danger ? 'danger' : 'primary', value: true }]
  }).then((v) => v === true);
}

/* ---------- 按鈕忙碌狀態 ---------- */
export async function busy(btn, fn) {
  if (!btn || btn.classList.contains('busy')) return;
  btn.classList.add('busy');
  try { return await fn(); } finally { btn.classList.remove('busy'); }
}

/* ---------- 格式化 ---------- */
export function fmtDate(s) { return s ? s.slice(0, 10).replace(/-/g, '/') : ''; }
export function fmtDateTime(s) { return s ? s.slice(0, 16).replace(/-/g, '/') : ''; }
export function fmtRange(a, b) {
  if (!a) return '';
  const d1 = a.slice(0, 10), d2 = (b || '').slice(0, 10);
  if (d1 === d2) return `${fmtDate(a)} ${a.slice(11, 16)}–${b.slice(11, 16)}`;
  return `${fmtDateTime(a)} – ${fmtDateTime(b)}`;
}
/** 'yyyy-MM-dd HH:mm:ss' → datetime-local 用的 'yyyy-MM-ddTHH:mm' */
export function toLocalInput(s) { return s ? s.slice(0, 16).replace(' ', 'T') : ''; }

export const ROLES = {
  admin: { label: '管理者', cls: 'orange' },
  pm: { label: 'PM', cls: 'green' },
  sales: { label: '業務', cls: 'navy' }
};
export const roleBadge = (r) => `<span class="badge ${(ROLES[r] || ROLES.sales).cls}">${(ROLES[r] || ROLES.sales).label}</span>`;

export const STATUS = {
  draft: { label: '草稿', cls: '' },
  active: { label: '進行中', cls: 'green' },
  ended: { label: '已結束', cls: 'navy' }
};
export const STATE = {
  draft: { label: '尚未開放', cls: '' },
  notStarted: { label: '尚未開始', cls: 'yellow' },
  open: { label: '開放抽獎中', cls: 'green' },
  ended: { label: '已結束', cls: 'navy' },
  soldOut: { label: '獎品已抽完', cls: 'orange' }
};
export const GAMES = {
  wheel: { label: '抽抽樂', ico: '🎪', theme: '醫學古早味風', desc: '燈泡圓盤、醫師護理師歡呼，獎項卡片跑燈停在結果' },
  scratch: { label: '刮刮樂', ico: '🎫', theme: '台灣古早復古風', desc: '柑仔店懷舊彩券，手指刮開塗層' },
  slot: { label: '拉霸機', ico: '🎰', theme: '華麗賭場風', desc: '黑金配色、跑馬燈，三軸依序停輪' },
  gacha: { label: '彩球機', ico: '🔮', theme: '飛資得扁平可愛風', desc: '彩球彈跳、轉把手，滾出一顆揭曉' }
};
export const DRAW_MODES = {
  booth: { label: '攤位操作', desc: '工作人員用筆電或平板，參與者輪流在攤位抽' },
  self: { label: '自助掃碼', desc: '參與者用自己的手機掃 QR code 抽' }
};
export const REG_MODES = {
  none: { label: '不登記', desc: '直接玩遊戲，由現場人員控管次數' },
  before: { label: '先登記再抽', desc: '填完資料才能抽，可限制每人每日次數' },
  after: { label: '中獎後登記', desc: '先抽，抽中獎品才填聯絡資料' }
};

export function badge(map, key) {
  const m = map[key] || { label: key, cls: '' };
  return `<span class="badge dot ${m.cls}">${esc(m.label)}</span>`;
}

/* ---------- 讀取中、空狀態 ---------- */
export const loadingHtml = (text = '載入中') =>
  `<div class="loading"><div class="dots"><i></i><i></i><i></i></div><div>${esc(text)}…</div></div>`;

/** 攤位帳篷小插圖 */
export const ART_BOOTH = `<svg viewBox="0 0 160 120" fill="none" aria-hidden="true">
  <ellipse cx="80" cy="110" rx="62" ry="6" fill="#efe9df"/>
  <rect x="30" y="52" width="100" height="56" rx="6" fill="#fff" stroke="#1b2a52" stroke-width="2.5"/>
  <path d="M22 52h116l-10-28H32z" fill="#f27a2b" stroke="#1b2a52" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M41 24l-5 28M60 24l-2 28M80 24v28M100 24l2 28M119 24l5 28" stroke="#1b2a52" stroke-width="2"/>
  <path d="M22 52c4 8 14 8 18 0 4 8 14 8 19 0 4 8 15 8 19 0 5 8 15 8 19 0 4 8 15 8 19 0 5 8 14 8 18 0" fill="#fff" stroke="#1b2a52" stroke-width="2.5" stroke-linejoin="round"/>
  <rect x="44" y="74" width="32" height="34" rx="3" fill="#e4e9f5" stroke="#1b2a52" stroke-width="2"/>
  <circle cx="104" cy="86" r="12" fill="#fde9da" stroke="#1b2a52" stroke-width="2"/>
  <path d="M104 78v8l5 4" stroke="#1b2a52" stroke-width="2" stroke-linecap="round"/>
  <path d="M80 8l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#f8b07c" stroke="#1b2a52" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

/** 名片／客戶小插圖 */
export const ART_CLIENT = `<svg viewBox="0 0 160 120" fill="none" aria-hidden="true">
  <ellipse cx="80" cy="110" rx="60" ry="6" fill="#efe9df"/>
  <path d="M40 104V44l40-22 40 22v60" fill="#fff" stroke="#1b2a52" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M30 48l50-28 50 28" stroke="#1b2a52" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="70" y="76" width="20" height="28" rx="2" fill="#f27a2b" stroke="#1b2a52" stroke-width="2"/>
  <rect x="50" y="56" width="14" height="12" rx="2" fill="#e4e9f5" stroke="#1b2a52" stroke-width="2"/>
  <rect x="96" y="56" width="14" height="12" rx="2" fill="#e4e9f5" stroke="#1b2a52" stroke-width="2"/>
  <path d="M74 44h12M80 38v12" stroke="#f27a2b" stroke-width="3" stroke-linecap="round"/>
</svg>`;

export function emptyHtml({ art = ART_BOOTH, title, text = '', action = '' }) {
  return `<div class="empty">${art}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

/* ---------- 圖示 ---------- */
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  home: I('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  event: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="12" cy="15.5" r="2"/>'),
  client: I('<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/>'),
  settings: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  task: I('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8l2 2 4-4M8 15h8"/>'),
  chart: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  lead: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  copy: I('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  link: I('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  external: I('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  download: I('<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>'),
  menu: I('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  logout: I('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4"/>'),
  qr: I('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-4M14 18v3"/>')
};
