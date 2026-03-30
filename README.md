# 拓元腳本 

使用 Puppeteer 自動監控拓元售票網站

---

## 環境需求

- Node.js v18 

---

## 安裝

```bash
npm install
```
## 使用前先安裝puppeteer
```bash
npm install puppeteer
```



---

## 使用方式

### 1. 設定 `tixcraft.js` 頂部的 CONFIG

| 參數 | 說明 | 範例 |
|------|------|------|
| `activityUrl` | 活動節目場次頁面網址 | `https://tixcraft.com/activity/detail/xxx` |
| `targetDate` | 目標場次日期（包含即匹配） | `'05/03'` |
| `targetArea` | 目標票區關鍵字 | `'A區'` |
| `ticketCount` | 購買張數 | `2` |
| `refreshInterval` | 刷新間隔（毫秒） | `400` |

### 2. 修改 Chrome 路徑（如有需要）

在 `launchBrowser()` 函式中找到 `executablePath`，修改為你本機的 Chrome 路徑：

```js
executablePath: '/your/path/to/Google Chrome'
```

### 3. 執行腳本

```bash
node tixcraft.js
```

---

## 流程說明

1. 自動開啟 Chrome 瀏覽器
2. 導向拓元登入頁，**手動完成登入**
3. 前往活動頁面，持續監控直到指定場次開賣
4. 開賣後自動進入票區選擇頁面
5. 自動選擇目標票區與張數
6. **手動完成驗證碼**後即可結帳

---

## 注意事項

- 驗證碼需手動輸入，腳本不會自動處理
- `refreshInterval` 不建議設定低於 `300` 毫秒
- 本腳本僅供學習 Puppeteer 使用
