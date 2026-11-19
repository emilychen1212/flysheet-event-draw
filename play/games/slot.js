/**
 * 拉霸機（華麗賭場風：黑金配色、跑馬燈、拉桿）
 * 三軸滾動、依序停輪；中獎＝三軸同一個獎項並噴金幣；銘謝惠顧＝三軸不一致。
 * 介面同 wheel.js，停在哪一格完全由 play(resultPrize) 決定。
 */
import { sfx } from '../sound.js';

export const startLabel = '拉下拉桿！';

const ICONS = ['💎', '🔔', '⭐', '🍒', '👑', '🍀', '🎁', '🍋', '🍇', '🎲', '🌟', '🎯'];
const LOSE_ICON = '💨';
const PACE = 2 / 3;   // 整體節奏（1 = 原本速度，數字越小越快）
let el, reels = [], symbols = [], H = 84, raf = 0, running = false, spinning = false, onResize, reelTick = 0;

function injectCss() {
  if (document.getElementById('g-slot-css')) return;
  const s = document.createElement('style');
  s.id = 'g-slot-css';
  s.textContent = `
  .g-slot { --gold: linear-gradient(180deg, #fff1b8, #e8b839 45%, #9c6b12 55%, #f5d777); position: relative; width: 100%; max-width: 560px;
    padding: 18px 18px 22px; border-radius: 28px; background: radial-gradient(120% 90% at 50% 0%, #2a2112, #0d0b07 70%);
    box-shadow: 0 0 0 3px #9c6b12, 0 0 0 6px #1a140a, 0 0 0 8px #e8b839, 0 30px 60px rgba(0, 0, 0, .5); color: #f5d777; }
  .g-slot .marquee { position: relative; margin: 0 auto 16px; width: 88%; padding: 12px 10px; border-radius: 16px; background: #1a0f05; text-align: center;
    box-shadow: inset 0 0 0 3px #e8b839; }
  .g-slot .marquee b { display: block; font: 900 clamp(22px, 6.5vw, 34px)/1 Fraunces, Georgia, serif; letter-spacing: .14em;
    background: var(--gold); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 2px 0 #3d2a06); }
  .g-slot .marquee small { display: block; margin-top: 6px; font-size: 11px; letter-spacing: .5em; color: #c9a54a; }
  .g-slot .bulbs { position: absolute; inset: -7px; pointer-events: none; }
  .g-slot .bulbs i { position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #fff1b8; box-shadow: 0 0 8px #ffd34d; animation: g-chase 1.2s linear infinite; }
  .g-slot.spin .bulbs i { animation-duration: .4s; }
  .g-slot.win .bulbs i { animation-duration: .2s; background: #ff6b3d; box-shadow: 0 0 10px #ff6b3d; }
  @keyframes g-chase { 0%, 60% { opacity: 1; } 61%, 100% { opacity: .2; } }
  .g-slot .body { display: grid; grid-template-columns: 1fr 34px; gap: 10px; align-items: center; }
  .g-slot .window { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 10px; border-radius: 16px;
    background: linear-gradient(180deg, #3b2a0c, #1a1206); box-shadow: inset 0 0 0 2px #e8b839, inset 0 6px 16px rgba(0, 0, 0, .6); }
  .g-slot .reel { position: relative; height: calc(var(--h) * 3); overflow: hidden; border-radius: 10px; background: linear-gradient(180deg, #d8cdb5, #fffaf0 30%, #fffaf0 70%, #d8cdb5); }
  .g-slot .reel::after { content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(180deg, rgba(0,0,0,.55), transparent 28%, transparent 72%, rgba(0,0,0,.55)); }
  .g-slot .strip { position: absolute; left: 0; right: 0; top: 0; will-change: transform; }
  .g-slot .tile { height: var(--h); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: #2a1d06; }
  .g-slot .tile .i { font-size: calc(var(--h) * .44); line-height: 1; }
  .g-slot .tile .n { font-size: 11px; font-weight: 700; max-width: 92%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .g-slot .payline { position: absolute; left: 4px; right: 4px; top: 50%; height: 2px; background: #ff3d2e; box-shadow: 0 0 8px #ff3d2e; pointer-events: none; opacity: .75; }
  .g-slot.win .reel { animation: g-glow .5s ease-in-out 4; }
  @keyframes g-glow { 50% { box-shadow: 0 0 0 3px #ffd34d, 0 0 22px #ffd34d; } }
  .g-slot .lever { position: relative; height: calc(var(--h) * 3); }
  .g-slot .lever .rod { position: absolute; left: 50%; bottom: 50%; width: 8px; margin-left: -4px; height: 46%; border-radius: 4px; background: var(--gold); transform-origin: 50% 100%; transition: transform .35s var(--ease-bounce); }
  .g-slot .lever .ball { position: absolute; left: 50%; top: -18px; width: 30px; height: 30px; margin-left: -15px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ff9a8a, #d9261b 60%, #7a0e08); box-shadow: 0 3px 6px rgba(0, 0, 0, .5); }
  .g-slot .lever .base { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: var(--gold); box-shadow: inset 0 -3px 0 rgba(0, 0, 0, .3); }
  .g-slot .lever[role=button] { cursor: pointer; }
  .g-slot .lever[role=button]::before { content: ''; position: absolute; inset: -14px -10px; }
  .g-slot:not(.spin):not(.win) .lever[role=button] .ball { animation: g-ball 1.4s ease-in-out infinite; }
  @keyframes g-ball { 50% { box-shadow: 0 3px 6px rgba(0,0,0,.5), 0 0 0 8px rgba(255, 107, 61, .35); } }
  .g-slot .lever[role=button]:focus-visible { outline: 3px solid #f5d777; outline-offset: 4px; border-radius: 8px; }
  .g-slot .lever.pull .rod { transform: scaleY(-1); transition: transform .18s ease-in; }
  .g-slot .prize-name { text-align: center; margin-top: 14px; min-height: 22px; font-weight: 700; letter-spacing: .1em; color: #f5d777; font-size: 15px; }
  .g-slot .coins { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
  .g-slot .coin { position: absolute; left: 50%; top: 40%; width: 26px; height: 26px; margin: -13px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff6c8, #f2c230 50%, #a8740f); box-shadow: inset 0 0 0 3px rgba(156, 107, 18, .6);
    display: grid; place-items: center; font: 900 12px/1 Georgia, serif; color: #7a5208; animation: g-coin var(--t) cubic-bezier(.2, .6, .4, 1) forwards; }
  @keyframes g-coin { 0% { transform: translate(0, 0) rotateY(0) scale(.4); opacity: 1; }
    40% { transform: translate(calc(var(--x) * .6), var(--up)) rotateY(540deg) scale(1); }
    100% { transform: translate(var(--x), 420px) rotateY(1080deg) scale(.9); opacity: 0; } }
  `;
  document.head.appendChild(s);
}

function bulbsHtml() {
  let s = '';
  const n = 26;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    let x, y;
    if (p < .5) { x = p * 2 * 100; y = 0; } else { x = (1 - (p - .5) * 2) * 100; y = 100; }
    s += `<i style="left:calc(${x}% - 4px);top:calc(${y}% - 4px);animation-delay:${-(i % 3) * .4}s"></i>`;
  }
  return `<div class="bulbs">${s}</div>`;
}

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); }

function stripHtml(copies) {
  let html = '';
  for (let c = 0; c < copies; c++) symbols.forEach((s) => { html += `<div class="tile"><span class="i">${s.icon}</span><span class="n">${esc(s.name)}</span></div>`; });
  return html;
}

function measure() {
  const w = el.clientWidth;
  H = Math.round(Math.max(62, Math.min(96, (w - 110) / 3.4)));
  const vh = window.innerHeight;
  if (window.innerWidth > vh && window.innerWidth >= 900) H = Math.round(Math.min(110, vh * 0.13));
  el.style.setProperty('--h', H + 'px');
}

function setY(r, y) {
  const cycle = symbols.length * H;
  // 保持在前兩輪之內，因為條帶是重複的，看起來不會跳
  while (y >= cycle * 2) y -= cycle;
  r.y = y;
  r.strip.style.transform = `translateY(${-y}px)`;
}


function bindTrigger(node, theme) {
  if (!node || !theme || !theme.onTrigger) return;
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.addEventListener('click', (e) => { e.stopPropagation(); theme.onTrigger(); });
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); theme.onTrigger(); } });
}

export function init(container, prizes, theme) {
  injectCss();
  const real = prizes.filter((p) => !p.isLose);
  symbols = real.map((p, i) => ({ prizeId: p.prizeId, name: p.name, icon: p.isSpecial ? '7️⃣' : ICONS[i % ICONS.length] }));
  if (prizes.some((p) => p.isLose) || symbols.length < 2) symbols.push({ prizeId: '__lose', name: '銘謝惠顧', icon: LOSE_ICON });
  const copies = Math.max(6, Math.ceil(40 / symbols.length));
  container.innerHTML = `<div class="g-slot">${bulbsHtml()}
    <div class="marquee"><b>JACKPOT</b><small>飛 資 得 幸 運 拉 霸</small></div>
    <div class="body"><div class="window">${[0, 1, 2].map(() => `<div class="reel"><div class="strip">${stripHtml(copies)}</div></div>`).join('')}<div class="payline"></div></div>
      <div class="lever"><div class="base"></div><div class="rod"><div class="ball"></div></div></div></div>
    <div class="prize-name"></div><div class="coins"></div></div>`;
  el = container.querySelector('.g-slot');
  measure();
  bindTrigger(el.querySelector('.lever'), theme);
  el.querySelector('.lever').setAttribute('aria-label', '拉下拉桿開始抽獎');
  reels = Array.from(el.querySelectorAll('.strip')).map((strip, i) => ({ strip, y: 0, v: 0, state: 'idle', i }));
  reels.forEach((r) => setY(r, (Math.floor(Math.random() * symbols.length)) * H));
  onResize = () => {
    const ratio = H;
    measure();
    reels.forEach((r) => setY(r, Math.round(r.y / ratio) * H));
  };
  window.addEventListener('resize', onResize);
}

/** 動畫迴圈：只要還有滾輪在動（或在等待停輪）就持續跑 */
function loop() {
  if (running) return;
  running = true;
  let last = performance.now();
  const step = (t) => {
    const dt = Math.min(40, t - last);
    last = t;
    let any = false;
    reels.forEach((r) => {
      if (r.state === 'spin') {
        r.v = Math.min(H * 0.045, r.v + dt * 0.0009 * H);
        setY(r, r.y + r.v * dt);
        any = true;
      } else if (r.state === 'stop') {
        const p = Math.min(1, (t - r.t0) / r.dur);
        // 稍微超過再彈回（easeOutBack）
        const c = 1.4;
        const e = 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
        setY(r, r.from + (r.to - r.from) * e);
        if (p >= 1) { r.state = 'idle'; setY(r, r.to); sfx.reelStop(); r.onDone && r.onDone(); }
        any = true;
      }
    });
    if (spinning && t - reelTick > 70) { reelTick = t; sfx.reel(); }
    if (any || spinning) raf = requestAnimationFrame(step);
    else running = false;
  };
  raf = requestAnimationFrame(step);
}

export function start() {
  if (spinning) return;
  spinning = true;
  el.classList.remove('win');
  el.classList.add('spin');
  el.querySelector('.prize-name').textContent = '';
  const lever = el.querySelector('.lever');
  lever.classList.add('pull');
  sfx.lever();
  setTimeout(() => lever.classList.remove('pull'), 380);
  reels.forEach((r, i) => setTimeout(() => { r.state = 'spin'; r.v = 0; }, i * 90));
  loop();
}

/** 決定三軸要停在哪個符號：中獎＝三個相同；銘謝惠顧＝故意差一個 */
function targetsFor(prize) {
  const n = symbols.length;
  if (!prize.isLose) {
    const idx = Math.max(0, symbols.findIndex((s) => s.prizeId === prize.prizeId));
    return [idx, idx, idx];
  }
  const a = Math.floor(Math.random() * n);
  let c = Math.floor(Math.random() * n);
  if (c === a) c = (a + 1 + Math.floor(Math.random() * (n - 1))) % n;
  return Math.random() < 0.5 ? [a, a, c] : [a, c, a === c ? (a + 1) % n : c];
}

function stopReel(r, idx, minTravel, dur) {
  return new Promise((resolve) => {
    const cycle = symbols.length * H;
    // 中間那一列顯示第 idx 個符號時：y + H = 第 idx 格的頂端 → y = idx*H - H
    let to = idx * H - H;
    while (to < r.y + minTravel) to += cycle;
    r.from = r.y;
    r.to = to;
    r.t0 = performance.now();
    r.dur = dur;
    r.state = 'stop';
    r.onDone = resolve;
    loop();
  });
}

export function play(resultPrize) {
  return new Promise(async (resolve) => {
    if (!spinning) start();
    const targets = targetsFor(resultPrize);
    await new Promise((r) => setTimeout(r, 500 * PACE));
    for (let i = 0; i < 3; i++) {
      await stopReel(reels[i], targets[i], H * symbols.length * (i === 2 && !resultPrize.isLose ? 2 : 1), (900 + i * 150) * PACE);
      if (i === 1 && targets[0] === targets[1]) await new Promise((r) => setTimeout(r, 350 * PACE)); // 前兩軸一樣時，多吊一下胃口
    }
    spinning = false;
    el.classList.remove('spin');
    const label = el.querySelector('.prize-name');
    if (!resultPrize.isLose) {
      el.classList.add('win');
      label.textContent = '★ ' + resultPrize.name + ' ★';
      burstCoins();
    } else {
      label.textContent = '差一點點！';
    }
    setTimeout(resolve, (resultPrize.isLose ? 400 : 900) * PACE);
  });
}

function burstCoins() {
  const box = el.querySelector('.coins');
  box.innerHTML = '';
  for (let i = 0; i < 28; i++) {
    const c = document.createElement('i');
    c.className = 'coin';
    c.textContent = '$';
    c.style.setProperty('--x', `${(Math.random() - 0.5) * 520}px`);
    c.style.setProperty('--up', `${-120 - Math.random() * 180}px`);
    c.style.setProperty('--t', `${1.1 + Math.random() * 0.9}s`);
    c.style.animationDelay = `${Math.random() * 0.35}s`;
    box.appendChild(c);
    if (i % 4 === 0) sfx.coin(i * 0.03);
  }
  setTimeout(() => { if (box.isConnected) box.innerHTML = ''; }, 2600);
}

export function cancel() {
  spinning = false;
  el.classList.remove('spin');
  reels.forEach((r) => {
    if (r.state !== 'spin') return;
    let to = Math.ceil(r.y / H) * H;
    r.from = r.y; r.to = to + H; r.t0 = performance.now(); r.dur = 500; r.state = 'stop'; r.onDone = null;
  });
  loop();
}

export function reset() {
  el && el.classList.remove('win');
  if (el) el.querySelector('.prize-name').textContent = '';
}

export function destroy() {
  spinning = false;
  running = false;
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', onResize);
  el = null;
  reels = [];
}
