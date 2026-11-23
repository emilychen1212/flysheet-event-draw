/**
 * 前台體驗任務：選擇資料庫 → 任務卡 → 驗證（工作人員 PIN／自行勾選）→ 達到門檻 → 抽獎
 * 進度與資格一律由後端回傳，前端只負責顯示；PIN 由後端比對。
 */
import { api, getToken } from '../assets/js/api.js';
import { sfx } from './sound.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ARROW = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';

const PT_KEY = (code) => 'fed.pt.' + code;
/** 資料庫名稱比對：不分大小寫、忽略多餘空白（和後端一致） */
const dbKey = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
export function savePt(code, pt) { try { pt ? localStorage.setItem(PT_KEY(code), pt) : localStorage.removeItem(PT_KEY(code)); } catch (e) { /* 無痕模式 */ } }
export function loadPt(code) { try { return localStorage.getItem(PT_KEY(code)) || ''; } catch (e) { return ''; } }

/** 規則一律由任務卡的必做／選做決定（數字來自後端的進度） */
function rulesText(p) {
  const req = p.requiredTotal || 0;
  const n = p.optionalNeed || 0;
  if (req && n) return `完成 ${req} 個必做任務＋任選 ${n} 個選做任務，就能參加抽獎`;
  if (req) return `完成 ${req} 個必做任務，就能參加抽獎`;
  return n === 1 ? '任選 1 個任務完成，就能參加抽獎' : `任選 ${n} 個任務完成，就能參加抽獎`;
}

function progressText(p) {
  if (p.eligible) return '🎉 已達抽獎資格！';
  if (p.requiredLeft && p.optionalLeft) return `還差 <b>${p.requiredLeft}</b> 個必做、<b>${p.optionalLeft}</b> 個選做任務就能抽獎`;
  if (p.requiredLeft) return `還差 <b>${p.requiredLeft}</b> 個必做任務就能抽獎`;
  if (p.requiredTotal) return `必做都完成了！再完成 <b>${p.optionalLeft}</b> 個選做就能抽獎`;
  return `再完成 <b>${p.optionalLeft}</b> 個任務就能抽獎`;
}

/**
 * @param {HTMLElement} stage
 * @param {object} o  { code, data: public.getEvent, state: 後端狀態, pt, onReady(ticket), onRestart(), onLimit(message) }
 */
export function renderTasks(stage, o) {
  const ev = o.data.event;
  const tasks = o.data.tasks || [];
  let state = o.state;
  const dbs = [];
  tasks.forEach((t) => {
    let d = dbs.find((x) => dbKey(x.dbName) === dbKey(t.dbName));
    if (!d) { d = { dbName: t.dbName, intro: t.dbIntro, required: false, count: 0 }; dbs.push(d); }
    d.count++;
    if (t.required) d.required = true;
    if (!d.intro && t.dbIntro) d.intro = t.dbIntro;
  });

  const apply = (st) => {
    state = st;
    if (st.progress.eligible && st.limitReached) return o.onLimit(st.message);
    list();
  };

  /* ---------- 步驟 1：選擇想體驗的資料庫 ---------- */
  const choose = () => {
    const chosen = new Set((state.selectedDbs || dbs.filter((d) => d.required).map((d) => d.dbName)).map(dbKey));
    stage.innerHTML = `<div class="panel t-panel">
      <div class="t-step">步驟 1／2</div>
      <h2>選擇想體驗的資料庫 🔍</h2>
      <p class="lead">可以複選。${esc(rulesText(state.progress))}。</p>
      <div class="t-dbs">${dbs.map((d) => `<label class="t-db ${d.required ? 'req' : ''}">
        <input type="checkbox" value="${esc(d.dbName)}" ${chosen.has(dbKey(d.dbName)) || d.required ? 'checked' : ''} ${d.required ? 'disabled' : ''}>
        <span class="box"><span class="nm">${esc(d.dbName)}${d.required ? '<em>必做</em>' : ''}${d.count > 1 ? `<small class="cnt">${d.count} 個任務</small>` : ''}</span>${d.intro ? `<span class="in">${esc(d.intro)}</span>` : ''}</span>
      </label>`).join('')}</div>
      <div id="tErr"></div>
      <button class="p-btn" id="tNext">下一步：查看任務</button>
    </div>`;
    stage.querySelector('#tNext').onclick = async (e) => {
      const btn = e.currentTarget;
      const picked = Array.from(stage.querySelectorAll('.t-db input:checked')).map((i) => i.value);
      if (!picked.length) { stage.querySelector('#tErr').innerHTML = '<div class="p-err">請至少選擇一個資料庫</div>'; return; }
      btn.classList.add('busy');
      try { apply(await api('public.selectDbs', { eventCode: o.code, pt: o.pt, dbs: picked })); } catch (err) { handleErr(err, stage.querySelector('#tErr')); } finally { btn.classList.remove('busy'); }
    };
    window.scrollTo({ top: 0 });
  };

  /* ---------- 步驟 2：任務卡 ---------- */
  const list = () => {
    const sel = new Set((state.selectedDbs || []).concat(dbs.filter((d) => d.required).map((d) => d.dbName)).map(dbKey));
    const done = new Set(state.progress.completed);
    const shown = tasks.filter((t) => t.required || sel.has(dbKey(t.dbName)));
    const p = state.progress;
    const total = Math.max(1, (p.requiredTotal || 0) + (p.optionalNeed || 0));
    const pct = p.eligible ? 100 : Math.round(Math.max(0, Math.min(1, (total - p.need) / total)) * 100);
    const optTag = p.optionalNeed ? `選做（任選 ${p.optionalNeed} 個）` : '選做（可不做）';
    stage.innerHTML = `<div class="panel t-panel">
      <div class="t-step">步驟 2／2</div>
      <div class="t-progress ${p.eligible ? 'ok' : ''}">
        <div class="t-ptext">${progressText(p)}</div>
        <div class="t-bar"><i style="width:${pct}%"></i></div>
        <div class="t-rule">${esc(rulesText(p))}</div>
      </div>
      ${p.eligible ? '<button class="p-btn t-go" id="tGo">開始抽獎！</button>' : ''}
      <div class="t-cards">${shown.map((t) => {
        const ok = done.has(t.eventTaskId);
        return `<article class="t-card ${ok ? 'done' : ''} ${t.required ? 'req' : ''}" data-id="${esc(t.eventTaskId)}">
          <div class="t-top"><span class="db">${esc(t.dbName)}</span>${t.required ? '<span class="tag req">必做</span>' : `<span class="tag">${optTag}</span>`}${ok ? '<span class="tag ok">✓ 已完成</span>' : ''}</div>
          <h3>${esc(t.title)}</h3>
          ${t.description ? `<p>${esc(t.description)}</p>` : ''}
          ${t.url ? `<a class="t-open" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.actionText || '前往 ' + t.dbName)} ${ARROW}</a>` : ''}
          ${ok ? '' : t.verifyMethod === 'staff_pin'
            ? '<button class="p-btn navy t-verify" data-pin>完成了！交給工作人員核銷</button>'
            : '<button class="p-btn navy t-verify" data-self>我完成了</button>'}
        </article>`;
      }).join('') || '<div class="muted">沒有任務</div>'}</div>
      <div id="tErr"></div>
      ${dbs.some((d) => !d.required) ? '<button class="t-link" id="tChange">修改想體驗的資料庫</button>' : ''}
    </div>`;
    stage.querySelector('#tGo')?.addEventListener('click', () => { sfx.click(); o.onReady(state.ticket); });
    stage.querySelector('#tChange')?.addEventListener('click', choose);
    stage.querySelectorAll('.t-card').forEach((card) => {
      const task = tasks.find((t) => t.eventTaskId === card.dataset.id);
      card.querySelector('[data-pin]')?.addEventListener('click', () => pinPad(task));
      card.querySelector('[data-self]')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.classList.add('busy');
        try { apply(await api('public.completeTask', { eventCode: o.code, pt: o.pt, eventTaskId: task.eventTaskId })); sfx.win(); }
        catch (err) { handleErr(err, stage.querySelector('#tErr')); btn.classList.remove('busy'); }
      });
    });
  };

  /* ---------- 工作人員輸入 PIN ---------- */
  const pinPad = (task) => {
    let pin = '';
    let busy = false;
    const ov = document.createElement('div');
    ov.className = 't-pin';
    ov.innerHTML = `<div class="t-pin-box" role="dialog" aria-modal="true" aria-label="工作人員核銷">
      <div class="t-pin-hd">🔐 工作人員核銷</div>
      <div class="t-pin-task">${esc(task.dbName)}｜${esc(task.title)}</div>
      <div class="t-dots">${'<i></i>'.repeat(4)}</div>
      <div class="t-pin-msg">請工作人員輸入 4 位數核銷碼</div>
      <div class="t-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-n="${n}">${n}</button>`).join('')}
        <button data-c class="fn">清除</button><button data-n="0">0</button><button data-b class="fn" aria-label="刪除">⌫</button></div>
      <button class="t-link" data-close>取消</button></div>`;
    document.body.appendChild(ov);
    const dots = () => ov.querySelectorAll('.t-dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const msg = (t, bad) => { const m = ov.querySelector('.t-pin-msg'); m.textContent = t; m.classList.toggle('bad', !!bad); };
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const submit = async () => {
      busy = true;
      msg('核銷中…');
      try {
        const st = await api('public.completeTask', { eventCode: o.code, pt: o.pt, eventTaskId: task.eventTaskId, pin, staffToken: getToken() });
        sfx.win();
        msg('✓ 核銷成功');
        ov.querySelector('.t-pin-box').classList.add('ok');
        setTimeout(() => { close(); apply(st); }, 700);
      } catch (err) {
        pin = '';
        dots();
        ov.querySelector('.t-pin-box').classList.remove('shake'); void ov.offsetWidth; ov.querySelector('.t-pin-box').classList.add('shake');
        msg(err.message, true);
        if (err.code === 'NEED_REGISTER') { setTimeout(() => { close(); o.onRestart(); }, 1200); }
      } finally { busy = false; }
    };
    const press = (k) => {
      if (busy) return;
      if (k === 'c') pin = '';
      else if (k === 'b') pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += k;
      sfx.click();
      dots();
      if (pin.length === 4) submit();
    };
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('b');
      else if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) { if (e.target === ov) close(); return; }
      if (b.dataset.close !== undefined) return close();
      if (b.dataset.n !== undefined) press(b.dataset.n);
      if (b.dataset.c !== undefined) press('c');
      if (b.dataset.b !== undefined) press('b');
    });
  };

  const handleErr = (err, box) => {
    if (err.code === 'NEED_REGISTER') return o.onRestart(err.message);
    if (box) box.innerHTML = `<div class="p-err">${esc(err.message)}</div>`;
  };

  // 第一次進來（還沒選過資料庫）先選資料庫；只有必做任務時直接看任務
  if (!state.selectedDbs && dbs.some((d) => !d.required)) choose();
  else apply(state);
}
