/**
 * 統一的 API 呼叫
 *   import { api, ApiError } from '../assets/js/api.js';
 *   const data = await api('events.list');
 * 送出 POST（Content-Type: text/plain，避免 CORS 預檢），body = { action, token, payload }
 * 後端回傳 { ok, data, error, code }；ok 為 false 時丟出 ApiError（訊息是中文、可直接顯示）。
 */

const TOKEN_KEY = 'fed.session';

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 'ERROR';
  }
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
}

export function setToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* 無痕模式 */ }
}

/* ---------- 後台讀取快取 ----------
 * 每次呼叫 Apps Script 都要 1～3 秒，所以後台的清單類資料在短時間內重複使用。
 * 任何「寫入」動作成功後，會自動清空快取，確保看到的是最新資料。
 */
const READ_ONLY = /^(public\.getEvent|auth\.me|settings\.get|[a-z]+\.(list|get|checkCode))$/;
const memo = new Map();

export function clearCache() { memo.clear(); }

export function cachedApi(action, payload = {}, ttl = 30000) {
  const key = action + JSON.stringify(payload);
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = api(action, payload).catch((e) => { memo.delete(key); throw e; });
  memo.set(key, { at: Date.now(), promise });
  return promise;
}

export async function api(action, payload = {}, opts = {}) {
  const data = await rawApi(action, payload, opts);
  if (!READ_ONLY.test(action)) clearCache();
  return data;
}

async function rawApi(action, payload = {}, { timeout = 30000 } = {}) {
  const url = window.APP_CONFIG && window.APP_CONFIG.GAS_URL;
  if (!url) throw new ApiError('尚未設定 GAS 網址，請檢查 config.js', 'CONFIG');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: getToken(), payload }),
      signal: controller.signal
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? '連線逾時，請再試一次' : '連線失敗，請檢查網路後再試一次', 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  let json;
  try { json = await res.json(); } catch (e) {
    throw new ApiError('伺服器回應格式錯誤，請確認 GAS 已正確部署', 'BAD_RESPONSE');
  }
  if (!json.ok) {
    if (json.code === 'AUTH') { setToken(''); saveUser(null); }
    throw new ApiError(json.error || '發生未知錯誤', json.code);
  }
  return json.data;
}

/** 用 Google ID token 換 session token */
export async function login(idToken) {
  const data = await api('auth.login', { idToken });
  setToken(data.token);
  saveUser(data.user);
  return data.user;
}

export async function logout() {
  try { await api('auth.logout'); } catch (e) { /* 已逾時也沒關係 */ }
  setToken('');
  saveUser(null);
}

/** 記住登入者資料，下次開頁不用先等「確認登入」 */
const USER_KEY = 'fed.user';
export function saveUser(u) {
  try { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); } catch (e) { /* 無痕模式 */ }
}
export function savedUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; }
}
