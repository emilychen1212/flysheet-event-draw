/** 活動成果報表：統計、圖表、匯出 Excel、16:9 成果圖卡（皆排除測試資料） */
import { api, cachedApi, clearCache } from '../../../assets/js/api.js';
import { $, esc, emptyHtml, ICON, fmtRange, fmtDateTime, toastErr, busy, modal } from '../ui.js';
import { exportXlsx, stamp } from '../xlsx.js';
import { drawCard } from './report-card.js';

const LEAD_LABEL = {
  recommendNew: '協助推薦採購', recommendRenew: '協助推薦續訂', info: '了解資訊', trial: '試用', training: '教育訓練', other: '其他'
};
const pct = (r) => (r === null || r === undefined ? '—' : Math.round(r * 100) + '%');
const slotLabel = (i, min = 30) => { const m = i * min; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

/** 找出有資料的時段範圍（前後多留一格），避免畫一整天 48 格 */
export function slotRange(byDay) {
  let lo = 48, hi = -1;
  Object.values(byDay).forEach((arr) => arr.forEach((v, i) => { if (v) { lo = Math.min(lo, i); hi = Math.max(hi, i); } }));
  if (hi < 0) return [18, 35];                     // 沒資料時顯示 09:00–18:00
  return [Math.max(0, lo - 1), Math.min(47, hi + 1)];
}

export function sumDays(byDay) {
  const out = new Array(48).fill(0);
  Object.values(byDay).forEach((arr) => arr.forEach((v, i) => { out[i] += v; }));
  return out;
}

function barList(items, total) {
  if (!items.length) return '<div class="muted small">還沒有資料</div>';
  const max = Math.max(...items.map((x) => x.count), 1);
  return `<div class="rbars">${items.map((x) => `<div class="rbar ${x.other ? 'other' : ''}" title="${esc(x.name)}：${x.count}（${total ? Math.round(x.count / total * 100) : 0}%）">
      <span class="n">${esc(x.name)}</span>
      <span class="track"><i style="width:${(x.count / max * 100).toFixed(1)}%"></i></span>
      <span class="v">${x.count}<small>${total ? Math.round(x.count / total * 100) + '%' : ''}</small></span></div>`).join('')}</div>`;
}

function columnChart(values, [lo, hi], minutes) {
  const data = values.slice(lo, hi + 1);
  const max = Math.max(...data, 1);
  const W = 760, H = 200, padL = 34, padB = 28, padT = 12;
  const bw = (W - padL) / data.length;
  const step = Math.max(1, Math.ceil(data.length / 12));
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  return `<svg class="rcol" viewBox="0 0 ${W} ${H}" role="img" aria-label="時段分布長條圖">
    ${ticks.map((t) => `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" class="ax" text-anchor="end">${t}</text>`).join('')}
    ${data.map((v, i) => {
      const w = Math.max(6, bw * 0.68), x = padL + i * bw + (bw - w) / 2, h = H - padB - y(v), r = Math.min(4, w / 2, h);
      return `<g class="col" data-tip="${slotLabel(lo + i, minutes)}–${slotLabel(lo + i + 1, minutes)}：${v} 次">
        <rect class="hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padB - padT}"/>
        ${v ? `<path class="bar" d="M${x} ${H - padB}v${-(h - r)}q0 ${-r} ${r} ${-r}h${w - 2 * r}q${r} 0 ${r} ${r}v${h - r}z"/>` : ''}
      </g>${i % step === 0 ? `<text x="${padL + i * bw + bw / 2}" y="${H - 8}" class="ax" text-anchor="middle">${slotLabel(lo + i, minutes)}</text>` : ''}`;
    }).join('')}
  </svg>`;
}

export async function render(root, [eventId], app) {
  const r = await cachedApi('reports.get', { eventId });
  const ev = r.event;
  const days = Object.keys(r.byDay).sort();
  const range = slotRange(r.byDay);
  let day = days.length > 1 ? 'all' : days[0] || 'all';
  const by = r.participantsBy === 'people';
  const realPrizes = r.prizes.filter((p) => !p.isLose);
  const issuedReal = realPrizes.reduce((s, p) => s + p.issued, 0);
  const totalReal = realPrizes.reduce((s, p) => s + p.quantity, 0);

  root.innerHTML = `
    <div class="crumb"><a href="#/events">專案活動</a> ／ <a href="#/events/${esc(ev.eventId)}">${esc(ev.title)}</a> ／</div>
    <div class="page-head">
      <div><h1>成果報表</h1><div class="sub">${esc(ev.title)}・${esc(ev.clientName)}・${esc(fmtRange(ev.startAt, ev.endAt))}</div></div>
      <div class="actions">
        <button class="btn" id="btnCard">${ICON.download}成果圖卡（PNG）</button>
        ${r.canSeeDetail ? `<button class="btn accent" id="btnXlsx">${ICON.download}匯出 Excel</button>` : ''}
      </div>
    </div>
    ${r.canSeeDetail ? '' : '<div class="readonly-bar">👀 這不是你負責的活動，可以看統計數字，但看不到參與者個資與名單。</div>'}
    <p class="muted small" style="margin:-8px 0 16px">皆不含測試資料・資料時間 ${esc(fmtDateTime(r.generatedAt))}　<a href="#" id="refresh">重新整理</a></p>

    <div class="grid rstats">
      <div class="card stat"><span class="v">${r.participants}</span><span class="l">參與${by ? '人數' : '人次'}</span>
        <span class="hint">${by ? '依 Email／手機辨識同一人' : r.event.regMode === 'after' ? '中獎後登記：以抽獎次數計' : '不登記：以抽獎次數計'}</span></div>
      <div class="card stat"><span class="v">${r.draws}</span><span class="l">抽獎總次數</span><span class="hint">中獎 ${r.wins} 次</span></div>
      <div class="card stat"><span class="v">${issuedReal}<small> / ${totalReal}</small></span><span class="l">獎品已發出</span><span class="hint">不含銘謝惠顧</span></div>
      <div class="card stat"><span class="v">${pct(r.consent.rate)}</span><span class="l">產品資訊同意率</span><span class="hint">${r.consent.yes} / ${r.consent.total} 位登記者</span></div>
      <div class="card stat"><span class="v">${r.leads.total}</span><span class="l">潛在客戶</span>
        <span class="hint">${Object.entries(r.leads.byType).map(([k, v]) => `${LEAD_LABEL[k] || k} ${v}`).join('・') || '—'}</span></div>
    </div>

    <section class="card">
      <h2 class="card-title"><span>時段分布</span>
        <span style="display:flex;gap:8px;align-items:center">
          ${days.length > 1 ? `<select class="input" id="daySel" style="min-height:32px;width:auto;font-size:13px">
            <option value="all">全部日期合計</option>${days.map((d) => `<option value="${d}">${d.replace(/-/g, '/')}</option>`).join('')}</select>` : ''}
          <button class="btn sm ghost" id="tblToggle">顯示表格</button></span></h2>
      <div class="muted small" style="margin:-8px 0 8px">每 ${r.slotMinutes} 分鐘一格，抽獎次數</div>
      <div id="timeChart"></div><div id="timeTable" hidden></div>
    </section>

    ${r.tasks ? `<section class="card rtask" style="margin-top:16px">
      <h2 class="card-title"><span>體驗任務成果</span><span class="muted small">不含測試資料</span></h2>
      <div class="grid rtask-stats">
        <div class="stat"><span class="v">${r.tasks.registered}</span><span class="l">登記人數</span></div>
        <div class="stat"><span class="v">${r.tasks.eligible}</span><span class="l">達到抽獎門檻</span><span class="hint">${pct(r.tasks.registered ? r.tasks.eligible / r.tasks.registered : null)}</span></div>
        <div class="stat"><span class="v">${r.tasks.notEligible}</span><span class="l">未達門檻（流失）</span></div>
      </div>
      <h3 class="rsub">各資料庫被選擇的人數</h3>
      <div class="table-wrap"><table class="table"><thead><tr><th>資料庫</th><th class="num">選擇人數</th><th class="num">比例</th><th style="width:40%"></th></tr></thead>
        <tbody>${r.tasks.dbs.map((d) => `<tr><td><b>${esc(d.dbName)}</b></td><td class="num">${d.selected}</td><td class="num">${pct(d.rate)}</td>
          <td><span class="rtrack"><i style="width:${d.rate ? (d.rate * 100).toFixed(1) : 0}%"></i></span></td></tr>`).join('')}</tbody></table></div>
      <h3 class="rsub">各任務完成率</h3>
      <div class="table-wrap"><table class="table"><thead><tr><th>資料庫</th><th>任務</th><th class="num">應完成人數</th><th class="num">完成</th><th class="num">完成率</th><th class="num">選了但未完成</th></tr></thead>
        <tbody>${r.tasks.tasks.map((t) => `<tr><td><b>${esc(t.dbName)}</b></td><td>${esc(t.title)} ${t.required ? '<span class="badge orange">必做</span>' : '<span class="badge">選做</span>'}</td>
          <td class="num">${t.denominator}</td><td class="num">${t.completed}</td><td class="num"><b>${pct(t.rate)}</b></td><td class="num">${t.dropped}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small" style="margin:8px 0 0">必做任務的「應完成人數」是全部登記者；選做任務是有選擇該資料庫的人。</p>
    </section>` : ''}

    <div class="grid cols-2" style="margin-top:16px">
      <section class="card"><h2 class="card-title"><span>服務單位（前 10 名）</span></h2>${barList(r.organizations, r.registered)}</section>
      <section class="card"><h2 class="card-title"><span>身分</span></h2>${barList(r.identities, r.registered)}</section>
    </div>

    <section class="card" style="margin-top:16px">
      <h2 class="card-title"><span>各獎項發出／剩餘</span></h2>
      ${r.prizes.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>獎項</th><th class="num">初始數量</th><th class="num">已發出</th><th class="num">剩餘</th><th style="width:34%">發出比例</th></tr></thead>
        <tbody>${r.prizes.map((p) => `<tr>
          <td>${p.label ? `<span class="badge orange">${esc(p.label)}</span> ` : ''}<b>${esc(p.name)}</b>${p.isLose ? ' <span class="badge">銘謝惠顧</span>' : ''}${p.isSpecial ? ' ✨' : ''}</td>
          <td class="num">${p.quantity}</td><td class="num">${p.issued}</td><td class="num">${p.remaining}</td>
          <td><span class="rtrack"><i style="width:${p.quantity ? Math.min(100, p.issued / p.quantity * 100).toFixed(1) : 0}%"></i></span></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="muted small">沒有獎項</div>'}
    </section>
    <div class="rtip" id="rtip" hidden></div>`;

  if (!r.draws) {
    $('#timeChart').innerHTML = emptyHtml({ title: '還沒有正式抽獎紀錄', text: '活動開始抽獎後，這裡會顯示每個時段的抽獎人次' });
  }

  const drawTime = () => {
    if (!r.draws) return;
    const values = day === 'all' ? sumDays(r.byDay) : r.byDay[day];
    $('#timeChart').innerHTML = columnChart(values, range, r.slotMinutes);
    $('#timeTable').innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>時段</th><th class="num">抽獎次數</th></tr></thead>
      <tbody>${values.slice(range[0], range[1] + 1).map((v, i) => `<tr><td>${slotLabel(range[0] + i, r.slotMinutes)}–${slotLabel(range[0] + i + 1, r.slotMinutes)}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table></div>`;
  };
  drawTime();
  $('#daySel')?.addEventListener('change', (e) => { day = e.target.value; drawTime(); });
  $('#tblToggle').addEventListener('click', (e) => {
    const t = $('#timeTable');
    t.hidden = !t.hidden;
    $('#timeChart').hidden = !t.hidden;
    e.currentTarget.textContent = t.hidden ? '顯示表格' : '顯示圖表';
  });
  $('#refresh').addEventListener('click', (e) => { e.preventDefault(); clearCache(); render(root, [eventId], app); });

  // 長條 hover 提示
  const tip = $('#rtip');
  $('#timeChart').addEventListener('mousemove', (e) => {
    const g = e.target.closest('[data-tip]');
    if (!g) { tip.hidden = true; return; }
    tip.textContent = g.dataset.tip;
    tip.hidden = false;
    tip.style.left = e.clientX + 12 + 'px';
    tip.style.top = e.clientY - 34 + 'px';
  });
  $('#timeChart').addEventListener('mouseleave', () => { tip.hidden = true; });

  /* ---------- 匯出 Excel ---------- */
  $('#btnXlsx')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      const d = await api('reports.detail', { eventId });
      const summary = [
        ['活動', ev.title], ['活動代碼', ev.eventCode], ['客戶', ev.clientName], ['期間', fmtRange(ev.startAt, ev.endAt)], ['負責業務', ev.ownerName], [],
        [`參與${by ? '人數' : '人次'}`, r.participants, by ? '依 Email／手機辨識同一人' : '以抽獎次數計'],
        ['登記人數', r.registered], ['抽獎總次數', r.draws], ['中獎次數', r.wins], ['獎品已發出（不含銘謝惠顧）', issuedReal, `共 ${totalReal} 份`],
        ['產品資訊同意率', pct(r.consent.rate), `${r.consent.yes} / ${r.consent.total}`],
        ['潛在客戶', r.leads.total, Object.entries(r.leads.byType).map(([k, v]) => `${LEAD_LABEL[k] || k} ${v}`).join('、')],
        ['手機／電腦抽獎', `${r.devices.mobile} / ${r.devices.desktop}`], [],
        ['獎項', '標籤', '初始數量', '已發出', '剩餘'], ...r.prizes.map((p) => [p.name + (p.isLose ? '（銘謝惠顧）' : ''), p.label || '', p.quantity, p.issued, p.remaining]), [],
        ['服務單位', '人數'], ...r.organizations.map((x) => [x.name, x.count]), [],
        ['身分', '人數'], ...r.identities.map((x) => [x.name, x.count]), [],
        ['資料時間', r.generatedAt, '不含測試資料']
      ];
      const lead = (l) => ({
        時間: l.createdAt, 類型: l.type === 'recommend' ? (l.productOwned ? '協助推薦續訂' : '協助推薦採購') : (LEAD_LABEL[l.type] || l.type),
        產品: l.productName, 產品狀態: l.productOwned ? '已購買' : '尚未購買', '推薦的話／說明': l.message,
        姓名: l.name, 服務單位: l.organization, Email: l.email, 手機: l.phone, 備註: l.note
      });
      await exportXlsx(`成果報表_${ev.eventCode}_${stamp()}.xlsx`, [
        { name: '統計摘要', aoa: summary, widths: [28, 26, 30, 10, 10] },
        { name: '抽獎紀錄', rows: d.draws.map((x) => ({ 時間: x.drawnAt, 參與者: x.name, 服務單位: x.organization, 身分: x.identity, 獎項: x.prizeName, 是否中獎: x.isLose ? '銘謝惠顧' : '中獎', 裝置: x.deviceType === 'mobile' ? '手機' : '電腦' })), widths: [20, 12, 24, 12, 20, 10, 8] },
        { name: '參與者名單', rows: d.participants.map((x) => Object.assign({
          登記時間: x.registeredAt, 姓名: x.name, Email: x.email, 手機: x.phone, 服務單位: x.organization, 身分: x.identity,
          想接收產品資訊: x.wantsProductInfo ? '是' : '否'
        }, Object.fromEntries(d.customQuestions.map((q) => [q.label, x.answers[q.id]])), { 抽獎次數: x.drawCount, 獲得獎品: x.prizesWon })) },
        { name: '潛在客戶名單', rows: d.leads.map(lead), widths: [20, 14, 20, 10, 30, 10, 22, 26, 14, 30] },
        ...(r.tasks ? [{ name: '體驗任務', aoa: [
          ['登記人數', r.tasks.registered], ['達到抽獎門檻', r.tasks.eligible, pct(r.tasks.registered ? r.tasks.eligible / r.tasks.registered : null)], ['未達門檻（流失）', r.tasks.notEligible], [],
          ['資料庫', '選擇人數', '比例'], ...r.tasks.dbs.map((x) => [x.dbName, x.selected, pct(x.rate)]), [],
          ['資料庫', '任務', '必做／選做', '應完成人數', '完成', '完成率', '選了但未完成'],
          ...r.tasks.tasks.map((t) => [t.dbName, t.title, t.required ? '必做' : '選做', t.denominator, t.completed, pct(t.rate), t.dropped]), [],
          ['說明', '必做任務的應完成人數是全部登記者；選做任務是有選擇該資料庫的人。不含測試資料。']
        ], widths: [16, 40, 12, 12, 8, 10, 14] }] : [])
      ]);
    } catch (err) { toastErr(err); }
  }));

  /* ---------- 16:9 成果圖卡 ---------- */
  $('#btnCard').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      const canvas = await drawCard(r, { day: 'all', range });
      const url = canvas.toDataURL('image/png');
      await modal({
        title: '成果圖卡（1920 × 1080）', width: 900,
        body: `<img src="${url}" alt="成果圖卡預覽" style="width:100%;border-radius:10px;border:1px solid var(--line)">
          <div class="muted small">可直接放進 16:9 簡報。下載後是高解析 PNG。</div>`,
        actions: [{ label: '關閉', kind: 'ghost', value: null }, {
          label: '下載 PNG', kind: 'accent', onClick: () => new Promise((res) => canvas.toBlob((b) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = `成果圖卡_${ev.eventCode}_${stamp()}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            res(true);
          }, 'image/png'))
        }]
      });
    } catch (err) { toastErr(err); }
  }));
}
