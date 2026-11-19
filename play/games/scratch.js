/**
 * 刮刮樂（台灣古早復古風：柑仔店、懷舊彩券、紅色與米黃色、印章字）
 * 介面同 wheel.js。play(resultPrize) 會讓彩券可以刮，刮開約 50% 自動全部揭開後 resolve。
 * 結果在 play() 被呼叫之前就已由後端決定，塗層底下的字也是那時才寫上去。
 */
import { sfx } from '../sound.js';

export const playingHint = '👆 用手指（或滑鼠）刮開金色區塊！';
export const startLabel = '拿一張彩券';

let el, card, coat, result, stamp, ctx, dpr = 1, enabled = false, done = null, moves = 0, lastSfx = 0, last = null, serial = 0;

function injectCss() {
  if (document.getElementById('g-scratch-css')) return;
  const s = document.createElement('style');
  s.id = 'g-scratch-css';
  s.textContent = `
  .g-scratch { position: relative; width: 100%; max-width: 560px; border-radius: 22px; overflow: hidden; padding: 58px 16px 24px;
    background: #f3e6c4 repeating-linear-gradient(90deg, rgba(150, 90, 40, .05) 0 2px, transparent 2px 9px);
    box-shadow: inset 0 0 0 4px #b3261e, inset 0 0 0 7px #f3e6c4, inset 0 0 0 9px #b3261e, 0 24px 60px rgba(0, 0, 0, .3); color: #6b1a14; }
  .g-scratch .awning { position: absolute; inset: 0 0 auto; height: 44px;
    background: repeating-linear-gradient(90deg, #c8322a 0 28px, #fff6e0 28px 56px);
    -webkit-mask: radial-gradient(14px at 14px 100%, transparent 98%, #000) 0 0 / 28px 100%;
            mask: radial-gradient(14px at 14px 100%, transparent 98%, #000) 0 0 / 28px 100%; }
  .g-scratch .shop { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: #6b1a14; color: #ffe9b0;
    font: 900 15px/1 'Noto Sans TC', serif; letter-spacing: .5em; padding: 6px 8px 6px 14px; border-radius: 4px; box-shadow: 0 2px 0 #3d0d0a; white-space: nowrap; }
  .g-scratch .ticket { position: relative; margin: 10px auto 0; width: min(380px, 100%); background: #fff8e6; border-radius: 6px; padding: 16px 16px 14px;
    box-shadow: 0 10px 22px rgba(107, 26, 20, .25); transition: transform .4s var(--ease-bounce);
    background-image: radial-gradient(circle at 0 50%, #f3e6c4 7px, transparent 7.5px), radial-gradient(circle at 100% 50%, #f3e6c4 7px, transparent 7.5px);
    background-size: 14px 22px; background-repeat: repeat-y; background-position: left top, right top; }
  .g-scratch .ticket.printing { animation: g-print .9s ease-in-out infinite; }
  @keyframes g-print { 50% { transform: translateY(-4px) rotate(-1deg); } }
  .g-scratch .ticket.fresh { animation: g-slide .5s var(--ease-bounce); }
  @keyframes g-slide { from { transform: translateY(40px) rotate(4deg); opacity: 0; } }
  .g-scratch .frame { border: 2.5px solid #b3261e; outline: 1px solid #b3261e; outline-offset: 3px; border-radius: 4px; padding: 12px 12px 10px; }
  .g-scratch .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
  .g-scratch .title { font: 900 30px/1 'Noto Sans TC', serif; color: #b3261e; letter-spacing: .12em; text-shadow: 2px 2px 0 #f4c95d; }
  .g-scratch .no { font: 700 11px/1.3 ui-monospace, monospace; color: #8a5a3a; text-align: right; }
  .g-scratch .sub { font-size: 12px; letter-spacing: .3em; color: #8a5a3a; margin: 6px 0 10px; }
  .g-scratch .zone { position: relative; height: 120px; border-radius: 6px; background: #fff; border: 2px dashed #d9a441; overflow: hidden; touch-action: none; }
  .g-scratch .result { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 8px; }
  .g-scratch .result b { display: block; font: 900 clamp(22px, 7vw, 32px)/1.15 'Noto Sans TC', sans-serif; color: #b3261e; }
  .g-scratch .result small { font-size: 12px; color: #8a5a3a; letter-spacing: .2em; }
  .g-scratch canvas.coat { position: absolute; inset: 0; width: 100%; height: 100%; cursor: grab; transition: opacity .5s; }
  .g-scratch canvas.coat.off { opacity: 0; pointer-events: none; }
  .g-scratch .foot { display: flex; justify-content: space-between; font-size: 11px; color: #8a5a3a; margin-top: 8px; letter-spacing: .08em; }
  .g-scratch .stamp { position: absolute; right: 14px; bottom: 26px; width: 84px; height: 84px; border-radius: 50%; border: 4px double #c8322a; color: #c8322a;
    display: grid; place-items: center; font: 900 22px/1 'Noto Sans TC', serif; transform: rotate(-14deg) scale(0); opacity: 0; mix-blend-mode: multiply; pointer-events: none; }
  .g-scratch .stamp.on { animation: g-stamp .35s cubic-bezier(.3, 1.6, .5, 1) forwards; }
  .g-scratch .stamp.lose { border-color: #8a5a3a; color: #8a5a3a; font-size: 16px; }
  @keyframes g-stamp { from { transform: rotate(-14deg) scale(2.2); opacity: 0; } to { transform: rotate(-14deg) scale(1); opacity: .9; } }
  .g-scratch .caption { text-align: center; margin-top: 14px; font-size: 13px; letter-spacing: .2em; color: #8a5a3a; }
  `;
  document.head.appendChild(s);
}

function paintCoat() {
  const w = coat.clientWidth, h = coat.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  coat.width = Math.round(w * dpr);
  coat.height = Math.round(h * dpr);
  ctx = coat.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#d9a441'); g.addColorStop(.5, '#f7dd8c'); g.addColorStop(1, '#c48a2c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 古早味花紋：「刮」字＋星星
  ctx.fillStyle = 'rgba(122, 62, 20, .16)';
  ctx.font = '900 18px "Noto Sans TC", serif';
  for (let y = 16; y < h + 20; y += 30) for (let x = (y / 30) % 2 ? 0 : 20; x < w + 20; x += 40) ctx.fillText(x % 80 ? '★' : '刮', x, y);
  ctx.fillStyle = '#6b1a14';
  ctx.font = '900 20px "Noto Sans TC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('刮 開 看 看', w / 2, h / 2);
}

function pos(e) {
  const r = coat.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function scratchAt(p) {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo((last || p).x, (last || p).y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last = p;
  const now = performance.now();
  if (now - lastSfx > 60) { lastSfx = now; sfx.scratch(); }
  if (++moves % 6 === 0) checkCleared();
}

function checkCleared() {
  const { width, height } = coat;
  const data = ctx.getImageData(0, 0, width, height).data;
  let clear = 0, total = 0;
  const step = 4 * 12;
  for (let i = 3; i < data.length; i += step) { total++; if (data[i] < 40) clear++; }
  if (clear / total >= 0.5) revealAll();
}

function revealAll() {
  if (!enabled) return;
  enabled = false;
  coat.classList.add('off');
  el.querySelector('.caption').textContent = '— 揭 曉 —';
  sfx.reveal();
  stamp.classList.add('on');
  const fn = done;
  done = null;
  setTimeout(() => fn && fn(), 650);
}

function onDown(e) {
  if (!enabled) return;
  e.preventDefault();
  coat.setPointerCapture && coat.setPointerCapture(e.pointerId);
  last = null;
  scratchAt(pos(e));
  coat.style.cursor = 'grabbing';
}
function onMove(e) {
  if (!enabled || !(e.buttons || e.pointerType === 'touch')) return;
  e.preventDefault();
  scratchAt(pos(e));
}
function onUp() { last = null; if (coat) coat.style.cursor = 'grab'; }

function buildTicket() {
  serial = Math.floor(100000 + Math.random() * 899999);
  const t = new Date();
  const roc = t.getFullYear() - 1911;
  card.innerHTML = `<div class="frame">
      <div class="top"><div class="title">福氣彩券</div><div class="no">第 ${roc}${String(t.getMonth() + 1).padStart(2, '0')} 期<br>No.${serial}</div></div>
      <div class="sub">★ 刮 開 有 獎 ★ 童 叟 無 欺 ★</div>
      <div class="zone"><div class="result"><div><small>— 本券獎項 —</small><b>？</b></div></div><canvas class="coat"></canvas></div>
      <div class="foot"><span>飛資得商行 敬贈</span><span>每人限刮一張</span></div>
    </div><div class="stamp">中獎</div>`;
  coat = card.querySelector('canvas.coat');
  result = card.querySelector('.result');
  stamp = card.querySelector('.stamp');
  coat.addEventListener('pointerdown', onDown);
  coat.addEventListener('pointermove', onMove);
  coat.addEventListener('pointerup', onUp);
  coat.addEventListener('pointercancel', onUp);
  requestAnimationFrame(paintCoat);
}

let onResize;
let trigger = null;

export function init(container, prizes, theme) {
  trigger = theme && theme.onTrigger;
  injectCss();
  container.innerHTML = `<div class="g-scratch"><div class="awning"></div><div class="shop">柑仔店</div>
    <div class="ticket"></div><div class="caption">— 按下方按鈕，拿一張彩券 —</div></div>`;
  el = container.querySelector('.g-scratch');
  card = el.querySelector('.ticket');
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => { if (!enabled && !card.classList.contains('printing') && trigger) trigger(); });
  buildTicket();
  onResize = () => { if (coat && !coat.classList.contains('off') && !moves) paintCoat(); };
  window.addEventListener('resize', onResize);
}

export function start() {
  card.classList.remove('fresh');
  card.classList.add('printing');
  el.querySelector('.caption').textContent = '— 彩券印製中… —';
  sfx.click();
}

export function play(resultPrize) {
  return new Promise((resolve) => {
    card.classList.remove('printing');
    buildTicket();
    card.classList.add('fresh');
    result.innerHTML = `<div><small>— 本券獎項 —</small><b>${String(resultPrize.name).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</b></div>`;
    if (resultPrize.isLose) { stamp.textContent = '再接再厲'; stamp.classList.add('lose'); }
    else stamp.textContent = resultPrize.isSpecial ? '大獎' : '中獎';
    const cap = el.querySelector('.caption');
    cap.textContent = '— 刮開金色區塊 —';
    moves = 0;
    enabled = true;
    done = resolve;
    // 刮不動（或用鍵盤操作）時，6 秒後提供直接揭曉
    setTimeout(() => {
      if (!enabled || !cap.isConnected) return;
      cap.innerHTML = '<button type="button" style="border:0;background:none;color:#b3261e;text-decoration:underline;font:inherit;letter-spacing:.1em;cursor:pointer">刮不開？點這裡直接揭曉</button>';
      cap.querySelector('button').onclick = revealAll;
    }, 6000);
  });
}

export function cancel() {
  card.classList.remove('printing');
  el.querySelector('.caption').textContent = '— 按下方按鈕，拿一張彩券 —';
}

export function reset() {
  enabled = false;
  done = null;
  moves = 0;
  buildTicket();
  card.classList.add('fresh');
  el.querySelector('.caption').textContent = '— 按下方按鈕，拿一張彩券 —';
}

export function destroy() {
  enabled = false;
  window.removeEventListener('resize', onResize);
  el = card = coat = result = stamp = ctx = null;
}
