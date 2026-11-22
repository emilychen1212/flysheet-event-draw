# 飛資得擺攤活動管理系統（flysheet-event-draw）

讓每位業務可以建立客戶、設定擺攤活動的獎池與互動遊戲，現場用 QR code 讓參與者抽獎，並自動留下紀錄、產出成果報表。

- 後台：`https://emilychen1212.github.io/flysheet-event-draw/admin/`
- 抽獎頁：`https://emilychen1212.github.io/flysheet-event-draw/play/?event=活動代碼`
- 展示頁（攤位大螢幕）：`https://emilychen1212.github.io/flysheet-event-draw/play/?event=活動代碼&view=screen`
- API 測試台（排查問題用）：`https://emilychen1212.github.io/flysheet-event-draw/dev/api-test.html`

## 功能總覽

| 區域 | 功能 |
|---|---|
| 後台總覽 | 本月參與人數／抽獎次數／新增潛在客戶、進行中・即將開始・最近結束的活動卡片（快速開啟抽獎頁、展示頁、QR、報表） |
| 客戶 | 每位業務各自建立；有活動的客戶不能刪除 |
| 專案活動 | 基本資訊、協作人員、抽獎方式、遊戲形式（含試玩）、獎池（獎項標籤＋獎品）、登記設定、本次推廣產品、測試模式、發布（網址＋QR code）、複製活動 |
| 前台抽獎頁 | 四款遊戲：醫學知識抽抽樂、刮刮樂（古早風）、拉霸機（賭場風）、彩球機（可愛風）；登記三模式；特別獎慶祝動畫；音效 |
| 推廣頁 | 自助掃碼抽完獎後顯示推廣產品，依「已購買／尚未購買」提供不同需求表單 |
| 展示頁 | 攤位大螢幕：大 QR code＋各獎項剩餘數量，每 30 秒更新 |
| 潛在客戶 | 協助推薦採購（新購／續訂）、了解資訊、試用、教育訓練、其他；篩選、匯出 Excel |
| 成果報表 | 參與人數、抽獎次數、獎項發出、時段／單位／身分分布、產品資訊同意率、潛在客戶；匯出 Excel（4 個工作表）、16:9 成果圖卡 PNG |
| 使用者管理 | 白名單、角色（管理者／PM／業務）、停用（僅管理者） |
| 系統設定 | 個資同意聲明、預設登記欄位（僅管理者） |

### 角色與權限

| | 管理者 | 業務／PM |
|---|---|---|
| 自己建立或被指派協作的活動 | 可修改、看個資 | 可修改、看個資 |
| 其他人的活動 | 可修改、看個資 | 只能看設定與統計，看不到個資、不能匯出 |
| 刪除活動、修改協作人員 | 可以 | 只有活動建立者 |
| 使用者管理、系統設定 | 可以 | 不行 |

### 現場使用小提醒

- 活動開始前：把「活動狀態」改成「進行中」，並**關閉測試模式**；測試時抽走的獎品可以按「清除測試資料」還原。
- 每人每日可抽次數只由系統判斷（以 Email／手機辨識同一人），前台不會顯示剩餘次數。
- 一段時間沒人使用後，第一次開啟會比較慢（Google 需要 3～5 秒啟動），活動開始前先自己開一次抽獎頁。
- 直接在 Google 試算表手動改資料，最多 5 分鐘後才會反映到網站；從後台修改則立即生效。

## 系統架構

| 層 | 用什麼 | 放在哪 |
|---|---|---|
| 網頁（前台＋後台） | GitHub Pages（純 HTML/CSS/JS） | 這個 repo |
| API | Google Apps Script 網頁應用程式 | `gas/` 資料夾的程式碼，手動貼到 Apps Script |
| 資料庫 | Google Sheet | 你的 Google 雲端硬碟 |
| 登入 | Sign in with Google＋白名單 | Google Cloud Console |

> 中獎結果一律由 Apps Script 決定並寫入紀錄後才回傳，網頁只負責播動畫。

---

## 一、第一次安裝（照順序做）

### 步驟 1：建立 Google Sheet 並開啟 Apps Script

1. 到 [Google 試算表](https://sheets.google.com) 建立一份新的空白試算表，命名為「飛資得擺攤抽獎_資料庫」。
2. 上方選單「擴充功能」→「Apps Script」，會開啟一個新分頁。
3. 左上角把專案名稱改成「flysheet-event-draw API」。

### 步驟 2：貼上程式碼

`gas/` 資料夾裡有這些檔案，每一個都要在 Apps Script 裡建立同名檔案並貼上內容：

| 檔案 | 用途 |
|---|---|
| `Config.gs` | 系統設定（**要填寫**） |
| `Code.gs` | API 入口 |
| `Utils.gs` | 共用小工具 |
| `Db.gs` | 試算表讀寫 |
| `Setup.gs` | 初始化、個資聲明預設文字 |
| `Auth.gs` | 登入、使用者、系統設定 |
| `Clients.gs` | 客戶 |
| `Events.gs` | 活動、獎池、總覽統計 |
| `Public.gs` | 前台登記、抽獎、推廣表單 |
| `Leads.gs` | 潛在客戶名單 |
| `Reports.gs` | 成果報表 |

操作方式：

1. 左側「檔案」旁邊的 **＋** → 「指令碼」→ 輸入檔名（不用打 `.gs`）。
2. 把 GitHub 上對應檔案的內容**全部複製**，貼上取代原本的內容。
3. 預設的 `程式碼.gs`（或 `Code.gs`）直接貼上 `Code.gs` 的內容即可。
4. 全部貼完按 💾 儲存。

（選做）左側「專案設定 ⚙️」→ 時區選「(GMT+08:00) 台北」。

### 步驟 3：填寫 `Config.gs`

打開步驟 2 貼好的 `Config.gs` 檔案，在**原本的內容裡**找到下面這幾行，只改引號 `''` 中間的文字。
（下面只是節錄，不要把這幾行另外貼到別的檔案，否則會出現紅色波浪線的語法錯誤。）

```js
SHEET_ID: '',                 // 從試算表開的 Apps Script 可以留空
ADMIN_EMAIL: '你的 Gmail',     // 第一位管理者
ADMIN_NAME: 'Emily',
OAUTH_CLIENT_ID: '',          // 步驟 6 拿到後再回來填
```

> ⚠️ `Config.gs` 只在 Apps Script 裡填。repo 是公開的，不要把 email 存回 GitHub。

### 步驟 4：執行 `setup()` 並授權

1. 上方函式下拉選單選 `setup`，按「▶ 執行」。
2. 第一次會跳出「需要授權」→「審查權限」→ 選你的 Google 帳號。
3. 看到「Google 尚未驗證這個應用程式」→ 點「進階」→「前往 flysheet-event-draw API（不安全）」→「允許」。
   （這是你自己寫的程式，所以 Google 會這樣提醒，放心允許。）
4. 下方「執行記錄」出現「✅ 初始化完成！」就成功了。回到試算表，會看到 8 個工作表：Users、Clients、Events、Prizes、Participants、Draws、Leads、Settings。

> `setup()` 可以重複執行，不會清掉資料，只會補上缺少的東西。

### 步驟 5：部署成網頁應用程式，拿到 API 網址

1. 右上角「部署」→「新增部署作業」。
2. 左邊齒輪 ⚙️ →「網頁應用程式」。
3. 設定：
   - 說明：`第一版`
   - 執行身分：**我**
   - 誰可以存取：**所有人**
4. 按「部署」，複製「網頁應用程式網址」（以 `/exec` 結尾），等一下填到 `config.js`。
5. 把這個網址貼到瀏覽器打開，看到 `{"ok":true,...}` 就代表 API 正常。

### 步驟 6：建立 Google 登入用的 OAuth 用戶端 ID

1. 到 [Google Cloud Console](https://console.cloud.google.com/)，左上角專案選單 →「新增專案」，名稱 `flysheet-event-draw`，建立後切換到這個專案。
2. 左側選單「API 和服務」→「OAuth 同意畫面」（新版叫「Google Auth Platform」）：
   - 使用者類型：**外部**
   - 應用程式名稱：`飛資得擺攤抽獎系統`，使用者支援 email 與開發人員聯絡 email 填你的 Gmail
   - 範圍（Scopes）不用加任何東西，一路「儲存並繼續」
   - 最後在「發布狀態」按 **「發布應用程式」→ 正式版**。
     （只用基本的登入資訊，不需要 Google 審查；如果維持「測試中」，只有加入測試使用者名單的人能登入。）
3. 左側「憑證」→「建立憑證」→「OAuth 用戶端 ID」：
   - 應用程式類型：**網頁應用程式**
   - 名稱：`flysheet-event-draw 網頁`
   - 已授權的 JavaScript 來源 → 新增 URI：`https://emilychen1212.github.io`
     （注意：**不要**加結尾的斜線或後面的路徑）
   - 已授權的重新導向 URI：不用填
4. 建立後複製「用戶端 ID」（以 `.apps.googleusercontent.com` 結尾）。

### 步驟 7：把兩個值填好

1. **Apps Script 的 `Config.gs`**：`OAUTH_CLIENT_ID` 填上步驟 6 的用戶端 ID → 儲存 → **重新部署**（見下方「二、更新程式」）。
2. **GitHub 的 `config.js`**：

```js
window.APP_CONFIG = {
  GAS_URL: '步驟 5 的 /exec 網址',
  GOOGLE_CLIENT_ID: '步驟 6 的用戶端 ID'
};
```

在 GitHub 網頁上打開 `config.js` → 右上角鉛筆 ✏️ 編輯 → 填好 →「Commit changes」。（或請 Claude 幫你改並推上去。）

### 步驟 8：開啟 GitHub Pages

1. GitHub repo 頁面 →「Settings」→ 左側「Pages」。
2. Source 選「Deploy from a branch」，Branch 選 `main`、資料夾 `/ (root)` → Save。
3. 等 1～2 分鐘，網址會是 `https://emilychen1212.github.io/flysheet-event-draw/`。

### 步驟 9：確認可以使用

1. 打開後台 `https://emilychen1212.github.io/flysheet-event-draw/admin/`，用管理者的 Google 帳號登入。
2. 「客戶」新增一個客戶 →「專案活動」建立活動，開啟測試模式 → 儲存。
3. 在活動的「發布」區打開抽獎頁，登記並抽一次；回到 Google Sheet 看 Draws 工作表有沒有多一筆。
4. 回後台按「清除測試資料」，Prizes 的 remaining 會還原。
5. 用一個**不在白名單**的 Google 帳號登入 → 應該顯示「不在使用名單中」。

> 有狀況時可以用 API 測試台（`/dev/api-test.html`）逐項檢查連線、登入是否正常。

---

## 二、更新程式後重新部署 Apps Script

改了 `gas/` 的程式碼、貼進 Apps Script 之後，**一定要重新部署**才會生效：

**維持同一個網址（建議，平常都用這個）**

1. 「部署」→「管理部署作業」。
2. 選目前的部署 → 右上角鉛筆 ✏️「編輯」。
3. 「版本」下拉選 **「新版本」** → 「部署」。
4. 網址不變，`config.js` 不用改。

**新增部署作業（會產生新網址）**

只有想保留舊版本同時測試新版時才用。新網址要記得更新到 `config.js`。

> 只改 `Config.gs` 也要重新部署。只執行 `setup()` 不用重新部署。

**用 clasp 一鍵更新（Claude 目前用這個方式）**

本機的 `.deploy/` 資料夾（不會上傳 GitHub）放著填好 email 的 `Config.gs` 和 `.clasp.json`。從 `gas/` 複製其他檔案進去後執行：

```bash
cd .deploy && clasp push -f && clasp update-deployment <部署 ID>
```

部署 ID 就是 GAS 網址 `/macros/s/` 和 `/exec` 中間那段，網址不會變。新版本新增的欄位會自動補到試算表，不用重跑 `setup()`。

---

## 三、交接與轉移到其他帳號

整個系統由三個部分組成，可以分開轉移：

### Google Sheet＋Apps Script（綁在一起）

- **方法 A：轉移擁有權**（同為個人 Gmail 時）：試算表「共用」→ 加入對方為編輯者 → 再把對方設為「擁有者」。Apps Script 跟著試算表走。轉移後對方要：重新執行 `setup()` 授權、重新「新增部署作業」（網址會變）。
- **方法 B：建立副本**（轉到公司 Google Workspace 時建議）：對方登入公司帳號 →「檔案」→「建立副本」（Apps Script 會一起複製）→ 在副本的 Apps Script 修改 `Config.gs` → 執行 `setup()` → 新增部署作業 → 把新網址填到 `config.js`。
- 轉移後若管理者換人，到後台「使用者管理」新增新管理者，或在 `Config.gs` 改 `ADMIN_EMAIL` 後執行 `setup()`。

### OAuth 用戶端 ID

- 在新的 Google Cloud 專案重做「步驟 6」，把新的用戶端 ID 同時填到 `Config.gs`（記得重新部署）和 `config.js`。
- 若網站網址變了（例如換成公司的 GitHub），「已授權的 JavaScript 來源」要改成新的網域。

### GitHub repo

- 轉給公司的 GitHub Organization：repo「Settings」→ 最下方「Transfer ownership」→ 輸入 Organization 名稱。
- 轉移後網址會變成 `https://組織名稱.github.io/flysheet-event-draw/`，記得：
  1. 到新 repo 重新開啟 Pages（步驟 8）。
  2. 把新網域加入 OAuth 的「已授權的 JavaScript 來源」。
  3. 已印出的 QR code 會失效，需要重新下載列印。

---

## 四、常見問題

**Q：網頁顯示「連線失敗」或主控台出現 CORS 錯誤**
- 確認 `config.js` 的 `GAS_URL` 是 `/exec` 結尾（不是 `/dev`）。
- 確認部署時「誰可以存取」選的是「**所有人**」。
- 改過程式後有沒有「重新部署新版本」。
- 把 GAS 網址直接貼到瀏覽器，有看到 `{"ok":true...}` 嗎？沒有的話是部署有問題。

**Q：按 Google 登入沒反應、或出現「origin_mismatch」「不允許的來源」**
- OAuth 用戶端的「已授權的 JavaScript 來源」要是 `https://emilychen1212.github.io`（沒有結尾斜線、沒有路徑）。
- 改完設定要等 5 分鐘左右才生效。

**Q：登入後顯示「不在使用名單中」**
- 請管理者到後台「使用者管理」新增這個 Gmail，狀態設為「啟用」。
- 第一位管理者：確認 `Config.gs` 的 `ADMIN_EMAIL` 正確，並重新執行一次 `setup()`。

**Q：顯示「登入來源不正確（Client ID 不符）」**
- `Config.gs` 的 `OAUTH_CLIENT_ID` 和 `config.js` 的 `GOOGLE_CLIENT_ID` 必須一模一樣，改完 `Config.gs` 要重新部署。

**Q：只有我自己能登入，其他同事登不進去（顯示「存取遭封鎖」）**
- OAuth 同意畫面還在「測試中」。到 Google Cloud Console 把發布狀態改成「正式版」。

**Q：執行 `setup()` 出現「請先在 Config.gs 填寫 ADMIN_EMAIL」**
- 依步驟 3 填好 email、儲存後再執行。

**Q：網站更新後，畫面還是舊的**
- GitHub Pages 更新約需 1～2 分鐘；之後在瀏覽器按 `Cmd + Shift + R`（Windows：`Ctrl + F5`）強制重新整理。

**Q：每次操作要等 1～3 秒**
- 這是 Google Apps Script 本身的啟動時間，和資料量無關。後台的清單會暫存 30 秒、切換頁面不用重等；前台抽獎時遊戲會先轉起來，等結果回來再停。

**Q：參與者說「今天的抽獎次數已用完」，但他還沒抽過**
- 系統以 Email 或手機辨識同一人，只要其中一個和今天已登記的人相同就算同一人。請他確認是否和家人、同事共用 Email 或手機。

**Q：其他業務說看不到參與者名單**
- 名單含個資，只有活動建立者、協作人員與管理者看得到。請活動建立者在「基本資訊 → 協作人員」勾選他。

---

## 五、開發者備註

- 本機測試（不需要 Google 帳號）：`node dev/server.js` → 前台 `http://localhost:8770/play/?event=EBM27`（自助＋先登記）、`BOOTH1`（攤位＋不登記）、`AFTER1`（攤位＋中獎後登記）、`SCR1`／`SLOT1`／`GACHA1`（三款遊戲）；遊戲試玩 `http://localhost:8770/play/?preview=wheel`；後台 `http://localhost:8770/admin/`（管理者 admin@example.com、業務 sales@example.com，會先建好示範資料；`SEED=0` 不建）；API 測試台 `http://localhost:8770/dev/api-test.html`。資料只存在記憶體。
- 後端自我測試：`node dev/selftest.js`（權限、協作人員、每日次數、測試資料清除、獎池不超抽、報表、推廣表單規則等驗收項目）。
- 遊戲模組放在 `play/games/`，共同介面：`init(container, prizes, theme)`、`start()`、`play(resultPrize) → Promise`、`cancel()`、`reset()`、`destroy()`；新增遊戲時照這個介面寫一個檔案，並在 `admin/js/ui.js` 的 `GAMES` 與 `gas/Events.gs` 的 `GAME_TYPES` 加上代號。抽抽樂的人物圖在 `play/games/chouchou/`，直接覆蓋 PNG 即可換圖。
- API 格式：POST、`Content-Type: text/plain`，body `{action, token, payload}`，回傳 `{ok, data, error, code}`。所有 action 列在 `gas/Code.gs` 的 `routes_()`。
- 時區一律 `Asia/Taipei`；時間存成文字 `yyyy-MM-dd HH:mm:ss`。

## 開發進度

- [x] 第 1 階段：GAS 與資料層（setup、Sheet 讀寫、驗證、權限、API 路由）
- [x] 第 2 階段：後台基本功能（登入、使用者、客戶、活動、獎池、QR code）
- [x] 第 3 階段：前台主流程＋轉盤（登記三模式、每日次數、測試模式）
- [x] 第 4 階段：刮刮樂、拉霸機、彩球機＋各遊戲音效＋特別獎慶祝動畫＋後台試玩
- [x] 第 5 階段：推廣頁（試用申請／產品資訊表單）、潛在客戶名單（篩選、匯出 Excel）、攤位大螢幕展示頁
- [x] 第 6 階段：成果報表（統計、時段／單位／身分分布）、Excel 匯出（4 個工作表）、16:9 成果圖卡
- [x] 第 7 階段：總覽頁（本月統計、活動卡片快速連結）、細節打磨、README
