/**
 * 推廣頁（自助掃碼＋活動有開啟推廣頁時，抽完獎顯示在結果下方）
 * 每個推廣產品一張卡片＋一個按鈕：
 *   尚未購買 →「有興趣了解更多」：推薦給採購單位／了解更多資訊／試用產品／其他
 *   已購買   →「想學更多使用技巧」：推薦採購單位續訂／預約教育訓練／了解更多資訊／其他
 * 送出後寫入 Leads（後端會再依產品設定檢查可選的項目）
 */
import { api } from '../assets/js/api.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ARROW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';

const FLOW = {
  notOwned: {
    button: '有興趣了解更多',
    title: (n) => `想更了解 ${n}`,
    options: [
      ['recommend', '我想推薦給採購單位', '一句話推薦（選填）', '例：臨床查證很需要，希望圖書館能採購'],
      ['info', '我有興趣了解更多資訊'],
      ['trial', '我有興趣試用產品'],
      ['other', '其他', '請簡單說明您的需求', '']
    ]
  },
  owned: {
    button: '想學更多使用技巧',
    title: (n) => `把 ${n} 用得更好`,
    options: [
      ['recommend', '我想推薦採購單位續訂', '一句話推薦（選填）', '例：每天查文獻都會用到，希望明年繼續訂'],
      ['training', '我想預約教育訓練／使用說明'],
      ['info', '我有興趣了解更多資訊'],
      ['other', '其他', '請簡單說明您的需求', '']
    ]
  }
};

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

  const home = (focusIdx) => {
    wrap.innerHTML = `
      <div class="p-promo-head"><span class="spark">✦</span>
        <h2>${o.won ? `恭喜抽中「${esc(o.prizeName)}」！` : '謝謝您的參與！'}</h2>
        <p>也來看看這些好用的醫學資源 👇</p></div>
      <div class="p-products">${products.map((p, i) => {
        const f = p.owned ? FLOW.owned : FLOW.notOwned;
        return `<article class="p-product ${p.owned ? 'owned' : ''}">
          <div class="p-product-top"><h3>${esc(p.name)}</h3>${p.owned ? '<span class="tag">貴單位已採購</span>' : ''}</div>
          ${p.intro ? `<p>${esc(p.intro)}</p>` : ''}
          ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">產品介紹 ${ARROW}</a>` : ''}
          ${done[i] ? '<div class="p-done">✅ 已收到，業務將與您聯繫</div>' : ''}
          <button class="p-btn ${p.owned ? 'navy' : ''} sm" data-i="${i}">${done[i] ? '再填一份' : f.button}</button>
        </article>`;
      }).join('')}</div>`;
    wrap.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => form(Number(b.dataset.i))));
    if (focusIdx !== undefined) wrap.querySelectorAll('.p-product')[focusIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const form = (idx) => {
    const p = products[idx];
    const flow = p.owned ? FLOW.owned : FLOW.notOwned;
    const r = o.reg || {};
    wrap.innerHTML = `<h2>${esc(flow.title(p.name))}</h2>
      <p class="lead">選擇您需要的協助，業務會儘快與您聯繫。</p>
      <form class="p-form" novalidate>
        <div class="p-field"><span class="lbl">您想要<span class="req">*</span></span>
          <div class="p-options">${flow.options.map(([k, label]) => `<label class="p-opt"><input type="radio" name="type" value="${k}"><span>${label}</span></label>`).join('')}</div></div>
        <div class="p-field" data-msg hidden><label for="ld_msg"></label><textarea class="p-input" id="ld_msg" name="message" maxlength="500"></textarea></div>
        <div class="p-field"><label for="ld_name">姓名<span class="req">*</span></label><input class="p-input" id="ld_name" name="name" autocomplete="name" maxlength="50" value="${esc(r.name)}"></div>
        <div class="p-field"><label for="ld_org">服務單位</label><input class="p-input" id="ld_org" name="organization" autocomplete="organization" maxlength="100" value="${esc(r.organization)}"></div>
        <div class="p-field"><label for="ld_email">Email</label><input class="p-input" id="ld_email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="200" value="${esc(r.email)}"></div>
        <div class="p-field"><label for="ld_phone">手機</label><input class="p-input" id="ld_phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="20" placeholder="09xxxxxxxx" value="${esc(r.phone)}">
          <span style="font-size:12.5px;color:var(--text-muted)">Email 與手機至少填一項</span></div>
        <div class="p-field"><label for="ld_note">備註</label><textarea class="p-input" id="ld_note" name="note" maxlength="1000" placeholder="方便聯絡的時間等（選填）"></textarea></div>
        <div class="err"></div>
        <button class="p-btn" type="submit">送出</button>
        <button class="p-btn ghost" type="button" data-back>返回</button>
      </form>`;
    const f = wrap.querySelector('form');
    const msgBox = f.querySelector('[data-msg]');
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    f.querySelector('[data-back]').addEventListener('click', () => home(idx));
    f.addEventListener('change', (e) => {
      if (e.target.name !== 'type') return;
      const opt = flow.options.find((x) => x[0] === e.target.value);
      msgBox.hidden = !opt[2];
      if (opt[2]) {
        msgBox.querySelector('label').innerHTML = opt[0] === 'other' ? `${opt[2]}<span class="req">*</span>` : opt[2];
        msgBox.querySelector('textarea').placeholder = opt[3] || '';
      }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (n) => f.elements[n].value.trim();
      const type = (f.querySelector('input[name=type]:checked') || {}).value || '';
      const err = f.querySelector('.err');
      const bad = !type ? '請選擇您想要的協助'
        : type === 'other' && !v('message') ? '請簡單說明您的需求'
          : !v('name') ? '請填寫姓名'
            : !v('email') && !v('phone') ? '請至少留下 Email 或手機，方便業務與您聯繫'
              : v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email')) ? 'Email 格式不正確'
                : v('phone') && v('phone').replace(/\D/g, '').length < 8 ? '手機號碼格式不正確' : '';
      if (bad) { err.innerHTML = `<div class="p-err">${esc(bad)}</div>`; return; }
      const btn = f.querySelector('[type=submit]');
      btn.classList.add('busy');
      err.innerHTML = '';
      try {
        await api('public.submitLead', {
          eventCode: o.eventCode, productName: p.name, type, message: msgBox.hidden ? '' : v('message'),
          name: v('name'), organization: v('organization'), email: v('email'), phone: v('phone'), note: v('note'),
          participantId: o.participantId || ''
        });
        done[idx] = true;
        home(idx);
      } catch (ex) {
        err.innerHTML = `<div class="p-err">${esc(ex.message)}</div>`;
      } finally {
        btn.classList.remove('busy');
      }
    });
  };

  home();
}
