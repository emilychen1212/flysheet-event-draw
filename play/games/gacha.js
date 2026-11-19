/**
 * 彩球機（飛資得扁平可愛風，和後台同色系）
 * 透明球體裡的彩球隨機彈跳 → 轉動把手 → 一顆球滾出出口 → 打開揭曉。
 * 介面同 wheel.js。滾出來的那顆球是什麼，完全由 play(resultPrize) 決定。
 */
import { sfx } from '../sound.js';

export const startLabel = '轉一下把手！';

const LOSE_COLOR = '#cfc8bd';
const PALETTE = ['#f27a2b', '#3d5596', '#f8b07c', '#2d8a57', '#e8b839', '#d96aa0', '#4aa3c2', '#8a6fc7', '#c4432b', '#ffffff'];
let el, canvas, ctx, balls = [], raf = 0, mode = 'idle', D = 280, colors = [], colorOf = {}, onResize, lastRattle = 0, dpr = 1;

function injectCss() {
  if (document.getElementById('g-gacha-css')) return;
  const s = document.createElement('style');
  s.id = 'g-gacha-css';
  s.textContent = `
  .g-gacha { position: relative; width: 100%; max-width: 520px; padding: 22px 16px 18px; border-radius: 28px; background: #fdf3e8;
    box-shadow: inset 0 0 0 2px #f8d9bd, 0 24px 60px rgba(0, 0, 0, .25); color: #1b2a52; overflow: hidden; }
  .g-gacha::before { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(circle, rgba(242,122,43,.14) 2px, transparent 2.5px) 0 0 / 22px 22px; }
  .g-gacha .machine { position: relative; width: var(--d); margin: 0 auto; }
  .g-gacha .dome { position: relative; width: var(--d); height: var(--d); border-radius: 50%;
    background: radial-gradient(circle at 32% 28%, rgba(255,255,255,.95) 0 6%, rgba(255,255,255,.35) 7% 16%, rgba(214,228,250,.35) 40%, rgba(160,186,230,.45) 100%);
    box-shadow: inset 0 0 0 5px #1b2a52, inset -10px -14px 30px rgba(27,42,82,.18); overflow: hidden; }
  .g-gacha .dome canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .g-gacha .dome::after { content: ''; position: absolute; left: 18%; top: 12%; width: 22%; height: 12%; border-radius: 50%; background: rgba(255,255,255,.7); transform: rotate(-30deg); }
  .g-gacha .neck { width: 46%; height: 18px; margin: -6px auto 0; background: #1b2a52; border-radius: 0 0 10px 10px; position: relative; z-index: 1; }
  .g-gacha .body { position: relative; width: 84%; margin: 0 auto; height: calc(var(--d) * .56); background: #f27a2b; border-radius: 18px 18px 26px 26px;
    box-shadow: inset 0 0 0 5px #1b2a52, inset 0 -10px 0 rgba(0,0,0,.12); }
  .g-gacha .label { position: absolute; left: 50%; top: 12%; transform: translateX(-50%); background: #fff; border: 3px solid #1b2a52; border-radius: 10px;
    padding: 3px 12px; font: 700 13px/1.3 Fraunces, 'Noto Sans TC', serif; letter-spacing: .12em; white-space: nowrap; }
  .g-gacha .knob { position: absolute; right: 12%; top: 42%; width: calc(var(--d) * .2); height: calc(var(--d) * .2); border-radius: 50%; background: #fff;
    box-shadow: inset 0 0 0 4px #1b2a52; transition: transform .2s; }
  .g-gacha .knob::before { content: ''; position: absolute; left: 50%; top: 10%; bottom: 10%; width: 22%; margin-left: -11%; border-radius: 6px; background: #1b2a52; }
  .g-gacha .knob[role=button] { cursor: pointer; }
  .g-gacha .knob[role=button]::after { content: ''; position: absolute; inset: -12px; border-radius: 50%; }
  .g-gacha .knob[role=button]:not(.turn) { animation: g-knob 1.5s ease-in-out infinite; }
  @keyframes g-knob { 50% { box-shadow: inset 0 0 0 4px #1b2a52, 0 0 0 8px rgba(255, 255, 255, .45); } }
  .g-gacha .knob[role=button]:focus-visible { outline: 3px solid #1b2a52; outline-offset: 4px; }
  .g-gacha .knob.turn { animation: g-turn 1.1s cubic-bezier(.5, 0, .3, 1); }
  @keyframes g-turn { to { transform: rotate(720deg); } }
  .g-gacha .outlet { position: absolute; left: 12%; top: 44%; width: calc(var(--d) * .24); height: calc(var(--d) * .2); border-radius: 12px; background: #14203f; box-shadow: inset 0 6px 0 rgba(0,0,0,.4); }
  .g-gacha .feet { display: flex; justify-content: space-between; width: 70%; margin: 0 auto; }
  .g-gacha .feet i { width: 18%; height: 12px; background: #1b2a52; border-radius: 0 0 8px 8px; }
  .g-gacha .out { position: absolute; width: calc(var(--d) * .17); height: calc(var(--d) * .17); border-radius: 50%; left: calc(12% + var(--d) * .035); top: calc(var(--d) + 18px + var(--d) * .56 * .46);
    opacity: 0; z-index: 3; pointer-events: none; }
  .g-gacha .out .half { position: absolute; left: 0; right: 0; height: 50%; background: var(--c); box-shadow: inset 0 0 0 3px #1b2a52; }
  .g-gacha .out .top { top: 0; border-radius: 999px 999px 0 0; transform-origin: 10% 100%; }
  .g-gacha .out .bot { bottom: 0; border-radius: 0 0 999px 999px; background: #fff; }
  .g-gacha .out.drop { opacity: 1; animation: g-drop .9s cubic-bezier(.3, 1.4, .5, 1) forwards; }
  @keyframes g-drop { 0% { transform: translate(0, -30px) scale(.6) rotate(0); } 60% { transform: translate(-10px, 70px) scale(1) rotate(-200deg); } 100% { transform: translate(-6px, 64px) scale(1) rotate(-360deg); } }
  .g-gacha .reveal { position: absolute; inset: 0; display: grid; place-items: center; z-index: 4; pointer-events: none; }
  .g-gacha .reveal .ball { position: relative; width: 150px; height: 150px; transform: scale(0); }
  .g-gacha .reveal.on .ball { animation: g-grow .5s var(--ease-bounce) forwards; }
  @keyframes g-grow { to { transform: scale(1); } }
  .g-gacha .reveal .half { position: absolute; left: 0; right: 0; height: 50%; box-shadow: inset 0 0 0 5px #1b2a52; }
  .g-gacha .reveal .top { top: 0; border-radius: 999px 999px 0 0; background: var(--c); transform-origin: 8% 100%; transition: transform .5s cubic-bezier(.3, 1.6, .5, 1); }
  .g-gacha .reveal .top::after { content: ''; position: absolute; left: 22%; top: 22%; width: 24%; height: 22%; border-radius: 50%; background: rgba(255,255,255,.6); }
  .g-gacha .reveal .bot { bottom: 0; border-radius: 0 0 999px 999px; background: #fff; }
  .g-gacha .reveal.open .top { transform: translate(-14px, -40px) rotate(-38deg); }
  .g-gacha .reveal .paper { position: absolute; left: 50%; top: 50%; width: 210px; transform: translate(-50%, -50%) scale(.2); opacity: 0; background: #fff;
    border: 3px solid #1b2a52; border-radius: 14px; padding: 12px 10px; text-align: center; box-shadow: 0 8px 0 #1b2a52; transition: all .45s var(--ease-bounce) .15s; }
  .g-gacha .reveal .paper small { display: block; font-size: 11px; letter-spacing: .3em; color: #f27a2b; font-weight: 700; }
  .g-gacha .reveal .paper b { display: block; font-size: 22px; line-height: 1.25; margin-top: 4px; }
  .g-gacha .reveal.open .paper { transform: translate(-50%, 10px) scale(1); opacity: 1; }
  .g-gacha .reveal.shade { background: rgba(253, 243, 232, .82); transition: background .3s; }
  `;
  document.head.appendChild(s);
}

function size() {
  const w = el.clientWidth - 32;
  const landscape = window.innerWidth > window.innerHeight && window.innerWidth >= 900;
  D = Math.floor(Math.max(200, Math.min(w * 0.78, landscape ? window.innerHeight * 0.42 : 320)));
  el.style.setProperty('--d', D + 'px');
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(D * dpr);
  canvas.height = Math.round(D * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function makeBalls() {
  const r = D * 0.085;
  const count = Math.max(12, Math.min(18, colors.length * 3));
  balls = Array.from({ length: count }, (_, i) => ({
    x: D / 2 + (Math.random() - 0.5) * D * 0.4,
    y: D * 0.55 + Math.random() * D * 0.25,
    vx: (Math.random() - 0.5) * 0.1,
    vy: 0,
    r: r * (0.92 + Math.random() * 0.16),
    c: colors[i % colors.length],
    a: Math.random() * Math.PI
  }));
}

function physics(dt) {
  const R = D / 2 - 6;
  const cx = D / 2, cy = D / 2;
  const g = 0.0012 * D / 280;
  const shake = mode === 'mix' ? 1 : 0;
  balls.forEach((b) => {
    if (shake) {
      // 攪拌：隨機往上、往旁邊推
      if (Math.random() < 0.08) { b.vy -= (0.25 + Math.random() * 0.35) * D / 280; b.vx += (Math.random() - 0.5) * 0.45 * D / 280; }
    } else if (Math.random() < 0.006) {
      b.vy -= 0.12 * D / 280; b.vx += (Math.random() - 0.5) * 0.1;   // 待機時偶爾輕輕跳一下
    }
    b.vy += g * dt;
    b.vx *= 0.995;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.a += b.vx * 0.04 * dt;
    const dx = b.x - cx, dy = b.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > R - b.r) {
      const nx = dx / dist, ny = dy / dist;
      b.x = cx + nx * (R - b.r);
      b.y = cy + ny * (R - b.r);
      const dot = b.vx * nx + b.vy * ny;
      if (dot > 0) { b.vx -= 1.6 * dot * nx; b.vy -= 1.6 * dot * ny; }
      if (shake && Math.abs(dot) > 0.15) {
        const now = performance.now();
        if (now - lastRattle > 55) { lastRattle = now; sfx.rattle(); }
      }
    }
  });
  // 球和球互相推開
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const min = a.r + b.r;
      if (d < min) {
        const push = (min - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { a.vx += rel * nx * 0.5; a.vy += rel * ny * 0.5; b.vx -= rel * nx * 0.5; b.vy -= rel * ny * 0.5; }
      }
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, D, D);
  balls.forEach((b) => {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, b.r, Math.PI, 0); ctx.fillStyle = b.c; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#1b2a52';
    ctx.beginPath(); ctx.arc(0, 0, b.r - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-b.r + 1, 0); ctx.lineTo(b.r - 1, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(-b.r * 0.35, -b.r * 0.45, b.r * 0.18, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    ctx.restore();
  });
}

function run() {
  let last = performance.now();
  const step = (t) => {
    if (!el) return;
    const dt = Math.min(32, t - last);
    last = t;
    physics(dt);
    draw();
    raf = requestAnimationFrame(step);
  };
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(step);
}

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); }


function bindTrigger(node, theme) {
  if (!node || !theme || !theme.onTrigger) return;
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.addEventListener('click', (e) => { e.stopPropagation(); theme.onTrigger(); });
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); theme.onTrigger(); } });
}

export function init(container, prizes, theme) {
  injectCss();
  colors = prizes.map((p, i) => p.color || (p.isLose ? LOSE_COLOR : PALETTE[i % PALETTE.length]));
  colorOf = {};
  prizes.forEach((p, i) => { colorOf[p.prizeId] = colors[i]; });
  container.innerHTML = `<div class="g-gacha">
    <div class="machine">
      <div class="dome"><canvas></canvas></div><div class="neck"></div>
      <div class="body"><div class="label">LUCKY BALL</div><div class="outlet"></div><div class="knob"></div></div>
      <div class="feet"><i></i><i></i></div>
      <div class="out"><div class="half top"></div><div class="half bot"></div></div>
    </div>
    <div class="reveal"><div class="ball"><div class="half top"></div><div class="half bot"></div></div><div class="paper"><small></small><b></b></div></div>
  </div>`;
  el = container.querySelector('.g-gacha');
  canvas = el.querySelector('canvas');
  ctx = canvas.getContext('2d');
  bindTrigger(el.querySelector('.knob'), theme);
  el.querySelector('.knob').setAttribute('aria-label', '轉動把手開始抽獎');
  size();
  makeBalls();
  mode = 'idle';
  run();
  onResize = () => { const old = D; size(); const k = D / old; balls.forEach((b) => { b.x *= k; b.y *= k; b.r *= k; }); };
  window.addEventListener('resize', onResize);
}

export function start() {
  if (mode === 'mix') return;
  mode = 'mix';
  hideReveal();
  const knob = el.querySelector('.knob');
  knob.classList.remove('turn');
  void knob.offsetWidth;
  knob.classList.add('turn');
  for (let i = 0; i < 6; i++) setTimeout(() => sfx.crank(), i * 160);
}

function hideReveal() {
  const rv = el.querySelector('.reveal');
  rv.classList.remove('on', 'open', 'shade');
  el.querySelector('.out').classList.remove('drop');
}

export function play(resultPrize) {
  return new Promise((resolve) => {
    if (mode !== 'mix') start();
    const color = colorOf[resultPrize.prizeId] || resultPrize.color || (resultPrize.isLose ? LOSE_COLOR : PALETTE[0]);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      await wait(1200);                 // 攪拌一下
      mode = 'idle';
      const knob = el.querySelector('.knob');
      knob.classList.remove('turn'); void knob.offsetWidth; knob.classList.add('turn');
      for (let i = 0; i < 5; i++) setTimeout(() => sfx.crank(), i * 180);
      await wait(900);
      const out = el.querySelector('.out');
      out.style.setProperty('--c', color);
      out.classList.remove('drop'); void out.offsetWidth; out.classList.add('drop');
      sfx.roll();
      await wait(1100);
      const rv = el.querySelector('.reveal');
      rv.querySelector('.ball').style.setProperty('--c', color);
      rv.querySelector('.top').style.background = color;
      rv.querySelector('small').textContent = resultPrize.isLose ? '扭蛋結果' : resultPrize.isSpecial ? '★ 特別獎 ★' : '恭喜獲得';
      rv.querySelector('b').innerHTML = esc(resultPrize.name);
      out.classList.remove('drop');
      rv.classList.add('shade', 'on');
      await wait(600);
      rv.classList.add('open');
      sfx.pop();
      await wait(700);
      resolve();
    })();
  });
}

export function cancel() { mode = 'idle'; }

export function reset() { if (el) { hideReveal(); mode = 'idle'; } }

export function destroy() {
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', onResize);
  el = canvas = ctx = null;
  balls = [];
}
