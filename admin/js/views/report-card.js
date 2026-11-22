/**
 * 一頁式成果圖卡：1920 × 1080（16:9），飛資得樣式，可直接放進簡報
 * 活動名、客戶、日期、4 個關鍵數字、3 張小圖（時段分布、服務單位前 5 名、身分）
 */
import { slotRange, sumDays } from './report.js';

const C = {
  navy: '#1b2a52', navy7: '#24376a', navy1: '#e4e9f5', orange: '#f27a2b', orange3: '#f8b07c', orange1: '#fde9da',
  bg: '#faf8f4', card: '#ffffff', line: '#e6e0d6', ink: '#2a2723', muted: '#8a837a', track: '#f2eee7'
};
const SANS = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
const SERIF = 'Fraunces, Georgia, serif';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, maxW) {
  text = String(text ?? '');
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

function fmtDates(a, b) {
  if (!a) return '';
  const d = (s) => s.slice(0, 10).replace(/-/g, '/');
  return d(a) === d(b) ? `${d(a)}　${a.slice(11, 16)}–${b.slice(11, 16)}` : `${d(a)} – ${d(b)}`;
}

function panel(ctx, x, y, w, h, title) {
  ctx.fillStyle = C.card;
  rr(ctx, x, y, w, h, 28);
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = C.navy;
  ctx.font = `700 32px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, x + 36, y + 62);
}

function hbars(ctx, items, x, y, w, h, total) {
  if (!items.length) {
    ctx.fillStyle = C.muted; ctx.font = `400 26px ${SANS}`; ctx.fillText('尚無資料', x, y + 40); return;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  const rowH = Math.min(70, h / items.length);
  const labelW = Math.min(200, w * 0.38);
  items.forEach((it, i) => {
    const cy = y + i * rowH + rowH / 2;
    ctx.fillStyle = C.ink;
    ctx.font = `500 24px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, it.name, labelW - 12), x, cy);
    const bx = x + labelW, bw = w - labelW - 90;
    ctx.fillStyle = C.track; rr(ctx, bx, cy - 9, bw, 18, 9); ctx.fill();
    const len = Math.max(18, bw * it.count / max);
    ctx.fillStyle = it.other ? C.orange3 : C.orange; rr(ctx, bx, cy - 9, len, 18, 9); ctx.fill();
    ctx.fillStyle = C.navy;
    ctx.font = `700 26px ${SERIF}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(it.count), x + w, cy);
    ctx.textAlign = 'left';
  });
  ctx.textBaseline = 'alphabetic';
}

function columns(ctx, values, [lo, hi], x, y, w, h) {
  const data = values.slice(lo, hi + 1);
  const max = Math.max(...data, 1);
  const baseY = y + h - 40;
  const bw = w / data.length;
  ctx.strokeStyle = C.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, baseY + 1); ctx.lineTo(x + w, baseY + 1); ctx.stroke();
  data.forEach((v, i) => {
    if (!v) return;
    const bh = (v / max) * (h - 70);
    ctx.fillStyle = C.orange;
    rr(ctx, x + i * bw + 3, baseY - bh, Math.max(4, bw - 6), bh + 4, Math.min(8, (bw - 6) / 2));
    ctx.fill();
  });
  // 尖峰標註
  const peak = data.indexOf(max);
  if (max > 0) {
    ctx.fillStyle = C.navy; ctx.font = `700 24px ${SERIF}`; ctx.textAlign = 'center';
    ctx.fillText(String(max), x + peak * bw + bw / 2, baseY - (max / max) * (h - 70) - 12);
  }
  const step = Math.max(1, Math.ceil(data.length / 6));
  ctx.fillStyle = C.muted; ctx.font = `400 20px ${SANS}`; ctx.textAlign = 'center';
  data.forEach((_, i) => {
    if (i % step) return;
    const m = (lo + i) * 30;
    ctx.fillText(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, x + i * bw + bw / 2, baseY + 32);
  });
  ctx.textAlign = 'left';
}

export async function drawCard(r) {
  const ev = r.event;
  const by = r.participantsBy === 'people';
  const real = r.prizes.filter((p) => !p.isLose);
  const issued = real.reduce((s, p) => s + p.issued, 0);
  const total = real.reduce((s, p) => s + p.quantity, 0);
  const orgs = r.organizations.slice(0, 5);
  const ids = r.identities.slice(0, 5);
  const stats = [
    [String(r.participants), `參與${by ? '人數' : '人次'}`],
    [String(r.draws), '抽獎總次數'],
    [r.consent.rate === null ? '—' : Math.round(r.consent.rate * 100) + '%', '產品資訊同意率'],
    [String(r.leads.total), '潛在客戶']
  ];
  const texts = [ev.title, ev.clientDisplayName || ev.clientName, '飛資得醫學資訊活動成果報告時段分布服務單位前名身分尚無資料不含測試資料參與人數人次抽獎總次數產品資訊同意率潛在客戶獎品已發出份資料時間',
    ...orgs.map((o) => o.name), ...ids.map((o) => o.name)].join('');
  if (document.fonts && document.fonts.load) {
    try {
      await Promise.all([
        document.fonts.load(`700 40px "Noto Sans TC"`, texts), document.fonts.load(`500 24px "Noto Sans TC"`, texts),
        document.fonts.load(`400 24px "Noto Sans TC"`, texts), document.fonts.load(`700 40px Fraunces`, '0123456789%—')
      ]);
    } catch (e) { /* 字型載入失敗就用系統字 */ }
  }

  const W = 1920, H = 1080;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

  // 頁首
  ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, 300);
  ctx.fillStyle = 'rgba(242,122,43,.18)';
  ctx.beginPath(); ctx.arc(W - 160, -40, 360, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.orange; rr(ctx, 90, 64, 56, 56, 16); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 36px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('F', 118, 94); ctx.textAlign = 'left';
  ctx.font = `700 28px ${SANS}`; ctx.fillText('飛資得醫學資訊', 166, 86);
  ctx.globalAlpha = .65; ctx.font = `500 20px ${SANS}`; ctx.fillText('活動成果報告', 166, 116); ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 68px ${SANS}`; ctx.fillStyle = '#fff';
  ctx.fillText(fit(ctx, ev.title, W - 180), 90, 220);
  ctx.font = `500 30px ${SANS}`; ctx.fillStyle = C.orange3;
  ctx.fillText(fit(ctx, `${ev.clientDisplayName || ev.clientName}　｜　${fmtDates(ev.startAt, ev.endAt)}`, W - 180), 90, 268);

  // 關鍵數字
  const sx = 90, sy = 340, sw = (W - 180 - 3 * 32) / 4, sh = 190;
  stats.forEach(([v, l], i) => {
    const x = sx + i * (sw + 32);
    ctx.fillStyle = C.card; rr(ctx, x, sy, sw, sh, 28); ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.orange; rr(ctx, x + 36, sy + 36, 10, 118, 5); ctx.fill();
    ctx.fillStyle = C.navy; ctx.font = `700 92px ${SERIF}`; ctx.fillText(v, x + 70, sy + 118);
    ctx.fillStyle = C.muted; ctx.font = `500 28px ${SANS}`; ctx.fillText(l, x + 72, sy + 160);
  });

  // 三張小圖
  const py = 570, ph = 420, gap = 32;
  const pw1 = 780, pw = (W - 180 - pw1 - gap * 2) / 2;
  panel(ctx, 90, py, pw1, ph, '時段分布（每 30 分鐘）');
  if (r.draws) columns(ctx, sumDays(r.byDay), slotRange(r.byDay), 126, py + 96, pw1 - 72, ph - 120);
  else { ctx.fillStyle = C.muted; ctx.font = `400 26px ${SANS}`; ctx.fillText('尚無資料', 126, py + 140); }
  panel(ctx, 90 + pw1 + gap, py, pw, ph, '服務單位 前 5 名');
  hbars(ctx, orgs, 90 + pw1 + gap + 36, py + 100, pw - 72, ph - 130, r.registered);
  panel(ctx, 90 + pw1 + gap * 2 + pw, py, pw, ph, '身分');
  hbars(ctx, ids, 90 + pw1 + gap * 2 + pw + 36, py + 100, pw - 72, ph - 130, r.registered);

  // 頁尾
  ctx.fillStyle = C.muted; ctx.font = `400 22px ${SANS}`;
  ctx.fillText(`獎品已發出 ${issued} / ${total} 份・資料時間 ${r.generatedAt.slice(0, 16).replace(/-/g, '/')}・不含測試資料`, 90, 1046);
  ctx.textAlign = 'right'; ctx.font = `500 22px ${SERIF}`;
  ctx.fillText('Flysheet Event Draw', W - 90, 1046);
  ctx.textAlign = 'left';
  return cv;
}
