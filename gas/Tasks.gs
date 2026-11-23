/**
 * ===== 體驗任務模組 =====
 * 三層結構：任務範本（TaskTemplates，跟著資料庫走、大家共用）
 *          → 客戶訂購的資料庫（ClientDatabases，各校連結）
 *          → 活動任務（EventTasks，從範本「複製」過來，可個別覆寫）
 * 參加者完成任務寫入 TaskCompletions；抽獎資格一律由後端判斷。
 * 連結優先順序：活動覆寫 > 客戶層連結 > 範本預設連結
 */

var VERIFY_METHODS = ['staff_pin', 'self_check', 'quiz'];
var VERIFY_ENABLED = ['staff_pin', 'self_check'];   // quiz 第二版才開放
// cards＝依任務卡的必做／選做判斷（目前唯一的模式）；any、required_plus 是舊活動的設定，照下方規則相容
var TASK_MODES = ['none', 'cards', 'any', 'required_plus'];
var PIN_MAX_FAILS = 5;            // 同一位參加者、同一任務連續輸錯次數
var PIN_LOCK_SECONDS = 60;        // 鎖定時間
var PIN_TASK_FAILS_PER_MIN = 30;  // 同一任務每分鐘最多接受的錯誤次數（防止換身分一直猜）
var PT_SECONDS = 6 * 60 * 60;     // 參加者憑證有效時間

var DEFAULT_TEMPLATES = [
  ['UpToDate', '和工作人員一起完成一次臨床問題搜尋', '由各專科醫師撰寫、持續更新的臨床實證資源，整理疾病診斷、治療建議與藥物資訊。', 'https://www.uptodate.com/'],
  ['JoVE', '參加進行中的 JoVE 有獎徵答', '用影片呈現科學實驗的完整操作流程，涵蓋生物、化學、神經科學、工程等領域。', 'https://www.jove.com/'],
  ['Acland', '在 Acland 找到工作人員指定的解剖構造', '用真實人體標本拍攝的解剖影片，搭配旁白講解，從不同角度看清楚結構。', 'https://aclandanatomy.com/'],
  ['HST', '搜尋一個你有興趣的主題，看一段學者演講', '收錄國際知名學者的生醫與生命科學專題演講影片。', 'https://hstalks.com/'],
  ['JoMI', '觀看一段外科手術影片', '完整記錄真實外科手術的全程影片，由頂尖醫學中心的外科醫師執刀和講解。', 'https://jomi.com/']
];

function dbKey_(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 範本庫是空的時候，建立 5 個預設範本（擁有者＝第一位管理者） */
function seedTemplates_() {
  if (all_('TaskTemplates').length) return;
  var adminEmail = normEmail_(CONFIG.ADMIN_EMAIL);
  var admin = all_('Users').filter(function (u) { return u.email === adminEmail; })[0] ||
    all_('Users').filter(function (u) { return u.role === 'admin'; })[0];
  DEFAULT_TEMPLATES.forEach(function (t) {
    insert_('TaskTemplates', {
      dbName: t[0], title: t[1], description: '', dbIntro: t[2], actionText: '前往 ' + t[0], defaultUrl: t[3],
      verifyMethod: 'staff_pin', quizJson: null, ownerId: admin ? admin.userId : ''
    });
  });
}

/* ---------- PIN ---------- */

function pinSalt_() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('PIN_SALT');
  if (!salt) { salt = token_(); props.setProperty('PIN_SALT', salt); }
  return salt;
}

/** PIN 雜湊（加上專案專屬的隨機鹽），PIN 本身不會儲存在任何地方 */
function hashPin_(pin) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pinSalt_() + ':pin:' + pin, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

/* ---------- 範本庫（後台） ---------- */

function templateOut_(t, user) {
  var out = pick_(t, ['templateId', 'dbName', 'title', 'description', 'dbIntro', 'actionText', 'defaultUrl', 'verifyMethod', 'quizJson', 'ownerId', 'updatedAt']);
  out.canEdit = canEdit_(user, t.ownerId);
  return out;
}

function apiTemplatesList_(p, user) {
  seedTemplates_();
  var users = userNameMap_();
  return all_('TaskTemplates').map(function (t) {
    var o = templateOut_(t, user);
    o.ownerName = users[t.ownerId] || '';
    return o;
  }).sort(function (a, b) { return dbKey_(a.dbName) < dbKey_(b.dbName) ? -1 : dbKey_(a.dbName) > dbKey_(b.dbName) ? 1 : 0; });
}

function cleanUrl_(v) {
  var url = str_(v, 500);
  if (url && !/^https?:\/\//i.test(url)) throw appError_('連結要以 http:// 或 https:// 開頭：' + url);
  return url;
}

function cleanTemplate_(p) {
  var t = {
    dbName: str_(p.dbName, 60), title: str_(p.title, 100), description: str_(p.description, 500),
    dbIntro: str_(p.dbIntro, 300), actionText: str_(p.actionText, 30), defaultUrl: cleanUrl_(p.defaultUrl),
    verifyMethod: oneOf_(p.verifyMethod, VERIFY_ENABLED, 'staff_pin'), quizJson: null
  };
  if (!t.dbName) throw appError_('請填寫資料庫名稱');
  if (!t.title) throw appError_('請填寫任務標題');
  if (!t.actionText) t.actionText = '前往 ' + t.dbName;
  return t;
}

function apiTemplatesSave_(p, user) {
  var t = cleanTemplate_(p);
  if (p.templateId) {
    var old = find_('TaskTemplates', p.templateId);
    if (!old) throw appError_('找不到這個範本', 'NOT_FOUND');
    requireEdit_(user, old.ownerId);
    return templateOut_(update_('TaskTemplates', old.templateId, t), user);
  }
  t.ownerId = user.userId;
  return templateOut_(insert_('TaskTemplates', t), user);
}

function apiTemplatesDelete_(p, user) {
  var old = find_('TaskTemplates', p.templateId);
  if (!old) throw appError_('找不到這個範本', 'NOT_FOUND');
  requireEdit_(user, old.ownerId);
  remove_('TaskTemplates', old.templateId);   // 活動任務是複製過去的，刪範本不影響已建立的活動
  return true;
}

/* ---------- 客戶訂購的資料庫 ---------- */

function clientDbsOf_(clientId) {
  return where_('ClientDatabases', function (x) { return x.clientId === clientId; })
    .sort(function (a, b) { return a.sortOrder - b.sortOrder; });
}

function apiClientDbsList_(p) {
  var c = find_('Clients', p.clientId);
  if (!c) throw appError_('找不到這個客戶', 'NOT_FOUND');
  return clientDbsOf_(c.clientId).map(function (x) { return pick_(x, ['cdbId', 'dbName', 'url', 'note', 'sortOrder']); });
}

function apiClientDbsSave_(p, user) {
  return withLock_(function () {
    var c = find_('Clients', p.clientId);
    if (!c) throw appError_('找不到這個客戶', 'NOT_FOUND');
    requireEdit_(user, c.ownerId);
    var seen = {};
    var items = (Array.isArray(p.items) ? p.items : []).slice(0, 50).map(function (x, i) {
      var name = str_(x && x.dbName, 60);
      if (!name) return null;
      if (seen[dbKey_(name)]) throw appError_('資料庫「' + name + '」重複了');
      seen[dbKey_(name)] = 1;
      return { clientId: c.clientId, dbName: name, url: cleanUrl_(x.url), note: str_(x.note, 300), sortOrder: i + 1 };
    }).filter(Boolean);
    removeWhere_('ClientDatabases', function (x) { return x.clientId === c.clientId; });
    items.forEach(function (x) { insert_('ClientDatabases', x); });
    resetTables_();
    return apiClientDbsList_({ clientId: c.clientId });
  });
}

/* ---------- 活動任務 ---------- */

function eventTasksOf_(eventId) {
  return cachedRows_('EventTasks').filter(function (t) { return t.eventId === eventId; })
    .sort(function (a, b) { return a.sortOrder - b.sortOrder; });
}

/** 依優先順序決定連結：活動覆寫 > 客戶層 > 範本預設 */
function resolveTaskUrl_(task, ev, cdbMap, tplMap) {
  if (task.url) return task.url;
  var c = cdbMap[dbKey_(task.dbName)];
  if (c && c.url) return c.url;
  var t = task.templateId && tplMap[task.templateId];
  return t ? t.defaultUrl : '';
}

function linkContext_(ev) {
  var cdbMap = {};
  clientDbsOf_(ev.clientId).forEach(function (x) { cdbMap[dbKey_(x.dbName)] = x; });
  var tplMap = {};
  all_('TaskTemplates').forEach(function (t) { tplMap[t.templateId] = t; });
  return { cdbMap: cdbMap, tplMap: tplMap };
}

/** 後台用（含沿用的連結來源，不含 PIN） */
function eventTasksAdminOut_(ev) {
  var ctx = linkContext_(ev);
  return eventTasksOf_(ev.eventId).map(function (t) {
    var o = pick_(t, ['eventTaskId', 'templateId', 'dbName', 'title', 'description', 'dbIntro', 'actionText', 'url', 'verifyMethod', 'required', 'sortOrder']);
    o.hasPin = !!t.pinHash;
    var c = ctx.cdbMap[dbKey_(t.dbName)];
    var tp = t.templateId && ctx.tplMap[t.templateId];
    o.clientUrl = c ? c.url : '';
    o.templateUrl = tp ? tp.defaultUrl : '';
    return o;
  });
}

/** 前台用（不含 PIN） */
function eventTasksPublicOut_(ev) {
  var ctx = linkContext_(ev);
  return eventTasksOf_(ev.eventId).map(function (t) {
    return {
      eventTaskId: t.eventTaskId, dbName: t.dbName, title: t.title, description: t.description, dbIntro: t.dbIntro,
      actionText: t.actionText || ('前往 ' + t.dbName), url: resolveTaskUrl_(t, ev, ctx.cdbMap, ctx.tplMap),
      verifyMethod: t.verifyMethod, required: t.required
    };
  });
}

function hasTasks_(ev) {
  return ev.taskMode && ev.taskMode !== 'none' && eventTasksOf_(ev.eventId).length > 0;
}

/** 整理後台送來的任務清單（在寫入前檢查，避免存一半） */
function cleanEventTasks_(list, taskMode, taskMinOptional, existingTasks) {
  var oldById = {};
  (existingTasks || []).forEach(function (t) { oldById[t.eventTaskId] = t; });
  var out = (Array.isArray(list) ? list : []).slice(0, 30).map(function (x, i) {
    var title = str_(x.title, 100);
    var dbName = str_(x.dbName, 60);
    if (!title) throw appError_('第 ' + (i + 1) + ' 個任務沒有標題');
    if (!dbName) throw appError_('「' + title + '」沒有資料庫名稱');
    var verify = oneOf_(x.verifyMethod, VERIFY_ENABLED, 'staff_pin');
    var pin = String(x.pin || '').trim();
    if (pin && !/^\d{4}$/.test(pin)) throw appError_('「' + title + '」的 PIN 要是 4 位數字');
    var old = x.eventTaskId && oldById[x.eventTaskId];
    if (verify === 'staff_pin' && !pin && !(old && old.pinHash)) throw appError_('「' + title + '」是工作人員核銷，請設定 4 位數 PIN');
    return {
      eventTaskId: old ? old.eventTaskId : '', templateId: str_(x.templateId, 20), dbName: dbName, title: title,
      description: str_(x.description, 500), dbIntro: str_(x.dbIntro, 300), actionText: str_(x.actionText, 30),
      url: cleanUrl_(x.url), verifyMethod: verify, pin: pin, required: bool_(x.required), sortOrder: i + 1,
      keepPin: old ? old.pinHash : ''
    };
  });
  if (taskMode !== 'none' && !out.length) throw appError_('已開啟體驗任務，請至少加入一個任務');
  if (taskMode !== 'none') {
    var optional = out.filter(function (t) { return !t.required; }).length;
    var n = effectiveMinOptional_(taskMode, taskMinOptional, out);
    if (n > optional) throw appError_('選做任務只有 ' + optional + ' 個，「選做至少完成幾個」不能設成 ' + n);
    if (!out.some(function (t) { return t.required; }) && n < 1) throw appError_('沒有必做任務時，選做任務至少要完成 1 個');
  }
  return out;
}

/** 寫入活動任務（請在 withLock_ 內呼叫） */
function syncEventTasks_(eventId, tasks) {
  var existing = where_('EventTasks', function (t) { return t.eventId === eventId; });
  var keep = {};
  tasks.forEach(function (x) {
    var data = {
      eventId: eventId, templateId: x.templateId, dbName: x.dbName, title: x.title, description: x.description,
      dbIntro: x.dbIntro, actionText: x.actionText, url: x.url, verifyMethod: x.verifyMethod,
      required: x.required, sortOrder: x.sortOrder, quizJson: null
    };
    if (x.eventTaskId) {
      keep[x.eventTaskId] = 1;
      if (x.pin) data.pinHash = hashPin_(x.pin);
      update_('EventTasks', x.eventTaskId, data);
    } else {
      if (x.pin) data.pinHash = hashPin_(x.pin);
      insert_('EventTasks', data);
    }
  });
  existing.forEach(function (t) { if (!keep[t.eventTaskId]) remove_('EventTasks', t.eventTaskId); });
}

/** 複製活動時一併複製任務（PIN 一起沿用） */
function copyEventTasks_(fromEventId, toEventId) {
  eventTasksOf_(fromEventId).forEach(function (t) {
    insert_('EventTasks', {
      eventId: toEventId, templateId: t.templateId, dbName: t.dbName, title: t.title, description: t.description,
      dbIntro: t.dbIntro, actionText: t.actionText, url: t.url, verifyMethod: t.verifyMethod, pinHash: t.pinHash,
      required: t.required, sortOrder: t.sortOrder, quizJson: t.quizJson
    });
  });
}

/* ---------- 參加者進度（前台） ---------- */

function issueParticipantToken_(eventId, participantId) {
  var t = token_();
  cachePutJson_('pt_' + t, { eventId: eventId, participantId: participantId }, PT_SECONDS);
  return t;
}

function participantFromToken_(ev, pt) {
  var s = pt ? cacheGetJson_('pt_' + pt) : null;
  if (!s || s.eventId !== ev.eventId) throw appError_('登記資料已過期，請重新登記', 'NEED_REGISTER');
  var person = find_('Participants', s.participantId);
  if (!person || person.eventId !== ev.eventId) throw appError_('登記資料已過期，請重新登記', 'NEED_REGISTER');
  return person;
}

function completionsOf_(ev, participantId) {
  return where_('TaskCompletions', function (c) { return c.eventId === ev.eventId && c.participantId === participantId; });
}

/**
 * 選做至少要完成幾個（N）。
 * 舊活動的「完成任一任務」：沒有必做時等於 N＝1；有必做時，必做卡片照樣要完成。
 */
function effectiveMinOptional_(taskMode, n, tasks) {
  n = Number(n) || 0;
  var hasRequired = (tasks || []).some(function (t) { return t.required; });
  if (!hasRequired && n < 1) return 1;
  return n;
}

/** 抽獎資格：所有必做都完成，而且選做完成至少 N 個 */
function taskProgress_(ev, participantId) {
  var tasks = eventTasksOf_(ev.eventId);
  var done = {};
  completionsOf_(ev, participantId).forEach(function (c) { done[c.eventTaskId] = 1; });
  var required = tasks.filter(function (t) { return t.required; });
  var optional = tasks.filter(function (t) { return !t.required; });
  var doneReq = required.filter(function (t) { return done[t.eventTaskId]; }).length;
  var doneOpt = optional.filter(function (t) { return done[t.eventTaskId]; }).length;
  var n = Math.min(optional.length, effectiveMinOptional_(ev.taskMode, ev.taskMinOptional, tasks));
  var requiredLeft = Math.max(0, required.length - doneReq);
  var optionalLeft = Math.max(0, n - doneOpt);
  return {
    completed: tasks.filter(function (t) { return done[t.eventTaskId]; }).map(function (t) { return t.eventTaskId; }),
    eligible: requiredLeft === 0 && optionalLeft === 0,
    need: requiredLeft + optionalLeft,
    requiredLeft: requiredLeft, optionalLeft: optionalLeft,
    requiredTotal: required.length, optionalNeed: n, optionalTotal: optional.length
  };
}

/** 回給前台的狀態：進度＋（有資格時）抽獎券 */
function taskStateOut_(ev, person) {
  var prog = taskProgress_(ev, person.participantId);
  var out = {
    participantId: person.participantId,
    selectedDbs: person.selectedDbs || null,
    progress: prog,
    reg: { name: person.name, email: person.email, phone: person.phone, organization: person.organization }
  };
  if (prog.eligible) {
    var used = countTodayDraws_(ev.eventId, person.participantId);
    var left = Math.max(0, ev.dailyLimit - used);
    out.limitReached = left <= 0;
    if (left > 0) out.ticket = issueTicket_(ev.eventId, person.participantId);
    else out.message = LIMIT_MESSAGE;
  }
  return out;
}

function apiPublicTaskState_(p) {
  var o = loadOpenEvent_(p.eventCode);
  if (!hasTasks_(o.ev)) throw appError_('這個活動沒有體驗任務');
  var person = participantFromToken_(o.ev, p.pt);
  return taskStateOut_(o.ev, person);
}

function apiPublicSelectDbs_(p) {
  var o = loadOpenEvent_(p.eventCode);
  if (!hasTasks_(o.ev)) throw appError_('這個活動沒有體驗任務');
  var person = participantFromToken_(o.ev, p.pt);
  var valid = {};
  var requiredDbs = [];
  eventTasksOf_(o.ev.eventId).forEach(function (t) {
    if (!valid[dbKey_(t.dbName)]) valid[dbKey_(t.dbName)] = t.dbName;
    if (t.required) requiredDbs.push(t.dbName);
  });
  var seen = {};
  var dbs = (Array.isArray(p.dbs) ? p.dbs : []).concat(requiredDbs).map(function (d) { return valid[dbKey_(d)]; })
    .filter(function (d) { if (!d || seen[d]) return false; seen[d] = 1; return true; });
  update_('Participants', person.participantId, { selectedDbs: dbs });
  person.selectedDbs = dbs;
  return taskStateOut_(o.ev, person);
}

/** 完成任務：self_check 直接記錄；staff_pin 比對 PIN（後端雜湊比對，有輸錯鎖定） */
function apiPublicCompleteTask_(p) {
  var o = loadOpenEvent_(p.eventCode);
  var ev = o.ev;
  if (!hasTasks_(ev)) throw appError_('這個活動沒有體驗任務');
  var person = participantFromToken_(ev, p.pt);
  var task = eventTasksOf_(ev.eventId).filter(function (t) { return t.eventTaskId === p.eventTaskId; })[0];
  if (!task) throw appError_('找不到這個任務，請重新整理頁面');

  if (task.verifyMethod === 'staff_pin') {
    var lockKey = 'pinlock_' + task.eventTaskId + '_' + person.participantId;
    var failKey = 'pinfail_' + task.eventTaskId + '_' + person.participantId;
    var taskKey = 'pinfailt_' + task.eventTaskId;
    if (cache_().get(lockKey)) throw appError_('輸入錯誤太多次，請 1 分鐘後再試', 'PIN_LOCKED');
    if (Number(cache_().get(taskKey) || 0) >= PIN_TASK_FAILS_PER_MIN) throw appError_('這個任務暫時無法核銷，請 1 分鐘後再試', 'PIN_LOCKED');
    var pin = String(p.pin || '').trim();
    if (!task.pinHash || !/^\d{4}$/.test(pin) || hashPin_(pin) !== task.pinHash) {
      var fails = Number(cache_().get(failKey) || 0) + 1;
      cache_().put(taskKey, String(Number(cache_().get(taskKey) || 0) + 1), 60);
      if (fails >= PIN_MAX_FAILS) {
        cache_().put(lockKey, '1', PIN_LOCK_SECONDS);
        cacheRemove_(failKey);
        throw appError_('輸入錯誤太多次，請 1 分鐘後再試', 'PIN_LOCKED');
      }
      cache_().put(failKey, String(fails), PIN_LOCK_SECONDS * 10);
      throw appError_('核銷碼不正確，還可以再試 ' + (PIN_MAX_FAILS - fails) + ' 次', 'PIN_WRONG');
    }
    cacheRemove_(failKey);
  } else if (task.verifyMethod !== 'self_check') {
    throw appError_('這個任務的驗證方式還沒開放');
  }

  // 有登入後台的裝置（例如攤位平板）就記錄是哪位業務核銷的
  var staffId = '';
  if (p.staffToken) { try { staffId = requireUser_(p.staffToken).userId; } catch (e) { staffId = ''; } }

  return withLock_(function () {
    var already = completionsOf_(ev, person.participantId).some(function (c) { return c.eventTaskId === task.eventTaskId; });
    if (!already) {
      insert_('TaskCompletions', {
        participantId: person.participantId, eventId: ev.eventId, eventTaskId: task.eventTaskId, completedAt: now_(),
        verifyMethod: task.verifyMethod, staffUserId: staffId, isTest: ev.isTestMode
      });
    }
    return taskStateOut_(ev, find_('Participants', person.participantId));
  });
}
