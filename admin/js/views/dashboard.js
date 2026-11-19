/** 總覽（第 7 階段會加上統計數字，目前先列出活動） */
import { api } from '../../../assets/js/api.js';
import { esc, emptyHtml, ICON, badge, STATE, GAMES, fmtRange } from '../ui.js';

function card(e) {
  const used = e.prizeTotal - e.prizeRemaining;
  const pct = e.prizeTotal ? Math.round(used / e.prizeTotal * 100) : 0;
  return `<a class="card lift event-card" href="#/events/${esc(e.eventId)}">
    <div class="top"><div><div class="code">${esc(e.eventCode)}</div><h3>${esc(e.title)}</h3></div>${badge(STATE, e.state)}</div>
    <div class="meta"><span>${esc(e.clientName)}</span><span>${esc(fmtRange(e.startAt, e.endAt))}</span><span>${GAMES[e.gameType]?.ico || ''} ${GAMES[e.gameType]?.label || ''}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="meta"><span>今日抽獎 <b style="color:var(--navy-800)">${e.todayDrawCount}</b> 次</span><span>獎品剩 <b style="color:var(--navy-800)">${e.prizeRemaining}</b> / ${e.prizeTotal}</span>
      ${e.isTestMode ? '<span class="badge yellow">測試中</span>' : ''}</div>
  </a>`;
}

export async function render(root, _p, app) {
  const events = (await api('events.list')).filter((e) => e.ownerId === app.user.userId);
  const now = new Date().toISOString().slice(0, 10);
  const live = events.filter((e) => e.state === 'open' || (e.status === 'active' && e.state === 'soldOut'));
  const upcoming = events.filter((e) => !live.includes(e) && e.status !== 'ended' && e.endAt.slice(0, 10) >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const recent = events.filter((e) => !live.includes(e) && !upcoming.includes(e)).slice(0, 6);
  const hi = new Date().getHours();
  const greet = hi < 11 ? '早安' : hi < 18 ? '午安' : '晚安';

  root.innerHTML = `
    <div class="page-head">
      <div><h1>${greet}，${esc(app.user.name || '')} 👋</h1><div class="sub">這裡是你的活動總覽</div></div>
      <div class="actions"><a class="btn accent" href="#/events/new">${ICON.plus}建立活動</a></div>
    </div>
    ${!events.length ? `<div class="card">${emptyHtml({ title: '準備好第一個擺攤活動了嗎？', text: '先建立客戶，再為客戶建立活動、設定獎池，就能拿到抽獎 QR code。', action: `<a class="btn accent" href="#/clients">${ICON.plus}從建立客戶開始</a>` })}</div>` : `
    <h2 style="font-size:16px;color:var(--navy-800);margin:8px 0 12px">進行中的活動</h2>
    ${live.length ? `<div class="grid auto">${live.map(card).join('')}</div>` : '<div class="card muted small">目前沒有開放抽獎中的活動</div>'}
    ${upcoming.length ? `<h2 style="font-size:16px;color:var(--navy-800);margin:28px 0 12px">即將開始</h2><div class="grid auto">${upcoming.map(card).join('')}</div>` : ''}
    ${recent.length ? `<h2 style="font-size:16px;color:var(--navy-800);margin:28px 0 12px">最近結束</h2><div class="grid auto">${recent.map(card).join('')}</div>` : ''}`}`;
}
