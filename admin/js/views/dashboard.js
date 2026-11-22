/** 總覽：本月統計＋我負責的活動（進行中／即將開始／最近結束），每張卡片有快速連結 */
import { cachedApi } from '../../../assets/js/api.js';
import { $, esc, emptyHtml, ICON, badge, STATE, GAMES, fmtRange, modal } from '../ui.js';
import { drawQr } from './publish.js';

function playUrl(code, screen) {
  const u = new URL('../play/', location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('event', code);
  if (screen) u.searchParams.set('view', 'screen');
  return u.toString();
}

function card(e) {
  const used = e.prizeTotal - e.prizeRemaining;
  const pct = e.prizeTotal ? Math.round(used / e.prizeTotal * 100) : 0;
  const unit = e.regMode === 'before' ? '人' : '人次';
  return `<article class="card lift event-card">
    <a class="top" href="#/events/${esc(e.eventId)}">
      <div><div class="code">${esc(e.eventCode)}${e.isTestMode ? ' <span class="badge yellow">測試中</span>' : ''}</div><h3>${esc(e.title)}</h3></div>${badge(STATE, e.state)}</a>
    <div class="meta"><span>${esc(e.clientName)}</span><span>${esc(fmtRange(e.startAt, e.endAt))}</span><span>${GAMES[e.gameType]?.ico || ''} ${GAMES[e.gameType]?.label || ''}</span></div>
    <div class="nums">
      <div><b>${e.todayParticipants ?? e.todayDrawCount}</b><span>今日參與（${unit}）</span></div>
      <div><b>${e.prizeRemaining}<small> / ${e.prizeTotal}</small></b><span>剩餘獎品</span></div>
    </div>
    <div class="bar" title="已發出 ${pct}%"><i style="width:${pct}%"></i></div>
    <div class="quick">
      <a class="btn sm" href="${esc(playUrl(e.eventCode))}" target="_blank" rel="noopener">${ICON.external}抽獎頁</a>
      <a class="btn sm" href="${esc(playUrl(e.eventCode, true))}" target="_blank" rel="noopener">${ICON.external}展示頁</a>
      <button class="btn sm" data-qr="${esc(e.eventCode)}" data-title="${esc(e.title)}">${ICON.qr}QR</button>
      <a class="btn sm" href="#/events/${esc(e.eventId)}/report">${ICON.chart}報表</a>
    </div>
  </article>`;
}

export async function render(root, _p, app) {
  const [all, stats] = await Promise.all([cachedApi('events.list'), cachedApi('dashboard.get').catch(() => null)]);
  const events = all.filter((e) => e.isMine);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const live = events.filter((e) => e.status === 'active' && (e.state === 'open' || e.state === 'soldOut'))
    .sort((a, b) => a.endAt.localeCompare(b.endAt));
  const upcoming = events.filter((e) => !live.includes(e) && e.status !== 'ended' && e.endAt.slice(0, 10) >= today)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const recent = events.filter((e) => !live.includes(e) && !upcoming.includes(e))
    .sort((a, b) => b.endAt.localeCompare(a.endAt)).slice(0, 6);
  const hi = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Taipei' }));
  const greet = hi < 11 ? '早安' : hi < 18 ? '午安' : '晚安';
  const month = stats ? Number(stats.month.slice(5, 7)) : new Date().getMonth() + 1;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>${greet}，${esc(app.user.name || '')} 👋</h1><div class="sub">這裡是你負責的活動總覽（含協作的活動）</div></div>
      <div class="actions"><a class="btn accent" href="#/events/new">${ICON.plus}建立活動</a></div>
    </div>
    <div class="grid dstats">
      <div class="card stat"><span class="v">${stats ? stats.participants : '—'}</span><span class="l">${month} 月參與人數</span><span class="hint">不含測試資料</span></div>
      <div class="card stat"><span class="v">${stats ? stats.draws : '—'}</span><span class="l">${month} 月抽獎次數</span></div>
      <div class="card stat"><span class="v">${stats ? stats.leads : '—'}</span><span class="l">${month} 月新增潛在客戶</span><span class="hint">${stats && stats.recommend ? `其中協助推薦採購 ${stats.recommend} 筆` : '&nbsp;'}</span></div>
      <div class="card stat"><span class="v">${live.length}</span><span class="l">進行中的活動</span><span class="hint">即將開始 ${upcoming.length} 個</span></div>
    </div>
    ${!events.length ? `<div class="card">${emptyHtml({ title: '準備好第一個擺攤活動了嗎？', text: '先建立客戶，再為客戶建立活動、設定獎池，就能拿到抽獎 QR code。', action: `<a class="btn accent" href="#/clients">${ICON.plus}從建立客戶開始</a>` })}</div>` : `
    <h2 class="dsec">進行中的活動</h2>
    ${live.length ? `<div class="grid auto">${live.map(card).join('')}</div>` : '<div class="card muted small">目前沒有開放抽獎中的活動</div>'}
    ${upcoming.length ? `<h2 class="dsec">即將開始</h2><div class="grid auto">${upcoming.map(card).join('')}</div>` : ''}
    ${recent.length ? `<h2 class="dsec">最近結束</h2><div class="grid auto">${recent.map(card).join('')}</div>` : ''}`}`;

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qr]');
    if (!b) return;
    const url = playUrl(b.dataset.qr);
    modal({
      title: b.dataset.title,
      body: `<div style="text-align:center"><canvas id="dqr" width="400" height="400" style="width:min(320px,100%);height:auto;image-rendering:pixelated"></canvas>
        <div class="small muted" style="word-break:break-all;margin-top:6px">${esc(url)}</div></div>`,
      onOpen: (m) => { try { drawQr($('#dqr', m), url, 400); } catch (err) { $('#dqr', m).replaceWith(err.message); } },
      actions: [{ label: '關閉', kind: 'ghost', value: null }, {
        label: '下載高解析 PNG', kind: 'accent', onClick: () => new Promise((res) => {
          drawQr(document.createElement('canvas'), url, 1200).toBlob((blob) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `QR_${b.dataset.qr}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            res(false);
          }, 'image/png');
        })
      }]
    });
  });
}
