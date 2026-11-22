/**
 * ===== API 入口 =====
 * 前端以 POST（Content-Type: text/plain）送 JSON：{ action, token, payload }
 * 回傳一律為 JSON：{ ok, data, error, code }
 *
 * 權限標記：pub = 不需登入；admin = 僅管理者；其餘 = 需登入（白名單內且啟用）
 */

function routes_() {
  return {
    // 公開
    'public.getEvent': { pub: true, fn: apiPublicGetEvent_ },
    'public.register': { pub: true, fn: apiPublicRegister_ },
    'public.draw': { pub: true, fn: apiPublicDraw_ },
    'public.submitLead': { pub: true, fn: apiPublicSubmitLead_ },

    // 登入
    'auth.login': { pub: true, fn: apiLogin_ },
    'auth.logout': { fn: apiLogout_ },
    'auth.me': { fn: apiMe_ },

    // 使用者與系統設定
    'users.list': { admin: true, fn: apiUsersList_ },
    'users.save': { admin: true, fn: apiUsersSave_ },
    'users.options': { fn: apiUsersOptions_ },
    'settings.get': { fn: apiSettingsGet_ },
    'settings.save': { admin: true, fn: apiSettingsSave_ },

    // 客戶
    'clients.list': { fn: apiClientsList_ },
    'clients.save': { fn: apiClientsSave_ },
    'clients.delete': { fn: apiClientsDelete_ },

    // 活動
    'events.list': { fn: apiEventsList_ },
    'events.get': { fn: apiEventsGet_ },
    'events.checkCode': { fn: apiEventsCheckCode_ },
    'events.save': { fn: apiEventsSave_ },
    'events.copy': { fn: apiEventsCopy_ },
    'events.delete': { fn: apiEventsDelete_ },
    'events.clearTest': { fn: apiEventsClearTest_ },

    // 潛在客戶
    'leads.list': { fn: apiLeadsList_ }
  };
}

function doPost(e) {
  return json_(handle_(e && e.postData ? e.postData.contents : ''));
}

/** 用瀏覽器打開 Web App 網址時顯示，用來確認部署成功 */
function doGet() {
  return json_({ ok: true, data: { service: 'flysheet-event-draw', time: now_() }, error: null });
}

function handle_(raw) {
  var t0 = Date.now();
  var out = handleInner_(raw);
  out.ms = Date.now() - t0;
  return out;
}

function handleInner_(raw) {
  try {
    var body;
    try { body = JSON.parse(raw || '{}'); } catch (err) { throw appError_('請求格式錯誤'); }
    var route = routes_()[body.action];
    if (!route) throw appError_('未知的操作：' + body.action);
    var user = null;
    if (!route.pub) {
      user = requireUser_(body.token);
      if (route.admin && !isAdmin_(user)) throw appError_('此功能僅限管理者使用', 'FORBIDDEN');
    }
    var payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    return { ok: true, data: route.fn(payload, user, body.token), error: null };
  } catch (err) {
    if (err && err.isApp) return { ok: false, data: null, error: err.message, code: err.code };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, data: null, error: '系統發生錯誤，請稍後再試（' + (err && err.message) + '）', code: 'SERVER' };
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
