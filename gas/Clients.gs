/** ===== 客戶管理 ===== */

function apiClientsList_(p, user) {
  var users = userNameMap_();
  var events = all_('Events');
  return all_('Clients')
    .filter(function (c) { return isAdmin_(user) || c.ownerId === user.userId; })
    .map(function (c) {
      var out = pick_(c, ['clientId', 'ownerId', 'name', 'type', 'note', 'createdAt', 'updatedAt']);
      out.ownerName = users[c.ownerId] || '';
      out.eventCount = events.filter(function (e) { return e.clientId === c.clientId; }).length;
      out.canEdit = canEdit_(user, c.ownerId);
      return out;
    });
}

function apiClientsSave_(p, user) {
  var name = str_(p.name, 100);
  if (!name) throw appError_('請填寫客戶名稱');
  var data = {
    name: name,
    type: oneOf_(p.type, CLIENT_TYPES, '其他'),
    note: str_(p.note, 1000)
  };
  if (p.clientId) {
    var c = find_('Clients', p.clientId);
    if (!c) throw appError_('找不到這個客戶', 'NOT_FOUND');
    requireEdit_(user, c.ownerId);
    return update_('Clients', c.clientId, data);
  }
  data.ownerId = user.userId;
  return insert_('Clients', data);
}

function apiClientsDelete_(p, user) {
  var c = find_('Clients', p.clientId);
  if (!c) throw appError_('找不到這個客戶', 'NOT_FOUND');
  requireEdit_(user, c.ownerId);
  var n = where_('Events', function (e) { return e.clientId === c.clientId; }).length;
  if (n) throw appError_('這個客戶底下還有 ' + n + ' 個活動，不能刪除。請先刪除或移走這些活動');
  remove_('Clients', c.clientId);
  return true;
}

function userNameMap_() {
  var map = {};
  all_('Users').forEach(function (u) { map[u.userId] = u.name || u.email; });
  return map;
}
