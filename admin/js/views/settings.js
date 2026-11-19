/** 系統設定（僅管理者）：個資同意聲明、預設登記欄位 */
import { api } from '../../../assets/js/api.js';
import { $, esc, toast, busy } from '../ui.js';
import { regFieldsHtml, readRegFields, bindRegFields } from './reg-fields.js';

export async function render(root, _p, app) {
  const s = await app.settings(true);
  root.innerHTML = `
    <div class="page-head"><div><h1>系統設定</h1><div class="sub">這裡的設定會套用到所有業務的活動</div></div></div>
    <div class="card">
      <h2 class="card-title"><span>個人資料蒐集告知聲明</span></h2>
      <p class="muted small" style="margin-top:-6px">參與者登記時必須勾選同意，可以展開閱讀全文。修改後所有活動立即套用。</p>
      <textarea class="input" id="privacy" style="min-height:360px">${esc(s.privacyText)}</textarea>
      <div style="margin-top:12px;display:flex;justify-content:flex-end"><button class="btn primary" id="savePrivacy">儲存聲明</button></div>
    </div>
    <div class="card">
      <h2 class="card-title"><span>預設登記欄位</span></h2>
      <p class="muted small" style="margin-top:-6px">新建活動時的預設值，業務可以在各活動中再調整。已建立的活動不受影響。</p>
      <div id="regBox">${regFieldsHtml(s.defaultRegFields, { editable: true })}</div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end"><button class="btn primary" id="saveReg">儲存預設欄位</button></div>
    </div>`;
  bindRegFields($('#regBox'));

  $('#savePrivacy').onclick = (e) => busy(e.currentTarget, async () => {
    await api('settings.save', { privacyText: $('#privacy').value });
    await app.settings(true);
    toast('個資聲明已更新');
  }).catch((err) => toast(err.message, 'err'));

  $('#saveReg').onclick = (e) => busy(e.currentTarget, async () => {
    await api('settings.save', { defaultRegFields: readRegFields($('#regBox')) });
    await app.settings(true);
    toast('預設登記欄位已更新');
  }).catch((err) => toast(err.message, 'err'));
}
