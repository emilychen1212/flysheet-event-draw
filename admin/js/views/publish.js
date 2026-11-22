/** 發布區塊：抽獎頁、展示頁網址與 QR code */
import { $, esc, toast, ICON } from '../ui.js';

function urlOf(code, screen) {
  const u = new URL('../play/', location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('event', code);
  if (screen) u.searchParams.set('view', 'screen');
  return u.toString();
}

export function publishHtml(ev) {
  const play = urlOf(ev.eventCode);
  const screen = urlOf(ev.eventCode, true);
  const warn = ev.isTestMode ? '<div class="notice warn" style="margin-bottom:14px"><span class="i">!</span><span>測試模式開啟中：前台會顯示「測試中」，資料不計入報表。正式開始前請關閉。</span></div>'
    : ev.status === 'draft' ? '<div class="notice" style="margin-bottom:14px"><span class="i">i</span><span>活動還是草稿，前台會顯示「活動尚未開放」。要開始抽獎時，請把狀態改成「進行中」。</span></div>' : '';
  return `<h2 class="card-title"><span><span class="num">9</span>發布</span></h2>
    ${warn}
    <div class="publish">
      <div class="qr"><canvas id="qrCanvas" width="400" height="400" aria-label="抽獎頁 QR code"></canvas>
        <button type="button" class="btn sm accent" id="btnQrPng" style="margin-top:10px;width:100%">${ICON.download}下載 QR code（PNG）</button>
        <div class="muted" style="font-size:12px;margin-top:6px">1200 × 1200 高解析，可印海報</div></div>
      <div style="display:grid;gap:16px">
        <div class="field"><label>抽獎頁（給參與者）</label>
          <div class="url-row"><input class="input" readonly value="${esc(play)}">
            <button type="button" class="btn icon" data-copy="${esc(play)}" title="複製">${ICON.copy}</button>
            <a class="btn icon" href="${esc(play)}" target="_blank" rel="noopener" title="開啟">${ICON.external}</a></div>
          <div class="hint">QR code 連到這個網址。攤位操作時，用筆電或平板直接開啟這頁。</div></div>
        <div class="field"><label>展示頁（攤位大螢幕）</label>
          <div class="url-row"><input class="input" readonly value="${esc(screen)}">
            <button type="button" class="btn icon" data-copy="${esc(screen)}" title="複製">${ICON.copy}</button>
            <a class="btn icon" href="${esc(screen)}" target="_blank" rel="noopener" title="開啟">${ICON.external}</a></div>
          <div class="hint">顯示大 QR code 與各獎項剩餘數量，每 30 秒自動更新。</div></div>
      </div>
    </div>`;
}

/** 依網址畫 QR code 到 canvas；size 為輸出像素，margin 為留白格數 */
export function drawQr(canvas, text, size, margin = 4) {
  if (!window.qrcode) throw new Error('QR code 元件尚未載入，請重新整理頁面');
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cell = Math.floor(size / (n + margin * 2));
  const offset = Math.floor((size - cell * n) / 2);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#14203f';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(offset + c * cell, offset + r * cell, cell, cell);
  }
  return canvas;
}

export function bindPublish(box, ev) {
  const play = urlOf(ev.eventCode);
  const render = () => {
    try { drawQr($('#qrCanvas', box), play, 400); } catch (e) { setTimeout(render, 300); }
  };
  render();
  box.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) {
      try { await navigator.clipboard.writeText(c.dataset.copy); toast('已複製網址'); } catch (err) { toast('無法自動複製，請手動選取', 'err'); }
    }
    if (e.target.closest('#btnQrPng')) {
      const canvas = drawQr(document.createElement('canvas'), play, 1200);
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `QR_${ev.eventCode}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, 'image/png');
    }
  });
}
