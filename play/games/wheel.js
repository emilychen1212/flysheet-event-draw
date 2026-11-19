/**
 * 轉盤（夜市節慶風）
 * 共同介面：
 *   init(container, prizes, theme)   畫出遊戲
 *   start()                          （選用）按下開始、等待後端結果時先轉起來
 *   play(resultPrize) → Promise      停在後端決定的結果，動畫結束後 resolve
 *   cancel()                         後端失敗時停下來（不顯示結果）
 *   destroy()
 * 這裡沒有任何決定中獎的邏輯：結果一律由 play() 傳入。
 */
import { sfx } from '../sound.js';

const LOSE_COLOR = '#cfc8bd';
const PALETTE = ['#f27a2b', '#1b2a52', '#f8b07c', '#3d5596', '#e8b839', '#2d8a57', '#c4432b', '#8a6fc7', '#4aa3c2', '#d96aa0'];
const SPIN_SPEED = 0.72;   // 等待時的轉速（度／毫秒）
const MIN_DECEL_MS = 4200; // 減速最少時間

let el, canvas, pointer, bulbs, segs = [], angle = 0, speed = 0, raf = 0, lastT = 0, lastTick = -1, lastTickAt = 0, mode = 'idle', idleRaf = 0;

function injectCss() {
  if (document.getElementById('g-wheel-css')) return;
  const s = document.createElement('style');
  s.id = 'g-wheel-css';
  s.textContent = `
  .g-wheel { position: relative; width: 100%; max-width: 620px; padding: 64px 12px 22px; border-radius: 28px; overflow: hidden;
    background: radial-gradient(120% 80% at 50% 0%, #a3231b 0%, #6d1410 55%, #3d0b0a 100%);
    box-shadow: inset 0 0 0 3px rgba(255, 196, 92, .35), 0 24px 60px rgba(0, 0, 0, .35); }
  .g-wheel::before { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(circle at 15% 70%, rgba(255, 190, 80, .18) 0 2px, transparent 3px) 0 0 / 46px 46px,
                radial-gradient(circle at 70% 30%, rgba(255, 190, 80, .12) 0 1.5px, transparent 2.5px) 0 0 / 34px 34px; }
  .g-wheel .bunting { position: absolute; left: -2%; right: -2%; top: 0; height: 56px; width: 104%; }
  .g-wheel .lantern { position: absolute; top: 18px; width: 54px; transform-origin: 50% 0; animation: g-sway 3.2s ease-in-out infinite; filter: drop-shadow(0 0 14px rgba(255, 120, 40, .55)); }
  .g-wheel .lantern.l { left: 10px; }
  .g-wheel .lantern.r { right: 10px; animation-delay: -1.6s; }
  @keyframes g-sway { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
  .g-wheel .stage { position: relative; width: var(--d); height: var(--d); margin: 0 auto; }
  .g-wheel canvas.disc { position: absolute; inset: 0; width: 100%; height: 100%; will-change: transform; }
  .g-wheel svg.rim { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .g-wheel .rim circle.b { fill: #ffe7a3; filter: drop-shadow(0 0 4px #ffcf5c); animation: g-blink 1s steps(2) infinite; }
  .g-wheel .rim circle.b:nth-of-type(even) { animation-delay: -.5s; }
  .g-wheel.spinning .rim circle.b { animation-duration: .25s; }
  .g-wheel.won .rim circle.b { animation-duration: .12s; }
  @keyframes g-blink { 50% { fill: #ff9d3a; filter: none; } }
  .g-wheel .pointer { position: absolute; left: 50%; top: -14px; width: 44px; margin-left: -22px; transform-origin: 50% 20%; z-index: 2;
    filter: drop-shadow(0 4px 4px rgba(0, 0, 0, .35)); transition: transform .08s; }
  .g-wheel .pointer.hit { transform: rotate(-14deg); transition: none; }
  .g-wheel .hub { position: absolute; left: 50%; top: 50%; width: 22%; height: 22%; transform: translate(-50%, -50%); border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff3c4, #f2b33d 55%, #b9731b); box-shadow: 0 0 0 5px #7a1712, 0 6px 14px rgba(0, 0, 0, .4);
    display: grid; place-items: center; color: #7a1712; font: 900 clamp(16px, 4.6vw, 26px)/1 'Noto Sans TC', sans-serif; letter-spacing: .05em; z-index: 1; }
  .g-wheel .sign { text-align: center; color: #ffe2a8; font-weight: 700; letter-spacing: .3em; font-size: 13px; margin-top: 16px; opacity: .85; }
  `;
  document.head.appendChild(s);
}

const BUNTING = (() => {
  const colors = ['#ffcf5c', '#2d8a57', '#f27a2b', '#ffffff', '#3d5596', '#e64b3c'];
  let flags = '';
  for (let i = 0; i < 22; i++) {
    const x = i * 48 + 6;
    const y = 10 + Math.sin((i / 21) * Math.PI) * 14;
    flags += `<path d="M${x} ${y}l20 0l-10 22z" fill="${colors[i % colors.length]}" opacity=".95"/>`;
  }
  return `<svg class="bunting" viewBox="0 0 1056 56" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 10 Q528 52 1056 10" stroke="#3d0b0a" stroke-width="2" fill="none"/>${flags}</svg>`;
})();

const lantern = (cls, ch) => `<svg class="lantern ${cls}" viewBox="0 0 60 110" aria-hidden="true">
  <path d="M30 0v14" stroke="#3d0b0a" stroke-width="2"/>
  <rect x="18" y="12" width="24" height="8" rx="2" fill="#f2b33d"/>
  <ellipse cx="30" cy="48" rx="27" ry="30" fill="#e23a22"/>
  <path d="M30 18c-12 6-12 54 0 60M30 18c12 6 12 54 0 60M30 18v60" stroke="#ff8a5c" stroke-width="1.4" fill="none" opacity=".7"/>
  <text x="30" y="56" text-anchor="middle" font-size="22" font-weight="900" fill="#ffe2a8" font-family="Noto Sans TC, sans-serif">${ch}</text>
  <rect x="18" y="76" width="24" height="8" rx="2" fill="#f2b33d"/>
  <path d="M24 84v20M30 84v24M36 84v20" stroke="#f2b33d" stroke-width="2"/></svg>`;

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function drawDisc(size) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const c = size / 2;
  const R = c - size * 0.06;      // 扇區半徑（外圈留給燈泡）
  const n = segs.length;
  const step = (Math.PI * 2) / n;

  // 外框
  ctx.beginPath(); ctx.arc(c, c, c - 1, 0, Math.PI * 2); ctx.fillStyle = '#7a1712'; ctx.fill();
  ctx.beginPath(); ctx.arc(c, c, c - size * 0.03, 0, Math.PI * 2); ctx.fillStyle = '#f2b33d'; ctx.fill();

  segs.forEach((s, i) => {
    const a0 = -Math.PI / 2 + i * step;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, R, a0, a0 + step);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(122, 23, 18, .55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 文字：從外往內沿半徑排
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a0 + step / 2);
    const fs = Math.max(11, Math.min(size * 0.055, (R * step) * 0.42));
    ctx.font = `700 ${fs}px "Noto Sans TC", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = luminance(s.color) > 0.62 ? '#5a1410' : '#ffffff';
    const label = fitText(ctx, s.name, R * 0.66);
    ctx.fillText(label, R - size * 0.04, 0);
    ctx.restore();
  });

  // 內圈陰影
  const g = ctx.createRadialGradient(c, c, R * 0.2, c, c, R);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
}

function rimSvg(n) {
  let s = '';
  const count = Math.max(16, Math.min(28, n * 3));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    s += `<circle class="b" cx="${(50 + Math.cos(a) * 47).toFixed(2)}" cy="${(50 + Math.sin(a) * 47).toFixed(2)}" r="1.35"/>`;
  }
  return `<svg class="rim" viewBox="0 0 100 100" aria-hidden="true">${s}</svg>`;
}

function setAngle(a) {
  angle = a;
  canvas.style.transform = `rotate(${angle}deg)`;
  // 指針敲到格線
  const seg = 360 / segs.length;
  const idx = Math.floor(((angle % 360) + 360) % 360 / seg);
  if (idx !== lastTick) {
    lastTick = idx;
    const now = performance.now();
    if (now - lastTickAt > 45) {
      lastTickAt = now;
      sfx.tick();
      pointer.classList.add('hit');
      setTimeout(() => pointer && pointer.classList.remove('hit'), 60);
    }
  }
}

function sizeOf() {
  const w = el.clientWidth - 24;
  const vh = window.innerHeight;
  const landscape = window.innerWidth > window.innerHeight && window.innerWidth >= 900;
  return Math.floor(Math.max(220, Math.min(w, landscape ? vh * 0.62 : 440)));
}

let onResize;

export function init(container, prizes) {
  injectCss();
  segs = prizes.map((p, i) => ({
    prizeId: p.prizeId, name: p.name,
    color: p.color || (p.isLose ? LOSE_COLOR : PALETTE[i % PALETTE.length])
  }));
  container.innerHTML = `<div class="g-wheel">${BUNTING}${lantern('l', '抽')}${lantern('r', '獎')}
    <div class="stage"><svg class="pointer" viewBox="0 0 44 56" aria-hidden="true">
      <path d="M22 54L4 14a18 18 0 1 1 36 0z" fill="#ffe2a8" stroke="#7a1712" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="22" cy="16" r="6" fill="#e23a22"/></svg>
      <canvas class="disc"></canvas>${rimSvg(segs.length)}<div class="hub">抽</div></div>
    <div class="sign">— 夜市好手氣 —</div></div>`;
  el = container.querySelector('.g-wheel');
  canvas = el.querySelector('canvas.disc');
  pointer = el.querySelector('.pointer');
  bulbs = el.querySelector('.rim');
  const layout = () => {
    const d = sizeOf();
    el.style.setProperty('--d', d + 'px');
    drawDisc(d);
  };
  layout();
  onResize = () => layout();
  window.addEventListener('resize', onResize);
  angle = Math.random() * 360;
  lastTick = -1;
  canvas.style.transform = `rotate(${angle}deg)`;
  idle();
}

/** 待機時慢慢轉 */
function idle() {
  mode = 'idle';
  let t0 = performance.now();
  const loop = (t) => {
    if (mode !== 'idle') return;
    angle += (t - t0) * 0.006;
    t0 = t;
    canvas.style.transform = `rotate(${angle}deg)`;
    idleRaf = requestAnimationFrame(loop);
  };
  idleRaf = requestAnimationFrame(loop);
}

/** 按下開始：加速到等速旋轉，等待後端結果 */
export function start() {
  if (mode === 'spin') return;
  cancelAnimationFrame(idleRaf);
  mode = 'spin';
  el.classList.remove('won');
  el.classList.add('spinning');
  sfx.spinStart();
  speed = 0;
  lastT = performance.now();
  const loop = (t) => {
    if (mode !== 'spin') return;
    const dt = Math.min(48, t - lastT);
    lastT = t;
    speed = Math.min(SPIN_SPEED, speed + dt * 0.0016); // 約 0.45 秒加速到全速
    setAngle(angle + speed * dt);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

/** 減速並精準停在 resultPrize 所在的扇區 */
export function play(resultPrize) {
  return new Promise((resolve) => {
    const idx = segs.findIndex((s) => s.prizeId === resultPrize.prizeId);
    if (mode !== 'spin') start();
    const seg = 360 / segs.length;
    // 第 i 格中心在指針（正上方）時，轉角 = -(i + 0.5) * seg；在格子內隨機偏移，看起來比較自然
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const target = -((Math.max(0, idx) + 0.5) * seg + jitter);
    const v0 = Math.max(speed, 0.3);
    // easeOutQuart 初速 = 4 × 距離 / 時間，讓減速和等速段無縫接上
    const minDist = (v0 * MIN_DECEL_MS) / 4;
    const cur = angle;
    let dist = (((target - cur) % 360) + 360) % 360;
    while (dist < minDist) dist += 360;
    const dur = (4 * dist) / v0;
    mode = 'stop';
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const loop = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      setAngle(cur + dist * e);
      if (p < 1) { raf = requestAnimationFrame(loop); return; }
      el.classList.remove('spinning');
      if (!resultPrize.isLose) el.classList.add('won');
      mode = 'done';
      setTimeout(resolve, 350);
    };
    raf = requestAnimationFrame(loop);
  });
}

/** 後端失敗：慢慢停下，不停在任何結果 */
export function cancel() {
  if (mode !== 'spin') return;
  mode = 'stop';
  cancelAnimationFrame(raf);
  const v0 = speed;
  const t0 = performance.now();
  const dur = 900;
  const start0 = angle;
  const loop = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    setAngle(start0 + (v0 * dur / 2) * (1 - Math.pow(1 - p, 2)));
    if (p < 1) raf = requestAnimationFrame(loop);
    else { el.classList.remove('spinning'); idle(); }
  };
  raf = requestAnimationFrame(loop);
}

/** 下一位：回到待機 */
export function reset() {
  cancelAnimationFrame(raf);
  el && el.classList.remove('won', 'spinning');
  if (mode !== 'idle') idle();
}

export function destroy() {
  mode = 'gone';
  cancelAnimationFrame(raf);
  cancelAnimationFrame(idleRaf);
  window.removeEventListener('resize', onResize);
  el = canvas = pointer = bulbs = null;
}
