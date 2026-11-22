/** 客戶詳情：基本資料＋該客戶所有活動 */
import { api, cachedApi } from '../../../assets/js/api.js';
import { $, $$, esc, toast, toastErr, confirmBox, emptyHtml, ICON, fmtDate, busy } from '../ui.js';
import { editClient } from './clients.js';
import { eventTable } from './events.js';

export async function render(root, [clientId], app) {
  const [clients, events, dbs, tpls] = await Promise.all([cachedApi('clients.list'), cachedApi('events.list'),
    cachedApi('clientDbs.list', { clientId }).catch(() => []), cachedApi('templates.list').catch(() => [])]);
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
    <section class="card" id="dbBox">
      <h2 class="card-title"><span>訂購的資料庫</span>${c.canEdit ? `<button class="btn sm primary" id="saveDbs">儲存資料庫設定</button>` : ''}</h2>
      <p class="muted small" style="margin:-6px 0 12px">設定這個客戶有訂哪些資料庫、該校的連結（proxy／校內入口）。之後建立活動時會自動列出這些資料庫的任務卡。</p>
      <datalist id="dbNames">${[...new Set(tpls.map((t) => t.dbName))].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="cdb-head"><span>資料庫名稱</span><span>該校連結</span><span>備註</span><span></span></div>
      <div id="dbRows"></div>
      ${c.canEdit ? `<button class="btn sm" id="addDb" style="margin-top:8px">${ICON.plus}新增資料庫</button>` : ''}
    </section>
    <h2 style="font-size:16px;color:var(--navy-800);margin:24px 0 12px">活動（${mine.length}）</h2>
    <div id="events">${mine.length ? eventTable(mine, app, { showClient: false }) : emptyHtml({ title: '這個客戶還沒有活動', text: '建立第一個擺攤活動吧！' })}</div>`;

  /* ---------- 訂購的資料庫 ---------- */
  const dis = c.canEdit ? '' : 'disabled';
  const rowHtml = (d) => `<div class="cdb-row">
      <input class="input" data-k="dbName" list="dbNames" maxlength="60" value="${esc(d.dbName || '')}" placeholder="例：UpToDate" ${dis}>
      <input class="input" data-k="url" maxlength="500" value="${esc(d.url || '')}" placeholder="https://…（留空則用範本預設連結）" ${dis}>
      <input class="input" data-k="note" maxlength="300" value="${esc(d.note || '')}" placeholder="例：只能校內 IP 使用" ${dis}>
      ${c.canEdit ? `<button class="btn sm ghost" data-del-db title="刪除">${ICON.trash}</button>` : '<span></span>'}</div>`;
  $('#dbRows').innerHTML = dbs.length ? dbs.map(rowHtml).join('') : (c.canEdit ? rowHtml({}) : '<div class="muted small">還沒有設定</div>');
  $('#addDb')?.addEventListener('click', () => { $('#dbRows').insertAdjacentHTML('beforeend', rowHtml({})); $$('#dbRows [data-k=dbName]').pop().focus(); });
  $('#dbRows').addEventListener('click', (e) => { const b = e.target.closest('[data-del-db]'); if (b) b.closest('.cdb-row').remove(); });
  $('#saveDbs')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const items = $$('#dbRows .cdb-row').map((r) => ({ dbName: $('[data-k=dbName]', r).value, url: $('[data-k=url]', r).value, note: $('[data-k=note]', r).value }))
      .filter((x) => x.dbName.trim());
    try { await api('clientDbs.save', { clientId, items }); toast('資料庫設定已儲存'); render(root, [clientId], app); } catch (err) { toastErr(err); }
  }));

  $('#events').addEventListener('click', (e) => {
    if (e.target.closest('[data-stop]')) return;
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
