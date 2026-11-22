/** ===== 潛在客戶名單（後台） =====
 * 只有活動擁有者與管理者看得到（含個資），測試資料不列出。
 */
function apiLeadsList_(p, user) {
  var events = {};
  all_('Events').forEach(function (e) { if (canEdit_(user, e.ownerId)) events[e.eventId] = e; });
  var clients = {};
  all_('Clients').forEach(function (c) { clients[c.clientId] = c.name; });
  var users = userNameMap_();
  var people = {};
  all_('Participants').forEach(function (x) { people[x.participantId] = x; });
  return where_('Leads', function (l) { return !l.isTest && events[l.eventId]; })
    .map(function (l) {
      var ev = events[l.eventId];
      var person = l.participantId ? people[l.participantId] : null;
      return {
        leadId: l.leadId, createdAt: l.createdAt, type: l.type, productName: l.productName,
        name: l.name, organization: l.organization, email: l.email, phone: l.phone, note: l.note,
        identity: person ? (person.identity === '其他' && person.identityOther ? '其他：' + person.identityOther : person.identity) : '',
        eventId: ev.eventId, eventCode: ev.eventCode, eventTitle: ev.title,
        clientName: clients[ev.clientId] || '', ownerName: users[ev.ownerId] || ''
      };
    })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
}
