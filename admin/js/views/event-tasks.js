/**
 * 活動編輯頁的「體驗任務」區塊
 * 列出客戶訂購的資料庫 → 從範本複製成活動任務（預覽小卡片）→ 點卡片開視窗編輯說明、連結、驗證方式、PIN、必做
 */
import { cachedApi } from '../../../assets/js/api.js';
import { $, esc, ICON, toast, toastErr, modal } from '../ui.js';
import { VERIFY } from './templates.js';

const key = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function tasksSectionHtml(ev, dis, num) {
  return `<section class="card" id="s-task">
    <h2 class="card-title"><span><span class="num">${num}</span>體驗任務</span></h2>
    <div class="notice warn" id="taskNeedBefore" hidden><span class="i">!</span><span>體驗任務要搭配「先登記再抽」，請到上方「登記設定」切換。</span></div>
    <label class="switch"><input type="checkbox" name="taskOn" ${dis}><span class="track"></span>使用體驗任務：參加者選資料庫、完成任務，達到門檻才能抽獎（資格由系統判斷）</label>
    <div class="notice warn" id="taskLegacy" hidden style="margin-top:12px"><span class="i">!</span><span>這個活動原本設定「完成任一任務」，現在改成依任務卡判斷：<b>勾了「必做」的任務卡一定要完成</b>。請確認規則後再儲存。</span></div>
    <div class="task-rule-row" id="taskRuleBox">
      <label class="nfield">選做任務至少要完成 <input class="input" type="number" name="taskMinOptional" min="0" max="30" ${dis}> 個</label>
      <div class="task-rule" id="taskRule"></div>
    </div>
    <input type="hidden" name="taskMode">
    <div id="taskBox">
      ${dis ? '' : `<div class="task-add-head"><b>加入任務卡</b><span class="muted small">點範本就會複製成這個活動的任務，之後修改不影響範本。</span>
        <span id="otherTpl"></span></div>
      <div class="task-add" id="taskAdd"></div>`}
      <div class="task-tools">
        <span class="small"><b>任務卡</b>（點卡片編輯）</span>
        ${dis ? '' : `<span class="pin-all"><span class="small muted">同一組 PIN 套用到全部：</span>
          <input class="input pin" id="pinAll" inputmode="numeric" maxlength="4" placeholder="1234"><button type="button" class="btn sm" id="pinAllBtn">套用</button></span>`}
      </div>
      <div class="mgrid" id="taskList"></div>
    </div>
  </section>`;
}

export async function bindTasks(root, form, ev, { ro, markDirty }) {
  const F = (n) => form.elements[n];
  const on = !!ev.taskMode && ev.taskMode !== 'none';
  F('taskOn').checked = on;
  F('taskMode').value = on ? 'cards' : 'none';
  const legacyAny = ev.taskMode === 'any';
  const hadRequired = (ev.tasks || []).some((t) => t.required);
  // 舊的「完成任一任務」沒有必做時，等於選做至少 1 個
  F('taskMinOptional').value = legacyAny && !hadRequired ? Math.max(1, ev.taskMinOptional || 0) : (ev.taskMinOptional || 0);
  const tasks = (ev.tasks || []).map((t) => ({ ...t, pin: '' }));
  let tpls = [];
  let cdbs = [];

  const sync = () => {
    const isOn = F('taskOn').checked;
    F('taskMode').value = isOn ? 'cards' : 'none';
    const regMode = (form.querySelector('input[name=regMode]:checked') || {}).value;
    $('#taskRuleBox', root).hidden = !isOn;
    $('#taskBox', root).hidden = !isOn && !tasks.length;
    $('#taskNeedBefore', root).hidden = !(isOn && regMode !== 'before');
    $('#taskLegacy', root).hidden = !(isOn && legacyAny && tasks.some((t) => t.required));
    // 即時白話規則
    const req = tasks.filter((t) => t.required).length;
    const opt = tasks.length - req;
    let n = Math.max(0, parseInt(F('taskMinOptional').value, 10) || 0);
    if (!req && n < 1 && opt) n = 1;
    const box = $('#taskRule', root);
    if (!tasks.length) { box.className = 'task-rule muted'; box.textContent = '還沒有加入任務卡'; return; }
    const bad = n > opt ? `選做任務只有 ${opt} 個，不能要求完成 ${n} 個` : '';
    const parts = [req ? `<b>${req} 個必做</b>` : '', n ? `${req ? '＋' : ''}至少 <b>${n} 個選做</b>` : ''].filter(Boolean).join('');
    box.className = 'task-rule' + (bad ? ' bad' : '');
    box.innerHTML = bad || `參加者要完成 ${parts}，最少共 <b>${req + n}</b> 個任務才能抽獎${req ? '' : '（沒有必做時至少 1 個）'}`;
  };

  const linkOf = (t) => t.url || t.clientUrl || t.templateUrl || '';
  const inherited = (t) => t.url ? '' : (t.clientUrl ? `留空＝沿用該校連結：${t.clientUrl}` : t.templateUrl ? `留空＝沿用範本預設連結：${t.templateUrl}` : '還沒有連結');
  const pinStatus = (t) => t.verifyMethod !== 'staff_pin' ? '' : (t.pin || t.hasPin) ? `🔐 PIN ${t.pin ? '已更新' : '已設定'}` : '<span class="warn-t">⚠ 尚未設定 PIN</span>';

  const draw = () => {
    $('#taskList', root).innerHTML = tasks.map((t, i) => `<article class="mcard tcard ${t.required ? 'req' : ''}" data-i="${i}" ${ro ? '' : 'tabindex="0" role="button" aria-label="編輯 ' + esc(t.title) + '"'}>
        <div class="mc-top"><span class="mc-db">${esc(t.dbName)}</span>
          <span class="tag ${t.required ? 'req' : ''}">${t.required ? '必做' : '選做'}</span>
          ${ro ? '' : `<span class="mc-acts"><button type="button" class="mc-mv" data-left title="往前">‹</button><button type="button" class="mc-mv" data-right title="往後">›</button>
            <button type="button" class="mc-edit" data-edit title="編輯">${ICON.edit}</button></span>`}</div>
        <div class="mc-name">${esc(t.title)}</div>
        ${t.description ? `<div class="mc-desc">${esc(t.description)}</div>` : ''}
        <div class="mc-link ${linkOf(t) ? '' : 'none'}">${esc(t.actionText || '前往 ' + t.dbName)} ↗</div>
        <div class="mc-meta">${VERIFY[t.verifyMethod]?.short || ''}${t.verifyMethod === 'staff_pin' ? '・' + pinStatus(t) : ''}</div>
      </article>`).join('') || '<div class="muted small">還沒有加入任務卡</div>';
    sync();
  };

  const editTask = async (i) => {
    const t = tasks[i];
    const r = await modal({
      title: `編輯任務卡｜${t.dbName}`,
      width: 600,
      body: `<div class="field"><label>任務標題<span class="req">*</span></label><input class="input" id="eTitle" maxlength="100" value="${esc(t.title)}"></div>
        <div class="field"><label>任務說明</label><textarea class="input" id="eDesc" maxlength="500" style="min-height:70px" placeholder="參加者要做什麼（選填）">${esc(t.description)}</textarea></div>
        <div class="form-grid">
          <div class="field"><label>必做／選做</label><div class="seg" style="align-self:flex-start">
            <label><input type="radio" name="eReq" value="1" ${t.required ? 'checked' : ''}><span>必做</span></label>
            <label><input type="radio" name="eReq" value="0" ${t.required ? '' : 'checked'}><span>選做</span></label></div></div>
          <div class="field"><label>驗證方式</label><select class="input" id="eVerify">
            <option value="staff_pin" ${t.verifyMethod === 'staff_pin' ? 'selected' : ''}>${VERIFY.staff_pin.label}</option>
            <option value="self_check" ${t.verifyMethod === 'self_check' ? 'selected' : ''}>${VERIFY.self_check.label}</option></select></div>
          <div class="field" id="ePinBox"><label>核銷 PIN（4 位數）</label><input class="input pin" id="ePin" inputmode="numeric" maxlength="4" value="${esc(t.pin)}" placeholder="${t.hasPin ? '已設定，留空不變' : '例：1234'}" style="width:100%"></div>
          <div class="field"><label>按鈕文字</label><input class="input" id="eAction" maxlength="30" value="${esc(t.actionText)}" placeholder="前往 ${esc(t.dbName)}"></div>
          <div class="field span-2"><label>連結</label><input class="input" id="eUrl" maxlength="500" value="${esc(t.url)}" placeholder="https://…"><div class="hint">${esc(inherited(t))}</div></div>
        </div>`,
      onOpen: (m) => {
        const sync2 = () => { $('#ePinBox', m).hidden = $('#eVerify', m).value !== 'staff_pin'; };
        $('#eVerify', m).addEventListener('change', sync2);
        $('#ePin', m).addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
        sync2();
      },
      actions: [
        { label: '移除任務', kind: 'danger', value: 'del' },
        { label: '取消', kind: 'ghost', value: null },
        { label: '完成', kind: 'primary', onClick: (m) => {
          const title = $('#eTitle', m).value.trim();
          const verify = $('#eVerify', m).value;
          const pin = $('#ePin', m).value.trim();
          const url = $('#eUrl', m).value.trim();
          if (!title) { toastErr('請填寫任務標題'); return false; }
          if (url && !/^https?:\/\//i.test(url)) { toastErr('連結要以 http:// 或 https:// 開頭'); return false; }
          if (verify === 'staff_pin' && pin && !/^\d{4}$/.test(pin)) { toastErr('PIN 要是 4 位數字'); return false; }
          if (verify === 'staff_pin' && !pin && !t.hasPin) { toastErr('工作人員核銷的任務要設定 4 位數 PIN'); return false; }
          return { title, description: $('#eDesc', m).value.trim(), required: $('input[name=eReq]:checked', m).value === '1',
            verifyMethod: verify, pin: verify === 'staff_pin' ? pin : '', actionText: $('#eAction', m).value.trim(), url };
        } }
      ]
    });
    if (r === 'del') { tasks.splice(i, 1); draw(); markDirty(); return; }
    if (!r || typeof r !== 'object') return;
    Object.assign(t, r);
    draw(); markDirty();
  };

  const drawAdd = () => {
    const box = $('#taskAdd', root);
    if (!box) return;
    const byDb = {};
    tpls.forEach((t) => { (byDb[key(t.dbName)] = byDb[key(t.dbName)] || []).push(t); });
    const tplBtn = (t, withDb) => `<button type="button" class="btn sm" data-add="${esc(t.templateId)}">${ICON.plus}${withDb ? esc(t.dbName) + '：' : ''}${esc(t.title)}</button>`;
    const used = new Set(cdbs.map((c) => key(c.dbName)));
    box.innerHTML = cdbs.map((c) => `<div class="db"><b>${esc(c.dbName)}</b>
      ${(byDb[key(c.dbName)] || []).map((t) => tplBtn(t)).join('') || '<span class="muted">範本庫沒有這個資料庫的範本</span>'}</div>`).join('') ||
      `<div class="muted small">這個客戶還沒設定「訂購的資料庫」，可以到<a href="#/clients/${esc(F('clientId').value)}">客戶頁</a>設定，或用右上「從其他資料庫的範本加入」。</div>`;
    const others = tpls.filter((t) => !used.has(key(t.dbName)));
    $('#otherTpl', root).innerHTML = others.length ? `<details class="pop"><summary class="btn sm">${ICON.plus}從其他資料庫的範本加入（${others.length}）</summary>
      <div class="pop-box">${others.map((t) => tplBtn(t, true)).join('')}</div></details>` : '';
  };

  const loadClient = async () => {
    const clientId = F('clientId').value;
    cdbs = clientId ? await cachedApi('clientDbs.list', { clientId }).catch(() => []) : [];
    const m = {};
    cdbs.forEach((c) => { m[key(c.dbName)] = c.url; });
    tasks.forEach((t) => { t.clientUrl = m[key(t.dbName)] || ''; });
    drawAdd();
    draw();
  };

  if (!ro) {
    tpls = await cachedApi('templates.list').catch(() => []);
    F('clientId').addEventListener('change', loadClient);
  }
  await loadClient();

  form.addEventListener('input', (e) => { if (e.target.name === 'taskMinOptional') sync(); });
  form.addEventListener('change', (e) => {
    if (!['taskOn', 'regMode', 'taskMinOptional'].includes(e.target.name)) return;
    if (e.target.name === 'taskOn' && e.target.checked && !tasks.some((t) => t.required) && !(parseInt(F('taskMinOptional').value, 10) > 0)) F('taskMinOptional').value = 1;
    sync();
  });
  $('#taskBox', root).addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const t = tpls.find((x) => x.templateId === add.dataset.add);
      const c = cdbs.find((x) => key(x.dbName) === key(t.dbName));
      tasks.push({ eventTaskId: '', templateId: t.templateId, dbName: c ? c.dbName : t.dbName, title: t.title, description: t.description,
        dbIntro: t.dbIntro, actionText: t.actionText, url: '', verifyMethod: t.verifyMethod === 'self_check' ? 'self_check' : 'staff_pin',
        pin: '', hasPin: false, required: false, clientUrl: c ? c.url : '', templateUrl: t.defaultUrl });
      if (!F('taskOn').checked) { F('taskOn').checked = true; if (!(parseInt(F('taskMinOptional').value, 10) > 0)) F('taskMinOptional').value = 1; }
      add.closest('details')?.removeAttribute('open');
      draw(); markDirty();
      toast(`已加入「${t.title}」，點卡片可以編輯`);
      return;
    }
    if (ro) return;
    const card = e.target.closest('.tcard');
    if (!card) return;
    const i = Number(card.dataset.i);
    const mv = e.target.closest('[data-left]') ? -1 : e.target.closest('[data-right]') ? 1 : 0;
    if (mv) {
      if (tasks[i + mv]) { [tasks[i], tasks[i + mv]] = [tasks[i + mv], tasks[i]]; draw(); markDirty(); }
      return;
    }
    editTask(i);
  });
  $('#taskList', root).addEventListener('keydown', (e) => {
    const card = e.target.closest('.tcard');
    if (card && !ro && (e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); editTask(Number(card.dataset.i)); }
  });
  $('#pinAllBtn', root)?.addEventListener('click', () => {
    const v = $('#pinAll', root).value.trim();
    if (!/^\d{4}$/.test(v)) return toastErr('PIN 要是 4 位數字');
    let n = 0;
    tasks.forEach((t) => { if (t.verifyMethod === 'staff_pin') { t.pin = v; n++; } });
    draw(); markDirty();
    toast(n ? `已套用到 ${n} 個任務，記得儲存` : '目前沒有工作人員核銷的任務');
  });
  $('#pinAll', root)?.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });

  return {
    collect: () => ({
      taskMode: F('taskMode').value,
      taskMinOptional: F('taskMinOptional').value,
      tasks: tasks.map((t) => ({
        eventTaskId: t.eventTaskId || '', templateId: t.templateId || '', dbName: t.dbName, title: t.title, description: t.description,
        dbIntro: t.dbIntro, actionText: t.actionText, url: t.url, verifyMethod: t.verifyMethod, pin: t.pin, required: !!t.required
      }))
    }),
    validate: (regMode) => {
      if (!F('taskOn').checked) return null;
      if (regMode !== 'before') return ['體驗任務要搭配「先登記再抽」，請到登記設定切換'];
      if (!tasks.length) return ['已開啟體驗任務，請至少加入一個任務'];
      const req = tasks.filter((t) => t.required).length;
      const n = parseInt(F('taskMinOptional').value, 10) || 0;
      if (!req && n < 1) return ['沒有必做任務時，「選做任務至少要完成幾個」至少要填 1'];
      if (n > tasks.length - req) return [`選做任務只有 ${tasks.length - req} 個，「選做任務至少要完成幾個」不能填 ${n}`];
      const bad = tasks.find((t) => t.verifyMethod === 'staff_pin' && !t.pin && !t.hasPin);
      if (bad) return [`「${bad.title}」是工作人員核銷，請設定 4 位數 PIN`];
      return null;
    }
  };
}
