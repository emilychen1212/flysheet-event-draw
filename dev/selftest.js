/*
 * 本機自我測試：node dev/selftest.js
 * 用假的試算表跑一遍 GAS 後端，檢查驗收重點（權限、每日次數、測試資料清除、獎池不超抽）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { FakeSpreadsheet, makeProject } = require('./gas-fakes');

const GAS = path.join(__dirname, '..', 'gas');
const files = ['Config.gs', 'Utils.gs', 'Db.gs', 'Setup.gs', 'Auth.gs', 'Clients.gs', 'Events.gs', 'Public.gs', 'Code.gs']
  .map((f) => path.join(GAS, f));
const all = fs.readdirSync(GAS).filter((f) => f.endsWith('.gs'));
all.forEach((f) => { if (!files.some((x) => x.endsWith('/' + f))) throw new Error('selftest 沒載入 ' + f); });

const ss = new FakeSpreadsheet();
const g = makeProject(ss, files);
g.CONFIG.ADMIN_EMAIL = 'boss@example.com';
g.CONFIG.OAUTH_CLIENT_ID = 'test-client';
g.setup();

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function call(action, payload, token) {
  g.resetTables_();
  const out = g.doPost({ postData: { contents: JSON.stringify({ action, token, payload }) } }).getContent();
  return JSON.parse(out);
}
function ok(action, payload, token) {
  const r = call(action, payload, token);
  if (!r.ok) throw new Error(action + ' 失敗：' + r.error);
  return r.data;
}
function rows(name) { g.resetTables_(); return g.all_(name); }

console.log('\n[登入與白名單]');
check('未登入呼叫後台被拒', call('events.list', {}).code === 'AUTH');
check('亂填 token 被拒', call('events.list', {}, 'xxx').code === 'AUTH');
check('非白名單登入被拒', call('auth.login', { idToken: 'dev:stranger@example.com' }).code === 'NOT_WHITELISTED');
check('假的 ID token 被拒', call('auth.login', { idToken: 'fake' }).code === 'AUTH');
const admin = ok('auth.login', { idToken: 'dev:Boss@Example.com' });
check('管理者可登入（email 不分大小寫）', admin.user.role === 'admin');
const A = admin.token;
ok('users.save', { email: 'amy@example.com', name: 'Amy', role: 'sales', status: 'active' }, A);
ok('users.save', { email: 'ben@example.com', name: 'Ben', role: 'sales', status: 'active' }, A);
const amy = ok('auth.login', { idToken: 'dev:amy@example.com' });
const ben = ok('auth.login', { idToken: 'dev:ben@example.com' });
check('業務不能管理使用者', call('users.list', {}, amy.token).code === 'FORBIDDEN');
check('重複 email 不能新增', !call('users.save', { email: 'amy@example.com', role: 'sales', status: 'active' }, A).ok);
check('管理者不能停用自己', !call('users.save', { userId: admin.user.userId, role: 'admin', status: 'disabled' }, A).ok);

console.log('\n[客戶與活動]');
const c1 = ok('clients.save', { name: '臺大醫圖', type: '醫學院' }, amy.token);
const cBen = ok('clients.save', { name: '馬偕醫院', type: '醫院' }, ben.token);
check('業務只看到自己的客戶', ok('clients.list', {}, amy.token).length === 1);
check('管理者看到全部客戶', ok('clients.list', {}, A).length === 2);
check('不能用別人的客戶建活動', !call('events.save', { event: baseEvent('X1', cBen.clientId), prizes: prizes1() }, amy.token).ok);

function baseEvent(code, clientId, extra) {
  return Object.assign({ eventCode: code, clientId, title: '實證醫學推廣', startAt: '2026-01-01T09:00', endAt: '2099-12-31T18:00',
    status: 'active', gameType: 'wheel', drawMode: 'self', regMode: 'before', dailyLimit: 2 }, extra || {});
}
function prizes1() {
  return [{ name: '保溫杯', quantity: 1, isSpecial: true }, { name: '銘謝惠顧', quantity: 0, isLose: true }];
}
const e1 = ok('events.save', { event: baseEvent('ebm27', c1.clientId), prizes: [{ name: '保溫杯', quantity: 3 }, { name: '貼紙', quantity: 5 }, { name: '銘謝惠顧', quantity: 10, isLose: true }] }, amy.token);
check('活動代碼自動轉大寫', e1.event.eventCode === 'EBM27');
check('剩餘數量 = 初始數量', e1.prizes.every((p) => p.remaining === p.quantity));
check('活動代碼不能重複', !call('events.save', { event: baseEvent('EBM27', c1.clientId), prizes: prizes1() }, amy.token).ok);
check('checkCode 回報已使用', ok('events.checkCode', { eventCode: 'ebm27' }, amy.token).available === false);
check('其他業務可以檢視活動', ok('events.get', { eventId: e1.event.eventId }, ben.token).event.canEdit === false);
check('其他業務不能修改活動', call('events.save', { event: Object.assign(baseEvent('EBM27', c1.clientId), { eventId: e1.event.eventId }), prizes: prizes1() }, ben.token).code === 'FORBIDDEN');
check('其他業務不能清除測試資料', call('events.clearTest', { eventId: e1.event.eventId }, ben.token).code === 'FORBIDDEN');
check('有活動的客戶不能刪除', !call('clients.delete', { clientId: c1.clientId }, amy.token).ok);
check('先登記模式要有必填 Email 或手機', !call('events.save', { event: baseEvent('Z9', c1.clientId, { regFields: { fields: { email: 'optional', phone: 'optional' } } }), prizes: prizes1() }, amy.token).ok);
check('沒有一般獎項不能存', !call('events.save', { event: baseEvent('Z8', c1.clientId), prizes: [{ name: '銘謝惠顧', quantity: 5, isLose: true }] }, amy.token).ok);

console.log('\n[先登記再抽：每日次數]');
const reg = { eventCode: 'EBM27', name: '王小明', email: 'Ming@Gmail.com ', organization: '臺大醫院', identity: '醫師', privacyConsent: true };
check('沒勾個資同意不能登記', !call('public.register', Object.assign({}, reg, { privacyConsent: false })).ok);
check('沒登記不能抽', call('public.draw', { eventCode: 'EBM27' }).code === 'NEED_REGISTER');
let r = ok('public.register', reg);
check('登記後拿到抽獎券，今日剩 2 次', !!r.ticket && r.remainingToday === 2);
let d = ok('public.draw', { eventCode: 'EBM27', ticket: r.ticket, deviceType: 'mobile' });
check('抽獎成功且有結果', !!d.prize && d.remainingToday === 1 && !!d.nextTicket);
check('同一張券不能重複用', call('public.draw', { eventCode: 'EBM27', ticket: r.ticket }).code === 'NEED_REGISTER');
d = ok('public.draw', { eventCode: 'EBM27', ticket: d.nextTicket });
check('第 2 次抽完沒有下一張券', d.remainingToday === 0 && !d.nextTicket);
r = ok('public.register', Object.assign({}, reg, { email: 'ming@gmail.com' }));
check('同一 Email 再登記：當天已達上限', r.limitReached === true && !r.ticket && r.message.indexOf('明天') >= 0);
check('同一人只存一筆參與者資料', rows('Participants').length === 1);
// 模擬隔天：把他的抽獎時間改成昨天
const yesterday = '2000-01-01 10:00:00';
rows('Draws').forEach((x) => g.update_('Draws', x.drawId, { drawnAt: yesterday }));
// 換日：今日次數的快取鍵含日期，模擬「明天」= 改掉 today_()
const realToday = g.today_;
g.today_ = () => '2099-01-02';
check('隔天（快取鍵換日）不受昨天計數影響', g.countTodayDraws_(e1.event.eventId, rows('Participants')[0].participantId) === 0);
g.today_ = realToday;
rows('Participants').forEach((x) => g.cacheRemove_(g.dailyKey_(e1.event.eventId, x.participantId)));
r = ok('public.register', reg);
check('隔天可以再抽', r.remainingToday === 2 && !!r.ticket);

console.log('\n[獎池不超抽]');
const e2 = ok('events.save', { event: baseEvent('LAST1', c1.clientId, { regMode: 'none', drawMode: 'booth' }), prizes: [{ name: '最後一個', quantity: 1 }] }, amy.token);
const p1 = call('public.draw', { eventCode: 'LAST1' });
const p2 = call('public.draw', { eventCode: 'LAST1' });
check('只剩 1 個時，第一個人抽中', p1.ok && p1.data.prize.name === '最後一個');
check('第二個人被告知已全數送出', !p2.ok && p2.code === 'STATE_SOLDOUT');
check('剩餘數量 0，不會變負數', rows('Prizes').filter((x) => x.eventId === e2.event.eventId)[0].remaining === 0);
const many = ok('events.save', { event: baseEvent('MANY', c1.clientId, { regMode: 'none' }), prizes: [{ name: 'A', quantity: 3 }, { name: 'B', quantity: 2 }, { name: '銘謝', quantity: 4, isLose: true }] }, amy.token);
const counts = {};
for (let i = 0; i < 20; i++) { const x = call('public.draw', { eventCode: 'MANY' }); if (x.ok) counts[x.data.prize.name] = (counts[x.data.prize.name] || 0) + 1; else { counts.stop = x.code; break; } }
check('各獎項發出數不超過數量', (counts.A || 0) <= 3 && (counts.B || 0) <= 2 && (counts['銘謝'] || 0) <= 4, counts);
check('一般獎抽完就結束（即使銘謝惠顧還有剩）', counts.A === 3 && counts.B === 2 && counts.stop === 'STATE_SOLDOUT', counts);

console.log('\n[活動狀態]');
ok('events.save', { event: baseEvent('DRAFT1', c1.clientId, { status: 'draft', regMode: 'none' }), prizes: prizes1() }, amy.token);
check('草稿不能抽', call('public.draw', { eventCode: 'DRAFT1' }).code === 'STATE_DRAFT');
ok('events.save', { event: baseEvent('SOON', c1.clientId, { regMode: 'none', startAt: '2099-01-01T09:00' }), prizes: prizes1() }, amy.token);
check('還沒開始顯示「活動尚未開始」', ok('public.getEvent', { eventCode: 'SOON' }).stateMessage === '活動尚未開始');
ok('events.save', { event: baseEvent('PAST', c1.clientId, { regMode: 'none', endAt: '2026-01-02T09:00' }), prizes: prizes1() }, amy.token);
check('過了結束時間顯示「活動已結束」', ok('public.getEvent', { eventCode: 'PAST' }).state === 'ended');
check('找不到的活動', call('public.getEvent', { eventCode: 'NOPE' }).code === 'NOT_FOUND');

console.log('\n[測試模式與清除]');
const t = ok('events.save', { event: baseEvent('TEST1', c1.clientId, { status: 'draft', isTestMode: true, regMode: 'before', dailyLimit: 5 }), prizes: [{ name: '杯子', quantity: 4 }, { name: '銘謝惠顧', quantity: 2, isLose: true }] }, amy.token);
const tr = ok('public.register', Object.assign({}, reg, { eventCode: 'TEST1' }));
let tk = tr.ticket;
for (let i = 0; i < 3; i++) { const x = ok('public.draw', { eventCode: 'TEST1', ticket: tk }); tk = x.nextTicket; check('測試模式草稿也能抽（第 ' + (i + 1) + ' 次），且標記 isTest', x.isTest === true); }
ok('public.submitLead', { eventCode: 'TEST1', type: 'trial', productName: 'UpToDate', name: '王小明', email: 'ming@gmail.com' });
const before = rows('Prizes').filter((x) => x.eventId === t.event.eventId).reduce((s, x) => s + x.remaining, 0);
check('測試抽走 3 個', before === 3);
const cleared = ok('events.clearTest', { eventId: t.event.eventId }, amy.token);
check('清除 3 筆抽獎、1 位參與者、1 筆潛在客戶', cleared.draws === 3 && cleared.participants === 1 && cleared.leads === 1, cleared);
const after = rows('Prizes').filter((x) => x.eventId === t.event.eventId);
check('獎池數量還原', after.every((x) => x.remaining === x.quantity), after);
check('正式資料沒被清掉', rows('Draws').filter((x) => !x.isTest).length > 0 && rows('Participants').length === 1);

console.log('\n[中獎後登記]');
ok('events.save', { event: baseEvent('AFTER1', c1.clientId, { regMode: 'after', drawMode: 'booth' }), prizes: [{ name: '筆記本', quantity: 2 }] }, amy.token);
const ad = ok('public.draw', { eventCode: 'AFTER1' });
check('抽中後拿到 claimToken', !!ad.claimToken);
ok('public.register', { eventCode: 'AFTER1', claimToken: ad.claimToken, name: '陳小姐', email: 'chen@example.com', organization: '馬偕', identity: '護理師', privacyConsent: true });
const linked = rows('Draws').filter((x) => x.drawId === ad.drawId)[0];
check('登記資料綁回該筆抽獎', !!linked.participantId);
check('claimToken 不能用第二次', call('public.register', { eventCode: 'AFTER1', claimToken: ad.claimToken, name: 'x', email: 'x@x.com', organization: 'x', identity: '學生', privacyConsent: true }).code === 'CLAIM_INVALID');

console.log('\n[獎池修改與複製、刪除]');
const got = ok('events.get', { eventId: many.event.eventId }, amy.token);
const pa = got.prizes.find((x) => x.name === 'A');
const edited = ok('events.save', { event: Object.assign(baseEvent('MANY', c1.clientId, { regMode: 'none' }), { eventId: many.event.eventId }), prizes: got.prizes.map((x) => x.prizeId === pa.prizeId ? Object.assign({}, x, { quantity: 5 }) : x) }, amy.token);
check('加量 3→5，剩餘 0→2', edited.prizes.find((x) => x.prizeId === pa.prizeId).remaining === 2);
check('已被抽過的獎項不能刪除', !call('events.save', { event: Object.assign(baseEvent('MANY', c1.clientId, { regMode: 'none' }), { eventId: many.event.eventId }), prizes: got.prizes.filter((x) => x.prizeId !== pa.prizeId) }, amy.token).ok);
const cp = ok('events.copy', { eventId: many.event.eventId, eventCode: 'MANY2' }, amy.token);
check('複製：草稿、數量重置', cp.event.status === 'draft' && cp.prizes.every((x) => x.remaining === x.quantity) && cp.prizes.length === 3);
check('複製時代碼不能重複', !call('events.copy', { eventId: many.event.eventId, eventCode: 'MANY' }, amy.token).ok);
check('有正式抽獎的活動不能刪除', !call('events.delete', { eventId: many.event.eventId }, amy.token).ok);
check('草稿活動可以刪除', ok('events.delete', { eventId: cp.event.eventId }, amy.token) === true);

console.log('\n[停用帳號]');
ok('users.save', { userId: ben.user.userId, role: 'sales', status: 'disabled' }, A);
check('停用後原本的登入立即失效', call('events.list', {}, ben.token).code === 'AUTH');
check('停用後不能再登入', call('auth.login', { idToken: 'dev:ben@example.com' }).code === 'DISABLED');

console.log('\n[獎項標籤（新欄位自動補上）]');
{
  // 模擬舊版試算表：Prizes 沒有 label 欄
  const sh = ss.getSheetByName('Prizes');
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const li = hdr.indexOf('label');
  sh.cells.forEach((row) => { if (row) row[li] = undefined; });
  const lb = ok('events.save', { event: baseEvent('LBL1', c1.clientId, { regMode: 'none' }), prizes: [{ name: 'AirPods', label: '頭獎', quantity: 1 }, { name: '銘謝惠顧', quantity: 1, isLose: true }] }, amy.token);
  check('舊表自動補上 label 欄並存入', lb.prizes[0].label === '頭獎');
  check('前台拿得到獎項標籤', ok('public.getEvent', { eventCode: 'LBL1' }).prizes[0].label === '頭獎');
  check('其他獎項資料沒有錯位', rows('Prizes').every((p) => typeof p.quantity === 'number' && p.eventId));
}

console.log('\n[資料格式]');
const sheetPhone = ok('public.register', Object.assign({}, reg, { eventCode: 'EBM27', email: 'zero@example.com', phone: '0912-345-678' }));
const pz = rows('Participants').find((x) => x.email === 'zero@example.com');
check('手機開頭的 0 保留', pz.phone === '0912345678', pz.phone);
ok('clients.save', { name: '=HYPERLINK("x")', type: '其他' }, amy.token);
check('公式不會被執行', rows('Clients').some((x) => x.name === '=HYPERLINK("x")'));
check('統一回應格式 {ok,data,error}', ['ok', 'data', 'error'].every((k) => k in call('public.getEvent', { eventCode: 'EBM27' })));

console.log('\n結果：' + pass + ' 項通過，' + fail + ' 項失敗');
process.exit(fail ? 1 : 0);
