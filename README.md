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

