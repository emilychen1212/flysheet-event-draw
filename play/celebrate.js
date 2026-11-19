/**
 * 特別獎慶祝：全畫面彩帶、紙花、獎項名稱放大，點一下關閉。回傳 Promise（關閉時 resolve）
 */
const COLORS = ['#f27a2b', '#f8b07c', '#ffd34d', '#ffffff', '#3d5596', '#2d8a57', '#d96aa0', '#4aa3c2'];

function injectCss() {
  if (document.getElementById('celebrate-css')) return;
  const s = document.createElement('style');
  s.id = 'celebrate-css';
  s.textContent = `
  .celebrate { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; cursor: pointer;
    background: radial-gradient(circle at 50% 45%, rgba(27,42,82,.75), rgba(10,15,32,.92)); animation: cel-in .3s ease-out; }
  .celebrate canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .celebrate .burst { position: absolute; width: 140vmax; height: 140vmax; left: 50%; top: 45%; margin: -70vmax 0 0 -70vmax; pointer-events: none;
    background: repeating-conic-gradient(rgba(255, 211, 77, .14) 0 8deg, transparent 8deg 20deg); animation: cel-spin 14s linear infinite; }
  .celebrate .box { position: relative; text-align: center; color: #fff; padding: 24px; max-width: 92vw; }
  .celebrate .kicker { font: 700 clamp(14px, 3.6vw, 20px)/1 'Noto Sans TC', sans-serif; letter-spacing: .5em; color: #ffd34d; animation: cel-drop .6s cubic-bezier(.3,1.6,.5,1) both; }
  .celebrate .name { margin: 18px 0 14px; font: 900 clamp(40px, 12vw, 104px)/1.1 'Noto Sans TC', sans-serif; letter-spacing: .04em;
    background: linear-gradient(180deg, #fff6c8, #ffd34d 50%, #f27a2b); -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 6px 0 rgba(0,0,0,.35)); animation: cel-zoom .8s cubic-bezier(.2,1.7,.4,1) .15s both; }
  .celebrate .tip { font-size: 14px; opacity: .7; animation: cel-in .4s 1.2s both; }
  @keyframes cel-in { from { opacity: 0; } }
  @keyframes cel-spin { to { transform: rotate(360deg); } }
  @keyframes cel-drop { from { opacity: 0; transform: translateY(-30px); } }
  @keyframes cel-zoom { 0% { opacity: 0; transform: scale(.2) rotate(-8deg); } 70% { transform: scale(1.08) rotate(2deg); } 100% { opacity: 1; transform: none; } }
  .celebrate.out { opacity: 0; transition: opacity .3s; }
  `;
  document.head.appendChild(s);
}

export function celebrate(prizeName) {
  injectCss();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'celebrate';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '恭喜抽中特別獎：' + prizeName);
    box.innerHTML = `<div class="burst"></div><canvas></canvas><div class="box"><div class="kicker">✦ 特 別 獎 ✦</div><div class="name"></div><div class="tip">點一下畫面關閉</div></div>`;
    box.querySelector('.name').textContent = prizeName;
    document.body.appendChild(box);

    const canvas = box.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W, H;
    const fit = () => { W = innerWidth; H = innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit();
    window.addEventListener('resize', fit);

    const parts = [];
    const spawn = (n, fromSides) => {
      for (let i = 0; i < n; i++) {
        const side = fromSides ? (i % 2 ? 1 : -1) : 0;
        const ribbon = Math.random() < 0.3;
        parts.push({
          x: fromSides ? (side < 0 ? -10 : W + 10) : Math.random() * W,
          y: fromSides ? H * (0.55 + Math.random() * 0.3) : -20 - Math.random() * H * 0.5,
          vx: fromSides ? -side * (4 + Math.random() * 7) : (Math.random() - 0.5) * 1.5,
          vy: fromSides ? -(8 + Math.random() * 9) : 1 + Math.random() * 2,
          w: ribbon ? 5 : 6 + Math.random() * 6,
          h: ribbon ? 24 + Math.random() * 20 : 8 + Math.random() * 8,
          a: Math.random() * Math.PI * 2,
          va: (Math.random() - 0.5) * 0.3,
          wob: Math.random() * 10,
          c: COLORS[Math.floor(Math.random() * COLORS.length)],
          ribbon
        });
      }
    };
    spawn(160, true);
    spawn(60, false);
    let t = 0, raf = 0, alive = true;
    const loop = () => {
      if (!alive) return;
      t++;
      if (t % 40 === 0 && t < 600) spawn(14, false);   // 持續飄落一段時間
      ctx.clearRect(0, 0, W, H);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy = Math.min(p.vy + 0.18, 3.2 + (p.ribbon ? 0 : 0.8));
        p.vx *= 0.985;
        p.x += p.vx + Math.sin((t + p.wob * 10) / 16) * 0.8;
        p.y += p.vy;
        p.a += p.va;
        if (p.y > H + 40) { parts.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.scale(1, Math.cos(t / 8 + p.wob));   // 翻面閃爍
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const close = () => {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      box.classList.add('out');
      setTimeout(() => { box.remove(); resolve(); }, 300);
    };
    setTimeout(() => box.addEventListener('click', close), 500);   // 避免連點誤關
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') { document.removeEventListener('keydown', onKey); close(); }
    });
  });
}
