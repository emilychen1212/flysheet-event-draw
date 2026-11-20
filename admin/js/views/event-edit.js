/** 活動編輯（新增／修改／檢視） */
import { api, cachedApi } from '../../../assets/js/api.js';
import {
  $, $$, esc, toast, toastErr, modal, confirmBox, busy, emptyHtml, ICON, badge,
  STATE, GAMES, DRAW_MODES, REG_MODES, toLocalInput
} from '../ui.js';
import { regFieldsHtml, readRegFields, bindRegFields } from './reg-fields.js';
import { editClient } from './clients.js';
import { publishHtml, bindPublish } from './publish.js';

const PALETTE = ['#f27a2b', '#1b2a52', '#f8b07c', '#3d5596', '#e8b839', '#2d8a57', '#c4432b', '#8a6fc7', '#4aa3c2', '#d96aa0'];
const LOSE_COLOR = '#cfc8bd';

function defaultTimes() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const p = (n) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { startAt: day + 'T09:00', endAt: day + 'T17:00' };
}

export async function render(root, [eventId], app) {
  const isNew = !eventId;
  const [settings, clientsAll, loaded] = await Promise.all([
    app.settings(),
    cachedApi('clients.list'),
    isNew ? null : cachedApi('events.get', { eventId })
  ]);

  let ev, prizes;
  if (loaded) {
    ev = loaded.event;
    prizes = loaded.prizes;
  } else {
    const t = defaultTimes();
    ev = {
      eventCode: '', clientId: app.query.get('client') || '', title: '', subtitle: '', clientDisplayName: '',
      startAt: t.startAt, endAt: t.endAt, status: 'draft', gameType: 'wheel', drawMode: 'self', regMode: 'before',
      dailyLimit: 1, regFields: settings.defaultRegFields, promoEnabled: false, promoProducts: [], soundDefault: 'on',
      isTestMode: false, canEdit: true, ownerId: app.user.userId
    };
    prizes = [
      { name: '', quantity: 10, isLose: false, isSpecial: false, color: PALETTE[0] },
      { name: '銘謝惠顧', quantity: 20, isLose: true, isSpecial: false, color: LOSE_COLOR }
    ];
  }
  const ro = !ev.canEdit;
  const dis = ro ? 'disabled' : '';
  const ownerClients = clientsAll.filter((c) => c.ownerId === ev.ownerId);

  root.innerHTML = `
    <div class="crumb"><a href="#/events">專案活動</a> ／</div>
    <div class="page-head">
      <div>
        <h1>${isNew ? '建立活動' : esc(ev.title)}</h1>
        ${isNew ? '<div class="sub">填好基本資訊與獎池就能儲存，之後隨時可以修改</div>'
        : `<div class="sub" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="font-family:var(--font-mono);letter-spacing:.05em">${esc(ev.eventCode)}</span>
            ${badge(STATE, ev.state)} ${ev.isTestMode ? '<span class="badge yellow">測試模式</span>' : ''}
            <span>${esc(ev.clientName)}・${esc(ev.ownerName)}</span></div>`}
      </div>
      ${isNew ? '' : `<div class="actions">
        ${ro ? '' : `<button class="btn" id="btnCopy">${ICON.copy}複製活動</button>`}
        <button type="button" class="btn" data-jump="publish">${ICON.qr}網址與 QR code</button>
        ${!ro && ev.status === 'draft' ? `<button class="btn danger" id="btnDelete">${ICON.trash}刪除</button>` : ''}
      </div>`}
    </div>

    ${ro ? `<div class="readonly-bar">👀 這是 <b>${esc(ev.ownerName)}</b> 的活動，你可以檢視設定，但不能修改。</div>` : ''}

    <nav class="section-nav">
      <a data-jump="s-basic">基本資訊</a><a data-jump="s-mode">抽獎方式</a><a data-jump="s-game">遊戲形式</a><a data-jump="s-prize">獎池</a>
      <a data-jump="s-reg">登記設定</a><a data-jump="s-promo">推廣頁</a><a data-jump="s-test">測試模式</a>${isNew ? '' : '<a data-jump="publish">發布</a>'}
    </nav>

    <form id="form" autocomplete="off">
    <section class="card" id="s-basic">
      <h2 class="card-title"><span><span class="num">1</span>基本資訊</span></h2>
      <div class="form-grid">
        <div class="field"><label>客戶<span class="req">*</span></label>
          <div style="display:flex;gap:8px">
            <select class="input" name="clientId" ${dis}>
              <option value="">請選擇客戶</option>
              ${ownerClients.map((c) => `<option value="${esc(c.clientId)}" data-name="${esc(c.name)}">${esc(c.name)}</option>`).join('')}
            </select>
            ${ro ? '' : `<button type="button" class="btn icon" id="btnNewClient" title="新增客戶">${ICON.plus}</button>`}
          </div></div>
        <div class="field"><label>活動代碼<span class="req">*</span></label>
          <input class="input mono" name="eventCode" maxlength="20" placeholder="例：EBM27" ${dis}>
          <div class="hint" id="codeHint">英文字母與數字，會出現在抽獎網址中</div></div>
        <div class="field span-2"><label>主標題<span class="req">*</span></label>
          <input class="input" name="title" maxlength="100" placeholder="例：實證醫學工具大集合　轉轉樂" ${dis}></div>
        <div class="field span-2"><label>說明</label>
          <input class="input" name="subtitle" maxlength="300" placeholder="例：完成登記就能抽，好禮等你帶回家！" ${dis}></div>
        <div class="field"><label>前台顯示的客戶名</label>
          <input class="input" name="clientDisplayName" maxlength="100" placeholder="留空則使用客戶名稱" ${dis}>
          <div class="hint">例：「臺大醫學院圖書館 × 飛資得」</div></div>
        <div class="field"><label>狀態</label>
          <select class="input" name="status" ${dis}>
            <option value="draft">草稿（前台不開放）</option><option value="active">進行中</option><option value="ended">已結束</option>
          </select></div>
        <div class="field"><label>開始時間<span class="req">*</span></label><input class="input" type="datetime-local" name="startAt" ${dis}></div>
        <div class="field"><label>結束時間<span class="req">*</span></label><input class="input" type="datetime-local" name="endAt" ${dis}></div>
      </div>
      <p class="hint muted small" style="margin:12px 0 0">前台只有在「進行中」且在起訖時間內才能抽獎。</p>
    </section>

    <section class="card" id="s-mode">
      <h2 class="card-title"><span><span class="num">2</span>抽獎方式</span></h2>
      <div class="choice-group">
        ${Object.entries(DRAW_MODES).map(([k, m]) => `<label class="choice"><input type="radio" name="drawMode" value="${k}" ${dis}>
          <span class="ico">${k === 'booth' ? '💻' : '📱'}</span><span class="t">${m.label}</span><span class="d">${m.desc}</span></label>`).join('')}
      </div>
      <div class="notice warn" id="selfNoneWarn" style="margin-top:12px" hidden><span class="i">!</span>
        <span>自助掃碼若不登記，無法限制每人抽獎次數，獎品可能被重複抽完。</span></div>
    </section>

    <section class="card" id="s-game">
      <h2 class="card-title"><span><span class="num">3</span>遊戲形式</span>
        ${isNew ? '' : `<a class="btn sm" id="btnPreview" target="_blank" rel="noopener">${ICON.external}預覽前台</a>`}</h2>
      <div class="choice-group">
        ${Object.entries(GAMES).map(([k, g]) => `<label class="choice"><input type="radio" name="gameType" value="${k}" ${dis}>
          <span class="ico">${g.ico}</span><span class="t">${g.label}</span><span class="d"><b style="color:var(--orange-600);font-weight:500">${g.theme}</b><br>${g.desc}</span></label>`).join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px">
        <span class="small muted">試玩（用目前的獎項、不會留下紀錄）：</span>
        ${Object.entries(GAMES).map(([k, g]) => `<button type="button" class="btn sm" data-preview="${k}">${g.ico} ${g.label}</button>`).join('')}
      </div>
      <div class="field" style="margin-top:16px"><label>音效預設</label>
        <div class="seg" style="align-self:flex-start">
          <label><input type="radio" name="soundDefault" value="on" ${dis}><span>🔊 開啟</span></label>
          <label><input type="radio" name="soundDefault" value="off" ${dis}><span>🔇 靜音</span></label>
        </div><div class="hint">參與者可以在前台右上角自己切換</div></div>
    </section>

    <section class="card" id="s-prize">
      <h2 class="card-title"><span><span class="num">4</span>獎池設定</span></h2>
      <p class="muted small" style="margin-top:-6px">每次抽獎依「剩餘數量」加權隨機，數量越多越容易抽中。一般獎項全部抽完後活動就會顯示「獎品已全數送出」。</p>
      <div class="prize-head"><span></span><span>顏色</span><span>獎項名稱</span><span>數量</span><span></span><span></span><span style="text-align:right">占比</span><span></span></div>
      <div class="prize-list" id="prizeList"></div>
      ${ro ? '' : `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button type="button" class="btn sm" id="addPrize">${ICON.plus}新增獎項</button>
        <button type="button" class="btn sm ghost" id="addLose">${ICON.plus}新增「銘謝惠顧」</button></div>`}
      <div class="stack-bar" id="stackBar"></div>
      <div class="prize-summary" id="prizeSummary"></div>
    </section>

    <section class="card" id="s-reg">
      <h2 class="card-title"><span><span class="num">5</span>登記設定</span></h2>
      <div class="choice-group">
        ${Object.entries(REG_MODES).map(([k, m]) => `<label class="choice"><input type="radio" name="regMode" value="${k}" ${dis}>
          <span class="t">${m.label}</span><span class="d">${m.desc}</span></label>`).join('')}
      </div>
      <div id="regDetail">
        <div class="field" id="dailyBox" style="margin-top:16px;max-width:260px"><label>每人每日可抽次數</label>
          <input class="input" type="number" name="dailyLimit" min="1" max="99" ${dis}>
          <div class="hint">以 Email 或手機辨識同一人，台北時間午夜換日</div></div>
        <div style="margin-top:20px" id="regBox">${regFieldsHtml(ev.regFields, { editable: !ro })}</div>
      </div>
    </section>

    <section class="card" id="s-promo">
      <h2 class="card-title"><span><span class="num">6</span>推廣頁設定</span></h2>
      <div id="promoOff" class="muted small">推廣頁只在「自助掃碼」時使用：參與者抽完後，可以看到推廣產品並申請試用。</div>
      <div id="promoOn">
        <label class="switch"><input type="checkbox" name="promoEnabled" ${dis}><span class="track"></span>抽完後顯示推廣頁</label>
        <div id="promoBox" style="margin-top:14px">
          <div id="promoList" style="display:grid;gap:10px"></div>
          ${ro ? '' : `<button type="button" class="btn sm" id="addPromo" style="margin-top:10px">${ICON.plus}新增推廣產品</button>`}
        </div>
      </div>
    </section>

    <section class="card" id="s-test">
      <h2 class="card-title"><span><span class="num">7</span>測試模式</span></h2>
      <label class="switch"><input type="checkbox" name="isTestMode" ${dis}><span class="track"></span>開啟測試模式</label>
      <p class="muted small" style="margin:10px 0 0">開啟後，即使是草稿或不在活動時間內也能抽獎，前台會顯示「測試中」。測試時的登記、抽獎、潛在客戶都會標記為測試資料，<b>不計入報表</b>。正式開始前記得關閉。</p>
      ${isNew ? '' : `<div style="display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap">
        <span class="small">目前有 <b>${ev.testDrawCount || 0}</b> 筆測試抽獎紀錄</span>
        ${ro ? '' : `<button type="button" class="btn sm danger" id="btnClearTest" ${ev.testDrawCount ? '' : 'disabled'}>${ICON.trash}清除測試資料</button>`}</div>`}
    </section>
    </form>

    ${isNew ? '' : `<section class="card" id="publish">${publishHtml(ev)}</section>`}

    ${ro ? '' : `<div class="save-bar"><span class="state" id="saveState">${isNew ? '尚未儲存' : '所有變更已儲存'}</span>
      ${isNew ? '<a class="btn ghost" href="#/events">取消</a>' : ''}
      <button class="btn primary" id="btnSave">${isNew ? '建立活動' : '儲存變更'}</button></div>`}`;

  const form = $('#form');
  const F = (n) => form.elements[n];

  // 區塊跳轉（不能用 #錨點，會跟網址路由衝突）
  root.addEventListener('click', (e) => {
    const j = e.target.closest('[data-jump]');
    if (j) { e.preventDefault(); document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  /* ---------- 填入資料 ---------- */
  F('clientId').value = ev.clientId || '';
  F('eventCode').value = ev.eventCode || '';
  F('title').value = ev.title || '';
  F('subtitle').value = ev.subtitle || '';
  F('clientDisplayName').value = ev.clientDisplayName || '';
  F('status').value = ev.status;
  F('startAt').value = toLocalInput(ev.startAt) || ev.startAt;
  F('endAt').value = toLocalInput(ev.endAt) || ev.endAt;
  F('dailyLimit').value = ev.dailyLimit || 1;
  F('promoEnabled').checked = !!ev.promoEnabled;
  F('isTestMode').checked = !!ev.isTestMode;
  ['drawMode', 'gameType', 'regMode', 'soundDefault'].forEach((n) => {
    const r = form.querySelector(`input[name=${n}][value="${ev[n]}"]`);
    if (r) r.checked = true;
  });
  if (!loaded && ev.clientId) {
    const opt = F('clientId').selectedOptions[0];
    if (opt && opt.dataset.name) F('clientDisplayName').placeholder = opt.dataset.name;
  }

  /* ---------- 變更狀態 ---------- */
  const markDirty = () => {
    if (ro) return;
    app.dirty = true;
    const s = $('#saveState');
    s.textContent = '有尚未儲存的變更';
    s.classList.add('dirty');
  };
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);

  /* ---------- 抽獎方式／登記模式連動 ---------- */
  let lastDrawMode = ev.drawMode;
  const syncModes = () => {
    const drawMode = form.querySelector('input[name=drawMode]:checked').value;
    if (!ro && drawMode !== lastDrawMode && drawMode === 'self') {
      // 自助掃碼預設「先登記再抽」
      form.querySelector('input[name=regMode][value=before]').checked = true;
    }
    lastDrawMode = drawMode;
    const regMode = form.querySelector('input[name=regMode]:checked').value;
    $('#selfNoneWarn').hidden = !(drawMode === 'self' && regMode === 'none');
    $('#dailyBox').hidden = regMode !== 'before';
    $('#regBox').hidden = regMode === 'none';
    $('#promoOff').hidden = drawMode === 'self';
    $('#promoOn').hidden = drawMode !== 'self';
    $('#promoBox').hidden = !F('promoEnabled').checked;
  };
  form.addEventListener('change', (e) => {
    if (['drawMode', 'regMode', 'promoEnabled'].includes(e.target.name)) syncModes();
  });
  syncModes();

  F('clientId').addEventListener('change', () => {
    const opt = F('clientId').selectedOptions[0];
    F('clientDisplayName').placeholder = opt && opt.dataset.name ? opt.dataset.name : '留空則使用客戶名稱';
  });

  $('#btnNewClient')?.addEventListener('click', async () => {
    const c = await editClient(null);
    if (!c) return;
    F('clientId').insertAdjacentHTML('beforeend', `<option value="${esc(c.clientId)}" data-name="${esc(c.name)}">${esc(c.name)}</option>`);
    F('clientId').value = c.clientId;
    F('clientId').dispatchEvent(new Event('change', { bubbles: true }));
    toast('已新增客戶');
  });

  /* ---------- 活動代碼即時檢查 ---------- */
  let codeTimer;
  let codeOk = !isNew;
  F('eventCode').addEventListener('input', () => {
    const el = F('eventCode');
    const pos = el.selectionStart;
    el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    el.setSelectionRange(pos, pos);
    const hint = $('#codeHint');
    clearTimeout(codeTimer);
    codeOk = false;
    if (!el.value) { hint.className = 'hint'; hint.textContent = '英文字母與數字，會出現在抽獎網址中'; return; }
    if (!isNew && el.value === ev.eventCode) { codeOk = true; hint.className = 'hint'; hint.textContent = '目前使用的代碼'; return; }
    hint.className = 'hint';
    hint.textContent = '檢查中…';
    codeTimer = setTimeout(async () => {
      try {
        const r = await api('events.checkCode', { eventCode: el.value, eventId: ev.eventId || '' });
        if (F('eventCode').value !== el.value) return;
        codeOk = r.available;
        hint.className = 'hint ' + (r.available ? 'ok' : 'bad');
        hint.textContent = r.available ? '✓ 可以使用' : r.message;
      } catch (e) { hint.className = 'hint bad'; hint.textContent = e.message; }
    }, 450);
  });

  /* ---------- 獎池 ---------- */
  const list = $('#prizeList');
  const prizeState = prizes.map((p, i) => ({ ...p, color: p.color || (p.isLose ? LOSE_COLOR : PALETTE[i % PALETTE.length]) }));

  const prizeRowHtml = (p, i) => `<div class="prize-row ${p.isLose ? 'lose' : ''}" data-i="${i}">
      <div class="order">${ro ? '' : `<button type="button" data-up title="上移">▲</button><button type="button" data-down title="下移">▼</button>`}</div>
      <input type="color" data-k="color" value="${esc(p.color || (p.isLose ? LOSE_COLOR : PALETTE[i % PALETTE.length]))}" title="遊戲中顯示的顏色" ${dis}>
      <div><input class="input" data-k="name" value="${esc(p.name)}" placeholder="${p.isLose ? '銘謝惠顧' : '獎項名稱，例：保溫杯'}" maxlength="50" ${dis}>
        ${p.prizeId ? `<div class="remain">剩餘 ${p.remaining} / ${p.quantity}</div>` : ''}</div>
      <input class="input" type="number" data-k="quantity" min="0" value="${p.quantity}" ${dis} aria-label="數量">
      <div class="flags">
        <label class="check small" title="勾選後此獎項視為沒中獎"><input type="checkbox" data-k="isLose" ${p.isLose ? 'checked' : ''} ${dis}>銘謝惠顧</label>
        <label class="check small" title="抽中時播放全畫面慶祝動畫"><input type="checkbox" data-k="isSpecial" ${p.isSpecial ? 'checked' : ''} ${p.isLose || ro ? 'disabled' : ''}>特別獎 ✨</label>
      </div>
      <div class="share" data-share></div>
      <div class="del">${ro ? '' : `<button type="button" class="btn sm ghost" data-del title="刪除">${ICON.trash}</button>`}</div>
    </div>`;

  const drawPrizes = () => {
    list.innerHTML = prizeState.length ? prizeState.map(prizeRowHtml).join('') : '<div class="muted small">還沒有獎項</div>';
    updateSummary();
  };
  const updateSummary = () => {
    const total = prizeState.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    const real = prizeState.filter((p) => !p.isLose).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    $$('.prize-row', list).forEach((row, i) => {
      const q = Number(prizeState[i].quantity) || 0;
      $('[data-share]', row).textContent = total ? (q / total * 100).toFixed(1) + '%' : '—';
    });
    $('#stackBar').innerHTML = prizeState.map((p) => {
      const q = Number(p.quantity) || 0;
      return total && q ? `<i style="width:${q / total * 100}%;background:${esc(p.color || LOSE_COLOR)}" title="${esc(p.name)}"></i>` : '';
    }).join('');
    $('#prizeSummary').innerHTML = `<span>獎品總數 <b>${real}</b></span><span>含銘謝惠顧共 <b>${total}</b> 份</span>
      <span>中獎率約 <b>${total ? Math.round(real / total * 100) : 0}%</b></span>`;
  };
  drawPrizes();

  list.addEventListener('input', (e) => {
    const row = e.target.closest('.prize-row');
    if (!row) return;
    const p = prizeState[row.dataset.i];
    const k = e.target.dataset.k;
    if (k === 'name' || k === 'color') p[k] = e.target.value;
    if (k === 'quantity') p.quantity = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
    updateSummary();
  });
  list.addEventListener('change', (e) => {
    const row = e.target.closest('.prize-row');
    if (!row) return;
    const p = prizeState[row.dataset.i];
    const k = e.target.dataset.k;
    if (k === 'isLose') {
      p.isLose = e.target.checked;
      if (p.isLose) { p.isSpecial = false; if (!p.name) p.name = '銘謝惠顧'; }
      drawPrizes();
    }
    if (k === 'isSpecial') p.isSpecial = e.target.checked;
  });
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.prize-row');
    if (!row) return;
    const i = Number(row.dataset.i);
    if (e.target.closest('[data-del]')) {
      const p = prizeState[i];
      if (p.prizeId && p.remaining < p.quantity) return toastErr(`「${p.name}」已經有人抽中過，不能刪除（可以把數量改成 0）`);
      prizeState.splice(i, 1);
      drawPrizes(); markDirty();
    }
    const move = e.target.closest('[data-up]') ? -1 : e.target.closest('[data-down]') ? 1 : 0;
    if (move && prizeState[i + move]) {
      [prizeState[i], prizeState[i + move]] = [prizeState[i + move], prizeState[i]];
      drawPrizes(); markDirty();
    }
  });
  $('#addPrize')?.addEventListener('click', () => {
    const used = prizeState.map((p) => p.color);
    prizeState.splice(prizeState.filter((p) => !p.isLose).length, 0,
      { name: '', quantity: 10, isLose: false, isSpecial: false, color: PALETTE.find((c) => !used.includes(c)) || PALETTE[0] });
    drawPrizes(); markDirty();
    const rows = $$('.prize-row:not(.lose) [data-k=name]', list);
    rows[rows.length - 1]?.focus();
  });
  $('#addLose')?.addEventListener('click', () => {
    prizeState.push({ name: '銘謝惠顧', quantity: 10, isLose: true, isSpecial: false, color: LOSE_COLOR });
    drawPrizes(); markDirty();
  });

  /* ---------- 登記欄位 ---------- */
  if (!ro) bindRegFields($('#regBox'), markDirty);

  /* ---------- 推廣產品 ---------- */
  const promo = (ev.promoProducts || []).map((p) => ({ ...p }));
  const drawPromo = () => {
    $('#promoList').innerHTML = promo.length ? promo.map((p, i) => `<div class="custom-q" data-i="${i}">
      <div class="row">
        <input class="input" data-k="name" value="${esc(p.name)}" placeholder="產品名稱，例：UpToDate" style="flex:1;min-width:160px" maxlength="100" ${dis}>
        ${ro ? '' : `<button type="button" class="btn sm ghost" data-del title="刪除">${ICON.trash}</button>`}
      </div>
      <input class="input" data-k="intro" value="${esc(p.intro)}" placeholder="一句話介紹，例：全球臨床醫師最信賴的實證醫學工具" maxlength="200" ${dis}>
      <input class="input" data-k="url" value="${esc(p.url)}" placeholder="產品連結（選填），https://…" maxlength="500" ${dis}>
    </div>`).join('') : '<div class="muted small">還沒有推廣產品</div>';
  };
  drawPromo();
  $('#promoList').addEventListener('input', (e) => {
    const box = e.target.closest('[data-i]');
    if (box && e.target.dataset.k) promo[box.dataset.i][e.target.dataset.k] = e.target.value;
  });
  $('#promoList').addEventListener('click', (e) => {
    const box = e.target.closest('[data-i]');
    if (box && e.target.closest('[data-del]')) { promo.splice(Number(box.dataset.i), 1); drawPromo(); markDirty(); }
  });
  $('#addPromo')?.addEventListener('click', () => {
    promo.push({ name: '', intro: '', url: '' });
    drawPromo(); markDirty();
    $$('#promoList [data-k=name]').pop()?.focus();
  });

  /* ---------- 儲存 ---------- */
  const collect = () => ({
    event: {
      eventId: ev.eventId || '',
      clientId: F('clientId').value,
      eventCode: F('eventCode').value,
      title: F('title').value,
      subtitle: F('subtitle').value,
      clientDisplayName: F('clientDisplayName').value,
      status: F('status').value,
      startAt: F('startAt').value,
      endAt: F('endAt').value,
      drawMode: form.querySelector('input[name=drawMode]:checked').value,
      gameType: form.querySelector('input[name=gameType]:checked').value,
      soundDefault: form.querySelector('input[name=soundDefault]:checked').value,
      regMode: form.querySelector('input[name=regMode]:checked').value,
      dailyLimit: F('dailyLimit').value,
      regFields: readRegFields($('#regBox')),
      promoEnabled: F('promoEnabled').checked,
      promoProducts: promo,
      isTestMode: F('isTestMode').checked
    },
    prizes: prizeState.map((p) => ({
      prizeId: p.prizeId || '', name: p.name.trim() || (p.isLose ? '銘謝惠顧' : ''), quantity: p.quantity === '' ? -1 : p.quantity,
      isLose: p.isLose, isSpecial: p.isSpecial, color: p.color
    }))
  });

  const validate = (d) => {
    const e = d.event;
    if (!e.clientId) return ['請選擇客戶', 'clientId'];
    if (!e.eventCode) return ['請填寫活動代碼', 'eventCode'];
    if (isNew && !codeOk && $('#codeHint').classList.contains('bad')) return [$('#codeHint').textContent, 'eventCode'];
    if (!e.title.trim()) return ['請填寫主標題', 'title'];
    if (!e.startAt || !e.endAt) return ['請填寫開始與結束時間', 'startAt'];
    if (e.startAt >= e.endAt) return ['結束時間要晚於開始時間', 'endAt'];
    if (!d.prizes.length) return ['請至少設定一個獎項'];
    if (d.prizes.some((p) => !p.name)) return ['有獎項還沒填名稱'];
    if (d.prizes.some((p) => p.quantity < 0)) return ['獎項數量要是 0 以上的整數'];
    if (!d.prizes.some((p) => !p.isLose)) return ['至少要有一個不是「銘謝惠顧」的獎項'];
    if (e.promoEnabled && e.drawMode === 'self' && !e.promoProducts.some((p) => p.name.trim())) return ['推廣頁已開啟，請至少新增一個推廣產品'];
    return null;
  };

  $('#btnSave')?.addEventListener('click', (btn) => busy(btn.currentTarget, async () => {
    const d = collect();
    const bad = validate(d);
    if (bad) {
      toastErr(bad[0]);
      if (bad[1]) { F(bad[1]).focus(); F(bad[1]).scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }
    if (d.event.status === 'active' && d.event.isTestMode) {
      const go = await confirmBox('活動狀態是「進行中」，但測試模式還開著，測試期間的抽獎不會計入報表。確定要這樣儲存嗎？', { ok: '仍要儲存' });
      if (!go) return;
    }
    try {
      const r = await api('events.save', d);
      app.dirty = false;
      toast(isNew ? '活動已建立！' : '已儲存');
      if (isNew) app.go('#/events/' + r.event.eventId);
      else render(root, [eventId], app);
    } catch (e) { toastErr(e); }
  }));

  /* ---------- 其他動作 ---------- */
  $('#btnCopy')?.addEventListener('click', async () => {
    if (app.dirty && !(await confirmBox('目前有尚未儲存的變更，複製時會使用「已儲存」的設定。要繼續嗎？'))) return;
    const r = await modal({
      title: '複製活動',
      body: `<p class="small muted" style="margin:0">會複製所有設定與獎項（數量重置為初始值），新活動為草稿狀態。</p>
        <div class="field"><label>新的活動代碼<span class="req">*</span></label><input class="input mono" id="newCode" maxlength="20" placeholder="例：${esc(ev.eventCode)}2"></div>`,
      onOpen: (m) => { $('#newCode', m).addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }); },
      actions: [{ label: '取消', kind: 'ghost', value: null },
        { label: '複製', kind: 'primary', onClick: (m) => api('events.copy', { eventId: ev.eventId, eventCode: $('#newCode', m).value }) }]
    });
    if (r) { app.dirty = false; toast('已複製，記得修改時間與標題'); app.go('#/events/' + r.event.eventId); }
  });

  $('#btnDelete')?.addEventListener('click', async () => {
    if (!(await confirmBox(`確定要刪除「${ev.title}」嗎？獎項與測試資料會一起刪除，無法復原。`, { ok: '刪除', danger: true }))) return;
    try { await api('events.delete', { eventId: ev.eventId }); app.dirty = false; toast('已刪除'); app.go('#/events'); } catch (e) { toastErr(e); }
  });

  $('#btnClearTest')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!(await confirmBox(`要清除 ${ev.testDrawCount} 筆測試抽獎，以及測試時的登記與潛在客戶資料嗎？測試抽走的獎品數量會加回獎池。`, { ok: '清除', danger: true }))) return;
    busy(btn, async () => {
      try {
        const r = await api('events.clearTest', { eventId: ev.eventId });
        toast(`已清除 ${r.draws} 筆抽獎、${r.participants} 位登記者、${r.leads} 筆潛在客戶`);
        if (!app.dirty) render(root, [eventId], app);
      } catch (err) { toastErr(err); }
    });
  });

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preview]');
    if (!b) return;
    try {
      localStorage.setItem('fed.preview', JSON.stringify({
        title: F('title').value || '遊戲試玩',
        client: F('clientDisplayName').value || (F('clientId').selectedOptions[0] || {}).dataset?.name || '',
        prizes: prizeState.map((p) => ({ name: p.name, quantity: p.quantity, isLose: p.isLose, isSpecial: p.isSpecial, color: p.color }))
      }));
    } catch (err) { /* 無痕模式就用範例獎項 */ }
    window.open(new URL('../play/?preview=' + b.dataset.preview, location.href).toString(), '_blank', 'noopener');
  });

  if (!isNew) {
    const prev = $('#btnPreview');
    if (prev) prev.href = playUrl(ev.eventCode);
    bindPublish($('#publish'), ev);
  }

  return () => { app.dirty = false; };
}

export function playUrl(code, screen) {
  const u = new URL('../play/', location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('event', code);
  if (screen) u.searchParams.set('view', 'screen');
  return u.toString();
}
