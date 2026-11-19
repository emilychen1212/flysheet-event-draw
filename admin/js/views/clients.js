/** 客戶列表 */
import { api } from '../../../assets/js/api.js';
import { $, esc, modal, toast, emptyHtml, ART_CLIENT, ICON } from '../ui.js';

export const CLIENT_TYPES = ['醫學院', '醫院', '護校', '其他'];

/** 新增／編輯客戶對話框；回傳儲存後的客戶，取消回傳 null */
export function editClient(c) {
  return modal({
    title: c ? '編輯客戶' : '新增客戶',
    body: `
      <div class="field"><label>客戶名稱<span class="req">*</span></label>
        <input class="input" id="cName" value="${esc(c ? c.name : '')}" placeholder="例：臺大醫圖" maxlength="100"></div>
      <div class="field"><label>類型</label>
        <div class="seg" style="align-self:flex-start">${CLIENT_TYPES.map((t) => `<label><input type="radio" name="cType" value="${t}" ${(c ? c.type : '醫學院') === t ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
      <div class="field"><label>備註</label><textarea class="input" id="cNote" placeholder="聯絡窗口、採購習慣等（只有你看得到）" maxlength="1000">${esc(c ? c.note : '')}</textarea></div>`,
    actions: [
      { label: '取消', kind: 'ghost', value: null },
      {
        label: '儲存', kind: 'primary', onClick: (m) => api('clients.save', {
          clientId: c ? c.clientId : '',
          name: $('#cName', m).value,
          type: $('input[name=cType]:checked', m).value,
          note: $('#cNote', m).value
        })
      }
    ]
  });
}

export async function render(root, _p, app) {
  const clients = await api('clients.list');
  let q = '';
  let type = '';

  root.innerHTML = `
    <div class="page-head">
      <div><h1>客戶</h1><div class="sub">${app.isAdmin() ? '所有業務的客戶' : '你建立的客戶（每位業務各自管理）'}</div></div>
      <div class="actions"><button class="btn accent" id="btnAdd">${ICON.plus}新增客戶</button></div>
    </div>
    ${clients.length ? `<div class="filters">
      <input class="input search" id="q" placeholder="搜尋客戶名稱">
      <select class="input" id="type"><option value="">全部類型</option>${CLIENT_TYPES.map((t) => `<option>${t}</option>`).join('')}</select>
    </div>` : ''}
    <div id="list"></div>`;

  const draw = () => {
    const list = clients.filter((c) => (!q || c.name.toLowerCase().includes(q)) && (!type || c.type === type))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    $('#list').innerHTML = !clients.length
      ? emptyHtml({ art: ART_CLIENT, title: '還沒有客戶', text: '先建立客戶，才能為客戶建立擺攤活動', action: `<button class="btn accent" data-add>${ICON.plus}新增第一個客戶</button>` })
      : !list.length ? '<div class="empty"><p>找不到符合的客戶</p></div>'
        : `<div class="table-wrap"><table class="table">
          <thead><tr><th>客戶名稱</th><th>類型</th>${app.isAdmin() ? '<th>業務</th>' : ''}<th class="num">活動數</th><th>備註</th></tr></thead>
          <tbody>${list.map((c) => `<tr class="clickable" data-id="${esc(c.clientId)}">
            <td><b>${esc(c.name)}</b></td><td><span class="badge">${esc(c.type)}</span></td>
            ${app.isAdmin() ? `<td class="small">${esc(c.ownerName)}</td>` : ''}
            <td class="num">${c.eventCount}</td>
            <td class="small muted" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.note)}</td>
          </tr>`).join('')}</tbody></table></div>`;
  };
  draw();

  const add = async () => {
    const c = await editClient(null);
    if (c) { toast('已新增客戶'); app.go('#/clients/' + c.clientId); }
  };
  $('#btnAdd').onclick = add;
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) add();
    const tr = e.target.closest('tr[data-id]');
    if (tr) app.go('#/clients/' + tr.dataset.id);
  });
  $('#q')?.addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
  $('#type')?.addEventListener('change', (e) => { type = e.target.value; draw(); });
}
