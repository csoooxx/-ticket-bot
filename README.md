# Tixcraft Ticket Bot

使用 Puppeteer 自動監控拓元售票網站，在指定時間自動搶票，並透過 Tesseract OCR 自動辨識驗證碼。

---

## 功能特色

- 自動監控場次開賣狀態，開賣瞬間立即搶票
- 時間觸發器：可設定開賣時間，腳本在開賣前數秒才開始刷新，避免頻繁請求被封鎖
- 自動選擇指定票區與張數
- OCR 自動辨識驗證碼（Tesseract + Sharp 預處理）
- 辨識失敗時自動重試，超過上限後退回手動輸入
- 反偵測處理（隱藏 WebDriver 特徵）

---

## 環境需求

- Node.js v18 以上
- Google Chrome 瀏覽器（需要本機安裝）

---

## 安裝

```bash
npm install
```

所有依賴套件（puppeteer、tesseract.js、sharp 等）會透過 `package.json` 一併安裝。

---

## 設定

執行前需要修改 `tixcraft.js` 頂部的 `CONFIG` 區塊：

| 參數 | 說明 | 範例 |
|------|------|------|
| `activityUrl` | 活動「節目場次」頁面網址 | `'https://tixcraft.com/activity/detail/26_xxx'` |
| `targetDate` | 目標場次的日期關鍵字，包含即匹配 | `'2026/05/03'` 或 `'05/03'` |
| `targetArea` | 目標票區關鍵字，精確填寫可指定特定區域 | `'VIP1區'` 或 `'A1區'` |
| `ticketCount` | 購買張數 | `2` |
| `saleTime` | 開賣時間，留空則立即開始搶票 | `'2026/05/03 11:00:00'` |
| `headStartSeconds` | 開賣前提前幾秒開始刷新（預設 5） | `5` |
| `refreshInterval` | 頁面刷新間隔，單位毫秒，不建議低於 300 | `400` |

### Chrome 路徑

在 `launchBrowser()` 函式中找到 `executablePath`，修改為你本機的 Chrome 安裝路徑：

```js
executablePath: '/your/path/to/Google Chrome'
```

常見路徑：

- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Windows: `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`
- Linux: `/usr/bin/google-chrome`

---

## 使用方式

```bash
node tixcraft.js
```

---

## 執行流程

1. 啟動 Chrome 瀏覽器，導向拓元登入頁面
2. 使用者手動完成登入（腳本自動偵測登入狀態）
3. 若設定了 `saleTime`，腳本進入倒數等待，終端顯示即時倒數計時
4. 開賣前指定秒數，開始刷新活動頁面監控場次狀態
5. 偵測到場次可購買後，自動進入票區選擇頁面
6. 根據 `targetArea` 關鍵字自動選擇票區
7. 自動選擇購買張數
8. OCR 辨識驗證碼並自動填入送出（最多重試 10 次，失敗則退回手動）
9. 流程結束後瀏覽器保持開啟，可手動完成後續操作

---

## 驗證碼辨識說明

腳本使用 Sharp 對驗證碼圖片進行預處理（提取紅色通道 + 二值化），再透過 Tesseract OCR 辨識。



---

## 注意事項

- `refreshInterval` 不建議低於 300 毫秒，過於頻繁的請求可能導致 IP 被封鎖
- 建議搭配 `saleTime` 使用，避免長時間刷新觸發風控
- 開賣時間以系統本地時區為準（台灣為 UTC+8）
- 本腳本僅供學習 Puppeteer 與自動化技術使用

---

# TicketPlus 搶票腳本

使用 Puppeteer + Axios 自動監控遠大售票網站 (ticketplus.com.tw)，在指定時間自動完成登入、排隊、選位，並保留票券。

---

## 功能特色

- 透過 API 直接登入，無需在瀏覽器手動操作
- 讀取 Vuex store 內部狀態偵測開賣，比頁面刷新更即時
- 倒數計時器：開賣前指定秒數才開始輪詢，避免過早觸發風控
- 自動排隊（處理 errCode 137 等待重試流程）
- 自動選擇指定票區與張數，點擊「下一步」完成保留
- 反偵測處理（隱藏 WebDriver 特徵）

---

## 環境需求

- Node.js v18 以上
- Google Chrome 瀏覽器（需要本機安裝）

---

## 安裝

```bash
npm install
```

所有依賴套件（puppeteer、axios 等）會透過 `package.json` 一併安裝。

---

## 設定

執行前需要修改 `ticketplus.js` 頂部的 `config` 區塊：

| 參數 | 說明 | 範例 |
|------|------|------|
| `activityUrl` | 活動頁面網址，需包含 32 字元 hex 的 activityId | `'https://ticketplus.com.tw/activity/abcdef1234...'` |
| `targetName` | 目標場次名稱關鍵字，包含即匹配 | `'Hi-Fi Un!corn 2026 ASIA LIVEHOUSE TOUR'` |
| `targetDate` | 目標場次日期，格式 `YYYY-MM-DD`，留空則不限日期 | `'2026-05-23'` |
| `ticketCount` | 購買張數 | `2` |
| `saleTime` | 開賣時間，格式 `YYYY-MM-DD HH:mm:ss`，留空則立即開始搶票 | `'2026-05-23 11:00:00'` |
| `headStartSeconds` | 開賣前提前幾秒開始輪詢（預設 5） | `5` |
| `apiPollInterval` | Vuex store 輪詢間隔，單位毫秒（預設 300） | `300` |
| `chromePath` | 本機 Chrome 執行檔路徑 | `'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'` |
| `targetArea` | 目標票區名稱，如 `'A區'`，留空則自動選第一個有票的區域 | `'A區'` |

### Chrome 路徑

在 `config` 的 `chromePath` 欄位填入本機 Chrome 安裝路徑：

常見路徑：

- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Windows: `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`
- Linux: `/usr/bin/google-chrome`

---

## 使用方式

```bash
node ticketplus.js
```

腳本啟動後，終端會提示輸入手機號碼與密碼（密碼輸入時以 `*` 遮罩顯示）。

---

## 執行流程

1. 終端提示輸入手機號碼與密碼
2. 透過 TicketPlus API 登入，取得 access token
3. 啟動 Chrome 瀏覽器，注入登入 cookie（`user` + `expiredTime`）
4. 載入活動頁面，自動關閉年齡確認 modal（若出現）
5. 從 sessions.json 比對 `targetName` / `targetDate`，鎖定目標場次
6. 若設定了 `saleTime`，進入倒數等待，終端顯示即時倒數計時
7. 開賣前 `headStartSeconds` 秒，開始輪詢瀏覽器 Vuex store 偵測 `status === 'onsale'`
8. 偵測到開賣後，重新整理頁面並點擊目標場次的「立即購買」
9. 進入選票頁後，展開指定票區，點擊 `+` 按鈕選取張數，點擊「下一步」
10. 腳本呼叫排隊 API（`enqueue`）；若收到 `errCode=137`，等待指定秒數後自動重試
11. 排隊通過後呼叫 `reserve` API 保留票券
12. 等待頁面導航至 `/confirmSeat/`，讀取座位資訊並點擊「下一步」
13. 後續付款流程需手動在瀏覽器中完成；瀏覽器保持開啟

---

## 注意事項

- `apiPollInterval` 不建議低於 200 毫秒，過於頻繁的請求可能觸發風控
- 建議搭配 `saleTime` 使用，避免腳本長時間運行被偵測
- 開賣時間以系統本地時區為準（台灣為 UTC+8）
- 目前付款（Step 3 以後）流程尚未實作，需手動在瀏覽器中完成
- 本腳本僅供學習 Puppeteer 與自動化技術使用

---
