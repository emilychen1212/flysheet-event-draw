/** ===== 共用小工具 ===== */

function appError_(message, code) {
  var e = new Error(message);
  e.isApp = true;
  e.code = code || 'BAD_REQUEST';
  return e;
}

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function today_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/** 短 UUID：10 碼英數 */
function shortId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

/** 長隨機字串（session、抽獎券用） */
function token_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

/** 字串整理：去頭尾空白、限制長度 */
function str_(v, max) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  return s.length > (max || 200) ? s.slice(0, max || 200) : s;
}

function bool_(v) {
  return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1';
}

function int_(v, def) {
  var n = parseInt(v, 10);
  return isNaN(n) ? (def === undefined ? 0 : def) : n;
}

function normEmail_(v) {
  return str_(v, 200).toLowerCase();
}

function normPhone_(v) {
  return String(v || '').replace(/\D/g, '');
}

function isEmail_(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function oneOf_(v, list, def) {
  return list.indexOf(v) >= 0 ? v : def;
}

/** 'yyyy-MM-ddTHH:mm' 或 'yyyy-MM-dd HH:mm(:ss)' → 'yyyy-MM-dd HH:mm:ss'，格式不對回傳 '' */
function normDateTime_(v) {
  var m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return '';
  return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + (m[6] || '00');
}

function pick_(obj, keys) {
  var out = {};
  keys.forEach(function (k) { out[k] = obj[k]; });
  return out;
}

/* ---------- 快取 ---------- */

function cache_() {
  return CacheService.getScriptCache();
}

function cacheGetJson_(key) {
  if (!key) return null;
  var raw = cache_().get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function cachePutJson_(key, obj, seconds) {
  cache_().put(key, JSON.stringify(obj), seconds);
}

function cacheRemove_(key) {
  cache_().remove(key);
}

/* ---------- 鎖 ---------- */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    throw appError_('目前參加的人比較多，請稍候幾秒再試一次', 'BUSY');
  }
  try {
    resetTables_(); // 拿到鎖之後一定重新讀最新資料
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}
