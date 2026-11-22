/**
 * 展示頁（攤位大螢幕）：/play/?event=代碼&view=screen
 * 大 QR code（連到抽獎頁）＋活動標題、客戶名＋各獎項剩餘數量，每 30 秒自動更新。
 */
import { api } from '../assets/js/api.js';

const REFRESH_MS = 30000;
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATE_TEXT = { draft: '活動尚未開放', notStarted: '活動尚未開始', ended: '活動已結束，感謝參與！', soldOut: '獎品已全數送出，感謝參與！' };

function loadQrLib() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = QR_LIB;
    s.onload = resolve;
    s.onerror = () => reject(new Error('QR code 元件載入失敗'));
    document.head.appendChild(s);
  });
}

function drawQr(canvas, text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const margin = 2;
  const size = 1000;
  const cell = Math.floor(size / (n + margin * 2));
  const off = Math.floor((size - cell * n) / 2);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#14203f';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
}

function injectCss() {
  const s = document.createElement('style');
  s.textContent = `
  .scr { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-rows: auto 1fr auto; color: #fff;
    background: radial-gradient(1200px 600px at 80% -10%, rgba(242,122,43,.22), transparent 70%), var(--navy-800); }
  .scr-top { display: flex; align-items: center; gap: 16px; padding: 18px 32px; }
  .scr-top .client { font-size: clamp(14px, 1.4vw, 20px); opacity: .85; padding-left: 16px; border-left: 1px solid rgba(255,255,255,.25); }
  .scr-top .right { margin-left: auto; display: flex; gap: 12px; align-items: center; font-variant-numeric: tabular-nums; opacity: .8; font-size: clamp(13px, 1.2vw, 18px); }
  .scr-main { display: grid; grid-template-columns: minmax(280px, 40%) 1fr; gap: clamp(20px, 4vw, 64px); align-items: center; padding: 8px clamp(20px, 4vw, 64px) 24px; }
  .scr-qr { background: #fff; color: var(--navy-800); border-radius: 28px; padding: clamp(16px, 2vw, 28px); text-align: center; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
  .scr-qr canvas { width: 100%; height: auto; display: block; image-rendering: pixelated; border-radius: 8px; }
  .scr-qr .scan { margin-top: 14px; font: 900 clamp(20px, 2.6vw, 38px)/1.2 var(--font-sans); letter-spacing: .06em; }
  .scr-qr .scan em { font-style: normal; color: var(--orange-600); }
  .scr-qr .url { margin-top: 6px; font: 500 clamp(11px, .95vw, 14px)/1.4 var(--font-mono); color: var(--text-muted); word-break: break-all; }
  .scr-info h1 { margin: 0; font-size: clamp(30px, 4.4vw, 72px); line-height: 1.15; letter-spacing: .03em; }
  .scr-info .sub { margin: 12px 0 0; font-size: clamp(16px, 1.8vw, 26px); opacity: .8; }
  .scr-state { display: inline-block; margin-top: 20px; padding: 8px 18px; border-radius: 99px; background: var(--orange-500); font-weight: 700; font-size: clamp(16px, 1.6vw, 24px); }
  .scr-prizes { margin-top: clamp(20px, 3vh, 40px); display: grid; gap: clamp(8px, 1.2vh, 14px); }
  .scr-prizes .hd { display: flex; justify-content: space-between; align-items: baseline; font-size: clamp(14px, 1.3vw, 20px); opacity: .75; letter-spacing: .1em; }
  .scr-prizes .hd b { font: 700 clamp(22px, 2.4vw, 36px)/1 var(--font-display); color: var(--orange-300); letter-spacing: 0; opacity: 1; }
  .scr-row { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; align-items: center; padding: clamp(10px, 1.3vh, 16px) clamp(14px, 1.4vw, 22px);
    border-radius: 16px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1); }
  .scr-row .nm { font-weight: 700; font-size: clamp(16px, 1.7vw, 26px); display: flex; gap: 10px; align-items: center; min-width: 0; }
  .scr-row .nm span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scr-row .lb { flex: none; font-size: .62em; font-weight: 700; padding: 3px 10px; border-radius: 99px; background: var(--orange-500); }
  .scr-row .ct { font: 700 clamp(18px, 2vw, 30px)/1 var(--font-display); font-variant-numeric: tabular-nums; }
  .scr-row .ct small { font: 500 .55em var(--font-sans); opacity: .65; margin-left: 4px; }
  .scr-row .bar { grid-column: 1 / -1; height: 8px; border-radius: 99px; background: rgba(255,255,255,.12); overflow: hidden; }
  .scr-row .bar i { display: block; height: 100%; border-radius: 99px; background: var(--orange-500); transition: width .8s var(--ease); }
  .scr-row.out { opacity: .45; }
  .scr-row.out .ct { color: var(--orange-300); }
  .scr-row.bump { animation: scr-bump .6s var(--ease-bounce); }
  @keyframes scr-bump { 40% { transform: scale(1.03); background: rgba(242,122,43,.25); } }
  .scr-foot { text-align: center; padding: 10px 16px 16px; font-size: clamp(11px, 1vw, 14px); opacity: .5; letter-spacing: .08em; }
  .scr-foot .warn { color: var(--orange-300); opacity: 1; }
  @media (orientation: portrait), (max-width: 760px) {
    .scr-main { grid-template-columns: 1fr; }
    .scr-qr { max-width: 460px; margin: 0 auto; width: 100%; }
    .scr-info { text-align: center; }
  }`;
  document.head.appendChild(s);
}

function prizeRows(prizes, prev) {
  const real = prizes.filter((p) => !p.isLose);
  const total = real.reduce((s, p) => s + p.remaining, 0);
  const rows = real.map((p) => {
    const pct = p.quantity ? Math.round(p.remaining / p.quantity * 100) : 0;
    const changed = prev && prev[p.prizeId] !== undefined && prev[p.prizeId] !== p.remaining;
    return `<div class="scr-row ${p.remaining ? '' : 'out'} ${changed ? 'bump' : ''}">
      <div class="nm">${p.label ? `<span class="lb">${esc(p.label)}</span>` : ''}<span>${esc(p.name)}</span></div>
      <div class="ct">${p.remaining ? p.remaining : '已送完'}${p.remaining ? `<small>/ ${p.quantity}</small>` : ''}</div>
      <div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  return `<div class="hd"><span>各獎項剩餘數量</span><span>剩餘 <b>${total}</b> 份</span></div>${rows}`;
}

export async function renderScreen(root, data, code) {
  injectCss();
  const ev = data.event;
  const playUrl = new URL(location.href);
  playUrl.search = '';
  playUrl.hash = '';
  playUrl.searchParams.set('event', code);
  document.title = `${ev.title}｜展示頁`;
  root.className = '';
  root.innerHTML = `<div class="scr">
    <header class="scr-top"><span class="brand-logo"><span class="mark">F</span><span class="name">飛資得醫學資訊</span></span>
      ${ev.clientDisplayName ? `<span class="client">${esc(ev.clientDisplayName)}</span>` : ''}
      <div class="right">${ev.isTestMode ? '<span class="p-test">測試中</span>' : ''}<span id="clock"></span></div></header>
    <main class="scr-main">
      <div class="scr-qr"><canvas id="qr" width="1000" height="1000" aria-label="抽獎頁 QR code"></canvas>
        <div class="scan">掃描 <em>QR code</em><br>參加抽獎</div><div class="url">${esc(playUrl.toString())}</div></div>
      <div class="scr-info"><h1>${esc(ev.title)}</h1>${ev.subtitle ? `<p class="sub">${esc(ev.subtitle)}</p>` : ''}
        <div id="state"></div><div class="scr-prizes" id="prizes"></div></div>
    </main>
    <footer class="scr-foot" id="foot"></footer></div>`;

  try { await loadQrLib(); drawQr(root.querySelector('#qr'), playUrl.toString()); } catch (e) {
    root.querySelector('#qr').replaceWith(Object.assign(document.createElement('p'), { textContent: e.message }));
  }

  const clock = () => {
    const el = root.querySelector('#clock');
    if (el) el.textContent = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' });
  };
  clock();
  setInterval(clock, 15000);

  let last = {};
  const paint = (d, ok = true) => {
    const st = d.state;
    root.querySelector('#state').innerHTML = st !== 'open' && STATE_TEXT[st] ? `<span class="scr-state">${STATE_TEXT[st]}</span>` : '';
    root.querySelector('#prizes').innerHTML = prizeRows(d.prizes, last);
    last = Object.fromEntries(d.prizes.map((p) => [p.prizeId, p.remaining]));
    const t = new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
    root.querySelector('#foot').innerHTML = ok ? `每 30 秒自動更新・最後更新 ${t}` : `<span class="warn">連線暫時中斷，30 秒後自動重試</span>・最後成功更新 ${esc(root.dataset.lastOk || '')}`;
    if (ok) root.dataset.lastOk = t;
  };
  let latest = data;
  paint(data);
  setInterval(async () => {
    try { latest = await api('public.getEvent', { eventCode: code }); paint(latest); } catch (e) { paint(latest, false); }
  }, REFRESH_MS);

  // 攤位大螢幕：盡量不要讓螢幕自動休眠
  const wake = async () => { try { if ('wakeLock' in navigator) await navigator.wakeLock.request('screen'); } catch (e) { /* 不支援就算了 */ } };
  wake();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
}
