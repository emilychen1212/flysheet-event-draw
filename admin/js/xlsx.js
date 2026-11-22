/**
 * 匯出 Excel（用 SheetJS 在瀏覽器產生 .xlsx，第一次使用時才下載元件）
 *   exportXlsx('檔名.xlsx', [{ name: '工作表名稱', rows: [{欄位: 值}], widths: [12, 20] }])
 */
const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let loading = null;

export function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { loading = null; reject(new Error('Excel 元件載入失敗，請檢查網路後再試一次')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export async function exportXlsx(filename, sheets) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  sheets.forEach((sh) => {
    const ws = sh.aoa ? XLSX.utils.aoa_to_sheet(sh.aoa) : XLSX.utils.json_to_sheet(sh.rows.length ? sh.rows : [{ '（沒有資料）': '' }]);
    const keys = sh.aoa ? [] : Object.keys(sh.rows[0] || {});
    ws['!cols'] = (sh.widths || keys.map((k) => Math.max(10, Math.min(40, k.length * 2 + 4)))).map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

/** 檔名用的日期 yyyyMMdd */
export function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
