/**
 * ===== 前台公開 API（不需登入）=====
 * 只能：讀取活動公開設定、登記、抽獎、送出潛在客戶表單。
 * 中獎結果一律在這裡決定、寫入紀錄後才回傳。
 */

var LIMIT_MESSAGE = '今天的抽獎次數已用完，明天再來試試手氣！';

function publicPrize_(p) {
  return pick_(p, ['prizeId', 'name', 'label', 'isLose', 'isSpecial', 'color', 'sortOrder', 'quantity', 'remaining']);
}

function loadOpenEvent_(code) {
  var ev = findEventByCode_(code);
  if (!ev) throw appError_('找不到這個活動，請確認網址是否正確', 'NOT_FOUND');
  var prizes = prizesOf_(ev.eventId);
  var state = eventState_(ev, prizes);
  if (state !== 'open') throw appError_(STATE_MESSAGES[state], 'STATE_' + state.toUpperCase());
  return { ev: ev, prizes: prizes };
}

function apiPublicGetEvent_(p) {
  var code = String(p.eventCode || '').trim().toUpperCase();
  if (!code) throw appError_('網址缺少活動代碼', 'NOT_FOUND');
  var cached = cacheGetJson_('pub_' + code);
  if (cached) return cached;
  var ev = findEventByCode_(code);
  if (!ev) throw appError_('找不到這個活動，請確認網址是否正確', 'NOT_FOUND');
  var prizes = prizesOf_(ev.eventId);
  var state = eventState_(ev, prizes);
  var out = {
    event: pick_(ev, ['eventCode', 'title', 'subtitle', 'clientDisplayName', 'startAt', 'endAt', 'gameType',
      'drawMode', 'regMode', 'dailyLimit', 'regFields', 'promoEnabled', 'promoProducts', 'soundDefault', 'isTestMode']),
    prizes: prizes.map(publicPrize_),
    state: state,
    stateMessage: STATE_MESSAGES[state] || '',
    privacyText: ev.regMode === 'none' ? '' : getSetting_('privacyText', DEFAULT_PRIVACY_TEXT),
    identities: IDENTITIES,
    serverTime: now_()
  };
  cachePutJson_('pub_' + code, out, CONFIG.PUBLIC_CACHE_SECONDS);
  return out;
}

/** 依活動的登記欄位設定檢查並整理登記資料 */
function cleanRegistration_(ev, p) {
  var rf = ev.regFields || DEFAULT_REG_FIELDS;
  var f = rf.fields;
  var labels = { name: '姓名', email: 'Email', phone: '手機', organization: '服務單位', identity: '身分' };
  var d = {
    name: str_(p.name, 50),
    email: normEmail_(p.email),
    phone: normPhone_(p.phone).slice(0, 20),
    organization: str_(p.organization, 100),
    identity: str_(p.identity, 20),
    identityOther: str_(p.identityOther, 50)
  };
  REG_FIELD_KEYS.forEach(function (k) {
    if (f[k] === 'hidden') { d[k] = ''; return; }
    if (f[k] === 'required' && !d[k]) throw appError_('請填寫「' + labels[k] + '」');
  });
  if (f.identity === 'hidden' || d.identity !== '其他') d.identityOther = '';
  if (d.email && !isEmail_(d.email)) throw appError_('Email 格式不正確');
  if (d.phone && d.phone.length < 8) throw appError_('手機號碼格式不正確');
  if (d.identity && IDENTITIES.indexOf(d.identity) < 0) throw appError_('請選擇身分');
  if (ev.regMode === 'after' && !d.email && !d.phone) throw appError_('請至少留下 Email 或手機，方便通知領獎');

  var answers = {};
  var input = p.customAnswers || {};
  (rf.custom || []).forEach(function (q) {
    var v = input[q.id];
    if (q.type === 'multi') {
      v = (Array.isArray(v) ? v : []).filter(function (x) { return q.options.indexOf(x) >= 0; });
      if (q.required && !v.length) throw appError_('請回答「' + q.label + '」');
    } else if (q.type === 'single') {
      v = q.options.indexOf(v) >= 0 ? v : '';
      if (q.required && !v) throw appError_('請回答「' + q.label + '」');
    } else {
      v = str_(v, 500);
      if (q.required && !v) throw appError_('請回答「' + q.label + '」');
    }
    answers[q.id] = v;
  });
  d.customAnswers = answers;

  if (!bool_(p.privacyConsent)) throw appError_('請先勾選同意個人資料蒐集聲明');
  d.privacyConsent = true;
  d.wantsProductInfo = bool_(p.wantsProductInfo);
  return d;
}

/** 今天抽了幾次。Draws 表會越來越大，所以用快取計數器，快取不見時才回頭數表 */
function dailyKey_(eventId, participantId) {
  return 'dc_' + eventId + '_' + participantId + '_' + today_();
}

function countTodayDraws_(eventId, participantId) {
  var hit = cache_().get(dailyKey_(eventId, participantId));
  if (hit !== null && hit !== undefined && hit !== '') return Number(hit) || 0;
  var today = today_();
  var n = where_('Draws', function (d) {
    return d.eventId === eventId && d.participantId === participantId && d.drawnAt.indexOf(today) === 0;
  }).length;
  cache_().put(dailyKey_(eventId, participantId), String(n), 6 * 60 * 60);
  return n;
}

function issueTicket_(eventId, participantId) {
  var t = token_();
  cachePutJson_('tk_' + t, { eventId: eventId, participantId: participantId }, CONFIG.TICKET_SECONDS);
  return t;
}

/** 同一活動中找同一人：Email（小寫）或手機（只留數字）相同即視為同一人 */
function findSameParticipant_(ev, d) {
  return where_('Participants', function (x) {
    if (x.eventId !== ev.eventId || x.isTest !== ev.isTestMode) return false;
    return (d.email && x.email === d.email) || (d.phone && normPhone_(x.phone) === d.phone);
  })[0] || null;
}

/**
 * 登記
 * - before：登記後發一張抽獎券（ticket），抽獎時要帶上。同一人沿用同一筆資料。
 * - after：帶著抽中時拿到的 claimToken，把登記資料綁回那筆抽獎紀錄。
 */
function apiPublicRegister_(p) {
  return withLock_(function () {
    var o = loadOpenEventForRegister_(p);
    var ev = o.ev;
    var d = cleanRegistration_(ev, p);
    var now = now_();

    if (ev.regMode === 'before') {
      var same = findSameParticipant_(ev, d);
      var person;
      if (same) {
        var patch = {};
        Object.keys(d).forEach(function (k) { if (d[k] !== '' && d[k] !== null) patch[k] = d[k]; });
        patch.wantsProductInfo = d.wantsProductInfo || same.wantsProductInfo;
        person = update_('Participants', same.participantId, patch);
      } else {
        d.eventId = ev.eventId;
        d.isTest = ev.isTestMode;
        d.registeredAt = now;
        person = insert_('Participants', d);
      }
      var used = countTodayDraws_(ev.eventId, person.participantId);
      var left = Math.max(0, ev.dailyLimit - used);
      var res = { participantId: person.participantId, dailyLimit: ev.dailyLimit, remainingToday: left, limitReached: left <= 0 };
      if (left > 0) res.ticket = issueTicket_(ev.eventId, person.participantId);
      else res.message = LIMIT_MESSAGE;
      return res;
    }

    if (ev.regMode === 'after') {
      var claim = cacheGetJson_('cl_' + p.claimToken);
      if (!claim || claim.eventId !== ev.eventId) throw appError_('登記時間已過或連結無效，請洽現場工作人員', 'CLAIM_INVALID');
      var draw = find_('Draws', claim.drawId);
      if (!draw || draw.participantId) throw appError_('這次中獎已經登記過了', 'CLAIM_INVALID');
      d.eventId = ev.eventId;
      d.isTest = draw.isTest;
      d.registeredAt = now;
      var created = insert_('Participants', d);
      update_('Draws', draw.drawId, { participantId: created.participantId });
      cacheRemove_('cl_' + p.claimToken);
      return { participantId: created.participantId };
    }

    throw appError_('這個活動不需要登記');
  });
}

/** 中獎後登記：抽完後活動剛好結束或獎品抽完，仍要讓得獎者完成登記 */
function loadOpenEventForRegister_(p) {
  var ev = findEventByCode_(p.eventCode);
  if (!ev) throw appError_('找不到這個活動，請確認網址是否正確', 'NOT_FOUND');
  if (ev.regMode === 'after' && p.claimToken) return { ev: ev };
  return loadOpenEvent_(p.eventCode);
}

/** 依剩餘數量加權隨機抽一個獎項 */
function pickPrize_(prizes) {
  var pool = prizes.filter(function (x) { return x.remaining > 0; });
  var total = pool.reduce(function (s, x) { return s + x.remaining; }, 0);
  if (!total) return null;
  var r = Math.random() * total;
  for (var i = 0; i < pool.length; i++) {
    r -= pool[i].remaining;
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function apiPublicDraw_(p) {
  return withLock_(function () {
    var o = loadOpenEvent_(p.eventCode);
    var ev = o.ev;
    var participantId = '';
    var ticketKey = '';
    var used = 0;

    if (ev.regMode === 'before') {
      ticketKey = 'tk_' + String(p.ticket || '');
      var tk = p.ticket ? cacheGetJson_(ticketKey) : null;
      if (!tk || tk.eventId !== ev.eventId) throw appError_('請先完成登記再抽獎', 'NEED_REGISTER');
      participantId = tk.participantId;
      used = countTodayDraws_(ev.eventId, participantId);
      if (used >= ev.dailyLimit) {
        cacheRemove_(ticketKey);
        return { limitReached: true, message: LIMIT_MESSAGE, remainingToday: 0 };
      }
    }

    var prize = pickPrize_(o.prizes);
    if (!prize) throw appError_(STATE_MESSAGES.soldOut, 'STATE_SOLDOUT');
    update_('Prizes', prize.prizeId, { remaining: prize.remaining - 1 });
    var draw = insert_('Draws', {
      eventId: ev.eventId, participantId: participantId, prizeId: prize.prizeId, prizeName: prize.name,
      isLose: prize.isLose, drawnAt: now_(), deviceType: p.deviceType === 'mobile' ? 'mobile' : 'desktop',
      isTest: ev.isTestMode
    });
    cacheRemove_('pub_' + ev.eventCode);
    if (participantId) cache_().put(dailyKey_(ev.eventId, participantId), String(used + 1), 6 * 60 * 60);

    var res = { drawId: draw.drawId, prize: publicPrize_(prize), limitReached: false, isTest: ev.isTestMode };
    if (ticketKey) {
      cacheRemove_(ticketKey);
      res.remainingToday = ev.dailyLimit - used - 1;
      if (res.remainingToday > 0) res.nextTicket = issueTicket_(ev.eventId, participantId);
    }
    if (ev.regMode === 'after' && !prize.isLose) {
      var claim = token_();
      cachePutJson_('cl_' + claim, { eventId: ev.eventId, drawId: draw.drawId }, CONFIG.CLAIM_SECONDS);
      res.claimToken = claim;
    }
    return res;
  });
}

/** 推廣表單可以選的項目（尚未購買／已購買的產品不同） */
var LEAD_TYPES = {
  notOwned: ['recommend', 'info', 'trial', 'other'],
  owned: ['recommend', 'training', 'info', 'other']
};

/** 推廣頁：有興趣了解更多／想學更多使用技巧 */
function apiPublicSubmitLead_(p) {
  var ev = findEventByCode_(p.eventCode);
  if (!ev) throw appError_('找不到這個活動', 'NOT_FOUND');
  if (ev.status === 'draft' && !ev.isTestMode) throw appError_(STATE_MESSAGES.draft);
  var productName = str_(p.productName, 100);
  var product = (ev.promoProducts || []).filter(function (x) { return x.name === productName; })[0];
  if (!product) throw appError_('請選擇想了解的產品');
  var owned = !!product.owned;
  var lead = {
    eventId: ev.eventId,
    type: oneOf_(p.type, owned ? LEAD_TYPES.owned : LEAD_TYPES.notOwned, ''),
    productName: product.name,
    productOwned: owned,
    message: str_(p.message, 500),
    name: str_(p.name, 50),
    organization: str_(p.organization, 100),
    email: normEmail_(p.email),
    phone: normPhone_(p.phone).slice(0, 20),
    note: str_(p.note, 1000),
    isTest: ev.isTestMode
  };
  if (!lead.type) throw appError_('請選擇您想要的協助');
  if (lead.type === 'other' && !lead.message) throw appError_('請簡單說明您的需求');
  if (!lead.name) throw appError_('請填寫姓名');
  if (!lead.email && !lead.phone) throw appError_('請至少留下 Email 或手機，方便業務與您聯繫');
  if (lead.email && !isEmail_(lead.email)) throw appError_('Email 格式不正確');
  if (lead.phone && lead.phone.length < 8) throw appError_('手機號碼格式不正確');
  var pid = str_(p.participantId, 20);
  if (pid) {
    var person = find_('Participants', pid);
    if (person && person.eventId === ev.eventId) lead.participantId = pid;
  }
  insert_('Leads', lead);
  return { message: '已收到，業務將與您聯繫' };
}
