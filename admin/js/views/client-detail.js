/** 客戶詳情：基本資料＋該客戶所有活動 */
import { api, cachedApi } from '../../../assets/js/api.js';
import { $, esc, toast, toastErr, confirmBox, emptyHtml, ICON, fmtDate } from '../ui.js';
import { editClient } from './clients.js';
import { eventTable } from './events.js';

export async function render(root, [clientId], app) {
  const [clients, events] = await Promise.all([cachedApi('clients.list'), cachedApi('events.list')]);
  const c = clients.find((x) => x.clientId === clientId);
  if (!c) {
    root.innerHTML = emptyHtml({ title: '找不到這個客戶', text: '可能已被刪除，或這是其他業務的客戶', action: '<a class="btn" href="#/clients">回到客戶列表</a>' });
    return;
  }
  const mine = events.filter((e) => e.clientId === clientId);

  root.innerHTML = `
    <div class="crumb"><a href="#/clients">客戶</a> ／</div>
    <div class="page-head">
      <div><h1>${esc(c.name)}</h1><div class="sub"><span class="badge">${esc(c.type)}</span>　建立於 ${fmtDate(c.createdAt)}${app.isAdmin() ? `　業務：${esc(c.ownerName)}` : ''}</div></div>
      <div class="actions">
        ${c.canEdit ? `<button class="btn" id="btnEdit">${ICON.edit}編輯</button>
        <button class="btn danger" id="btnDel">${ICON.trash}刪除</button>` : ''}
        <a class="btn accent" href="#/events/new?client=${esc(c.clientId)}">${ICON.plus}為這個客戶建立活動</a>
      </div>
    </div>
    ${c.note ? `<div class="card" style="margin-bottom:16px"><div class="muted small">備註</div><div style="white-space:pre-wrap">${esc(c.note)}</div></div>` : ''}
    <h2 style="font-size:16px;color:var(--navy-800);margin:24px 0 12px">活動（${mine.length}）</h2>
    <div id="events">${mine.length ? eventTable(mine, app, { showClient: false }) : emptyHtml({ title: '這個客戶還沒有活動', text: '建立第一個擺攤活動吧！' })}</div>`;

  $('#events').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) app.go('#/events/' + tr.dataset.id);
  });
  $('#btnEdit')?.addEventListener('click', async () => {
    if (await editClient(c)) { toast('已更新'); render(root, [clientId], app); }
  });
  $('#btnDel')?.addEventListener('click', async () => {
    if (mine.length) return toastErr(`這個客戶底下還有 ${mine.length} 個活動，不能刪除`);
    if (!(await confirmBox(`確定要刪除客戶「${c.name}」嗎？`, { ok: '刪除', danger: true }))) return;
    try { await api('clients.delete', { clientId }); toast('已刪除'); app.go('#/clients'); } catch (e) { toastErr(e); }
  });
}
