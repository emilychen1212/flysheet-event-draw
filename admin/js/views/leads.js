/** 潛在客戶名單：自己活動的 Leads（管理者看全部），可篩選、匯出 Excel */
import { cachedApi } from '../../../assets/js/api.js';
import { $, esc, emptyHtml, ICON, fmtDateTime, toastErr, busy } from '../ui.js';
import { exportXlsx, stamp } from '../xlsx.js';

const TYPE = { trial: { label: '申請試用', cls: 'orange' }, info: { label: '了解產品資訊', cls: 'navy' } };
const ART_LEAD = `<svg viewBox="0 0 160 120" fill="none" aria-hidden="true">
  <ellipse cx="80" cy="110" rx="60" ry="6" fill="#efe9df"/>
  <rect x="36" y="30" width="88" height="70" rx="10" fill="#fff" stroke="#1b2a52" stroke-width="2.5"/>
  <path d="M36 44l44 30 44-30" stroke="#1b2a52" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="118" cy="32" r="14" fill="#f27a2b" stroke="#1b2a52" stroke-width="2.5"/>
  <path d="M112 32l4 4 8-8" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export async function render(root, _p, app) {
  const leads = await cachedApi('leads.list');
  const f = { q: '', event: app.query.get('event') || '', type: '', product: '' };
  const events = [...new Map(leads.map((l) => [l.eventId, `${l.eventTitle}（${l.eventCode}）`])).entries()];
  const products = [...new Set(leads.flatMap((l) => String(l.productName || '').split('、').map((s) => s.trim()).filter(Boolean)))].sort();

  root.innerHTML = `
    <div class="page-head">
      <div><h1>潛在客戶</h1><div class="sub">${app.isAdmin() ? '所有活動' : '你的活動'}推廣頁收到的試用申請與產品詢問（不含測試資料）</div></div>
      <div class="actions"><button class="btn" id="btnExport" ${leads.length ? '' : 'disabled'}>${ICON.download}匯出 Excel</button></div>
    </div>
    ${leads.length ? `<div class="filters">
      <input class="input search" id="fq" placeholder="搜尋姓名、單位、Email、手機">
      <select class="input" id="fEvent"><option value="">全部活動</option>${events.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select>
      <select class="input" id="fType"><option value="">全部類型</option><option value="trial">申請試用</option><option value="info">了解產品資訊</option></select>
      <select class="input" id="fProduct"><option value="">全部產品</option>${products.map((p) => `<option>${esc(p)}</option>`).join('')}</select>
    </div>
    <div class="grid cols-3" id="stats" style="margin-bottom:16px"></div>` : ''}
    <div id="list"></div>`;

  const filtered = () => leads.filter((l) =>
    (!f.event || l.eventId === f.event) && (!f.type || l.type === f.type) &&
    (!f.product || String(l.productName).split('、').includes(f.product)) &&
    (!f.q || [l.name, l.organization, l.email, l.phone].join(' ').toLowerCase().includes(f.q)));

  const draw = () => {
    if (!leads.length) {
      $('#list').innerHTML = `<div class="card">${emptyHtml({ art: ART_LEAD, title: '還沒有潛在客戶', text: '在「自助掃碼」活動開啟推廣頁，參與者抽完獎就能申請試用或詢問產品' })}</div>`;
      return;
    }
    const list = filtered();
    $('#stats').innerHTML = `
      <div class="card stat"><span class="v">${list.length}</span><span class="l">筆名單</span></div>
      <div class="card stat"><span class="v">${list.filter((l) => l.type === 'trial').length}</span><span class="l">申請試用</span></div>
      <div class="card stat"><span class="v">${list.filter((l) => l.type === 'info').length}</span><span class="l">了解產品資訊</span></div>`;
    $('#list').innerHTML = list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>時間</th><th>類型</th><th>產品</th><th>姓名</th><th>服務單位</th><th>聯絡方式</th><th>活動</th><th>備註</th></tr></thead>
      <tbody>${list.map((l) => `<tr>
        <td class="small muted" style="white-space:nowrap">${fmtDateTime(l.createdAt)}</td>
        <td><span class="badge ${TYPE[l.type]?.cls || ''}">${TYPE[l.type]?.label || esc(l.type)}</span></td>
        <td class="small">${esc(l.productName)}</td>
        <td><b>${esc(l.name)}</b>${l.identity ? `<div class="small muted">${esc(l.identity)}</div>` : ''}</td>
        <td class="small">${esc(l.organization)}</td>
        <td class="small">${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : ''}${l.email && l.phone ? '<br>' : ''}${esc(l.phone)}</td>
        <td class="small"><a href="#/events/${esc(l.eventId)}">${esc(l.eventTitle)}</a><div class="muted">${esc(l.clientName)}${app.isAdmin() ? '・' + esc(l.ownerName) : ''}</div></td>
        <td class="small muted" style="max-width:240px;white-space:pre-wrap">${esc(l.note)}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty"><p>沒有符合條件的名單</p></div>';
  };

  if (leads.length) {
    $('#fEvent').value = f.event;
    $('#fq').oninput = (e) => { f.q = e.target.value.trim().toLowerCase(); draw(); };
    $('#fEvent').onchange = (e) => { f.event = e.target.value; draw(); };
    $('#fType').onchange = (e) => { f.type = e.target.value; draw(); };
    $('#fProduct').onchange = (e) => { f.product = e.target.value; draw(); };
  }
  draw();

  $('#btnExport').onclick = (e) => busy(e.currentTarget, async () => {
    try {
      const rows = filtered().map((l) => ({
        時間: l.createdAt, 類型: TYPE[l.type]?.label || l.type, 想了解的產品: l.productName, 姓名: l.name, 身分: l.identity,
        服務單位: l.organization, Email: l.email, 手機: l.phone, 備註: l.note, 活動: l.eventTitle, 活動代碼: l.eventCode,
        客戶: l.clientName, 業務: l.ownerName
      }));
      await exportXlsx(`潛在客戶名單_${stamp()}.xlsx`, [{ name: '潛在客戶', rows, widths: [18, 12, 24, 10, 10, 22, 26, 14, 30, 24, 10, 16, 10] }]);
    } catch (err) { toastErr(err); }
  });
}
