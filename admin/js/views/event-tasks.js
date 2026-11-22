/**
 * 活動編輯頁的「體驗任務」區塊
 * 列出客戶訂購的資料庫 → 從範本複製成活動任務 → 可覆寫說明、連結、驗證方式、PIN、必做、排序
 */
import { cachedApi } from '../../../assets/js/api.js';
import { $, $$, esc, ICON, toast, toastErr } from '../ui.js';
import { VERIFY } from './templates.js';

const key = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function tasksSectionHtml(ev, dis, num) {
  return `<section class="card" id="s-task">
    <h2 class="card-title"><span><span class="num">${num}</span>體驗任務</span></h2>
    <p class="muted small" style="margin-top:-6px">參加者先選想體驗的資料庫、完成對應任務，達到門檻才能抽獎。資格由系統判斷，參加者沒辦法自己跳過。</p>
    <div class="notice warn" id="taskNeedBefore" hidden><span class="i">!</span><span>體驗任務要搭配「先登記再抽」，請到上方「登記設定」切換。</span></div>
    <div class="form-grid">
      <div class="field"><label>抽獎門檻</label>
        <select class="input" name="taskMode" ${dis}>
          <option value="none">不使用體驗任務（填資料就能抽）</option>
          <option value="any">完成任一任務</option>
          <option value="required_plus">完成所有必做＋至少 N 個選做</option>
        </select></div>
      <div class="field" id="taskNBox"><label>至少完成幾個選做任務（N）</label>
        <input class="input" type="number" name="taskMinOptional" min="0" max="30" ${dis}>
        <div class="hint">0＝只要完成所有必做任務</div></div>
    </div>
    <div id="taskBox" style="margin-top:16px">
      ${dis ? '' : `<div class="label" style="font-weight:500;font-size:14px">加入任務卡</div>
      <div class="muted small">下面列出這個客戶有訂的資料庫，點範本就會<b>複製</b>成這個活動的任務（之後修改不會影響範本）。</div>
      <div class="task-add" id="taskAdd"></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:14px 0 6px">
        <span class="small">同一組 PIN 套用到全部工作人員核銷任務：</span>
        <input class="input pin" id="pinAll" inputmode="numeric" maxlength="4" placeholder="1234" style="width:110px">
        <button type="button" class="btn sm" id="pinAllBtn">套用</button>
      </div>`}
      <div class="task-list" id="taskList"></div>
    </div>
  </section>`;
}

export async function bindTasks(root, form, ev, { ro, markDirty }) {
  const F = (n) => form.elements[n];
  F('taskMode').value = ev.taskMode || 'none';
  F('taskMinOptional').value = ev.taskMinOptional || 0;
  const dis = ro ? 'disabled' : '';
  let tasks = (ev.tasks || []).map((t) => ({ ...t, pin: '' }));
  let tpls = [];
  let cdbs = [];

  const sync = () => {
    const mode = F('taskMode').value;
    const regMode = (form.querySelector('input[name=regMode]:checked') || {}).value;
    $('#taskNBox', root).hidden = mode !== 'required_plus';
    $('#taskBox', root).hidden = mode === 'none' && !tasks.length;
    $('#taskNeedBefore', root).hidden = !(mode !== 'none' && regMode !== 'before');
  };

  const inherited = (t) => t.url ? '' : (t.clientUrl ? `沿用該校連結：${t.clientUrl}` : t.templateUrl ? `沿用範本預設連結：${t.templateUrl}` : '還沒有連結');

  const draw = () => {
    $('#taskList', root).innerHTML = tasks.length ? tasks.map((t, i) => `<div class="etask ${t.required ? 'req' : ''}" data-i="${i}">
      <div class="top">
        ${ro ? '' : '<span class="order"><button type="button" data-up title="上移">▲</button><button type="button" data-down title="下移">▼</button></span>'}
        <span class="db">${esc(t.dbName)}</span>
        <label class="check small"><input type="checkbox" data-k="required" ${t.required ? 'checked' : ''} ${dis}>必做</label>
        <span class="sp">
          <select class="input" data-k="verifyMethod" style="min-height:32px;width:auto;font-size:13px" ${dis}>
            <option value="staff_pin" ${t.verifyMethod === 'staff_pin' ? 'selected' : ''}>${VERIFY.staff_pin.short}</option>
            <option value="self_check" ${t.verifyMethod === 'self_check' ? 'selected' : ''}>${VERIFY.self_check.short}</option>
          </select>
          ${t.verifyMethod === 'staff_pin' ? `<input class="input pin" data-k="pin" inputmode="numeric" maxlength="4" value="${esc(t.pin)}" placeholder="${t.hasPin ? '已設定' : 'PIN'}" title="${t.hasPin ? '已設定 PIN，留空表示不變' : '請設定 4 位數 PIN'}" ${dis}>` : ''}
          ${ro ? '' : `<button type="button" class="btn sm ghost" data-del title="移除">${ICON.trash}</button>`}
        </span>
      </div>
      <input class="input" data-k="title" maxlength="100" value="${esc(t.title)}" placeholder="任務標題" ${dis}>
      <textarea class="input" data-k="description" maxlength="500" style="min-height:56px" placeholder="任務說明（選填）" ${dis}>${esc(t.description)}</textarea>
      <div class="form-grid">
        <div class="field"><input class="input" data-k="url" maxlength="500" value="${esc(t.url)}" placeholder="連結（留空＝沿用）" ${dis}><div class="hint">${esc(inherited(t))}</div></div>
        <div class="field"><input class="input" data-k="actionText" maxlength="30" value="${esc(t.actionText)}" placeholder="按鈕文字，例：前往 ${esc(t.dbName)}" ${dis}></div>
      </div>
    </div>`).join('') : '<div class="muted small">還沒有加入任務</div>';
    sync();
  };

  const drawAdd = () => {
    const box = $('#taskAdd', root);
    if (!box) return;
    const byDb = {};
    tpls.forEach((t) => { (byDb[key(t.dbName)] = byDb[key(t.dbName)] || []).push(t); });
    const tplBtn = (t) => `<button type="button" class="btn sm" data-add="${esc(t.templateId)}">${ICON.plus}${esc(t.title)}</button>`;
    const used = new Set(cdbs.map((c) => key(c.dbName)));
    const rows = cdbs.map((c) => `<div class="db"><b>${esc(c.dbName)}</b>
      ${(byDb[key(c.dbName)] || []).map(tplBtn).join('') || '<span class="muted">範本庫沒有這個資料庫的範本</span>'}
      ${c.url ? `<span class="muted">該校連結：${esc(c.url)}</span>` : ''}</div>`).join('');
    const others = tpls.filter((t) => !used.has(key(t.dbName)));
    box.innerHTML = (rows || `<div class="muted small">這個客戶還沒設定「訂購的資料庫」。可以到<a href="#/clients/${esc(F('clientId').value)}">客戶頁</a>設定，或從下方全部範本加入。</div>`) +
      (others.length ? `<details><summary class="small" style="cursor:pointer;color:var(--navy-700)">從其他資料庫的範本加入（${others.length}）</summary>
        <div class="db" style="margin-top:8px">${others.map((t) => `<button type="button" class="btn sm" data-add="${esc(t.templateId)}">${ICON.plus}${esc(t.dbName)}：${esc(t.title)}</button>`).join('')}</div></details>` : '');
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

  form.addEventListener('change', (e) => {
    if (['taskMode', 'regMode'].includes(e.target.name)) sync();
    const card = e.target.closest('.etask');
    if (!card) return;
    const t = tasks[card.dataset.i];
    if (e.target.dataset.k === 'required') { t.required = e.target.checked; draw(); }
    if (e.target.dataset.k === 'verifyMethod') { t.verifyMethod = e.target.value; draw(); }
  });
  form.addEventListener('input', (e) => {
    const card = e.target.closest('.etask');
    if (!card) return;
    const k = e.target.dataset.k;
    if (k === 'pin') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (['title', 'description', 'url', 'actionText', 'pin'].includes(k)) tasks[card.dataset.i][k] = e.target.value;
  });
  $('#taskBox', root).addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const t = tpls.find((x) => x.templateId === add.dataset.add);
      const c = cdbs.find((x) => key(x.dbName) === key(t.dbName));
      tasks.push({ eventTaskId: '', templateId: t.templateId, dbName: c ? c.dbName : t.dbName, title: t.title, description: t.description,
        dbIntro: t.dbIntro, actionText: t.actionText, url: '', verifyMethod: t.verifyMethod === 'self_check' ? 'self_check' : 'staff_pin',
        pin: '', hasPin: false, required: false, clientUrl: c ? c.url : '', templateUrl: t.defaultUrl });
      if (F('taskMode').value === 'none') F('taskMode').value = 'any';
      draw(); markDirty();
      toast(`已加入「${t.title}」`);
      return;
    }
    const card = e.target.closest('.etask');
    if (!card) return;
    const i = Number(card.dataset.i);
    if (e.target.closest('[data-del]')) { tasks.splice(i, 1); draw(); markDirty(); }
    const mv = e.target.closest('[data-up]') ? -1 : e.target.closest('[data-down]') ? 1 : 0;
    if (mv && tasks[i + mv]) { [tasks[i], tasks[i + mv]] = [tasks[i + mv], tasks[i]]; draw(); markDirty(); }
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
      const mode = F('taskMode').value;
      if (mode === 'none') return null;
      if (regMode !== 'before') return ['體驗任務要搭配「先登記再抽」，請到登記設定切換'];
      if (!tasks.length) return ['已開啟體驗任務門檻，請至少加入一個任務'];
      const bad = tasks.find((t) => t.verifyMethod === 'staff_pin' && !t.pin && !t.hasPin);
      if (bad) return [`「${bad.title}」是工作人員核銷，請設定 4 位數 PIN`];
      const badPin = tasks.find((t) => t.pin && !/^\d{4}$/.test(t.pin));
      if (badPin) return [`「${badPin.title}」的 PIN 要是 4 位數字`];
      return null;
    }
  };
}
