/**
 * ===== 登入與權限 =====
 * 前端用 Google 登入拿到 ID token → 這裡向 Google 驗證 → 比對 Users 白名單 → 發 session token（存 6 小時）。
 */

function verifyGoogleIdToken_(idToken) {
  if (!idToken) throw appError_('沒有收到 Google 登入資訊，請重新登入', 'AUTH');
  if (!CONFIG.OAUTH_CLIENT_ID) throw appError_('系統尚未設定 OAUTH_CLIENT_ID（Config.gs）', 'CONFIG');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw appError_('Google 登入驗證失敗，請重新登入', 'AUTH');
  var info = JSON.parse(res.getContentText());
  if (info.aud !== CONFIG.OAUTH_CLIENT_ID) throw appError_('登入來源不正確（Client ID 不符），請聯絡管理者', 'AUTH');
  if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') {
    throw appError_('登入來源不正確，請重新登入', 'AUTH');
  }
  if (String(info.email_verified) !== 'true') throw appError_('這個 Google 帳號的 Email 尚未驗證', 'AUTH');
  if (Number(info.exp) * 1000 < Date.now()) throw appError_('登入資訊已過期，請重新登入', 'AUTH');
  return { email: normEmail_(info.email), name: str_(info.name, 100) };
}

function apiLogin_(p) {
  var g = verifyGoogleIdToken_(p.idToken);
  var user = cachedRows_('Users').filter(function (u) { return u.email === g.email; })[0];
  if (!user) throw appError_('「' + g.email + '」不在使用名單中，請聯絡管理者開通', 'NOT_WHITELISTED');
  if (user.status !== 'active') throw appError_('這個帳號已被停用，請聯絡管理者', 'DISABLED');
  if (!user.name && g.name) user = update_('Users', user.userId, { name: g.name });
  var token = token_();
  cachePutJson_('sess_' + token, { userId: user.userId }, CONFIG.SESSION_SECONDS);
  return { token: token, user: publicUser_(user) };
}

function apiLogout_(p, user, token) {
  if (token) cacheRemove_('sess_' + token);
  return true;
}

function apiMe_(p, user) {
  return publicUser_(user);
}

/** 檢查 session token，回傳目前使用者；每次都重新比對白名單，停用後立即失效 */
function requireUser_(token) {
  if (!token) throw appError_('請先登入', 'AUTH');
  var sess = cacheGetJson_('sess_' + token);
  if (!sess) throw appError_('登入已逾時，請重新登入', 'AUTH');
  var user = cachedRows_('Users').filter(function (u) { return u.userId === sess.userId; })[0];
  if (!user || user.status !== 'active') {
    cacheRemove_('sess_' + token);
    throw appError_('帳號已停用或不存在，請聯絡管理者', 'AUTH');
  }
  return user;
}

function publicUser_(u) {
  return pick_(u, ['userId', 'email', 'name', 'role', 'status']);
}

function isAdmin_(user) {
  return user && user.role === 'admin';
}

/** 可以修改（也可以看個資）：管理者或擁有者 */
function canEdit_(user, ownerId) {
  return isAdmin_(user) || (user && user.userId === ownerId);
}

function requireEdit_(user, ownerId) {
  if (!canEdit_(user, ownerId)) throw appError_('這是其他業務的資料，你只能檢視、不能修改', 'FORBIDDEN');
}

/* ---------- 活動權限：擁有者＋協作人員 ---------- */

function isCoOwner_(user, ev) {
  return !!(user && ev && (ev.coOwnerIds || []).indexOf(user.userId) >= 0);
}

/** 可以修改活動、看個資：管理者、擁有者、協作人員 */
function canEditEvent_(user, ev) {
  return !!(user && ev && (isAdmin_(user) || user.userId === ev.ownerId || isCoOwner_(user, ev)));
}

/** 可以刪除活動、修改協作名單：管理者、擁有者 */
function canManageEvent_(user, ev) {
  return !!(user && ev && (isAdmin_(user) || user.userId === ev.ownerId));
}

function requireEditEvent_(user, ev) {
  if (!canEditEvent_(user, ev)) throw appError_('這個活動不是你負責的，你只能檢視、不能修改', 'FORBIDDEN');
}

function requireManageEvent_(user, ev) {
  if (!canManageEvent_(user, ev)) throw appError_('只有活動建立者或管理者可以進行這個操作', 'FORBIDDEN');
}

var ROLE_LABELS = { admin: '管理者', sales: '業務', pm: 'PM' };

/** 給「指派協作人員」用的名單（任何登入者都能讀，只含啟用中的人） */
function apiUsersOptions_() {
  return cachedRows_('Users').filter(function (u) { return u.status === 'active'; })
    .map(function (u) { return { userId: u.userId, name: u.name || u.email, email: u.email, role: u.role }; });
}

/* ---------- 使用者管理（僅管理者） ---------- */

function apiUsersList_() {
  return all_('Users').map(function (u) {
    return pick_(u, ['userId', 'email', 'name', 'role', 'status', 'createdAt']);
  });
}

function apiUsersSave_(p, me) {
  var email = normEmail_(p.email);
  var name = str_(p.name, 50);
  var role = oneOf_(p.role, ['admin', 'sales', 'pm'], '');
  var status = oneOf_(p.status, ['active', 'disabled'], '');
  if (!role) throw appError_('請選擇角色');
  if (!status) throw appError_('請選擇狀態');

  if (p.userId) {
    var u = find_('Users', p.userId);
    if (!u) throw appError_('找不到這位使用者', 'NOT_FOUND');
    if (u.userId === me.userId && (role !== 'admin' || status !== 'active')) {
      throw appError_('不能停用自己或拿掉自己的管理者權限');
    }
    return publicUser_(update_('Users', u.userId, { name: name || u.name, role: role, status: status }));
  }

  if (!isEmail_(email)) throw appError_('Email 格式不正確');
  if (where_('Users', function (x) { return x.email === email; }).length) throw appError_('這個 Email 已經在名單裡了');
  return publicUser_(insert_('Users', { email: email, name: name, role: role, status: status }));
}

/* ---------- 系統設定 ---------- */

function apiSettingsGet_() {
  return {
    privacyText: getSetting_('privacyText', DEFAULT_PRIVACY_TEXT),
    defaultRegFields: getSetting_('defaultRegFields', DEFAULT_REG_FIELDS),
    identities: IDENTITIES,
    clientTypes: CLIENT_TYPES
  };
}

function apiSettingsSave_(p) {
  if (p.privacyText !== undefined) {
    var text = str_(p.privacyText, 10000);
    if (!text) throw appError_('個資同意聲明不可空白');
    setSetting_('privacyText', text);
  }
  if (p.defaultRegFields !== undefined) setSetting_('defaultRegFields', cleanRegFields_(p.defaultRegFields));
  return apiSettingsGet_();
}
