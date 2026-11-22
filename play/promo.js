/**
 * 推廣頁（自助掃碼＋活動有開啟推廣頁時，抽完獎顯示在結果下方）
 * 推廣產品卡片 →「申請產品試用」「有興趣了解產品資訊」→ 簡短表單 → 寫入 Leads
 */
import { api } from '../assets/js/api.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPES = {
  trial: { label: '申請產品試用', title: '申請產品試用', lead: '留下聯絡方式，業務會協助您開通試用帳號。' },
  info: { label: '有興趣了解產品資訊', title: '了解產品資訊', lead: '留下聯絡方式，業務會提供產品介紹與相關資料。' }
};
const ARROW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';

/**
 * @param {HTMLElement} box   放推廣頁的容器
 * @param {object} o          { eventCode, products, won, prizeName, reg: 登記資料（可空）, participantId }
 */
export function renderPromo(box, o) {
  const products = (o.products || []).filter((p) => p.name);
  if (!products.length) return;
  const done = {};
  const wrap = document.createElement('section');
  wrap.className = 'panel p-promo';
  box.appendChild(wrap);

  const home = () => {
    wrap.innerHTML = `
      <div class="p-promo-head"><span class="spark">✦</span>
        <h2>${o.won ? `恭喜抽中「${esc(o.prizeName)}」！` : '謝謝您的參與！'}</h2>
        <p>也來看看這些好用的醫學資源 👇</p></div>
      <div class="p-products">${products.map((p) => `<article class="p-product">
        <h3>${esc(p.name)}</h3>${p.intro ? `<p>${esc(p.intro)}</p>` : ''}
        ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">產品介紹 ${ARROW}</a>` : ''}</article>`).join('')}</div>
      <div class="p-promo-actions">
        ${Object.entries(TYPES).map(([k, t]) => done[k]
          ? `<div class="p-done">✅ 已收到「${t.title}」，業務將與您聯繫</div>`
          : `<button class="p-btn ${k === 'trial' ? '' : 'navy'}" data-type="${k}">${t.label}</button>`).join('')}
      </div>`;
    wrap.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => form(b.dataset.type)));
  };

  const form = (type) => {
    const t = TYPES[type];
    const r = o.reg || {};
    wrap.innerHTML = `<h2>${t.title}</h2><p class="lead">${t.lead}</p>
      <form class="p-form" novalidate>
        <div class="p-field"><label for="ld_name">姓名<span class="req">*</span></label><input class="p-input" id="ld_name" name="name" autocomplete="name" maxlength="50" value="${esc(r.name)}"></div>
        <div class="p-field"><label for="ld_org">服務單位</label><input class="p-input" id="ld_org" name="organization" autocomplete="organization" maxlength="100" value="${esc(r.organization)}"></div>
        <div class="p-field"><label for="ld_email">Email</label><input class="p-input" id="ld_email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="200" value="${esc(r.email)}"></div>
        <div class="p-field"><label for="ld_phone">手機</label><input class="p-input" id="ld_phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="20" placeholder="09xxxxxxxx" value="${esc(r.phone)}">
          <span style="font-size:12.5px;color:var(--text-muted)">Email 與手機至少填一項</span></div>
        <div class="p-field"><span class="lbl">想了解的產品<span class="req">*</span><span style="font-weight:400;font-size:12.5px;color:var(--text-muted)">（可複選）</span></span>
          <div class="chips">${products.map((p) => `<label class="chip"><input type="checkbox" name="product" value="${esc(p.name)}" ${products.length === 1 ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}</div></div>
        <div class="p-field"><label for="ld_note">備註</label><textarea class="p-input" id="ld_note" name="note" maxlength="1000" placeholder="想詢問的問題、方便聯絡的時間等（選填）"></textarea></div>
        <div class="err"></div>
        <button class="p-btn" type="submit">送出</button>
        <button class="p-btn ghost" type="button" data-back>返回</button>
      </form>`;
    const f = wrap.querySelector('form');
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    f.querySelector('[data-back]').addEventListener('click', home);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (n) => f.elements[n].value.trim();
      const picked = Array.from(f.querySelectorAll('input[name=product]:checked')).map((i) => i.value);
      const err = f.querySelector('.err');
      const bad = !v('name') ? '請填寫姓名'
        : !v('email') && !v('phone') ? '請至少留下 Email 或手機，方便業務與您聯繫'
          : v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email')) ? 'Email 格式不正確'
            : v('phone') && v('phone').replace(/\D/g, '').length < 8 ? '手機號碼格式不正確'
              : !picked.length ? '請選擇想了解的產品' : '';
      if (bad) { err.innerHTML = `<div class="p-err">${esc(bad)}</div>`; return; }
      const btn = f.querySelector('[type=submit]');
      btn.classList.add('busy');
      err.innerHTML = '';
      try {
        await api('public.submitLead', {
          eventCode: o.eventCode, type, productName: picked.join('、'), name: v('name'), organization: v('organization'),
          email: v('email'), phone: v('phone'), note: v('note'), participantId: o.participantId || ''
        });
        done[type] = true;
        home();
        wrap.querySelector('.p-done')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (ex) {
        err.innerHTML = `<div class="p-err">${esc(ex.message)}</div>`;
      } finally {
        btn.classList.remove('busy');
      }
    });
  };

  home();
}
