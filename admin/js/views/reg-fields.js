/** 登記欄位設定元件（系統設定與活動編輯共用） */
import { $, $$, esc, ICON } from '../ui.js';

export const FIELD_LABELS = {
  name: '姓名',
  email: 'Email',
  phone: '手機',
  organization: '服務單位／就讀學校',
  identity: '身分（醫師／護理師／老師／學生／館員／其他）'
};
const STATES = [['required', '顯示且必填'], ['optional', '顯示選填'], ['hidden', '隱藏']];
const Q_TYPES = [['text', '簡答'], ['single', '單選'], ['multi', '複選']];

let seq = 0;

function customQHtml(q, editable) {
  const id = 'cq' + (++seq);
  const dis = editable ? '' : 'disabled';
  return `<div class="custom-q" data-qid="${esc(q.id || '')}">
    <div class="row">
      <input class="input" data-k="label" value="${esc(q.label || '')}" placeholder="題目，例如：您目前使用哪些資料庫？" style="flex:1;min-width:200px" ${dis}>
      <select class="input" data-k="type" style="width:auto" ${dis}>
        ${Q_TYPES.map(([v, l]) => `<option value="${v}" ${q.type === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <label class="check"><input type="checkbox" data-k="required" ${q.required ? 'checked' : ''} ${dis}>必填</label>
      ${editable ? `<button type="button" class="btn sm ghost" data-del title="刪除題目">${ICON.trash}</button>` : ''}
    </div>
    <div class="field" data-opts ${q.type === 'text' || !q.type ? 'hidden' : ''}>
      <label for="${id}">選項（一行一個）</label>
      <textarea class="input" id="${id}" data-k="options" style="min-height:80px" placeholder="UpToDate&#10;ClinicalKey&#10;其他" ${dis}>${esc((q.options || []).join('\n'))}</textarea>
    </div>
  </div>`;
}

export function regFieldsHtml(rf, { editable = true } = {}) {
  rf = rf || { fields: {}, custom: [] };
  const dis = editable ? '' : 'disabled';
  const rows = Object.keys(FIELD_LABELS).map((k) => {
    const v = (rf.fields || {})[k] || 'optional';
    return `<div class="reg-field"><span class="name">${FIELD_LABELS[k]}</span>
      <div class="seg" role="radiogroup" aria-label="${FIELD_LABELS[k]}">
        ${STATES.map(([s, l]) => `<label><input type="radio" name="rf_${k}_${seq}" data-field="${k}" value="${s}" ${v === s ? 'checked' : ''} ${dis}><span>${l}</span></label>`).join('')}
      </div></div>`;
  }).join('');
  seq++;
  return `<div class="reg-fields">${rows}</div>
    <div style="margin-top:16px">
      <div class="label" style="font-weight:500;font-size:14px;margin-bottom:8px">自訂題目</div>
      <div class="custom-list" style="display:grid;gap:10px">${(rf.custom || []).map((q) => customQHtml(q, editable)).join('')}</div>
      ${editable ? `<button type="button" class="btn sm" data-add-q style="margin-top:10px">${ICON.plus}新增自訂題目</button>` : ''}
      ${!editable && !(rf.custom || []).length ? '<div class="muted small">沒有自訂題目</div>' : ''}
    </div>
    <div class="muted small" style="margin-top:12px">個資同意（必勾）與「我想接收產品資訊」（選填、預設不勾）會固定出現在登記表最下方。</div>`;
}

export function bindRegFields(box, onChange = () => {}) {
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-q]')) {
      $('.custom-list', box).insertAdjacentHTML('beforeend', customQHtml({ type: 'text' }, true));
      $('.custom-list .custom-q:last-child input', box).focus();
      onChange();
    }
    const del = e.target.closest('[data-del]');
    if (del) { del.closest('.custom-q').remove(); onChange(); }
  });
  box.addEventListener('change', (e) => {
    if (e.target.dataset.k === 'type') {
      e.target.closest('.custom-q').querySelector('[data-opts]').hidden = e.target.value === 'text';
    }
    onChange();
  });
  box.addEventListener('input', onChange);
}

export function readRegFields(box) {
  const fields = {};
  $$('input[data-field]:checked', box).forEach((i) => { fields[i.dataset.field] = i.value; });
  const custom = $$('.custom-q', box).map((q) => {
    const type = $('[data-k=type]', q).value;
    return {
      id: q.dataset.qid || '',
      label: $('[data-k=label]', q).value.trim(),
      type,
      options: type === 'text' ? [] : $('[data-k=options]', q).value.split('\n').map((s) => s.trim()).filter(Boolean),
      required: $('[data-k=required]', q).checked
    };
  }).filter((q) => q.label);
  return { fields, custom };
}
