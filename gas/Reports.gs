/**
 * ===== 活動成果報表 =====
 * reports.get    統計數字（任何登入者都能看，沒有個資）
 * reports.detail 抽獎紀錄、參與者、潛在客戶明細（含個資，只有負責人與管理者）
 * 一律排除測試資料。
 */

var SLOT_MINUTES = 30;

function reportEvent_(p) {
  var ev = find_('Events', p.eventId);
  if (!ev) throw appError_('找不到這個活動', 'NOT_FOUND');
  return ev;
}

/** 依名稱分組計數，取前 n 名，其餘合併為「其他」。名稱去頭尾空白、不分大小寫合併 */
function topCounts_(values, n, emptyLabel) {
  var map = {}, label = {};
  values.forEach(function (v) {
    var s = String(v || '').trim();
    var key = s ? s.toLowerCase().replace(/\s+/g, ' ') : '';
    if (!key) { key = '__empty'; s = emptyLabel || '未填寫'; }
    map[key] = (map[key] || 0) + 1;
    if (!label[key]) label[key] = s;
  });
  var list = Object.keys(map).map(function (k) { return { name: label[k], count: map[k] }; })
    .sort(function (a, b) { return b.count - a.count; });
  if (n && list.length > n) {
    var rest = list.slice(n).reduce(function (s, x) { return s + x.count; }, 0);
    list = list.slice(0, n).concat([{ name: '其他', count: rest, other: true }]);
  }
  return list;
}

function apiReportsGet_(p, user) {
  var ev = reportEvent_(p);
  var mine = function (r) { return r.eventId === ev.eventId && !r.isTest; };
  var draws = where_('Draws', mine);
  var people = where_('Participants', mine);
  var leads = where_('Leads', mine);
  var prizes = prizesOf_(ev.eventId);
  var client = find_('Clients', ev.clientId);
  var users = userNameMap_();

  // 各獎項發出數
  var issued = {};
  draws.forEach(function (d) { issued[d.prizeId] = (issued[d.prizeId] || 0) + 1; });
  var prizeStats = prizes.map(function (x) {
    return { prizeId: x.prizeId, name: x.name, label: x.label, isLose: x.isLose, isSpecial: x.isSpecial,
      quantity: x.quantity, remaining: x.remaining, issued: issued[x.prizeId] || 0 };
  });

  // 時段分布：每天 48 格（每 30 分鐘一格）
  var byDay = {};
  draws.forEach(function (d) {
    var day = d.drawnAt.slice(0, 10);
    var h = Number(d.drawnAt.slice(11, 13)), m = Number(d.drawnAt.slice(14, 16));
    var slot = Math.floor((h * 60 + m) / SLOT_MINUTES);
    if (!byDay[day]) { byDay[day] = []; for (var i = 0; i < 48; i++) byDay[day].push(0); }
    byDay[day][slot]++;
  });

  // 參與人數：先登記再抽以「人」計；不登記或中獎後登記以「抽獎次數」計
  var countBy = ev.regMode === 'before' ? 'people' : 'draws';
  var consentYes = people.filter(function (x) { return x.wantsProductInfo; }).length;
  var identities = people.map(function (x) { return x.identity; });

  var leadTypes = {};
  leads.forEach(function (l) {
    var k = l.type === 'recommend' ? (l.productOwned ? 'recommendRenew' : 'recommendNew') : l.type;
    leadTypes[k] = (leadTypes[k] || 0) + 1;
  });

  return {
    event: {
      eventId: ev.eventId, eventCode: ev.eventCode, title: ev.title, subtitle: ev.subtitle,
      clientName: client ? client.name : '', clientDisplayName: ev.clientDisplayName,
      startAt: ev.startAt, endAt: ev.endAt, status: ev.status, regMode: ev.regMode, drawMode: ev.drawMode,
      gameType: ev.gameType, ownerName: users[ev.ownerId] || ''
    },
    canSeeDetail: canEditEvent_(user, ev),
    participants: countBy === 'people' ? people.length : draws.length,
    participantsBy: countBy,
    registered: people.length,
    draws: draws.length,
    wins: draws.filter(function (d) { return !d.isLose; }).length,
    prizes: prizeStats,
    byDay: byDay,
    slotMinutes: SLOT_MINUTES,
    organizations: topCounts_(people.map(function (x) { return x.organization; }), 10, '未填寫'),
    identities: topCounts_(identities, 0, '未填寫'),
    consent: { yes: consentYes, total: people.length, rate: people.length ? consentYes / people.length : null },
    leads: { total: leads.length, byType: leadTypes },
    devices: {
      mobile: draws.filter(function (d) { return d.deviceType === 'mobile'; }).length,
      desktop: draws.filter(function (d) { return d.deviceType !== 'mobile'; }).length
    },
    generatedAt: now_()
  };
}

function apiReportsDetail_(p, user) {
  var ev = reportEvent_(p);
  requireEditEvent_(user, ev);
  var mine = function (r) { return r.eventId === ev.eventId && !r.isTest; };
  var people = where_('Participants', mine);
  var byId = {};
  people.forEach(function (x) { byId[x.participantId] = x; });
  var custom = (ev.regFields && ev.regFields.custom) || [];
  var identityOf = function (x) { return x.identity === '其他' && x.identityOther ? '其他：' + x.identityOther : x.identity; };
  var draws = where_('Draws', mine).sort(function (a, b) { return a.drawnAt < b.drawnAt ? -1 : 1; });
  var won = {};
  draws.forEach(function (d) {
    if (!d.participantId) return;
    (won[d.participantId] = won[d.participantId] || []).push(d.isLose ? '' : d.prizeName);
  });
  return {
    customQuestions: custom.map(function (q) { return { id: q.id, label: q.label }; }),
    draws: draws.map(function (d) {
      var x = byId[d.participantId] || {};
      return { drawnAt: d.drawnAt, name: x.name || '', organization: x.organization || '', identity: identityOf(x) || '',
        prizeName: d.prizeName, isLose: d.isLose, deviceType: d.deviceType };
    }),
    participants: people.sort(function (a, b) { return a.registeredAt < b.registeredAt ? -1 : 1; }).map(function (x) {
      var answers = {};
      custom.forEach(function (q) {
        var a = (x.customAnswers || {})[q.id];
        answers[q.id] = Array.isArray(a) ? a.join('、') : (a || '');
      });
      return { registeredAt: x.registeredAt, name: x.name, email: x.email, phone: x.phone, organization: x.organization,
        identity: identityOf(x), wantsProductInfo: x.wantsProductInfo, answers: answers,
        drawCount: (won[x.participantId] || []).length, prizesWon: (won[x.participantId] || []).filter(String).join('、') };
    }),
    leads: where_('Leads', mine).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; }).map(function (l) {
      return { createdAt: l.createdAt, type: l.type, productName: l.productName, productOwned: l.productOwned, message: l.message,
        name: l.name, organization: l.organization, email: l.email, phone: l.phone, note: l.note };
    })
  };
}
