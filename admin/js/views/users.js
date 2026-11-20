/** 使用者管理（僅管理者） */
import { api, cachedApi } from '../../../assets/js/api.js';
import { $, esc, modal, toast, emptyHtml, ICON, fmtDate } from '../ui.js';

export async function render(root, _p, app) {
  const users = await cachedApi('users.list');
  const sorted = users.slice().sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === 'active' ? -1 : 1));

  root.innerHTML = `
    <div class="page-head">
      <div><h1>使用者管理</h1><div class="sub">只有名單內、狀態為「啟用」的 Google 帳號可以登入後台</div></div>
      <div class="actions"><button class="btn accent" id="btnAdd">${ICON.plus}新增使用者</button></div>
    </div>
    ${sorted.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>姓名</th><th>Email</th><th>角色</th><th>狀態</th><th>加入日期</th><th></th></tr></thead>
      <tbody>${sorted.map((u) => `<tr>
        <td><b>${esc(u.name || '—')}</b>${u.userId === app.user.userId ? ' <span class="badge">你</span>' : ''}</td>
        <td class="small">${esc(u.email)}</td>
        <td>${u.role === 'admin' ? '<span class="badge orange">管理者</span>' : '<span class="badge navy">業務</span>'}</td>
        <td>${u.status === 'active' ? '<span class="badge dot green">啟用</span>' : '<span class="badge dot">已停用</span>'}</td>
        <td class="small muted">${fmtDate(u.createdAt)}</td>
        <td class="actions"><button class="btn sm" data-edit="${esc(u.userId)}">${ICON.edit}編輯</button></td>
      </tr>`).join('')}</tbody></table></div>` : emptyHtml({ title: '還沒有使用者' })}
    <p class="muted small" style="margin-top:16px">・管理者：可以管理使用者、系統設定，並檢視與修改所有資料。<br>・業務：可以建立與修改自己的客戶與活動；其他業務的活動只能檢視設定與統計，看不到參與者個資。</p>`;

  $('#btnAdd').onclick = () => edit(null);
  root.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => edit(users.find((u) => u.userId === b.dataset.edit));
  });

  async function edit(u) {
    const isMe = u && u.userId === app.user.userId;
    const saved = await modal({
      title: u ? '編輯使用者' : '新增使用者',
      body: `
        <div class="field"><label>Google 帳號 Email<span class="req">*</span></label>
          <input class="input" id="uEmail" type="email" value="${esc(u ? u.email : '')}" ${u ? 'disabled' : ''} placeholder="name@gmail.com"></div>
        <div class="field"><label>姓名</label><input class="input" id="uName" value="${esc(u ? u.name : '')}" placeholder="例：陳小美（留空會在第一次登入時帶入 Google 名稱）"></div>
        <div class="form-grid">
          <div class="field"><label>角色</label><select class="input" id="uRole" ${isMe ? 'disabled' : ''}>
            <option value="sales">業務</option><option value="admin">管理者</option></select></div>
          <div class="field"><label>狀態</label><select class="input" id="uStatus" ${isMe ? 'disabled' : ''}>
            <option value="active">啟用</option><option value="disabled">停用</option></select></div>
        </div>
        ${isMe ? '<div class="hint muted small">不能停用自己或拿掉自己的管理者權限</div>' : ''}`,
      onOpen: (m) => {
        $('#uRole', m).value = u ? u.role : 'sales';
        $('#uStatus', m).value = u ? u.status : 'active';
      },
      actions: [
        { label: '取消', kind: 'ghost', value: null },
        {
          label: '儲存', kind: 'primary', onClick: (m) => api('users.save', {
            userId: u ? u.userId : '',
            email: $('#uEmail', m).value,
            name: $('#uName', m).value,
            role: $('#uRole', m).value,
            status: $('#uStatus', m).value
          })
        }
      ]
    });
    if (saved) { toast(u ? '已更新' : '已新增，對方可以用這個 Google 帳號登入了'); render(root, _p, app); }
  }
}
