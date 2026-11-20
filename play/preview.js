/**
 * 後台「試玩」用的假資料與假抽獎。
 * ⚠️ 只在 ?preview= 時載入：不連後端、不寫任何紀錄，結果只是為了讓業務看看遊戲動畫。
 * 正式抽獎一律由後端 public.draw 決定。
 */
const SAMPLE = [
  { label: '頭獎', name: '保溫杯', quantity: 5, isSpecial: true, color: '#f27a2b' },
  { label: 'JoVE 影片', name: '一個月體驗', quantity: 10, color: '#038BA2' },
  { label: '精美好禮', name: '帆布袋', quantity: 20, color: '#1b2a52' },
  { label: '幸運獎', name: '貼紙組', quantity: 40, color: '#f8b07c' },
  { name: '再接再厲', quantity: 30, isLose: true, color: '#cfc8bd' }
];

let current = [];

export function previewData(gameType) {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('fed.preview') || 'null'); } catch (e) { /* 無痕模式 */ }
  const list = saved && saved.prizes && saved.prizes.length ? saved.prizes : SAMPLE;
  const prizes = list.map((p, i) => ({
    prizeId: 'p' + i, label: p.label || '', name: p.name || (p.isLose ? '銘謝惠顧' : '獎項 ' + (i + 1)), isLose: !!p.isLose, isSpecial: !!p.isSpecial,
    color: p.color || '', sortOrder: i + 1, quantity: Number(p.quantity) || 0, remaining: Number(p.quantity) || 0
  }));
  current = prizes;
  return {
    event: {
      eventCode: 'PREVIEW', title: (saved && saved.title) || '遊戲試玩', subtitle: '這是預覽畫面，結果隨機產生、不會留下任何紀錄',
      clientDisplayName: (saved && saved.client) || '', gameType: ['wheel', 'scratch', 'slot', 'gacha'].includes(gameType) ? gameType : 'wheel',
      drawMode: 'booth', regMode: 'none', soundDefault: 'on', isTestMode: false, regFields: null
    },
    prizes, state: 'open', identities: [], privacyText: ''
  };
}

export async function previewDraw() {
  await new Promise((r) => setTimeout(r, 600));
  const data = current;
  const pool = data.filter((p) => p.quantity > 0);
  const list = pool.length ? pool : data;
  const w = (p) => (pool.length ? p.quantity : 1);
  const total = list.reduce((s, p) => s + w(p), 0);
  let r = Math.random() * total;
  const prize = list.find((p) => (r -= w(p)) < 0) || list[0];
  return { drawId: 'preview', prize, limitReached: false };
}
