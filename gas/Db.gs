/**
 * ===== 資料層：Google Sheet 讀寫 =====
 * 每個資料表一個工作表，第一列是欄位名稱。程式依欄位名稱對應，欄位順序被調動也不會壞。
 * 文字一律以 ' 開頭寫入，避免 Sheet 把手機號碼、日期、ID 自動轉格式，也避免公式注入。
 */

var SCHEMA = {
  Users: ['userId', 'email', 'name', 'role', 'status', 'createdAt', 'updatedAt'],
  Clients: ['clientId', 'ownerId', 'name', 'type', 'note', 'createdAt', 'updatedAt'],
  Events: ['eventId', 'eventCode', 'ownerId', 'clientId', 'title', 'subtitle', 'clientDisplayName',
    'startAt', 'endAt', 'status', 'gameType', 'drawMode', 'regMode', 'dailyLimit', 'regFields',
    'promoEnabled', 'promoProducts', 'soundDefault', 'isTestMode', 'createdAt', 'updatedAt'],
  Prizes: ['prizeId', 'eventId', 'name', 'quantity', 'remaining', 'isLose', 'isSpecial', 'color',
    'sortOrder', 'createdAt', 'updatedAt', 'label'],
  Participants: ['participantId', 'eventId', 'name', 'email', 'phone', 'organization', 'identity',
    'identityOther', 'customAnswers', 'privacyConsent', 'wantsProductInfo', 'isTest', 'registeredAt',
    'createdAt', 'updatedAt'],
  Draws: ['drawId', 'eventId', 'participantId', 'prizeId', 'prizeName', 'isLose', 'drawnAt',
    'deviceType', 'isTest', 'createdAt', 'updatedAt'],
  Leads: ['leadId', 'eventId', 'participantId', 'type', 'productName', 'name', 'organization',
    'email', 'phone', 'note', 'isTest', 'createdAt', 'updatedAt'],
  Settings: ['key', 'value', 'createdAt', 'updatedAt']
};

var ID_FIELD = {
  Users: 'userId', Clients: 'clientId', Events: 'eventId', Prizes: 'prizeId',
  Participants: 'participantId', Draws: 'drawId', Leads: 'leadId', Settings: 'key'
};

var NUM_FIELDS = { quantity: 1, remaining: 1, sortOrder: 1, dailyLimit: 1 };
var BOOL_FIELDS = {
  promoEnabled: 1, isTestMode: 1, isLose: 1, isSpecial: 1, privacyConsent: 1,
  wantsProductInfo: 1, isTest: 1
};
var JSON_FIELDS = { regFields: 1, promoProducts: 1, customAnswers: 1 };

var TABLES_ = {};

function resetTables_() {
  TABLES_ = {};
}

/* ---------- 讀取快取（只用在小表：Users、Events）----------
 * 讀試算表每次要幾百毫秒，常用的小表放進 CacheService。
 * 所有寫入都經過 insert_/update_/remove_/removeWhere_，寫入時會自動清掉快取，所以不會讀到舊資料。
 * （若直接在試算表手動改資料，最多 CACHE_TABLE_SECONDS 秒後才會生效）
 */
var CACHED_TABLES = { Users: 1, Events: 1 };
var CACHE_TABLE_SECONDS = 300;

function cachedRows_(name) {
  if (!CACHED_TABLES[name]) return all_(name);
  if (TABLES_[name]) return TABLES_[name].rows;
  var hit = cacheGetJson_('tbl_' + name);
  if (hit) return hit;
  var rows = all_(name);
  try { cachePutJson_('tbl_' + name, rows, CACHE_TABLE_SECONDS); } catch (e) { /* 超過快取大小上限就直接讀表 */ }
  return rows;
}

function dropTableCache_(name) {
  if (CACHED_TABLES[name]) cacheRemove_('tbl_' + name);
}

function ss_() {
  return CONFIG.SHEET_ID ? SpreadsheetApp.openById(CONFIG.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('找不到工作表「' + name + '」，請先執行 setup()');
  return sh;
}

function fromCell_(field, v) {
  if (v instanceof Date) v = Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  if (NUM_FIELDS[field]) return v === '' || v === null ? 0 : Number(v) || 0;
  if (BOOL_FIELDS[field]) return bool_(v);
  if (JSON_FIELDS[field]) {
    if (v === '' || v === null) return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  }
  return v === null || v === undefined ? '' : String(v);
}

function toCell_(field, v) {
  if (BOOL_FIELDS[field]) return bool_(v);
  if (NUM_FIELDS[field]) return Number(v) || 0;
  if (v === null || v === undefined) return '';
  var s = JSON_FIELDS[field] ? JSON.stringify(v) : String(v);
  return s === '' ? '' : "'" + s;
}

/** 讀整張表（同一次請求內快取） */
function table_(name) {
  if (TABLES_[name]) return TABLES_[name];
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(String);
  // 新版本加的欄位：自動補在最右邊，不用重跑 setup()
  var missing = SCHEMA[name].filter(function (h) { return headers.indexOf(h) < 0; });
  if (missing.length) {
    if (sh.getMaxColumns() < headers.length + missing.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length + missing.length - sh.getMaxColumns());
    sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#1f2f57').setFontColor('#ffffff');
    headers = headers.concat(missing);
    values = values.map(function (row, i) { return i === 0 ? headers : row.concat(missing.map(function () { return ''; })); });
  }
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var line = values[i];
    if (line.every(function (c) { return c === '' || c === null; })) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      if (headers[j]) obj[headers[j]] = fromCell_(headers[j], line[j]);
    }
    Object.defineProperty(obj, '_row', { value: i + 1, enumerable: false, writable: true });
    rows.push(obj);
  }
  TABLES_[name] = { sheet: sh, headers: headers, rows: rows };
  return TABLES_[name];
}

function all_(name) {
  return table_(name).rows;
}

function find_(name, id) {
  var key = ID_FIELD[name];
  var rows = all_(name);
  for (var i = 0; i < rows.length; i++) if (rows[i][key] === id) return rows[i];
  return null;
}

function where_(name, pred) {
  return all_(name).filter(pred);
}

function rowValues_(headers, obj) {
  return headers.map(function (h) { return toCell_(h, obj[h]); });
}

function insert_(name, obj) {
  var t = table_(name);
  var key = ID_FIELD[name];
  var now = now_();
  var rec = {};
  SCHEMA[name].forEach(function (h) { rec[h] = obj[h] === undefined ? '' : obj[h]; });
  if (!rec[key]) rec[key] = shortId_();
  rec.createdAt = rec.createdAt || now;
  rec.updatedAt = now;
  t.sheet.appendRow(rowValues_(t.headers, rec));
  delete TABLES_[name];
  dropTableCache_(name); // 下次讀取時重新載入，確保列號正確
  return rec;
}

function update_(name, id, patch) {
  var t = table_(name);
  var row = find_(name, id);
  if (!row) throw appError_('找不到要更新的資料', 'NOT_FOUND');
  Object.keys(patch).forEach(function (k) {
    if (k !== ID_FIELD[name] && k !== 'createdAt') row[k] = patch[k];
  });
  row.updatedAt = now_();
  t.sheet.getRange(row._row, 1, 1, t.headers.length).setValues([rowValues_(t.headers, row)]);
  dropTableCache_(name);
  return row;
}

function remove_(name, id) {
  var row = find_(name, id);
  if (!row) return false;
  table_(name).sheet.deleteRow(row._row);
  delete TABLES_[name];
  dropTableCache_(name);
  return true;
}

/** 刪除符合條件的多筆資料（整批重寫，請在 withLock_ 內呼叫）。回傳刪除的資料 */
function removeWhere_(name, pred) {
  var t = table_(name);
  var removed = t.rows.filter(pred);
  if (!removed.length) return [];
  var keep = t.rows.filter(function (r) { return !pred(r); });
  var lastRow = t.sheet.getLastRow();
  if (lastRow > 1) t.sheet.getRange(2, 1, lastRow - 1, t.headers.length).clearContent();
  if (keep.length) {
    t.sheet.getRange(2, 1, keep.length, t.headers.length)
      .setValues(keep.map(function (r) { return rowValues_(t.headers, r); }));
  }
  delete TABLES_[name];
  dropTableCache_(name);
  return removed;
}

/* ---------- Settings ---------- */

function getSetting_(key, def) {
  var row = find_('Settings', key);
  if (!row || row.value === '') return def;
  try { return JSON.parse(row.value); } catch (e) { return row.value; }
}

function setSetting_(key, value) {
  var v = JSON.stringify(value);
  if (find_('Settings', key)) update_('Settings', key, { value: v });
  else insert_('Settings', { key: key, value: v });
}
