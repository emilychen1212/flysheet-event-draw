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
    gameType: 'wheel', drawMode: 'self', regMode: 'before', dailyLimit: 2, promoEnabled: true,
    promoProducts: [{ name: 'UpToDate', intro: '全球臨床醫師最信賴的實證醫學臨床決策工具', url: 'https://www.wolterskluwer.com/en/solutions/uptodate' },
      { name: 'JoVE', intro: '實驗操作影片期刊，看影片學實驗步驟', url: 'https://www.jove.com/', owned: true },
      { name: 'ClinicalKey', intro: '醫學電子書、期刊與臨床資訊一站搜尋', url: '' }] },
    prizes: [{ label: '頭獎', name: '保溫杯', quantity: 5, isSpecial: true }, { label: 'JoVE 影片', name: '一個月體驗', quantity: 10 }, { label: '電子書', name: 'Thieme 電子書', quantity: 10 }, { label: '資料庫', name: 'UpToDate 試用', quantity: 10 }, { label: '精美好禮', name: '帆布袋', quantity: 20 }, { label: '幸運獎', name: '貼紙組', quantity: 50 }, { name: '再接再厲', quantity: 30, isLose: true }] }, sales);
  call('public.submitLead', { eventCode: 'EBM27', type: 'trial', productName: 'UpToDate', name: '王小明', organization: '臺大醫院 內科部', email: 'ming@example.com', note: '想試用一個月' });
  call('public.submitLead', { eventCode: 'EBM27', type: 'recommend', productName: 'ClinicalKey', message: '查電子書很方便，希望圖書館採購', name: '林護理師', organization: '臺大醫院 護理部', phone: '0912345678' });
  call('public.submitLead', { eventCode: 'EBM27', type: 'training', productName: 'JoVE', name: '張老師', organization: '臺大 醫學系', email: 'chang@example.com' });
  // 報表示範：60 位參與者、兩天、不同時段與單位
  {
    const orgs = ['臺大醫院', '臺大醫院', '臺大醫院', '馬偕醫院', '馬偕醫院', '北醫附醫', '長庚醫院', '國泰醫院', '臺大 醫學系', '陽明交大', '亞東醫院', '振興醫院', '萬芳醫院', '輔大醫院'];
    const ids = ['醫師', '護理師', '護理師', '學生', '館員', '老師', '其他'];
    const days = ['2026-11-20', '2026-11-21'];
    for (let i = 0; i < 60; i++) {
      const r = call('public.register', { eventCode: 'EBM27', name: '參與者' + i, email: `p${i}@example.com`, organization: orgs[i % orgs.length],
        identity: ids[i % ids.length], identityOther: ids[i % ids.length] === '其他' ? '藥師' : '', privacyConsent: true, wantsProductInfo: i % 3 !== 0 });
      if (r.ticket) call('public.draw', { eventCode: 'EBM27', ticket: r.ticket, deviceType: i % 4 ? 'mobile' : 'desktop' });
    }
    g.resetTables_();
    const peak = [10, 10, 10, 12, 12, 12, 12, 13, 15, 15, 16, 16];
    g.all_('Draws').filter((d) => d.prizeName && !d.isTest).forEach((d, i) => {
      const h = peak[i % peak.length], m = (i * 7) % 60;
      g.update_('Draws', d.drawId, { drawnAt: `${days[i % 2]} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00` });
    });
  }
  // 體驗任務示範：清華大學，UpToDate 必做＋至少 1 個選做，PIN 1234
  {
    const tpls = call('templates.list', {}, sales);
    const nthu = call('clients.save', { name: '清華大學圖書館', type: '醫學院' }, sales);
    call('clientDbs.save', { clientId: nthu.clientId, items: [{ dbName: 'UpToDate', url: 'https://proxy.lib.nthu.edu.tw/uptodate' }, { dbName: 'JoVE' }, { dbName: 'Acland' }, { dbName: 'HST' }] }, sales);
    const pick = (db) => tpls.find((t) => t.dbName === db);
    const tk = (db, extra) => Object.assign({ templateId: pick(db).templateId, dbName: db, title: pick(db).title, dbIntro: pick(db).dbIntro, actionText: pick(db).actionText,
      verifyMethod: 'staff_pin', pin: '1234' }, extra || {});
    call('events.save', { event: { eventCode: 'NTHU', clientId: nthu.clientId, title: '資料庫體驗抽抽樂', subtitle: '完成資料庫體驗任務就能抽獎！',
      clientDisplayName: '清華大學圖書館 × 飛資得', startAt: '2026-11-01T09:00', endAt: '2026-12-31T17:00', status: 'active', gameType: 'wheel',
      drawMode: 'self', regMode: 'before', dailyLimit: 1, taskMode: 'cards', taskMinOptional: 1 },
      prizes: [{ label: '頭獎', name: '保溫杯', quantity: 5, isSpecial: true }, { label: '精美好禮', name: '帆布袋', quantity: 30 }, { name: '再接再厲', quantity: 20, isLose: true }],
      tasks: [tk('UpToDate', { required: true }), tk('JoVE'), tk('Acland', { verifyMethod: 'self_check', pin: '' }), tk('HST')] }, sales);
  }
  // PM 帳號，並指派為 EBM27 的協作人員
  call('users.save', { email: 'pm@example.com', name: '陳 PM', role: 'pm', status: 'active' }, admin);
  const pmId = call('users.options', {}, admin).find((u) => u.email === 'pm@example.com').userId;
  const ebm = call('events.list', {}, sales).find((e) => e.eventCode === 'EBM27');
  const full = call('events.get', { eventId: ebm.eventId }, sales);
  call('events.save', { event: Object.assign({}, full.event, { coOwnerIds: [pmId] }), prizes: full.prizes }, sales);
  // 攤位操作＋不登記、攤位操作＋中獎後登記
  call('events.save', { event: { eventCode: 'BOOTH1', clientId: c.clientId, title: '年會攤位轉轉樂', subtitle: '轉到就送！',
    startAt: '2026-11-01T09:00', endAt: '2026-12-31T17:00', status: 'active', gameType: 'wheel', drawMode: 'booth', regMode: 'none' },
    prizes: [{ name: '原子筆', quantity: 30 }, { name: '便利貼', quantity: 30 }, { name: '大獎：AirPods', quantity: 1, isSpecial: true }, { name: '銘謝惠顧', quantity: 20, isLose: true }] }, sales);
  // 其餘三款遊戲（攤位＋不登記，方便連續測試）
  [['SCR1', 'scratch', '古早味刮刮樂'], ['SLOT1', 'slot', '幸運拉霸大挑戰'], ['GACHA1', 'gacha', '飛資得扭蛋機']].forEach(([code, game, title]) => {
    call('events.save', { event: { eventCode: code, clientId: c.clientId, title, subtitle: '攤位限定，抽完換下一位！', startAt: '2026-11-01T09:00',
      endAt: '2026-12-31T17:00', status: 'active', gameType: game, drawMode: 'booth', regMode: 'none' },
      prizes: [{ name: '保溫杯', quantity: 3, isSpecial: true }, { name: '帆布袋', quantity: 20 }, { name: '貼紙組', quantity: 30 }, { name: '銘謝惠顧', quantity: 20, isLose: true }] }, sales);
  });
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
