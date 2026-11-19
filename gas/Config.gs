/**
 * ===== 系統設定（交接或搬家時，只要改這裡）=====
 * 這個檔案會放在公開的 GitHub repo，所以 email 請只在 Apps Script 編輯器裡填，不要 commit 回 repo。
 */
var CONFIG = {
  // Google Sheet 的 ID（網址 /d/ 和 /edit 中間那段）。
  // 若 Apps Script 是從該 Sheet 的「擴充功能 → Apps Script」開的，可以留空。
  SHEET_ID: '',

  // 第一位管理者的 Gmail（執行 setup() 時自動加入白名單）
  ADMIN_EMAIL: '',
  ADMIN_NAME: '管理者',

  // Google OAuth 用戶端 ID（和前端 config.js 的 GOOGLE_CLIENT_ID 一樣）
  OAUTH_CLIENT_ID: '',

  TIMEZONE: 'Asia/Taipei',
  SESSION_SECONDS: 6 * 60 * 60,   // 後台登入有效時間：6 小時
  TICKET_SECONDS: 30 * 60,        // 登記後抽獎券有效時間：30 分鐘
  CLAIM_SECONDS: 30 * 60,         // 中獎後登記的有效時間：30 分鐘
  PUBLIC_CACHE_SECONDS: 20        // 前台活動設定快取秒數
};
