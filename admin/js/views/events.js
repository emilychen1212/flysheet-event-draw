/** 專案活動列表 */
import { api, cachedApi } from '../../../assets/js/api.js';
import { $, esc, emptyHtml, ICON, badge, STATE, GAMES, fmtRange } from '../ui.js';

export function eventTable(list, app, { showClient = true } = {}) {
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>活動</th>${showClient ? '<th>客戶</th>' : ''}<th>時間</th><th>遊戲</th><th>前台狀態</th><th class="num">已抽 / 獎品</th><th>業務</th></tr></thead>
    <tbody>${list.map((e) => `<tr class="clickable" data-id="${esc(e.eventId)}">
      <td><b>${esc(e.title)}</b><div class="small muted" style="font-family:var(--font-mono);letter-spacing:.05em">${esc(e.eventCode)}
        ${e.status === 'draft' ? ' <span class="badge">草稿</span>' : ''}${e.isTestMode ? ' <span class="badge yellow">測試中</span>' : ''}</div></td>
      ${showClient ? `<td class="small">${esc(e.clientName)}</td>` : ''}
      <td class="small">${esc(fmtRange(e.startAt, e.endAt))}</td>
      <td class="small">${GAMES[e.gameType] ? GAMES[e.gameType].ico + ' ' + GAMES[e.gameType].label : ''}</td>
      <td>${badge(STATE, e.state)}</td>
      <td class="num small">${e.prizeTotal - e.prizeRemaining} / ${e.prizeTotal}</td>
      <td class="small">${esc(e.ownerName)}${e.canEdit ? '' : ' <span class="badge" title="其他業務的活動，只能檢視">唯讀</span>'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

export async function render(root, _p, app) {
  const events = await cachedApi('events.list');
  const f = { q: '', client: '', status: '', owner: app.isAdmin() ? '' : 'me' };
  const owners = [...new Map(events.map((e) => [e.ownerId, e.ownerName])).entries()];
  const clients = [...new Map(events.filter((e) => e.canEdit).map((e) => [e.clientId, e.clientName])).entries()];

  root.innerHTML = `
    <div class="page-head">
      <div><h1>專案活動</h1><div class="sub">其他業務的活動只能檢視，不能修改</div></div>
      <div class="actions"><a class="btn accent" href="#/events/new">${ICON.plus}建立活動</a></div>
    </div>
    ${events.length ? `<div class="filters">
      <input class="input search" id="fq" placeholder="搜尋活動名稱或代碼">
      <select class="input" id="fOwner">
        <option value="me">我的活動</option><option value="">全部業務</option>
        ${owners.filter(([id]) => id !== app.user.userId).map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}
      </select>
      <select class="input" id="fClient"><option value="">全部客戶</option>${clients.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select>
      <select class="input" id="fStatus">
        <option value="">全部狀態</option><option value="draft">草稿</option><option value="active">進行中</option><option value="ended">已結束</option>
      </select>
    </div>` : ''}
    <div id="list"></div>`;

  const draw = () => {
    const list = events.filter((e) =>
      (!f.q || (e.title + ' ' + e.eventCode).toLowerCase().includes(f.q)) &&
      (!f.client || e.clientId === f.client) &&
      (!f.status || e.status === f.status) &&
      (!f.owner || (f.owner === 'me' ? e.ownerId === app.user.userId : e.ownerId === f.owner)));
    $('#list').innerHTML = !events.length
      ? emptyHtml({ title: '還沒有任何活動', text: '建立第一個擺攤活動，設定獎池與遊戲，就能拿到抽獎 QR code', action: `<a class="btn accent" href="#/events/new">${ICON.plus}建立活動</a>` })
      : list.length ? eventTable(list, app) : '<div class="empty"><p>沒有符合條件的活動</p></div>';
  };
  if (events.length) {
    $('#fOwner').value = f.owner;
    $('#fq').oninput = (e) => { f.q = e.target.value.trim().toLowerCase(); draw(); };
    $('#fOwner').onchange = (e) => { f.owner = e.target.value; draw(); };
    $('#fClient').onchange = (e) => { f.client = e.target.value; draw(); };
    $('#fStatus').onchange = (e) => { f.status = e.target.value; draw(); };
  }
  draw();
  $('#list').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) app.go('#/events/' + tr.dataset.id);
  });
}
