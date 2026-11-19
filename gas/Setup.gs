/**
 * ===== 初始化 =====
 * 在 Apps Script 編輯器選擇 setup 後按「執行」。可以重複執行：已存在的工作表和資料不會被覆蓋，
 * 只會補上缺少的工作表、欄位、管理者帳號與預設設定。
 */

var IDENTITIES = ['醫師', '護理師', '老師', '學生', '館員', '其他'];
var CLIENT_TYPES = ['醫學院', '醫院', '護校', '其他'];

var DEFAULT_REG_FIELDS = {
  fields: { name: 'required', email: 'required', phone: 'optional', organization: 'required', identity: 'required' },
  custom: []
};

var DEFAULT_PRIVACY_TEXT = [
  '【個人資料蒐集告知聲明】',
  '飛資得醫學資訊（以下簡稱本公司）依據《個人資料保護法》第 8 條規定，於蒐集您的個人資料前，告知下列事項：',
  '',
  '一、蒐集目的：辦理本次活動抽獎、獎品發送與聯繫、活動成果統計；若您另外勾選「我想接收產品資訊」或填寫產品試用／資訊表單，亦作為提供醫學電子資源產品資訊、試用服務與客戶服務之用（特定目的：040 行銷、090 消費者／客戶管理與服務、135 資（通）訊服務）。',
  '',
  '二、蒐集之個人資料類別：姓名、電子郵件、手機號碼等聯絡方式（C001 辨識個人者），服務單位、身分（C061 現行之受僱情形），以及您於表單中填寫的其他內容。',
  '',
  '三、利用期間、地區、對象及方式：',
  '（一）期間：自蒐集之日起至蒐集目的消失為止，或至您請求停止利用時為止。',
  '（二）地區：中華民國境內，以及本公司使用之雲端服務（Google）主機所在地區。',
  '（三）對象：本公司及受本公司委託處理活動事務之人員。除法律另有規定外，不會提供給其他第三人。',
  '（四）方式：以自動化或非自動化方式進行蒐集、處理、利用，包括以電子郵件或電話聯繫中獎事宜；若您同意接收產品資訊，亦會寄送相關資訊。',
  '',
  '四、當事人權利：您可依《個人資料保護法》第 3 條規定，向本公司請求查詢、閱覽、製給複製本、補充或更正、停止蒐集處理利用，或刪除您的個人資料。請洽本公司活動負責業務或客服窗口。',
  '',
  '五、不提供之影響：您可自由選擇是否提供個人資料。若您不提供或提供不完整，將無法參加本次抽獎或領取獎品。「我想接收產品資訊」為選填，不勾選不影響抽獎資格。'
].join('\n');

function setup() {
  if (!CONFIG.ADMIN_EMAIL) throw new Error('請先在 Config.gs 填寫 ADMIN_EMAIL（你的 Gmail），再執行一次 setup()');
  var ss = ss_();
  ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);

  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var lastCol = sh.getLastColumn();
    var existing = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(String) : [];
    var headers = existing.slice();
    SCHEMA[name].forEach(function (h) { if (headers.indexOf(h) < 0) headers.push(h); });
    if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1f2f57').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });

  // 刪掉預設的空白工作表
  ss.getSheets().forEach(function (sh) {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  resetTables_();
  var email = normEmail_(CONFIG.ADMIN_EMAIL);
  var admin = where_('Users', function (u) { return u.email === email; })[0];
  if (!admin) {
    insert_('Users', { email: email, name: CONFIG.ADMIN_NAME, role: 'admin', status: 'active' });
  } else if (admin.role !== 'admin' || admin.status !== 'active') {
    update_('Users', admin.userId, { role: 'admin', status: 'active' });
  }

  if (getSetting_('privacyText', null) === null) setSetting_('privacyText', DEFAULT_PRIVACY_TEXT);
  if (getSetting_('defaultRegFields', null) === null) setSetting_('defaultRegFields', DEFAULT_REG_FIELDS);

  SpreadsheetApp.flush();
  Logger.log('✅ 初始化完成！管理者：' + email);
  return true;
}
