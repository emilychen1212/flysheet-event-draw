/** 任務範本庫：所有人共用、看得到全部，只能編輯自己建立的（管理者可編輯全部） */
import { api, cachedApi } from '../../../assets/js/api.js';
import { $, esc, modal, toast, toastErr, confirmBox, emptyHtml, ICON } from '../ui.js';

export const VERIFY = {
  staff_pin: { label: '工作人員核銷（PIN）', short: '工作人員核銷', cls: 'navy' },
  self_check: { label: '自行勾選完成', short: '自行勾選', cls: 'green' },
  quiz: { label: '答題自動判定（第二版）', short: '答題', cls: 'yellow' }
};

export function templateForm(t, dbNames) {
  return modal({
    title: t && t.templateId ? '編輯任務範本' : '新增任務範本',
    width: 600,
    body: `
      <div class="form-grid">
        <div class="field"><label>資料庫名稱<span class="req">*</span></label>
          <input class="input" id="tDb" list="tDbList" maxlength="60" value="${esc(t ? t.dbName : '')}" placeholder="例：UpToDate">
          <datalist id="tDbList">${dbNames.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
          <div class="hint">和客戶「訂購的資料庫」名稱相同（不分大小寫）就會自動對應</div></div>
        <div class="field"><label>驗證方式</label><select class="input" id="tVerify">
          <option value="staff_pin">${VERIFY.staff_pin.label}</option><option value="self_check">${VERIFY.self_check.label}</option></select></div>
        <div class="field span-2"><label>任務標題<span class="req">*</span></label><input class="input" id="tTitle" maxlength="100" value="${esc(t ? t.title : '')}" placeholder="例：和工作人員一起完成一次臨床問題搜尋"></div>
        <div class="field span-2"><label>任務說明</label><textarea class="input" id="tDesc" maxlength="500" placeholder="參加者要做什麼、怎麼算完成（選填）">${esc(t ? t.description : '')}</textarea></div>
        <div class="field span-2"><label>資料庫簡介</label><textarea class="input" id="tIntro" maxlength="300" style="min-height:70px" placeholder="一兩句話介紹這個資料庫，參加者選擇資料庫時會看到">${esc(t ? t.dbIntro : '')}</textarea></div>
        <div class="field"><label>行動按鈕文字</label><input class="input" id="tAction" maxlength="30" value="${esc(t ? t.actionText : '')}" placeholder="留空則為「前往 資料庫名稱」"></div>
        <div class="field"><label>預設連結</label><input class="input" id="tUrl" maxlength="500" value="${esc(t ? t.defaultUrl : '')}" placeholder="https://…"></div>
      </div>
      <div class="hint">連結優先順序：活動覆寫 ＞ 客戶的該校連結 ＞ 這裡的預設連結</div>`,
    onOpen: (m) => { $('#tVerify', m).value = t && t.verifyMethod === 'self_check' ? 'self_check' : 'staff_pin'; },
    actions: [{ label: '取消', kind: 'ghost', value: null }, {
      label: '儲存', kind: 'primary', onClick: (m) => api('templates.save', {
        templateId: t && t.templateId ? t.templateId : '',
        dbName: $('#tDb', m).value, title: $('#tTitle', m).value, description: $('#tDesc', m).value, dbIntro: $('#tIntro', m).value,
        actionText: $('#tAction', m).value, defaultUrl: $('#tUrl', m).value, verifyMethod: $('#tVerify', m).value
      })
    }]
  });
}

export async function render(root, _p, app) {
  const list = await cachedApi('templates.list');
  const groups = {};
  list.forEach((t) => { (groups[t.dbName] = groups[t.dbName] || []).push(t); });
  const dbNames = Object.keys(groups);

  root.innerHTML = `
    <div class="page-head">
      <div><h1>任務範本庫</h1><div class="sub">任務跟著資料庫走，所有業務共用。建立活動時從這裡複製任務卡，修改活動任務不會影響範本。</div></div>
      <div class="actions"><button class="btn accent" id="btnAdd">${ICON.plus}新增範本</button></div>
    </div>
    ${list.length ? dbNames.map((db) => `<section class="card tpl-group">
      <h2 class="card-title"><span>${esc(db)}</span><span class="muted small">${groups[db].length} 個範本</span></h2>
      ${groups[db][0].dbIntro ? `<p class="muted small" style="margin:-6px 0 12px">${esc(groups[db][0].dbIntro)}</p>` : ''}
      <div class="tpl-list">${groups[db].map((t) => `<div class="tpl">
        <div class="tpl-main"><b>${esc(t.title)}</b>
          <div class="small muted">${t.description ? esc(t.description) + '・' : ''}<span class="badge ${VERIFY[t.verifyMethod]?.cls || ''}">${VERIFY[t.verifyMethod]?.short || esc(t.verifyMethod)}</span>
            ${t.defaultUrl ? `・<a href="${esc(t.defaultUrl)}" target="_blank" rel="noopener">${esc(t.defaultUrl)}</a>` : ''}</div>
          <div class="small muted">建立者：${esc(t.ownerName || '—')}</div></div>
        <div class="tpl-act">${t.canEdit
          ? `<button class="btn sm" data-edit="${esc(t.templateId)}">${ICON.edit}編輯</button><button class="btn sm ghost" data-del="${esc(t.templateId)}" title="刪除">${ICON.trash}</button>`
          : `<button class="btn sm" data-copy="${esc(t.templateId)}">${ICON.copy}複製成我的範本</button>`}</div>
      </div>`).join('')}</div></section>`).join('')
    : `<div class="card">${emptyHtml({ title: '還沒有任務範本', text: '新增範本後，就能在活動中勾選任務卡' })}</div>`}`;

  const reload = () => render(root, _p, app);
  $('#btnAdd').onclick = async () => { if (await templateForm(null, dbNames)) { toast('已新增範本'); reload(); } };
  root.addEventListener('click', async (e) => {
    const get = (id) => list.find((t) => t.templateId === id);
    const ed = e.target.closest('[data-edit]');
    if (ed && await templateForm(get(ed.dataset.edit), dbNames)) { toast('已更新'); reload(); }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      const src = get(cp.dataset.copy);
      if (await templateForm(Object.assign({}, src, { templateId: '' }), dbNames)) { toast('已複製成你的範本'); reload(); }
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const t = get(del.dataset.del);
      if (!(await confirmBox(`確定要刪除範本「${t.title}」嗎？已經建立的活動任務不受影響。`, { ok: '刪除', danger: true }))) return;
      try { await api('templates.delete', { templateId: t.templateId }); toast('已刪除'); reload(); } catch (err) { toastErr(err); }
    }
  });
}
