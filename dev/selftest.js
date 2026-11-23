/*
 * 本機自我測試：node dev/selftest.js
 * 用假的試算表跑一遍 GAS 後端，檢查驗收重點（權限、每日次數、測試資料清除、獎池不超抽）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { FakeSpreadsheet, makeProject } = require('./gas-fakes');

const GAS = path.join(__dirname, '..', 'gas');
const files = ['Config.gs', 'Utils.gs', 'Db.gs', 'Setup.gs', 'Auth.gs', 'Clients.gs', 'Events.gs', 'Public.gs', 'Leads.gs', 'Reports.gs', 'Tasks.gs', 'Code.gs']
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
    status: 'active', gameType: 'wheel', drawMode: 'self', regMode: 'before', dailyLimit: 2,
    promoProducts: [{ name: 'UpToDate' }, { name: 'JoVE', owned: true }, { name: 'ClinicalKey' }] }, extra || {});
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

console.log('\n[潛在客戶]');
check('沒選產品不能送出', !call('public.submitLead', { eventCode: 'EBM27', type: 'trial', name: '王小明', email: 'ming@gmail.com' }).ok);
check('不在推廣清單的產品不能送出', !call('public.submitLead', { eventCode: 'EBM27', type: 'info', productName: '亂填', name: '王小明', email: 'ming@gmail.com' }).ok);
check('已購買的產品不能選「試用」', !call('public.submitLead', { eventCode: 'EBM27', type: 'trial', productName: 'JoVE', name: '王小明', email: 'ming@gmail.com' }).ok);
check('尚未購買的產品不能選「教育訓練」', !call('public.submitLead', { eventCode: 'EBM27', type: 'training', productName: 'UpToDate', name: '王小明', email: 'ming@gmail.com' }).ok);
check('選「其他」要寫說明', !call('public.submitLead', { eventCode: 'EBM27', type: 'other', productName: 'UpToDate', name: '王小明', email: 'ming@gmail.com' }).ok);
ok('public.submitLead', { eventCode: 'EBM27', type: 'recommend', productName: 'UpToDate', message: '臨床很需要', name: '王小明', email: 'ming@gmail.com', organization: '臺大' });
ok('public.submitLead', { eventCode: 'EBM27', type: 'training', productName: 'JoVE', name: '林護理師', phone: '0912000111' });
const myLeads = ok('leads.list', {}, amy.token);
check('擁有者看得到自己活動的潛在客戶（不含測試資料）', myLeads.length === 2 && myLeads.every((l) => l.eventCode === 'EBM27'), myLeads.length);
check('名單帶出「已購買」與推薦的話', myLeads.some((l) => l.productOwned && l.type === 'training') && myLeads.some((l) => !l.productOwned && l.message === '臨床很需要'));

check('其他業務看不到', ok('leads.list', {}, ben.token).length === 0);

console.log('\n[協作人員與 PM]');
ok('users.save', { email: 'pm@example.com', name: 'Pat', role: 'pm', status: 'active' }, A);
const pm = ok('auth.login', { idToken: 'dev:pm@example.com' });
check('PM 角色可以登入', pm.user.role === 'pm');
check('PM 不能管理使用者', call('users.list', {}, pm.token).code === 'FORBIDDEN');
check('任何登入者都能讀可指派名單', ok('users.options', {}, pm.token).length >= 3);
check('PM 預設不能改別人的活動', call('events.clearTest', { eventId: e1.event.eventId }, pm.token).code === 'FORBIDDEN');
check('PM 預設看不到別人活動的名單', ok('leads.list', {}, pm.token).length === 0);
const full = ok('events.get', { eventId: e1.event.eventId }, amy.token);
const withCo = ok('events.save', { event: Object.assign({}, full.event, { coOwnerIds: [pm.user.userId, ben.user.userId, 'nobody', amy.user.userId] }), prizes: full.prizes }, amy.token);
check('指派協作：無效的人、擁有者自己會被排除', JSON.stringify(withCo.event.coOwnerIds.sort()) === JSON.stringify([pm.user.userId, ben.user.userId].sort()), withCo.event.coOwnerIds);
check('協作人員可以修改活動', call('events.save', { event: Object.assign({}, withCo.event, { subtitle: 'PM 改的' }), prizes: withCo.prizes }, pm.token).ok);
check('協作人員改不了協作名單', ok('events.get', { eventId: e1.event.eventId }, pm.token).event.coOwnerIds.length === 2 &&
  (call('events.save', { event: Object.assign({}, withCo.event, { coOwnerIds: [] }), prizes: withCo.prizes }, pm.token), ok('events.get', { eventId: e1.event.eventId }, amy.token).event.coOwnerIds.length === 2));
check('協作人員看得到名單', ok('leads.list', {}, pm.token).length === 2);
check('協作人員不能刪除活動', call('events.delete', { eventId: e1.event.eventId }, pm.token).code === 'FORBIDDEN');
check('列表標示是我的活動', ok('events.list', {}, pm.token).find((e) => e.eventId === e1.event.eventId).isMine === true);
check('管理者看得到全部', ok('leads.list', {}, A).length === 2);
check('未登入不能讀名單', call('leads.list', {}).code === 'AUTH');

const carlTok = () => ok('auth.login', { idToken: 'dev:carl@example.com' }).token;
console.log('\n[報表]');
{
  const rp = ok('reports.get', { eventId: e1.event.eventId }, amy.token);
  const realDraws = rows('Draws').filter((d) => d.eventId === e1.event.eventId && !d.isTest).length;
  check('抽獎次數只算正式資料', rp.draws === realDraws, [rp.draws, realDraws]);
  check('先登記再抽：參與人數以人計', rp.participantsBy === 'people' && rp.participants === rows('Participants').filter((x) => x.eventId === e1.event.eventId && !x.isTest).length);
  check('各獎項發出數加總 = 抽獎次數', rp.prizes.reduce((s, x) => s + x.issued, 0) === rp.draws);
  check('時段分布加總 = 抽獎次數', Object.values(rp.byDay).flat().reduce((s, x) => s + x, 0) === rp.draws);
  check('潛在客戶數', rp.leads.total === 2 && rp.leads.byType.recommendNew === 1 && rp.leads.byType.training === 1, rp.leads);
  check('擁有者可看明細', rp.canSeeDetail === true && ok('reports.detail', { eventId: e1.event.eventId }, amy.token).participants.length === rp.registered);
  const other = ok('auth.login', { idToken: 'dev:boss@example.com' });
  ok('users.save', { email: 'carl@example.com', name: 'Carl', role: 'sales', status: 'active' }, other.token);
  const carl = ok('auth.login', { idToken: 'dev:carl@example.com' });
  check('其他業務可以看統計', ok('reports.get', { eventId: e1.event.eventId }, carl.token).draws === rp.draws);
  check('其他業務看不到明細（個資）', call('reports.detail', { eventId: e1.event.eventId }, carl.token).code === 'FORBIDDEN');
  check('不登記活動以抽獎次數計', ok('reports.get', { eventId: e2.event.eventId }, amy.token).participantsBy === 'draws');
  const tops = g.topCounts_(['臺大', '臺大 ', '馬偕', '', 'A', 'B', 'C'], 3, '未填寫');
  check('單位分布：合併空白、前 N 名＋其他', tops[0].name === '臺大' && tops[0].count === 2 && tops[tops.length - 1].name === '其他' && tops.length === 4, tops);
}

console.log('\n[總覽]');
{
  const db = ok('dashboard.get', {}, amy.token);
  check('本月統計有數字', db.draws > 0 && db.leads === 2 && db.recommend === 1, db);
  const ls = ok('events.list', {}, amy.token).find((e) => e.eventId === e1.event.eventId);
  check('今日參與人數（以人計）', typeof ls.todayParticipants === 'number' && ls.todayParticipants <= ls.todayDrawCount, [ls.todayParticipants, ls.todayDrawCount]);
}

console.log('\n[體驗任務]');
{
  const tpls = ok('templates.list', {}, amy.token);
  check('預設 5 個範本自動建立', ['UpToDate', 'JoVE', 'Acland', 'HST', 'JoMI'].every((n) => tpls.some((t) => t.dbName === n)), tpls.map((t) => t.dbName));
  check('預設範本其他業務不能改', tpls.every((t) => !t.canEdit) && !call('templates.save', Object.assign({}, tpls[0]), amy.token).ok);
  const mine = ok('templates.save', { dbName: 'uptodate', title: '我的 UpToDate 任務', verifyMethod: 'self_check' }, amy.token);
  check('可以建立自己的範本', mine.canEdit === true);
  check('範本連結要 http 開頭', !call('templates.save', { dbName: 'X', title: 'Y', defaultUrl: 'abc' }, amy.token).ok);

  // 客戶訂購的資料庫
  check('別人不能改我的客戶資料庫', call('clientDbs.save', { clientId: c1.clientId, items: [{ dbName: 'JoVE' }] }, carlTok()).code === 'FORBIDDEN');
  ok('clientDbs.save', { clientId: c1.clientId, items: [{ dbName: 'UpToDate', url: 'https://proxy.school.edu/uptodate' }, { dbName: 'JoVE' }] }, amy.token);
  check('客戶資料庫重複名稱會被擋（不分大小寫）', !call('clientDbs.save', { clientId: c1.clientId, items: [{ dbName: 'JoVE' }, { dbName: 'jove' }] }, amy.token).ok);
  check('讀得回客戶資料庫', ok('clientDbs.list', { clientId: c1.clientId }, amy.token).length === 2);

  const tUp = tpls.find((t) => t.dbName === 'UpToDate');
  const tJo = tpls.find((t) => t.dbName === 'JoVE');
  const tAc = tpls.find((t) => t.dbName === 'Acland');
  const taskEv = (extra, tasks) => call('events.save', { event: baseEvent('TASK1', c1.clientId, Object.assign({ regMode: 'before', dailyLimit: 1 }, extra)),
    prizes: [{ name: '筆記本', quantity: 20 }], tasks }, amy.token);
  check('任務要搭配先登記再抽', !taskEv({ regMode: 'none', taskMode: 'any' }, [{ templateId: tUp.templateId, dbName: 'UpToDate', title: 'a', verifyMethod: 'self_check' }]).ok);
  check('工作人員核銷任務一定要設 PIN', !taskEv({ taskMode: 'any' }, [{ templateId: tUp.templateId, dbName: 'UpToDate', title: 'a', verifyMethod: 'staff_pin' }]).ok);
  check('PIN 要 4 位數', !taskEv({ taskMode: 'any' }, [{ dbName: 'UpToDate', title: 'a', verifyMethod: 'staff_pin', pin: '12' }]).ok);
  check('選做數量不能超過選做任務數', !taskEv({ taskMode: 'required_plus', taskMinOptional: 3 }, [{ dbName: 'A', title: 'a', verifyMethod: 'self_check' }]).ok);
  const saved = taskEv({ taskMode: 'required_plus', taskMinOptional: 1 }, [
    { templateId: tUp.templateId, dbName: 'UpToDate', title: tUp.title, verifyMethod: 'staff_pin', pin: '2468', required: true },
    { templateId: tJo.templateId, dbName: 'JoVE', title: tJo.title, verifyMethod: 'self_check' },
    { templateId: tAc.templateId, dbName: 'Acland', title: tAc.title, verifyMethod: 'staff_pin', pin: '1357', url: 'https://override.example.com/acland' }
  ]);
  check('建立有任務的活動', saved.ok, saved.error);
  const evId = saved.data.event.eventId;
  const at = saved.data.event.tasks;
  check('後台看得到任務但看不到 PIN', at.length === 3 && at.every((t) => !('pinHash' in t) && !('pin' in t)) && at[0].hasPin === true);
  check('PIN 以雜湊儲存在 Sheet', rows('EventTasks').every((t) => !t.pinHash || (t.pinHash.length === 64 && t.pinHash !== '2468')));

  const pub = ok('public.getEvent', { eventCode: 'TASK1' });
  const raw = JSON.stringify(pub);
  check('前台設定不含 PIN', !raw.includes('pinHash') && !raw.includes('2468') && !raw.includes('1357'));
  const byDb = Object.fromEntries(pub.tasks.map((t) => [t.dbName, t]));
  check('連結優先順序：客戶層 > 範本預設', byDb.UpToDate.url === 'https://proxy.school.edu/uptodate');
  check('連結優先順序：活動覆寫最優先', byDb.Acland.url === 'https://override.example.com/acland');
  check('連結優先順序：沒有覆寫和客戶層時用範本預設', byDb.JoVE.url === tJo.defaultUrl);

  // 參加者流程
  const r1 = ok('public.register', { eventCode: 'TASK1', name: '任務王', email: 'task@example.com', organization: '清大', identity: '學生', privacyConsent: true });
  check('有任務時登記後不直接發抽獎券', r1.tasksMode === true && !r1.ticket && !!r1.pt && r1.progress.eligible === false && r1.progress.need === 2, r1.progress);
  check('沒資格不能抽（拿不到抽獎券）', call('public.draw', { eventCode: 'TASK1' }).code === 'NEED_REGISTER');
  // 偷用一般抽獎券也擋得住
  const fakeTicket = g.issueTicket_(evId, r1.participantId);
  check('伺服器端再檢查資格', call('public.draw', { eventCode: 'TASK1', ticket: fakeTicket }).code === 'NEED_TASKS');
  const st1 = ok('public.selectDbs', { eventCode: 'TASK1', pt: r1.pt, dbs: ['jove', 'UpToDate', '亂填'] });
  check('記錄選擇的資料庫（只留有效的）', JSON.stringify(st1.selectedDbs.sort()) === JSON.stringify(['JoVE', 'UpToDate']));
  const idUp = byDb.UpToDate.eventTaskId, idJo = byDb.JoVE.eventTaskId, idAc = byDb.Acland.eventTaskId;
  const w1 = call('public.completeTask', { eventCode: 'TASK1', pt: r1.pt, eventTaskId: idUp, pin: '0000' });
  check('PIN 錯誤會提示剩餘次數', w1.code === 'PIN_WRONG' && w1.error.includes('4'), w1.error);
  for (let i = 0; i < 3; i++) call('public.completeTask', { eventCode: 'TASK1', pt: r1.pt, eventTaskId: idUp, pin: '0000' });
  const w5 = call('public.completeTask', { eventCode: 'TASK1', pt: r1.pt, eventTaskId: idUp, pin: '0000' });
  check('連續錯 5 次鎖定', w5.code === 'PIN_LOCKED');
  check('鎖定期間正確 PIN 也不行', call('public.completeTask', { eventCode: 'TASK1', pt: r1.pt, eventTaskId: idUp, pin: '2468' }).code === 'PIN_LOCKED');
  g.cacheRemove_('pinlock_' + idUp + '_' + r1.participantId);   // 模擬 1 分鐘後
  const s2 = ok('public.completeTask', { eventCode: 'TASK1', pt: r1.pt, eventTaskId: idUp, pin: '2468', staffToken: amy.token });
  check('正確 PIN 核銷成功，還差 1 個選做', s2.progress.eligible === false && s2.progress.need === 1 && s2.progress.completed.includes(idUp), s2.progress);
  check('記錄核銷人員', rows('TaskCompletions').find((c) => c.eventTaskId === idUp).staffUserId === amy.user.userId);
  const s3 = ok('public.completeTask', { eventCode: 'TASK1', pt: r1.pt, eventTaskId: idJo });
  check('自行勾選完成，達到門檻後發抽獎券', s3.progress.eligible === true && !!s3.ticket);
  ok('public.completeTask', { eventCode: 'TASK1', pt: r1.pt, eventTaskId: idJo });
  check('重複完成不會重複記錄', rows('TaskCompletions').filter((c) => c.eventTaskId === idJo && c.participantId === r1.participantId).length === 1);
  const st = ok('public.taskState', { eventCode: 'TASK1', pt: r1.pt });
  check('重新整理後讀回進度', st.progress.eligible && st.selectedDbs.length === 2 && st.reg.name === '任務王');
  const d1 = ok('public.draw', { eventCode: 'TASK1', ticket: st.ticket });
  check('有資格後可以抽獎', !!d1.prize);
  const again = ok('public.register', { eventCode: 'TASK1', name: '任務王', email: 'task@example.com', organization: '清大', identity: '學生', privacyConsent: true });
  check('同一人再登記：進度保留、但受每日次數限制', again.progress.eligible === true && again.limitReached === true && !again.ticket);

  // 依任務卡判斷：全部改成選做、N＝0 → 系統自動當成至少 1 個（完成任一任務）
  const allOpt = at.map((t) => Object.assign({}, t, { required: false }));
  const sv2 = ok('events.save', { event: Object.assign({}, saved.data.event, { taskMode: 'cards', taskMinOptional: 0, eventCode: 'TASK1' }), prizes: saved.data.prizes, tasks: allOpt }, amy.token);
  check('沒有必做時 N 自動至少 1', sv2.event.taskMode === 'cards');
  check('修改活動時不重填 PIN 也保留原本的 PIN', rows('EventTasks').find((t) => t.eventTaskId === idUp).pinHash.length === 64);
  const r2 = ok('public.register', { eventCode: 'TASK1', name: '小明', email: 'any@example.com', organization: '清大', identity: '學生', privacyConsent: true });
  check('全部選做：還差 1 個選做', r2.progress.need === 1 && r2.progress.optionalLeft === 1 && r2.progress.requiredLeft === 0, r2.progress);
  const a2 = ok('public.completeTask', { eventCode: 'TASK1', pt: r2.pt, eventTaskId: idAc, pin: '1357' });
  check('全部選做：完成一個就有資格', a2.progress.eligible === true && !!a2.ticket);

  // 舊活動「完成任一任務」＋有必做卡：必做照樣要完成
  ok('events.save', { event: Object.assign({}, saved.data.event, { taskMode: 'cards', taskMinOptional: 1, eventCode: 'TASK1' }), prizes: saved.data.prizes, tasks: at }, amy.token);
  g.update_('Events', evId, { taskMode: 'any', taskMinOptional: 0 });
  g.cacheRemove_('tbl_Events'); g.cacheRemove_('pub_TASK1');
  const r3 = ok('public.register', { eventCode: 'TASK1', name: '舊設定', email: 'legacy@example.com', organization: '清大', identity: '學生', privacyConsent: true });
  check('舊「任一任務」＋必做：要先完成必做', r3.progress.requiredLeft === 1 && r3.progress.optionalLeft === 0 && r3.progress.need === 1, r3.progress);
  const a3 = ok('public.completeTask', { eventCode: 'TASK1', pt: r3.pt, eventTaskId: idAc, pin: '1357' });
  check('舊「任一任務」＋必做：只做選做還不夠', a3.progress.eligible === false);
  const a4 = ok('public.completeTask', { eventCode: 'TASK1', pt: r3.pt, eventTaskId: idUp, pin: '2468' });
  check('舊「任一任務」＋必做：完成必做才有資格', a4.progress.eligible === true);
  check('進度欄位：必做總數、選做門檻', a4.progress.requiredTotal === 1 && a4.progress.optionalNeed === 0, a4.progress);
  ok('events.save', { event: Object.assign({}, saved.data.event, { taskMode: 'cards', taskMinOptional: 1, eventCode: 'TASK1' }), prizes: saved.data.prizes, tasks: at }, amy.token);
  check('選做 N 不能超過選做數量', !call('events.save', { event: Object.assign({}, saved.data.event, { taskMode: 'cards', taskMinOptional: 5, eventCode: 'TASK1' }), prizes: saved.data.prizes, tasks: at }, amy.token).ok);

  // 沒設任務的活動維持原流程
  const plain = ok('public.register', Object.assign({}, reg, { email: 'plain@example.com' }));
  check('沒有任務的活動照原本流程', !!plain.ticket && !plain.tasksMode);

  // 複製活動一併複製任務與 PIN
  const cp2 = ok('events.copy', { eventId: evId, eventCode: 'TASK2' }, amy.token);
  check('複製活動會複製任務（PIN 沿用）', cp2.event.tasks.length === 3 && cp2.event.tasks.every((t) => t.verifyMethod !== 'staff_pin' || t.hasPin));
  // 範本修改不影響活動任務
  ok('templates.save', Object.assign({}, mine, { title: '改過的標題' }), amy.token);
  const rt = ok('reports.get', { eventId: evId }, amy.token).tasks;
  const rUp = rt.tasks.find((t) => t.dbName === 'UpToDate');
  const rJo = rt.tasks.find((t) => t.dbName === 'JoVE');
  check('報表：資料庫選擇人數', rt.dbs.find((d) => d.dbName === 'JoVE').selected === 1, rt.dbs);
  check('報表：必做任務分母是全部登記者', rUp.required && rUp.denominator === 3 && rUp.completed === 2 && rUp.dropped === 1, rUp);
  check('報表：選做任務分母是選該資料庫的人', !rJo.required && rJo.denominator === 1 && rJo.completed === 1, rJo);
  check('報表：達到門檻人數', rt.eligible === 2 && rt.registered === 3, [rt.eligible, rt.registered]);
  // 同一資料庫名稱寫法不同（大小寫、空白）也算同一個
  const mixed = ok('events.save', { event: baseEvent('MIX1', c1.clientId, { regMode: 'before', taskMode: 'cards', taskMinOptional: 1 }), prizes: [{ name: '筆', quantity: 5 }],
    tasks: [{ dbName: 'UpToDate', title: 'A', verifyMethod: 'self_check' }, { dbName: 'uptodate ', title: 'B', verifyMethod: 'self_check' }, { dbName: 'UPTODATE', title: 'C', verifyMethod: 'self_check' }] }, amy.token);
  const rm = ok('public.register', { eventCode: 'MIX1', name: '混', email: 'mix@example.com', organization: '清大', identity: '學生', privacyConsent: true });
  const sm = ok('public.selectDbs', { eventCode: 'MIX1', pt: rm.pt, dbs: ['UpToDate'] });
  ok('public.completeTask', { eventCode: 'MIX1', pt: rm.pt, eventTaskId: mixed.event.tasks[1].eventTaskId });
  const rmix = ok('reports.get', { eventId: mixed.event.eventId }, amy.token).tasks;
  check('報表：寫法不同的資料庫合併成一個', rmix.dbs.length === 1 && rmix.dbs[0].selected === 1, rmix.dbs);
  check('報表：三張同資料庫任務的分母都是選擇的人', rmix.tasks.every((t) => t.denominator === 1), rmix.tasks);
  // 每個資料庫都有必做時會跳過選擇資料庫：同資料庫的選做任務仍要算進「已選」
  const allReq = ok('events.save', { event: baseEvent('REQDB', c1.clientId, { regMode: 'before', taskMode: 'cards', taskMinOptional: 0 }), prizes: [{ name: '筆', quantity: 5 }],
    tasks: [{ dbName: 'UpToDate', title: '必做一', verifyMethod: 'self_check', required: true }, { dbName: 'JoVE', title: '必做二', verifyMethod: 'self_check', required: true },
      { dbName: 'UpToDate', title: '選做', verifyMethod: 'self_check' }] }, amy.token);
  const rq = ok('public.register', { eventCode: 'REQDB', name: '全必做', email: 'reqdb@example.com', organization: '清大', identity: '學生', privacyConsent: true });
  const sq = ok('public.selectDbs', { eventCode: 'REQDB', pt: rq.pt, dbs: [] });
  check('有必做任務的資料庫自動算成已選', sq.selectedDbs.length === 2, sq.selectedDbs);
  const rr = ok('reports.get', { eventId: allReq.event.eventId }, amy.token).tasks;
  check('報表：有必做的資料庫，選做任務分母是全部登記者', rr.tasks.find((t) => t.title === '選做').denominator === 1 && rr.dbs.every((d) => d.selected === 1), rr);
  check('改範本不影響已建立的活動任務', ok('events.get', { eventId: evId }, amy.token).event.tasks.every((t) => t.title !== '改過的標題'));
}

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
