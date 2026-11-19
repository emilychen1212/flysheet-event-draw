/**
 * 前台抽獎頁
 *   /play/?event=活動代碼               抽獎頁
 *   /play/?event=活動代碼&view=screen   展示頁（第 5 階段）
 * 流程：〔登記〕→ 遊戲 → 結果 →（攤位）下一位／（自助）再抽一次
 * 中獎結果只來自後端 public.draw，前端只負責演出。
 */
import { api } from '../assets/js/api.js';
import { sfx, setMuted, isMuted, unlock } from './sound.js';

const params = new URLSearchParams(location.search);
const CODE = (params.get('event') || '').trim().toUpperCase();
const VIEW = params.get('view') || '';
const root = document.getElementById('app');

const S = {
  data: null,        // public.getEvent 的結果
  ev: null,
  game: null,        // 遊戲模組
  ticket: '',        // 先登記再抽：抽獎券
  remainingToday: 0,
  participantId: '',
  lastReg: null,     // 最近一次登記資料（推廣頁帶入用）
  playing: false     // 遊戲進行中（離開頁面要提醒）
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));

window.addEventListener('beforeunload', (e) => {
  if (S.playing) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- 圖示 ---------- */
const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>';

/* ---------- 外框 ---------- */
function renderShell() {
  const ev = S.ev;
  document.title = `${ev.title}｜飛資得`;
  root.className = 'play ' + (ev.drawMode === 'booth' ? 'booth' : 'self');
  root.innerHTML = `
    <header class="p-head">
      <span class="brand-logo"><span class="mark">F</span><span class="name">飛資得</span></span>
      ${ev.clientDisplayName ? `<span class="client">${esc(ev.clientDisplayName)}</span>` : ''}
      <div class="tools">
        ${ev.isTestMode ? '<span class="p-test">測試中</span>' : ''}
        <button class="p-mute" id="mute" aria-label="切換音效"></button>
      </div>
    </header>
    <section class="p-hero">
      <h1>${esc(ev.title)}</h1>
      ${ev.subtitle ? `<p>${esc(ev.subtitle)}</p>` : ''}
    </section>
    <main class="p-stage" id="stage"></main>
    <footer class="p-foot">飛資得醫學資訊 Flysheet Medical Information</footer>`;
  setMuted(ev.soundDefault === 'off');
  const btn = $('#mute');
  const paint = () => { btn.innerHTML = isMuted() ? ICON_MUTE : ICON_SOUND; btn.setAttribute('aria-pressed', String(isMuted())); };
  paint();
  btn.onclick = () => { setMuted(!isMuted()); paint(); if (!isMuted()) { unlock(); sfx.click(); } };
}

function stage() { return $('#stage'); }

/* ---------- 單純訊息畫面 ---------- */
function bareMessage(icon, title, text) {
  root.className = 'play';
  root.innerHTML = `<header class="p-head"><span class="brand-logo"><span class="mark">F</span><span class="name">飛資得</span></span></header>
    <main class="p-stage" style="justify-content:center"><div class="panel p-msg"><div class="big">${icon}</div><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}</div></main>
    <footer class="p-foot">飛資得醫學資訊 Flysheet Medical Information</footer>`;
}

const STATE_VIEW = {
  draft: ['🛠️', '活動尚未開放', '請稍後再來，或洽現場工作人員'],
  notStarted: ['⏰', '活動尚未開始', ''],
  ended: ['🎐', '活動已結束', '感謝您的參與！'],
  soldOut: ['🎁', '獎品已全數送出', '感謝參與！']
};

function showState(state, message) {
  const [icon, title, text] = STATE_VIEW[state] || ['🙇', message || '目前無法抽獎', ''];
  let extra = text;
  if (state === 'notStarted' && S.ev && S.ev.startAt) extra = `開始時間：${S.ev.startAt.slice(0, 16).replace(/-/g, '/')}`;
  stage().innerHTML = `<div class="panel p-msg"><div class="big">${icon}</div><h2>${esc(title)}</h2>${extra ? `<p>${esc(extra)}</p>` : ''}</div>`;
}

function showLimit(message) {
  S.ticket = '';
  stage().innerHTML = `<div class="panel p-msg"><div class="big">🌙</div><h2>${esc(message || '今天的抽獎次數已用完，明天再來試試手氣！')}</h2>
    ${S.ev.drawMode === 'booth' ? '<div style="margin-top:18px"><button class="p-btn navy" id="next">下一位</button></div>' : ''}</div>`;
  $('#next')?.addEventListener('click', nextPerson);
}

/* ---------- 登記表 ---------- */
const FIELD_DEF = {
  name: { label: '姓名', type: 'text', auto: 'name', max: 50 },
  email: { label: 'Email', type: 'email', auto: 'email', mode: 'email', max: 200 },
  phone: { label: '手機', type: 'tel', auto: 'tel', mode: 'numeric', max: 20, ph: '09xxxxxxxx' },
  organization: { label: '服務單位', type: 'text', auto: 'organization', max: 100, ph: '例：臺大醫院 內科部' }
};

function regFormHtml({ claim }) {
  const rf = S.ev.regFields || { fields: {}, custom: [] };
  const f = rf.fields || {};
  const field = (k) => {
    const st = f[k] || 'optional';
    if (st === 'hidden') return '';
    const d = FIELD_DEF[k];
    return `<div class="p-field"><label for="r_${k}">${d.label}${st === 'required' ? '<span class="req">*</span>' : ''}</label>
      <input class="p-input" id="r_${k}" name="${k}" type="${d.type}" autocomplete="${d.auto}" ${d.mode ? `inputmode="${d.mode}"` : ''}
        maxlength="${d.max}" ${d.ph ? `placeholder="${d.ph}"` : ''} ${st === 'required' ? 'required' : ''}></div>`;
  };
  const identity = () => {
    const st = f.identity || 'optional';
    if (st === 'hidden') return '';
    return `<div class="p-field"><span class="lbl">身分${st === 'required' ? '<span class="req">*</span>' : ''}</span>
      <div class="chips" role="radiogroup">${S.data.identities.map((x) => `<label class="chip"><input type="radio" name="identity" value="${esc(x)}"><span>${esc(x)}</span></label>`).join('')}</div>
      <input class="p-input" name="identityOther" maxlength="50" placeholder="請說明您的身分（選填）" hidden></div>`;
  };
  const custom = (rf.custom || []).map((q) => {
    const req = q.required ? '<span class="req">*</span>' : '';
    if (q.type === 'text') return `<div class="p-field"><label for="q_${esc(q.id)}">${esc(q.label)}${req}</label><input class="p-input" id="q_${esc(q.id)}" data-q="${esc(q.id)}" maxlength="500"></div>`;
    const t = q.type === 'multi' ? 'checkbox' : 'radio';
    return `<div class="p-field"><span class="lbl">${esc(q.label)}${req}${q.type === 'multi' ? '<span class="muted" style="font-weight:400;font-size:12.5px">（可複選）</span>' : ''}</span>
      <div class="chips">${q.options.map((o) => `<label class="chip"><input type="${t}" name="q_${esc(q.id)}" data-q="${esc(q.id)}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div></div>`;
  }).join('');
  return `<form class="p-form" id="regForm" novalidate>
      ${field('name')}${field('email')}${field('phone')}${field('organization')}${identity()}${custom}
      <div class="p-privacy">
        <details><summary>個人資料蒐集告知聲明（點此展開）</summary><div class="full">${esc(S.data.privacyText)}</div></details>
        <label class="p-check"><input type="checkbox" name="privacyConsent"><span>我已閱讀並同意上述個人資料蒐集告知聲明<span class="req" style="color:var(--orange-600)">*</span></span></label>
        <label class="p-check"><input type="checkbox" name="wantsProductInfo"><span>我想接收產品資訊（選填）</span></label>
      </div>
      <div id="regErr"></div>
      <button class="p-btn" type="submit" id="regSubmit">${claim ? '送出領獎資料' : '完成登記，開始抽獎'}</button>
    </form>`;
}

function readForm(form) {
  const rf = S.ev.regFields || { fields: {}, custom: [] };
  const v = (n) => (form.elements[n] ? form.elements[n].value.trim() : '');
  const out = {
    name: v('name'), email: v('email'), phone: v('phone'), organization: v('organization'),
    identity: (form.querySelector('input[name=identity]:checked') || {}).value || '',
    identityOther: v('identityOther'),
    privacyConsent: form.elements.privacyConsent.checked,
    wantsProductInfo: form.elements.wantsProductInfo.checked,
    customAnswers: {}
  };
  (rf.custom || []).forEach((q) => {
    if (q.type === 'text') out.customAnswers[q.id] = (form.querySelector(`[data-q="${q.id}"]`) || {}).value || '';
    else if (q.type === 'single') out.customAnswers[q.id] = (form.querySelector(`input[data-q="${q.id}"]:checked`) || {}).value || '';
    else out.customAnswers[q.id] = Array.from(form.querySelectorAll(`input[data-q="${q.id}"]:checked`)).map((i) => i.value);
  });
  return out;
}

/** 前端先檢查一次（後端還會再檢查） */
function checkForm(d) {
  const rf = S.ev.regFields || { fields: {}, custom: [] };
  const f = rf.fields || {};
  const labels = { name: '姓名', email: 'Email', phone: '手機', organization: '服務單位', identity: '身分' };
  for (const k of Object.keys(labels)) if (f[k] === 'required' && !d[k]) return [`請填寫「${labels[k]}」`, k];
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return ['Email 格式不正確', 'email'];
  if (d.phone && d.phone.replace(/\D/g, '').length < 8) return ['手機號碼格式不正確', 'phone'];
  if (S.ev.regMode === 'after' && !d.email && !d.phone) return ['請至少留下 Email 或手機，方便通知領獎', f.email !== 'hidden' ? 'email' : 'phone'];
  for (const q of rf.custom || []) {
    const a = d.customAnswers[q.id];
    if (q.required && (!a || (Array.isArray(a) && !a.length))) return [`請回答「${q.label}」`];
  }
  if (!d.privacyConsent) return ['請先勾選同意個人資料蒐集聲明', 'privacyConsent'];
  return null;
}

function bindForm(form, onSubmit) {
  form.addEventListener('change', (e) => {
    if (e.target.name === 'identity') {
      const other = form.elements.identityOther;
      if (other) other.hidden = e.target.value !== '其他';
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    unlock();
    const errBox = $('#regErr', form);
    errBox.innerHTML = '';
    form.querySelectorAll('.bad').forEach((x) => x.classList.remove('bad'));
    const d = readForm(form);
    const bad = checkForm(d);
    if (bad) {
      errBox.innerHTML = `<div class="p-err">${esc(bad[0])}</div>`;
      const el = bad[1] && form.elements[bad[1]];
      if (el && el.classList) { el.classList.add('bad'); if (el.focus) el.focus(); }
      return;
    }
    const btn = $('#regSubmit', form);
    btn.classList.add('busy');
    try {
      await onSubmit(d);
    } catch (err) {
      errBox.innerHTML = `<div class="p-err">${esc(err.message)}</div>`;
      if (/^STATE_/.test(err.code)) setTimeout(() => showState(stateFromCode(err.code), err.message), 1200);
    } finally {
      btn.classList.remove('busy');
    }
  });
}

function showRegister() {
  stage().innerHTML = `<div class="panel"><h2>先登記，再抽獎 ✍️</h2>
    <p class="lead">填寫基本資料就能參加抽獎${S.ev.dailyLimit > 1 ? `，每人每天可以抽 ${S.ev.dailyLimit} 次` : ''}。</p>${regFormHtml({ claim: false })}</div>`;
  const form = $('#regForm');
  bindForm(form, async (d) => {
    const r = await api('public.register', { ...d, eventCode: CODE });
    S.participantId = r.participantId;
    S.lastReg = d;
    if (r.limitReached) return showLimit(r.message);
    S.ticket = r.ticket;
    S.remainingToday = r.remainingToday;
    showGame();
  });
  window.scrollTo({ top: 0 });
}

/* ---------- 遊戲 ---------- */
async function loadGame() {
  const type = S.ev.gameType;
  try {
    return await import(`./games/${type}.js`);
  } catch (e) {
    console.warn('遊戲模組載入失敗，改用轉盤：', type, e);
    return import('./games/wheel.js');
  }
}

async function showGame() {
  stage().innerHTML = `<div class="game-area"><div id="game" style="width:100%;display:flex;justify-content:center"></div><div id="controls" style="width:100%;display:flex;flex-direction:column;align-items:center;gap:10px"></div></div>`;
  if (S.game && S.game.destroy) S.game.destroy();
  S.game = await loadGame();
  S.game.init($('#game'), S.data.prizes, { drawMode: S.ev.drawMode });
  showStartButton();
}

function showStartButton(errorMsg) {
  const left = S.ev.regMode === 'before' ? `<div class="left">今天還可以抽 ${S.remainingToday} 次</div>` : '';
  $('#controls').innerHTML = `${errorMsg ? `<div class="p-err" style="max-width:420px;width:100%">${esc(errorMsg)}</div>` : ''}
    <button class="p-btn p-start" id="start">${errorMsg ? '再試一次' : '開始抽獎！'}</button>${left}`;
  $('#start').addEventListener('click', doDraw);
}

async function doDraw() {
  const btn = $('#start');
  unlock();
  btn.classList.add('busy');
  btn.textContent = '抽獎中';
  S.playing = true;
  if (S.game.start) S.game.start();
  let res;
  try {
    res = await api('public.draw', { eventCode: CODE, ticket: S.ticket, deviceType: isMobile() ? 'mobile' : 'desktop' });
  } catch (err) {
    S.playing = false;
    if (S.game.cancel) S.game.cancel();
    if (err.code === 'NEED_REGISTER') return showRegister();
    if (/^STATE_/.test(err.code)) return showState(stateFromCode(err.code), err.message);
    return showStartButton('抽獎失敗：' + err.message);
  }
  if (res.limitReached) {
    S.playing = false;
    if (S.game.cancel) S.game.cancel();
    return showLimit(res.message);
  }
  $('#controls').innerHTML = '<div class="left">🎶</div>';
  await S.game.play(res.prize);
  S.playing = false;
  if (res.prize.isLose) sfx.lose();
  else if (res.prize.isSpecial) sfx.bigWin();
  else sfx.win();
  if (S.ev.regMode === 'before') {
    S.ticket = res.nextTicket || '';
    S.remainingToday = res.remainingToday || 0;
  }
  showResult(res);
}

function stateFromCode(code) {
  return { STATE_DRAFT: 'draft', STATE_NOTSTARTED: 'notStarted', STATE_ENDED: 'ended', STATE_SOLDOUT: 'soldOut' }[code] || '';
}

/* ---------- 結果 ---------- */
function showResult(res) {
  const p = res.prize;
  const ev = S.ev;
  const booth = ev.drawMode === 'booth';
  let kicker = p.isLose ? '' : p.isSpecial ? '✨ 特別獎 ✨' : '恭喜中獎';
  let note = p.isLose ? '別灰心，謝謝你的參與！' : booth ? '請向工作人員領取獎品' : '請出示此畫面向工作人員領獎';
  let actions = '';
  if (booth) {
    actions = '<button class="p-btn navy" id="next">下一位</button>';
  } else if (ev.regMode === 'before') {
    actions = S.ticket ? `<button class="p-btn" id="again">再抽一次（今天還有 ${S.remainingToday} 次）</button>` : '<div class="muted small" style="color:var(--text-muted);font-size:14px">今天的抽獎次數已用完，明天再來試試手氣！</div>';
  }
  const claimForm = ev.regMode === 'after' && !p.isLose && res.claimToken;
  const box = $('#controls');
  box.innerHTML = `<div class="panel p-result ${p.isLose ? 'lose' : ''}">
    ${kicker ? `<div class="kicker">${kicker}</div>` : ''}
    <div class="prize">${esc(p.isLose ? p.name || '銘謝惠顧' : p.name)}</div>
    <p class="note">${claimForm ? '請填寫以下資料，方便我們通知領獎' : note}</p>
    ${claimForm ? `<div style="text-align:left">${regFormHtml({ claim: true })}</div>` : `<div class="actions">${actions}</div>`}
  </div>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#next')?.addEventListener('click', nextPerson);
  $('#again')?.addEventListener('click', () => { if (S.game.reset) S.game.reset(); showStartButton(); });

  if (claimForm) {
    S.playing = true; // 還沒填完領獎資料，離開前提醒
    bindForm($('#regForm', box), async (d) => {
      const r = await api('public.register', { ...d, eventCode: CODE, claimToken: res.claimToken });
      S.playing = false;
      S.participantId = r.participantId;
      S.lastReg = d;
      box.querySelector('.p-result').innerHTML = `<div class="kicker">已完成登記</div><div class="prize">${esc(p.name)}</div>
        <p class="note">${booth ? '請向工作人員領取獎品' : '請出示此畫面向工作人員領獎'}</p>
        <div class="actions">${booth ? '<button class="p-btn navy" id="next">下一位</button>' : ''}</div>`;
      $('#next')?.addEventListener('click', nextPerson);
    });
  }
}

function nextPerson() {
  sfx.click();
  S.ticket = '';
  S.participantId = '';
  S.lastReg = null;
  S.playing = false;
  if (S.ev.regMode === 'before') return showRegister();
  if (S.game && S.game.reset) S.game.reset();
  if ($('#controls')) showStartButton(); else showGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 啟動 ---------- */
(async function boot() {
  if (!CODE) return bareMessage('🔗', '網址缺少活動代碼', '請重新掃描 QR code');
  try {
    S.data = await api('public.getEvent', { eventCode: CODE });
  } catch (e) {
    if (e.code === 'NOT_FOUND') return bareMessage('🔍', '找不到這個活動', '請確認網址或重新掃描 QR code');
    return bareMessage('📡', '連線失敗', e.message + '　請重新整理頁面再試一次');
  }
  S.ev = S.data.event;
  renderShell();
  if (VIEW === 'screen') {
    stage().innerHTML = '<div class="panel p-msg"><div class="big">📺</div><h2>展示頁建置中</h2><p>攤位大螢幕的展示頁會在第 5 階段完成</p></div>';
    return;
  }
  if (S.data.state !== 'open') return showState(S.data.state, S.data.stateMessage);
  if (S.ev.regMode === 'before') showRegister();
  else showGame();
})();
