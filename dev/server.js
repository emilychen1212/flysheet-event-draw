/*
 * 本機測試伺服器：node dev/server.js  →  http://localhost:8770/dev/api-test.html
 * 用假的試算表跑 gas/ 的程式（資料只在記憶體，關掉就消失）。
 * 本機不能用真的 Google 登入，所以 config.js 會被換成 DEV 模式：用「dev:你的email」登入。
 * 預設管理者：admin@example.com
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { FakeSpreadsheet, makeProject } = require('./gas-fakes');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8770);
const LATENCY = Number(process.env.LATENCY || 300);
const GAS = path.join(ROOT, 'gas');

const ss = new FakeSpreadsheet();
const g = makeProject(ss, fs.readdirSync(GAS).filter((f) => f.endsWith('.gs'))
  .sort((a, b) => (a === 'Config.gs' ? -1 : b === 'Config.gs' ? 1 : a.localeCompare(b)))
  .map((f) => path.join(GAS, f)));
g.CONFIG.ADMIN_EMAIL = 'admin@example.com';
g.CONFIG.OAUTH_CLIENT_ID = 'dev-client';
g.setup();

// 示範資料：業務帳號 sales@example.com、一個客戶與活動（關掉 SEED=0）
function call(action, payload, token) {
  g.resetTables_();
  const r = JSON.parse(g.doPost({ postData: { contents: JSON.stringify({ action, payload, token }) } }).getContent());
  if (!r.ok) throw new Error(action + '：' + r.error);
  return r.data;
}
if (process.env.SEED !== '0') {
  const admin = call('auth.login', { idToken: 'dev:admin@example.com' }).token;
  call('users.save', { email: 'sales@example.com', name: '王業務', role: 'sales', status: 'active' }, admin);
  const sales = call('auth.login', { idToken: 'dev:sales@example.com' }).token;
  const c = call('clients.save', { name: '臺大醫圖', type: '醫學院', note: '窗口：林館員' }, sales);
  call('clients.save', { name: '馬偕紀念醫院', type: '醫院' }, admin);
  call('events.save', { event: { eventCode: 'EBM27', clientId: c.clientId, title: '實證醫學工具大集合　轉轉樂', subtitle: '完成登記就能抽，好禮帶回家！',
    clientDisplayName: '臺大醫學院圖書館 × 飛資得', startAt: '2026-11-01T09:00', endAt: '2026-12-31T17:00', status: 'active',
    gameType: 'wheel', drawMode: 'self', regMode: 'before', dailyLimit: 2 },
    prizes: [{ name: '保溫杯', quantity: 5, isSpecial: true }, { name: '帆布袋', quantity: 20 }, { name: '貼紙組', quantity: 50 }, { name: '銘謝惠顧', quantity: 30, isLose: true }] }, sales);
  // 攤位操作＋不登記、攤位操作＋中獎後登記
  call('events.save', { event: { eventCode: 'BOOTH1', clientId: c.clientId, title: '年會攤位轉轉樂', subtitle: '轉到就送！',
    startAt: '2026-11-01T09:00', endAt: '2026-12-31T17:00', status: 'active', gameType: 'wheel', drawMode: 'booth', regMode: 'none' },
    prizes: [{ name: '原子筆', quantity: 30 }, { name: '便利貼', quantity: 30 }, { name: '大獎：AirPods', quantity: 1, isSpecial: true }, { name: '銘謝惠顧', quantity: 20, isLose: true }] }, sales);
  call('events.save', { event: { eventCode: 'AFTER1', clientId: c.clientId, title: '中獎再登記', startAt: '2026-11-01T09:00', endAt: '2026-12-31T17:00',
    status: 'active', gameType: 'wheel', drawMode: 'booth', regMode: 'after' },
    prizes: [{ name: '咖啡券', quantity: 10 }, { name: '銘謝惠顧', quantity: 2, isLose: true }] }, sales);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

function readBody(req) {
  return new Promise((resolve) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => resolve(d)); });
}
function send(res, status, type, body, delay) {
  setTimeout(() => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(body); }, delay || 0);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/config.js') {
      return send(res, 200, TYPES['.js'], `window.APP_CONFIG = { GAS_URL: '/api', GOOGLE_CLIENT_ID: '', DEV: true };`);
    }
    if (url.pathname === '/api') {
      g.resetTables_();
      if (req.method === 'GET') return send(res, 200, TYPES['.json'], g.doGet().getContent(), LATENCY);
      return send(res, 200, TYPES['.json'], g.doPost({ postData: { contents: await readBody(req) } }).getContent(), LATENCY);
    }
    if (url.pathname === '/dump') {
      const out = {};
      ss.getSheets().forEach((s) => { out[s.getName()] = s.getDataRange().getValues(); });
      return send(res, 200, TYPES['.json'], JSON.stringify(out, null, 1));
    }
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) return send(res, 403, 'text/plain', 'forbidden');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return send(res, 404, 'text/plain', 'not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    send(res, 500, 'text/plain', String(err && err.stack));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`本機測試：http://localhost:${PORT}/dev/api-test.html（管理者 dev:admin@example.com）`));
