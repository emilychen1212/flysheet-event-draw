/**
 * 醫學知識抽抽樂（台灣古早味抽抽樂 × 醫學扁平插畫）
 * gameType 沿用 'wheel'（取代原本的夜市轉盤，已建立的活動不用改設定）。
 * 共同介面：init(container, prizes, theme) / start() / play(resultPrize) → Promise / cancel() / reset() / destroy()
 * 按中間燈泡圓盤開始 → 下方獎項卡片輪流亮起、越跑越慢 → 停在後端決定的那張 → 翻面揭曉。
 * 這裡沒有任何決定中獎的邏輯，停在哪張完全由 play() 傳入。
 *
 * 人物圖：chouchou/doctor.svg、chouchou/nurse.svg，之後要換成 PNG 只要改下面兩個檔名。
 */
import { sfx } from '../sound.js';

export const startLabel = '開始抽獎！';

const ART = {
  doctor: new URL('./chouchou/doctor.svg', import.meta.url).href,
  nurse: new URL('./chouchou/nurse.svg', import.meta.url).href
};

let el, cards = [], prizesRef = [], cur = -1, timer = 0, running = false, theme = {}, onResize;

/* ---------- 扁平圖示 ---------- */
const S = (d, vb = '0 0 48 48') => `<svg viewBox="${vb}" fill="none" stroke="#145078" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  video: S('<rect x="5" y="10" width="38" height="28" rx="5" fill="#038BA2"/><path d="M20 18l10 6-10 6z" fill="#fff"/>'),
  journal: S('<rect x="9" y="5" width="30" height="38" rx="3" fill="#DDF4F7"/><path d="M15 14h18M15 21h18M15 28h12" stroke="#038BA2"/><rect x="9" y="5" width="30" height="38" rx="3"/>'),
  book: S('<path d="M8 9h12a4 4 0 0 1 4 4v26a3 3 0 0 0-3-3H8z" fill="#fff"/><path d="M40 9H28a4 4 0 0 0-4 4v26a3 3 0 0 1 3-3h13z" fill="#55B78A"/>'),
  db: S('<ellipse cx="24" cy="11" rx="15" ry="5" fill="#038BA2"/><path d="M9 11v26c0 3 7 5 15 5s15-2 15-5V11" fill="#038BA2"/><path d="M9 20c0 3 7 5 15 5s15-2 15-5M9 29c0 3 7 5 15 5s15-2 15-5" stroke="#fff"/>'),
  course: S('<path d="M4 18l20-9 20 9-20 9z" fill="#145078"/><path d="M12 22v9c0 3 6 6 12 6s12-3 12-6v-9" fill="#038BA2"/><path d="M42 19v12"/>'),
  gift: S('<rect x="7" y="18" width="34" height="24" rx="2" fill="#F45B54"/><rect x="5" y="12" width="38" height="8" rx="2" fill="#F45B54"/><path d="M24 12v30" stroke="#FFD65A" stroke-width="5"/><path d="M24 12c-4-8-14-8-12-2s12 2 12 2zM24 12c4-8 14-8 12-2s-12 2-12 2z" fill="#FFD65A"/>'),
  star: S('<path d="M24 5l5.6 12 13 1.4-9.7 8.8 2.8 12.8L24 33.4 12.3 40l2.8-12.8-9.7-8.8 13-1.4z" fill="#FFD65A"/>'),
  retry: S('<path d="M38 18A15 15 0 0 0 11 15M10 30a15 15 0 0 0 27 3" stroke="#038BA2" stroke-width="5"/><path d="M11 6v9h9M37 42v-9h-9" stroke="#038BA2" stroke-width="5"/>'),
  trophy: S('<path d="M15 7h18v10a9 9 0 0 1-18 0z" fill="#FFD65A"/><path d="M15 10H8c0 7 3 10 8 10M33 10h7c0 7-3 10-8 10M24 26v8M16 40h16l-2-6H18z" /><path d="M16 40h16l-2-6H18z" fill="#FFD65A"/>'),
  pen: S('<path d="M30 8l10 10-20 20H10V28z" fill="#55B78A"/><path d="M26 12l10 10"/>'),
  cup: S('<path d="M10 14h24v16a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10z" fill="#DDF4F7"/><path d="M34 18h3a5 5 0 0 1 0 10h-3M16 6v4M22 4v6M28 6v4"/>'),
  bag: S('<path d="M8 16h32l-3 26H11z" fill="#55B78A"/><path d="M17 20v-6a7 7 0 0 1 14 0v6"/>')
};

/** 依獎項名稱／標籤挑圖示 */
function iconFor(p) {
  const t = `${p.label || ''} ${p.name || ''}`;
  if (p.isLose) return ICON.retry;
  if (/jove|影片|video/i.test(t)) return ICON.video;
  if (/期刊|journal/i.test(t)) return ICON.journal;
  if (/電子書|書|book/i.test(t)) return ICON.book;
  if (/資料庫|database|uptodate|clinicalkey/i.test(t)) return ICON.db;
  if (/課程|講座|course|研習/i.test(t)) return ICON.course;
  if (/杯|瓶|咖啡|cup/i.test(t)) return ICON.cup;
  if (/袋|包|bag/i.test(t)) return ICON.bag;
  if (/筆|貼|文具|便利貼/i.test(t)) return ICON.pen;
  if (p.isSpecial || /頭獎|大獎|加碼|冠軍/.test(t)) return ICON.trophy;
  if (/幸運|lucky/i.test(t)) return ICON.star;
  return ICON.gift;
}

/* ---------- 背景醫學小圖示 ---------- */
const DECOR = [
  ['dna', 4, 6, 70, -20, '<path d="M8 4c20 10 20 30 0 40M32 4C12 14 12 34 32 44M12 12h16M10 24h20M12 36h16" stroke="#038BA2" stroke-width="3.5"/>', '0 0 40 48'],
  ['flask', 15, 22, 44, 12, '<path d="M15 4h10M17 4v12L7 38a4 4 0 0 0 4 6h18a4 4 0 0 0 4-6L23 16V4" fill="#fff"/><path d="M11 30h18l4 8a4 4 0 0 1-4 6H11a4 4 0 0 1-4-6z" fill="#038BA2"/>', '0 0 40 48'],
  ['cross', 3, 40, 52, 0, '<path d="M15 4h10v11h11v10H25v11H15V25H4V15h11z" fill="#038BA2"/>', '0 0 40 40'],
  ['pill', 84, 22, 54, -35, '<rect x="4" y="12" width="40" height="18" rx="9" fill="#fff"/><path d="M24 12v18" /><path d="M4 21a9 9 0 0 1 9-9h11v18H13a9 9 0 0 1-9-9z" fill="#038BA2"/>', '0 0 48 42'],
  ['heart', 90, 6, 56, 8, '<path d="M24 42S5 30 5 17a9 9 0 0 1 19-4 9 9 0 0 1 19 4c0 13-19 25-19 25z" fill="#F45B54"/><path d="M9 22h9l3-6 5 12 3-6h10" stroke="#fff"/>', '0 0 48 46'],
  ['mol', 88, 44, 60, 0, '<circle cx="24" cy="8" r="5" fill="#fff"/><circle cx="8" cy="32" r="5" fill="#fff"/><circle cx="40" cy="32" r="5" fill="#fff"/><circle cx="24" cy="24" r="6" fill="#DDF4F7"/><path d="M24 13v5M12 29l7-3M36 29l-7-3"/>', '0 0 48 40'],
  ['cross2', 93, 70, 40, 0, '<path d="M15 4h10v11h11v10H25v11H15V25H4V15h11z" fill="#55B78A"/>', '0 0 40 40'],
  ['star1', 23, 4, 30, 0, '<path d="M20 3l4 10 11 1-8 7 2 11-9-6-9 6 2-11-8-7 11-1z" fill="#FFD65A"/>', '0 0 40 36'],
  ['star2', 76, 3, 26, 0, '<path d="M20 3l4 10 11 1-8 7 2 11-9-6-9 6 2-11-8-7 11-1z" fill="#FFD65A"/>', '0 0 40 36']
];

function injectCss() {
  if (document.getElementById('g-cc-css')) return;
  const s = document.createElement('style');
  s.id = 'g-cc-css';
  s.textContent = `
  .g-cc { --teal: #038BA2; --navy: #145078; --yel: #FFD65A; --red: #F45B54; --grn: #55B78A; --cream: #FFF8E8; --sky: #DDF4F7;
    position: relative; width: 100%; max-width: 860px; border-radius: 26px; overflow: hidden; color: var(--navy); padding: 14px 12px 16px;
    background: repeating-conic-gradient(from 0deg at 50% 46%, rgba(255,255,255,.55) 0 7deg, transparent 7deg 18deg), var(--sky);
    box-shadow: inset 0 0 0 4px var(--navy), 0 24px 60px rgba(0, 0, 0, .25); font-family: 'Noto Sans TC', sans-serif; }
  .g-cc .decor { position: absolute; inset: 0; pointer-events: none; }
  .g-cc .decor svg { position: absolute; height: auto; opacity: .9; }
  .g-cc .banner { position: relative; text-align: center; margin: 2px auto 6px; width: min(560px, 96%); z-index: 1; }
  .g-cc .cloud { display: inline-flex; align-items: center; gap: .25em; padding: 10px 26px 12px; border-radius: 999px; background: var(--cream);
    border: 5px solid var(--yel); box-shadow: 0 0 0 4px var(--red), 0 6px 0 4px var(--navy); font-weight: 900; font-size: clamp(24px, 6.4vw, 46px); line-height: 1; letter-spacing: .04em; }
  .g-cc .cloud .a { color: var(--navy); }
  .g-cc .cloud .b { color: var(--red); }
  .g-cc .cloud .st { width: .7em; height: .7em; }
  .g-cc .ribbon { display: inline-block; margin-top: 12px; padding: 5px 18px; background: #fff3cf; border: 3px solid var(--navy); border-radius: 6px;
    font-weight: 700; font-size: clamp(12px, 3.2vw, 16px); transform: rotate(-1.5deg); position: relative; }
  .g-cc .stage { position: relative; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 4px; z-index: 1; margin-top: 6px; }
  .g-cc .stage img { width: 100%; max-width: 190px; height: auto; display: block; }
  .g-cc .stage .doc { justify-self: end; transform-origin: 50% 100%; }
  .g-cc .stage .nurse { justify-self: start; transform-origin: 50% 100%; }
  .g-cc.run .stage img { animation: cc-cheer .5s ease-in-out infinite alternate; }
  .g-cc.won .stage img { animation: cc-jump .45s cubic-bezier(.3,1.6,.5,1) 3; }
  @keyframes cc-cheer { to { transform: rotate(3deg) translateY(-4px); } }
  @keyframes cc-jump { 50% { transform: translateY(-16px); } }
  .g-cc .dial { position: relative; width: var(--dial); height: var(--dial); border-radius: 50%; cursor: pointer; margin-bottom: 8px;
    background: var(--red); box-shadow: 0 0 0 5px var(--navy), 0 8px 0 5px var(--navy); transition: transform .15s cubic-bezier(.3,1.6,.5,1); }
  .g-cc .dial:active { transform: scale(.96); }
  .g-cc .dial:focus-visible { outline: 4px solid var(--yel); outline-offset: 8px; }
  .g-cc .dial .bulbs { position: absolute; inset: 0; }
  .g-cc .dial .bulbs i { position: absolute; width: 9%; height: 9%; margin: -4.5%; border-radius: 50%; background: var(--yel); box-shadow: 0 0 0 2px rgba(20,80,120,.2);
    animation: cc-blink 1.2s steps(2) infinite; }
  .g-cc .dial .bulbs i:nth-child(even) { animation-delay: -.6s; }
  .g-cc.run .dial .bulbs i { animation: cc-chase .6s linear infinite; }
  @keyframes cc-blink { 50% { background: #fff4c2; } }
  @keyframes cc-chase { 0%, 70% { background: #fff4c2; box-shadow: 0 0 10px #ffe58a; } 71%, 100% { background: #e8a92a; } }
  .g-cc .dial .face { position: absolute; inset: 15%; border-radius: 50%; background: var(--cream); box-shadow: inset 0 0 0 4px var(--navy);
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 2px; }
  .g-cc .dial .atom { width: 22%; }
  .g-cc .dial .txt { font-weight: 900; font-size: calc(var(--dial) * .105); line-height: 1.25; color: var(--navy); }
  .g-cc .dial .hand { position: absolute; right: -8%; bottom: -6%; width: 30%; z-index: 2; animation: cc-tap 1.1s ease-in-out infinite; transform-origin: 30% 20%; }
  .g-cc.run .dial .hand, .g-cc.done .dial .hand { display: none; }
  @keyframes cc-tap { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-6%, -8%) scale(.94); } }
  .g-cc.ready:not(.run):not(.done) .dial { animation: cc-glow 1.6s ease-in-out infinite; }
  @keyframes cc-glow { 50% { box-shadow: 0 0 0 5px var(--navy), 0 8px 0 5px var(--navy), 0 0 0 16px rgba(255, 214, 90, .45); } }
  .g-cc .cards { position: relative; z-index: 1; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 10px; padding: 10px;
    background: #fff; border: 4px solid var(--yel); border-radius: 18px; box-shadow: 0 0 0 3px var(--navy); }
  .g-cc .card { position: relative; width: var(--cw); aspect-ratio: 3 / 4; perspective: 600px; }
  .g-cc .card .in { position: absolute; inset: 0; transition: transform .55s cubic-bezier(.3,1.4,.5,1); transform-style: preserve-3d; }
  .g-cc .card .f, .g-cc .card .k { position: absolute; inset: 0; border-radius: 12px; backface-visibility: hidden; -webkit-backface-visibility: hidden;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 6px 4px; text-align: center; }
  .g-cc .card .f { background: var(--cream); box-shadow: inset 0 0 0 3px var(--navy); transition: background .12s, transform .12s; }
  .g-cc .card .k { background: var(--red); color: #fff; transform: rotateY(180deg); box-shadow: inset 0 0 0 3px var(--navy), inset 0 0 0 7px var(--yel); }
  .g-cc .card.lose .k { background: var(--teal); }
  .g-cc .card .lb { font-size: calc(var(--cw) * .13); font-weight: 900; color: #fff; background: var(--teal); border-radius: 99px; padding: 1px 7px; max-width: 96%;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .g-cc .card.special .lb { background: var(--red); }
  .g-cc .card .ic { width: 46%; }
  .g-cc .card .nm { font-size: calc(var(--cw) * .135); font-weight: 900; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all; }
  .g-cc.compact { padding: 10px 8px 12px; }
  .g-cc.compact .cards { gap: 6px; padding: 8px; }
  .g-cc.compact .card { aspect-ratio: 5 / 6; }
  .g-cc.compact .card .f { gap: 2px; padding: 4px 3px; }
  .g-cc.compact .card .ic { width: 38%; }
  .g-cc.compact .stage img { max-width: 120px; }
  .g-cc .card .k small { font-size: calc(var(--cw) * .12); letter-spacing: .1em; color: var(--yel); font-weight: 700; }
  .g-cc .card .k b { font-size: calc(var(--cw) * .15); line-height: 1.2; }
  .g-cc .card.on .f { background: var(--yel); transform: translateY(-6px); box-shadow: inset 0 0 0 3px var(--navy), 0 6px 0 var(--navy); }
  .g-cc .card.dim { opacity: .45; transition: opacity .3s; }
  .g-cc .card.flip .in { transform: rotateY(180deg); }
  .g-cc .card.flip { z-index: 2; animation: cc-pop .5s cubic-bezier(.3,1.6,.5,1); }
  @keyframes cc-pop { 50% { transform: scale(1.18); } }
  `;
  document.head.appendChild(s);
}

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); }

const ATOM = S('<ellipse cx="24" cy="24" rx="20" ry="8" stroke="#038BA2"/><ellipse cx="24" cy="24" rx="20" ry="8" stroke="#038BA2" transform="rotate(60 24 24)"/><ellipse cx="24" cy="24" rx="20" ry="8" stroke="#038BA2" transform="rotate(120 24 24)"/><circle cx="24" cy="24" r="4" fill="#F45B54" stroke="none"/>');
const HAND = `<svg class="hand" viewBox="0 0 60 64" aria-hidden="true"><g stroke="#145078" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
  <path d="M8 4l4 6M2 16l7 2M20 2l-1 7" stroke="#F45B54"/>
  <path d="M22 14a5 5 0 0 1 10 0v18l2-6a5 5 0 0 1 9 3l-1 4 1-1a5 5 0 0 1 8 5l-2 4a5 5 0 0 1 7 5l-4 10c-3 7-9 10-17 10h-4c-7 0-12-3-15-9l-9-15a5 5 0 0 1 8-6l6 7z" fill="#fff"/></g></svg>`;

function layout() {
  const w = el.clientWidth;
  const landscape = window.innerWidth > window.innerHeight && window.innerWidth >= 900;
  const dial = Math.round(Math.max(150, Math.min(w * 0.44, landscape ? window.innerHeight * 0.3 : 280)));
  el.style.setProperty('--dial', dial + 'px');
  const n = Math.max(1, cards.length);
  const compact = w < 520;
  el.classList.toggle('compact', compact);
  const perRow = compact ? Math.min(n, 4) : Math.min(n, 9);
  const inner = Math.min(w, 860) - 24 - 20;
  const cw = Math.floor(Math.max(58, Math.min(110, (inner - (perRow - 1) * (compact ? 6 : 8)) / perRow)));
  el.style.setProperty('--cw', cw + 'px');
}

export function init(container, prizes, th) {
  injectCss();
  theme = th || {};
  prizesRef = prizes.slice();
  const decor = DECOR.map(([k, x, y, w, rot, d, vb]) =>
    `<svg viewBox="${vb}" style="left:${x}%;top:${y}%;width:${w}px;transform:rotate(${rot}deg)" fill="none" stroke="#145078" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${d}</svg>`).join('');
  const bulbs = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2 - Math.PI / 2;
    return `<i style="left:${(50 + Math.cos(a) * 42.5).toFixed(2)}%;top:${(50 + Math.sin(a) * 42.5).toFixed(2)}%;animation-delay:${(-(i % 6) * 0.1).toFixed(1)}s"></i>`;
  }).join('');
  const starSvg = ICON.star.replace('<svg', '<svg class="st"');
  container.innerHTML = `<div class="g-cc ready">
    <div class="decor">${decor}</div>
    <div class="banner"><div class="cloud">${starSvg}<span class="a">醫學知識</span><span class="b">抽抽樂</span>${starSvg}</div><br>
      <div class="ribbon">試試手氣！看看今天能抽到什麼好禮！</div></div>
    <div class="stage">
      <img class="doc" src="${ART.doctor}" alt="">
      <div class="dial" aria-label="按這裡開始抽獎"><div class="bulbs">${bulbs}</div>
        <div class="face"><span class="atom">${ATOM}</span><span class="txt">點擊開始<br>抽獎吧！</span></div>${HAND}</div>
      <img class="nurse" src="${ART.nurse}" alt="">
    </div>
    <div class="cards">${prizes.map((p, i) => `<div class="card ${p.isLose ? 'lose' : ''} ${p.isSpecial ? 'special' : ''}" data-i="${i}">
      <div class="in"><div class="f">${p.label ? `<span class="lb">${esc(p.label)}</span>` : ''}<span class="ic">${iconFor(p)}</span><span class="nm">${esc(p.name)}</span></div>
        <div class="k"><small>${p.isLose ? '別灰心' : '恭喜獲得'}</small><b>${esc(p.name)}</b></div></div></div>`).join('')}</div>
  </div>`;
  el = container.querySelector('.g-cc');
  cards = Array.from(el.querySelectorAll('.card'));
  const dial = el.querySelector('.dial');
  if (theme.onTrigger) {
    dial.setAttribute('role', 'button');
    dial.setAttribute('tabindex', '0');
    dial.addEventListener('click', () => theme.onTrigger());
    dial.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); theme.onTrigger(); } });
  }
  layout();
  onResize = () => layout();
  window.addEventListener('resize', onResize);
}

function setText(html) { const t = el && el.querySelector('.dial .txt'); if (t) t.innerHTML = html; }

function light(i) {
  if (cur >= 0 && cards[cur]) cards[cur].classList.remove('on');
  cur = i;
  if (cards[cur]) cards[cur].classList.add('on');
  sfx.tick();
}

/** 按下開始：卡片開始快速輪流亮起，等待後端結果 */
export function start() {
  if (running) return;
  running = true;
  clearTimeout(timer);
  el.classList.remove('done', 'won');
  el.classList.add('run');
  cards.forEach((c) => c.classList.remove('flip', 'dim'));
  setText('抽獎中…');
  sfx.spinStart();
  const step = () => {
    if (!running) return;
    light((cur + 1) % cards.length);
    timer = setTimeout(step, 85);
  };
  step();
}

/** 減速、停在 resultPrize 那張卡片，翻面揭曉 */
export function play(resultPrize) {
  return new Promise((resolve) => {
    if (!running) start();
    clearTimeout(timer);
    running = false;
    const n = cards.length;
    const target = Math.max(0, prizesRef.findIndex((p) => p.prizeId === resultPrize.prizeId));
    const laps = Math.max(1, Math.ceil(14 / n));
    const steps = laps * n + ((target - cur + n) % n || (n === 1 ? 0 : n));
    let k = 0;
    const next = () => {
      k++;
      light((cur + 1) % n);
      if (k >= steps) return finish();
      const p = k / steps;
      timer = setTimeout(next, 85 + Math.pow(p, 2.4) * 420);
    };
    const finish = () => {
      el.classList.remove('run');
      el.classList.add('done');
      if (!resultPrize.isLose) el.classList.add('won');
      setText(resultPrize.isLose ? '再接再厲！' : '恭喜<br>中獎！');
      setTimeout(() => {
        cards.forEach((c, i) => { if (i !== target) c.classList.add('dim'); });
        cards[target].classList.remove('on');
        cards[target].classList.add('flip');
        setTimeout(resolve, 700);
      }, 380);
    };
    if (steps <= 0) finish(); else timer = setTimeout(next, 85);
  });
}

/** 後端失敗：停下來，回到待機 */
export function cancel() {
  running = false;
  clearTimeout(timer);
  if (!el) return;
  el.classList.remove('run');
  if (cards[cur]) cards[cur].classList.remove('on');
  setText('點擊開始<br>抽獎吧！');
}

/** 下一位 */
export function reset() {
  running = false;
  clearTimeout(timer);
  if (!el) return;
  el.classList.remove('run', 'done', 'won');
  cards.forEach((c) => c.classList.remove('on', 'flip', 'dim'));
  setText('點擊開始<br>抽獎吧！');
}

export function destroy() {
  running = false;
  clearTimeout(timer);
  window.removeEventListener('resize', onResize);
  el = null;
  cards = [];
}
