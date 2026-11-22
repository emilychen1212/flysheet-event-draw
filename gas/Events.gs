/** ===== 專案活動與獎池 ===== */

var GAME_TYPES = ['wheel', 'scratch', 'slot', 'gacha'];
var REG_FIELD_KEYS = ['name', 'email', 'phone', 'organization', 'identity'];

var EVENT_FIELDS = ['eventId', 'eventCode', 'ownerId', 'clientId', 'title', 'subtitle', 'clientDisplayName',
  'startAt', 'endAt', 'status', 'gameType', 'drawMode', 'regMode', 'dailyLimit', 'regFields',
  'promoEnabled', 'promoProducts', 'soundDefault', 'isTestMode', 'createdAt', 'updatedAt', 'coOwnerIds'];

var PRIZE_FIELDS = ['prizeId', 'eventId', 'name', 'label', 'quantity', 'remaining', 'isLose', 'isSpecial', 'color', 'sortOrder'];

function findEventByCode_(code) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return null;
  return cachedRows_('Events').filter(function (e) { return e.eventCode === code; })[0] || null;
}

function prizesOf_(eventId) {
  return where_('Prizes', function (p) { return p.eventId === eventId; })
    .sort(function (a, b) { return a.sortOrder - b.sortOrder; });
}

/** 前台狀態：draft / notStarted / ended / soldOut / open（測試模式略過草稿與時間檢查） */
function eventState_(ev, prizes) {
  if (!ev.isTestMode) {
    if (ev.status === 'draft') return 'draft';
    if (ev.status === 'ended') return 'ended';
    var now = now_();
    if (ev.startAt && now < ev.startAt) return 'notStarted';
    if (ev.endAt && now > ev.endAt) return 'ended';
  }
  var real = prizes.filter(function (p) { return !p.isLose; });
  var pool = real.length ? real : prizes;
  if (!pool.some(function (p) { return p.remaining > 0; })) return 'soldOut';
  return 'open';
}

var STATE_MESSAGES = {
  draft: '活動尚未開放',
  notStarted: '活動尚未開始',
  ended: '活動已結束',
  soldOut: '獎品已全數送出，感謝參與'
};

function cleanRegFields_(rf) {
  rf = rf || {};
  var f = rf.fields || {};
  var out = { fields: {}, custom: [] };
  REG_FIELD_KEYS.forEach(function (k) {
    out.fields[k] = oneOf_(f[k], ['required', 'optional', 'hidden'], DEFAULT_REG_FIELDS.fields[k]);
  });
  var seen = {};
  (rf.custom || []).slice(0, 20).forEach(function (q) {
    var label = str_(q && q.label, 200);
    if (!label) return;
    var type = oneOf_(q.type, ['text', 'single', 'multi'], 'text');
    var options = type === 'text' ? [] : (q.options || []).map(function (o) { return str_(o, 100); })
      .filter(String).slice(0, 30);
    if (type !== 'text' && options.length < 2) throw appError_('自訂題目「' + label + '」至少要有 2 個選項');
    var id = str_(q.id, 20).replace(/[^\w]/g, '');
    if (!id || seen[id]) id = 'q' + shortId_().slice(0, 6);
    seen[id] = 1;
    out.custom.push({ id: id, label: label, type: type, options: options, required: bool_(q.required) });
  });
  return out;
}

function cleanPromoProducts_(list) {
  return (list || []).slice(0, 20).map(function (x) {
    var url = str_(x && x.url, 500);
    if (url && !/^https?:\/\//i.test(url)) throw appError_('產品連結要以 http:// 或 https:// 開頭：' + url);
    return { name: str_(x && x.name, 100), intro: str_(x && x.intro, 200), url: url, owned: bool_(x && x.owned) };
  }).filter(function (x) { return x.name; });
}

function isCodeTaken_(code, exceptEventId) {
  return where_('Events', function (e) { return e.eventCode === code && e.eventId !== exceptEventId; }).length > 0;
}

function cleanEventCode_(v) {
  var code = String(v || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(code)) throw appError_('活動代碼只能用英文字母和數字，長度 2～20 個字');
  return code;
}

/** 整理、檢查活動欄位。existing 為修改前的資料（新增時為 null） */
function cleanEvent_(p, existing, user) {
  var ev = {};
  var ownerId = existing ? existing.ownerId : user.userId;

  ev.eventCode = cleanEventCode_(p.eventCode);
  if (isCodeTaken_(ev.eventCode, existing && existing.eventId)) throw appError_('活動代碼「' + ev.eventCode + '」已被使用，請換一個');

  var client = find_('Clients', p.clientId);
  if (!client) throw appError_('請選擇客戶');
  if (client.ownerId !== ownerId) throw appError_('只能選擇活動擁有者自己建立的客戶');
  ev.clientId = client.clientId;

  ev.title = str_(p.title, 100);
  if (!ev.title) throw appError_('請填寫主標題');
  ev.subtitle = str_(p.subtitle, 300);
  ev.clientDisplayName = str_(p.clientDisplayName, 100) || client.name;

  ev.startAt = normDateTime_(p.startAt);
  ev.endAt = normDateTime_(p.endAt);
  if (!ev.startAt || !ev.endAt) throw appError_('請填寫活動開始與結束時間');
  if (ev.startAt >= ev.endAt) throw appError_('結束時間要晚於開始時間');

  ev.status = oneOf_(p.status, ['draft', 'active', 'ended'], 'draft');
  ev.gameType = oneOf_(p.gameType, GAME_TYPES, 'wheel');
  ev.drawMode = oneOf_(p.drawMode, ['booth', 'self'], 'booth');
  ev.regMode = oneOf_(p.regMode, ['none', 'before', 'after'], ev.drawMode === 'self' ? 'before' : 'none');
  ev.dailyLimit = Math.min(99, Math.max(1, int_(p.dailyLimit, 1)));
  ev.regFields = cleanRegFields_(p.regFields || getSetting_('defaultRegFields', DEFAULT_REG_FIELDS));
  if (ev.regMode === 'before' && ev.regFields.fields.email !== 'required' && ev.regFields.fields.phone !== 'required') {
    throw appError_('「先登記再抽」需要用 Email 或手機辨識同一人，請至少把其中一個設為「必填」');
  }
  if (ev.regMode === 'after' && ev.regFields.fields.email === 'hidden' && ev.regFields.fields.phone === 'hidden') {
    throw appError_('「中獎後登記」至少要顯示 Email 或手機其中一個，才能聯絡得獎者');
  }
  ev.promoEnabled = ev.drawMode === 'self' && bool_(p.promoEnabled);
  ev.promoProducts = cleanPromoProducts_(p.promoProducts);
  ev.soundDefault = oneOf_(p.soundDefault, ['on', 'off'], 'on');
  ev.isTestMode = bool_(p.isTestMode);
  // 協作人員：只有擁有者／管理者能改，協作人員自己存檔時保留原名單
  if (!existing || canManageEvent_(user, existing)) {
    var valid = {};
    cachedRows_('Users').forEach(function (u) { valid[u.userId] = 1; });
    var seen = {};
    ev.coOwnerIds = (Array.isArray(p.coOwnerIds) ? p.coOwnerIds : []).map(function (x) { return str_(x, 20); })
      .filter(function (id) { if (!valid[id] || id === ownerId || seen[id]) return false; seen[id] = 1; return true; }).slice(0, 10);
  } else {
    ev.coOwnerIds = existing.coOwnerIds || [];
  }
  return ev;
}

function cleanPrizes_(list) {
  if (!Array.isArray(list) || !list.length) throw appError_('請至少設定一個獎項');
  if (list.length > 30) throw appError_('獎項最多 30 個');
  var out = list.map(function (x, i) {
    var name = str_(x.name, 50);
    if (!name) throw appError_('第 ' + (i + 1) + ' 個獎項沒有名稱');
    var qty = int_(x.quantity, -1);
    if (qty < 0 || qty > 100000) throw appError_('「' + name + '」的數量要是 0 以上的整數');
    var color = str_(x.color, 20);
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) color = '';
    return {
      prizeId: str_(x.prizeId, 20), name: name, label: str_(x.label, 20), quantity: qty,
      isLose: bool_(x.isLose), isSpecial: bool_(x.isSpecial) && !bool_(x.isLose),
      color: color, sortOrder: i + 1
    };
  });
  if (!out.some(function (p) { return !p.isLose; })) throw appError_('至少要有一個不是「銘謝惠顧」的獎項');
  return out;
}

/** 刪除獎項前檢查：已被抽中過的獎項不能刪（在任何寫入之前呼叫） */
function assertPrizeRemovable_(eventId, list) {
  var keep = {};
  list.forEach(function (x) { if (x.prizeId) keep[x.prizeId] = 1; });
  var drawn = {};
  where_('Draws', function (d) { return d.eventId === eventId; }).forEach(function (d) { drawn[d.prizeId] = 1; });
  prizesOf_(eventId).forEach(function (p) {
    if (!keep[p.prizeId] && drawn[p.prizeId]) throw appError_('「' + p.name + '」已經有人抽中過，不能刪除（可以把數量改成 0）');
  });
}

/** 依新設定同步獎池：數量增減會同步調整剩餘數量 */
function syncPrizes_(eventId, list) {
  var existing = prizesOf_(eventId);
  var byId = {};
  existing.forEach(function (p) { byId[p.prizeId] = p; });
  var keepIds = {};
  list.forEach(function (x) {
    var old = x.prizeId && byId[x.prizeId];
    if (old) {
      keepIds[old.prizeId] = 1;
      var remaining = Math.max(0, Math.min(x.quantity, old.remaining + (x.quantity - old.quantity)));
      update_('Prizes', old.prizeId, {
        name: x.name, label: x.label, quantity: x.quantity, remaining: remaining, isLose: x.isLose,
        isSpecial: x.isSpecial, color: x.color, sortOrder: x.sortOrder
      });
    } else {
      insert_('Prizes', {
        eventId: eventId, name: x.name, label: x.label, quantity: x.quantity, remaining: x.quantity, isLose: x.isLose,
        isSpecial: x.isSpecial, color: x.color, sortOrder: x.sortOrder
      });
    }
  });
  existing.forEach(function (p) { if (!keepIds[p.prizeId]) remove_('Prizes', p.prizeId); });
}

function eventOut_(ev, user, extra) {
  var out = pick_(ev, EVENT_FIELDS);
  out.coOwnerIds = ev.coOwnerIds || [];
  out.canEdit = canEditEvent_(user, ev);
  out.canManage = canManageEvent_(user, ev);
  out.isMine = user.userId === ev.ownerId || isCoOwner_(user, ev);
  if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
  return out;
}

function prizeOut_(p) {
  return pick_(p, PRIZE_FIELDS);
}

/* ---------- API ---------- */

function apiEventsList_(p, user) {
  var users = userNameMap_();
  var clients = {};
  all_('Clients').forEach(function (c) { clients[c.clientId] = c.name; });
  var prizes = all_('Prizes');
  var today = today_();
  var draws = where_('Draws', function (d) { return !d.isTest; });
  return all_('Events').map(function (ev) {
    var ps = prizes.filter(function (x) { return x.eventId === ev.eventId; });
    var real = ps.filter(function (x) { return !x.isLose; });
    var ds = draws.filter(function (d) { return d.eventId === ev.eventId; });
    return eventOut_(ev, user, {
      ownerName: users[ev.ownerId] || '',
      coOwnerNames: (ev.coOwnerIds || []).map(function (id) { return users[id]; }).filter(String),
      clientName: clients[ev.clientId] || '',
      state: eventState_(ev, ps),
      prizeTotal: real.reduce(function (s, x) { return s + x.quantity; }, 0),
      prizeRemaining: real.reduce(function (s, x) { return s + x.remaining; }, 0),
      drawCount: ds.length,
      todayDrawCount: ds.filter(function (d) { return d.drawnAt.indexOf(today) === 0; }).length
    });
  }).sort(function (a, b) { return a.startAt < b.startAt ? 1 : -1; });
}

function apiEventsGet_(p, user) {
  var ev = find_('Events', p.eventId);
  if (!ev) throw appError_('找不到這個活動', 'NOT_FOUND');
  var client = find_('Clients', ev.clientId);
  var users = userNameMap_();
  var prizes = prizesOf_(ev.eventId);
  return {
    event: eventOut_(ev, user, {
      ownerName: users[ev.ownerId] || '',
      coOwners: (ev.coOwnerIds || []).map(function (id) { return { userId: id, name: users[id] || '' }; }),
      clientName: client ? client.name : '',
      state: eventState_(ev, prizes),
      testDrawCount: where_('Draws', function (d) { return d.eventId === ev.eventId && d.isTest; }).length
    }),
    prizes: prizes.map(prizeOut_)
  };
}

function apiEventsCheckCode_(p) {
  var code;
  try { code = cleanEventCode_(p.eventCode); } catch (e) { return { available: false, message: e.message }; }
  if (isCodeTaken_(code, p.eventId || '')) return { available: false, message: '這個代碼已被使用' };
  return { available: true, code: code };
}

function apiEventsSave_(p, user) {
  return withLock_(function () {
    var input = p.event || {};
    var existing = input.eventId ? find_('Events', input.eventId) : null;
    if (input.eventId && !existing) throw appError_('找不到這個活動', 'NOT_FOUND');
    if (existing) requireEditEvent_(user, existing);
    var ev = cleanEvent_(input, existing, user);
    var prizes = cleanPrizes_(p.prizes);
    if (existing) assertPrizeRemovable_(existing.eventId, prizes);
    var saved;
    if (existing) {
      saved = update_('Events', existing.eventId, ev);
      if (existing.eventCode !== ev.eventCode) cacheRemove_('pub_' + existing.eventCode);
    } else {
      ev.ownerId = user.userId;
      saved = insert_('Events', ev);
    }
    syncPrizes_(saved.eventId, prizes);
    cacheRemove_('pub_' + saved.eventCode);
    resetTables_();
    return apiEventsGet_({ eventId: saved.eventId }, user);
  });
}

function apiEventsCopy_(p, user) {
  return withLock_(function () {
    var src = find_('Events', p.eventId);
    if (!src) throw appError_('找不到要複製的活動', 'NOT_FOUND');
    requireEditEvent_(user, src);
    var code = cleanEventCode_(p.eventCode);
    if (isCodeTaken_(code, '')) throw appError_('活動代碼「' + code + '」已被使用，請換一個');
    var copy = pick_(src, EVENT_FIELDS);
    delete copy.eventId;
    delete copy.createdAt;
    copy.eventCode = code;
    copy.status = 'draft';
    copy.isTestMode = false;
    var saved = insert_('Events', copy);
    prizesOf_(src.eventId).forEach(function (x) {
      insert_('Prizes', {
        eventId: saved.eventId, name: x.name, label: x.label, quantity: x.quantity, remaining: x.quantity,
        isLose: x.isLose, isSpecial: x.isSpecial, color: x.color, sortOrder: x.sortOrder
      });
    });
    resetTables_();
    return apiEventsGet_({ eventId: saved.eventId }, user);
  });
}

function apiEventsDelete_(p, user) {
  return withLock_(function () {
    var ev = find_('Events', p.eventId);
    if (!ev) throw appError_('找不到這個活動', 'NOT_FOUND');
    requireManageEvent_(user, ev);
    if (ev.status !== 'draft') throw appError_('只能刪除「草稿」狀態的活動；進行過的活動請改成「已結束」');
    var mine = function (r) { return r.eventId === ev.eventId; };
    if (where_('Draws', function (d) { return mine(d) && !d.isTest; }).length) {
      throw appError_('這個活動已有正式抽獎紀錄，不能刪除');
    }
    removeWhere_('Draws', mine);
    removeWhere_('Participants', mine);
    removeWhere_('Leads', mine);
    removeWhere_('Prizes', mine);
    remove_('Events', ev.eventId);
    cacheRemove_('pub_' + ev.eventCode);
    return true;
  });
}

/** 清除測試資料，並把測試抽走的獎品數量加回獎池 */
function apiEventsClearTest_(p, user) {
  return withLock_(function () {
    var ev = find_('Events', p.eventId);
    if (!ev) throw appError_('找不到這個活動', 'NOT_FOUND');
    requireEditEvent_(user, ev);
    var isTestOf = function (r) { return r.eventId === ev.eventId && r.isTest; };
    var draws = removeWhere_('Draws', isTestOf);
    var back = {};
    draws.forEach(function (d) { back[d.prizeId] = (back[d.prizeId] || 0) + 1; });
    prizesOf_(ev.eventId).forEach(function (x) {
      if (back[x.prizeId]) update_('Prizes', x.prizeId, { remaining: Math.min(x.quantity, x.remaining + back[x.prizeId]) });
    });
    var participants = removeWhere_('Participants', isTestOf);
    var leads = removeWhere_('Leads', isTestOf);
    cacheRemove_('pub_' + ev.eventCode);
    return { draws: draws.length, participants: participants.length, leads: leads.length };
  });
}
