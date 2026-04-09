---
doc_type: teaching_spec
project: ticketplus-ticket-bot
target_file: ticket-bot/ticketplus.js
reference_file: ticket-bot/tixcraft.js
runtime: node >= 18, CommonJS
deps_required: [puppeteer, axios]  # already in package.json
deps_builtin: [crypto, readline]
version: v0.1-skeleton
created: 2026-04-08
purpose: |
  Hand-typing teaching book for building ticketplus.com.tw auto ticket bot.
  This doc is designed to (a) guide user to hand-type the code themselves,
  (b) be pasted as-is into the NEXT conversation so a new Claude session
  can resume without re-deriving context.

decisions_locked:
  browser_framework: puppeteer           # NOT playwright (repo already uses puppeteer)
  login_strategy: api_direct             # POST /user/api/v1/login with MD5 password
  checkout_strategy: ui_browser          # click buttons via puppeteer
  session_status_strategy: api_polling_aggressive  # poll /config/api/v1/get, ~200ms
  password_input: runtime_prompt_hidden  # readline raw mode, masked with *
  trigger_mode: scheduled                # CONFIG.saleTime + headStartSeconds
  code_style: match_tixcraft_js          # reuse log/delay/launchBrowser patterns

reference_docs_in_conversation_history:
  - ticketplus_dom_analysis (activity page DOM, .sesstion-item selectors, button states)
  - ticketplus_login_flow_analysis (login modal DOM + API endpoint + MD5 password)

unknowns_to_resolve_next_session:
  - id: U1
    what: token storage location after successful login
    why_blocking: cannot persist auth into puppeteer page without knowing where browser keeps it
    how_to_resolve: user will open browser manually, login, inspect DevTools Application tab
    data_needed:
      - cookies on ticketplus.com.tw domain (all cookie names + which is auth)
      - localStorage keys on ticketplus.com.tw (especially anything with "token"/"user"/"auth")
      - sessionStorage keys
      - sample Authorization header on a post-login XHR (Network tab)
  - id: U2
    what: successful /user/api/v1/login response body shape
    why_blocking: need to know where token field sits so we can inject it
    how_to_resolve: run script once with valid credentials, it will console.log the full response
    data_needed:
      - full JSON body with keys redacted (e.g. token: "xxx", userId: "fetix.xxx")
  - id: U3
    what: /config/api/v1/getS3?path=event/{id}/sessions.json response shape
    why_blocking: matchTargetSession() cannot be written without knowing schema
    how_to_resolve: run script, it will fetch + console.log the sessions.json
    data_needed:
      - structure of a single session entry (which fields map to eventId/sessionId/name/date/time)
  - id: U4
    what: /config/api/v1/get?eventId=X&sessionId=Y response shape (session status)
    why_blocking: isOnSale() predicate cannot be written correctly
    how_to_resolve: fetch the endpoint before + after sale time for a known activity
    data_needed:
      - pre-sale response example
      - on-sale response example (diff shows which field flips)
  - id: U5
    what: captcha presence on ticketplus
    why_blocking: if captcha exists, need OCR (like tixcraft.js) or manual fallback
    how_to_resolve: user observes on real checkout flow
    data_needed:
      - yes/no, if yes: image selector + input selector + type (4 chars / 5 chars / math)
  - id: U6
    what: ticket quantity selector on ticketplus checkout page
    why_blocking: cannot automate ticketCount without DOM info
    how_to_resolve: user observes or provides DOM snapshot like activity page

next_session_onboarding_instructions: |
  When starting the next conversation, paste this entire file as context, then
  add a section at the bottom titled "RESOLVED UNKNOWNS" with the data from
  each U1..U6. That gives the next Claude everything it needs to finish the
  implementation without re-asking questions.
---

# 遠大售票 (ticketplus.com.tw) 自動搶票腳本 — 手打教學書

> **這份文件的使用方式**
> 1. 你現在照著 Part 0 → Part 9 的順序手打 `ticketplus.js`
> 2. 每個 Part 尾端會標「檢查點」,到那邊可以先跑一下確認沒壞
> 3. 遇到 `TODO(Ux)` 標記的地方暫時留著,那是需要下次對話才能填的部分
> 4. 本檔案頂部的 YAML frontmatter 是給「下次對話的 Claude」看的,不用管它
> 5. 跑完 Part 9 後,按照最後「給下次對話的備忘錄」收集資料,貼到新對話

---

## 背景快速回顧

你正在寫的是 `ticket-bot/ticketplus.js`。這個專案裡 `tixcraft.js` 是拓元售票的搶票腳本(Puppeteer 寫的),你的工作是為「遠大(ticketplus)」寫對應版本。

**關鍵差異 vs tixcraft:**
- tixcraft 用手動登入(人點完腳本偵測)→ ticketplus 改用 **API 直接登入**(快、穩)
- tixcraft 的場次列表是 `<tr>` → ticketplus 是 Vuetify `.sesstion-item` div(注意 sesstion 是原站 typo)
- ticketplus 有額外的「年齡限制 modal」要先關掉
- ticketplus 密碼要 **client-side MD5** 後才送 API
- ticketplus 錯誤用 **HTTP 200 + errCode 欄位**,不是 HTTP 4xx

---

## Part 0:前置作業

### 0.1 驗證相依套件
```bash
cd "ticket-bot"
cat package.json
```
確認有 `puppeteer` 和 `axios`。你現有的 `package.json` 已經兩個都有,**不需要 `npm install` 任何新東西**。

### 0.2 確認檔案存在
`ticketplus.js` 目前是空檔(0 bytes),就是要填它。

### 0.3 MacOS Chrome 路徑
你現有的 `tixcraft.js` 用:
```js
'/Volumes/NVme/Google Chrome.app/Contents/MacOS/Google Chrome'
```
我們沿用這條路徑。

**檢查點 0:** `cat ticketplus.js` 回傳空字串、`grep -c puppeteer package.json` 回傳 ≥1。

---

## Part 1:檔頭 — imports 與整體註解

```js
// ============================================================
//   遠大 (ticketplus.com.tw) 自動搶票腳本 v0.1
//
//   登入走 API (POST /user/api/v1/login,密碼 client-side MD5)
//   場次狀態走 API 輪詢 (/config/api/v1/get)
//   下單流程走 Puppeteer 瀏覽器 UI
// ============================================================

const puppeteer = require('puppeteer');
const axios     = require('axios');
const crypto    = require('crypto');
const readline  = require('readline');
```

**為什麼這樣排:**
- `crypto` 是 Node 內建 — 用來算密碼的 MD5
- `readline` 是 Node 內建 — 用來在終端機 prompt 手機+密碼
- `axios` 拿來打 ticketplus 的 API(也可以用 fetch,但你的 `package.json` 已經有 axios 了)
- `puppeteer` 接手瀏覽器 UI 流程

**為什麼用 CommonJS(`require`)而不是 `import`?**
因為你的 `package.json` 裡 `"type": "commonjs"`,與 tixcraft.js 保持一致。混用 ESM/CJS 會踩坑。

---

## Part 2:CONFIG 設定區

```js
// ============================
//   設定區(每次搶票前修改)
// ============================
const CONFIG = {
  // 活動網址(必填) — 32 字元 hex activityId
  // 例:https://ticketplus.com.tw/activity/855545b98229fb404775ae0f0b48bf8f
  activityUrl: '',

  // 目標場次名稱關鍵字(必填)
  // 腳本會用 session.name.includes(targetName) 比對
  // 可以填完整或局部,例如 'Taipei' 或 'REBOOT'
  targetName: '',

  // 目標場次日期關鍵字(選填,留空表示只比對 name)
  // 例 '2026/04/20' 或 '04/20'
  targetDate: '',

  // 購買張數
  ticketCount: 2,

  // 開賣時間(格式:'YYYY/MM/DD HH:mm:ss')
  // 若留空則立即進入搶票
  saleTime: '',

  // 開賣前幾秒開始輪詢 API(與 tixcraft 一致)
  headStartSeconds: 5,

  // 倒數階段 (sale time 之前):sessions.json 輪詢間隔(毫秒)
  configPollInterval: 2000,

  // 開賣後:激進 API 狀態輪詢間隔(毫秒)
  apiPollInterval: 200,

  // 本機 Chrome 路徑
  chromePath: '/Volumes/NVme/Google Chrome.app/Contents/MacOS/Google Chrome',
};
```

**為什麼 `apiPollInterval` 設 200ms?**
搶票場景,開賣瞬間的 200ms 決定勝負。`/config/api/v1/get` 是純 JSON endpoint、沒有 DOM render 開銷,打 200ms 不會被 IP 封(比 UI 刷新 400ms 更激進但安全)。tixcraft 用 400ms 是因為它刷整頁 HTML + Vue render,瓶頸在瀏覽器。

**為什麼 `configPollInterval` 比較慢(2000ms)?**
開賣前只是要確保 sessions.json 載得到 + 目標場次還在,沒必要敲太兇。

---

## Part 3:(從 tixcraft.js 復用)

```js
// ============================
//   Utility
// ============================
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  const now = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  console.log(`[${now}] ${message}`);
}

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}
```

**`md5` 為什麼用 Node 內建 crypto 而不裝 `md5` 套件?**
1. 少一個 dep
2. Node 內建實作就是 OpenSSL,穩定又快
3. 一行完成,沒必要抽象

**小驗證:** 你那份 JSON 說 `MD5('testpassword123') = 'b3e508d6e62e50b49eefa3c464d79e00'`。你可以先單獨測試:
```js
// 暫時加在檔尾測試,測完刪掉
console.log(md5('testpassword123'));  // 應該印 b3e508d6e62e50b49eefa3c464d79e00
```

---

## Part 4:Prompt 手機 + 密碼(密碼隱藏輸入)

```js
// ============================
//   Runtime prompt (手機 + 密碼)
// ============================

// 一般可見輸入(手機號碼)
function promptVisible(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// 隱藏輸入(密碼) — 用 raw mode 攔截鍵盤,把每個字元印成 *
function promptHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');

    let password = '';

    const onData = (char) => {
      char = char.toString();

      if (char === '\n' || char === '\r' || char === '\u0004') {
        // Enter 或 Ctrl-D -> 結束輸入
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '\u0003') {
        // Ctrl-C -> 直接結束程式
        process.stdout.write('\n');
        process.exit(130);
      } else if (char === '\u007f' || char === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += char;
        process.stdout.write('*');
      }
    };

    process.stdin.on('data', onData);
  });
}
```

**為什麼要自己實作而不用現成套件?**
`readline` 預設沒有隱藏模式,市面上有 `prompts`、`inquirer` 這類套件可以做到,但又要裝 dep。Node 內建的 `setRawMode(true)` 就能攔截每個鍵盤按鍵,加上 terminal 的 ANSI 控制字元(`\b \b` = 倒退+空白+倒退)就能做 backspace,一共不到 30 行。

**踩坑警告:**
- Raw mode 下 Ctrl-C 不會自動觸發 SIGINT,所以我們要手動偵測 `\u0003` 退出,否則你按 Ctrl-C 沒反應會以為當機
- `setRawMode` 只在 TTY 環境可用 — 如果你之後把這腳本包成 systemd service 或 pipe stdin,要改成讀環境變數 fallback

---

## Part 5:API helpers

```js
// ============================
//   API helpers
// ============================
const API_BASE        = 'https://api.ticketplus.com.tw';
const CONFIG_API_BASE = 'https://apis.ticketplus.com.tw';  // 注意是 apis 不是 api

// 共用 headers,讓請求看起來像真實瀏覽器
const COMMON_HEADERS = {
  'accept'        : 'application/json, text/plain, */*',
  'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8',
  'origin'        : 'https://ticketplus.com.tw',
  'referer'       : 'https://ticketplus.com.tw/',
  'user-agent'    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

// ---- 登入 ----
async function loginViaApi(mobile, password, countryCode = '886') {
  log('正在透過 API 登入...');

  const url = `${API_BASE}/user/api/v1/login?_=${Date.now()}`;
  const body = {
     
    countryCode,                              // 不含 '+' 號
    password  : md5(password),                // client-side MD5
  };

  try {
    const res = await axios.post(url, body, {
      headers: { ...COMMON_HEADERS, 'content-type': 'application/json' },
      timeout: 10000,
    });

    const data = res.data;

    // 錯誤不是 HTTP 4xx,而是 body.errCode
    if (data.errCode) {
      log(`登入失敗: errCode=${data.errCode} msg=${data.errMsg}`);
      if (data.errDetail) log(`  詳細: ${data.errDetail}`);
      throw new Error(`Login failed: ${data.errMsg}`);
    }

    log('API 登入成功');
    return data;
  } catch (err) {
    if (err.response) {
      log(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

// ---- 取得該活動的所有場次 (sessions.json) ----
async function fetchSessions(activityId) {
  const url = `${CONFIG_API_BASE}/config/api/v1/getS3?path=event/${activityId}/sessions.json&_=${Date.now()}`;
  const res = await axios.get(url, {
    headers: COMMON_HEADERS,
    timeout: 10000,
  });
  return res.data;
}

// ---- 取得該活動的 event metadata (event.json) ----
async function fetchEventMeta(activityId) {
  const url = `${CONFIG_API_BASE}/config/api/v1/getS3?path=event/${activityId}/event.json&_=${Date.now()}`;
  const res = await axios.get(url, {
    headers: COMMON_HEADERS,
    timeout: 10000,
  });
  return res.data;
}

// ---- 輪詢單一場次的即時狀態 ----
async function fetchSessionStatus(eventId, sessionId) {
  const url = `${CONFIG_API_BASE}/config/api/v1/get?eventId=${eventId}&sessionId=${sessionId}&_=${Date.now()}`;
  const res = await axios.get(url, {
    headers: COMMON_HEADERS,
    timeout: 5000,
  });
  return res.data;
}
```

**為什麼每個請求都加 `?_=${Date.now()}`?**
你那份 JSON 顯示 ticketplus 自己的前端就這樣做,目的是 cache-bust — 阻止中途 CDN / 瀏覽器把舊的 JSON 回給你。搶票時舊資料會致命,所以我們也照做。

**為什麼 `API_BASE` 是 `api.ticketplus.com.tw` 但 `CONFIG_API_BASE` 是 `apis.ticketplus.com.tw`?**
遠大後端拆兩個服務:`api`(user 相關、需授權)和 `apis`(config/S3 proxy、公開讀取)。多一個 s 的是公開 CDN-like 的 config,不需要 token 就能讀 — 這對我們有利,代表開賣前的場次輪詢不需要登入態。

**檢查點 5:** 你可以單獨測 `loginViaApi` — 暫時在檔尾加:
```js
// 暫時測試,測完刪掉
(async () => {
  const r = await loginViaApi('你的手機', '你的密碼');
  console.log(JSON.stringify(r, null, 2));
})();
```
執行 `node ticketplus.js`。預期看到登入成功的 JSON。**請把這個成功 response 存下來,填到本文件底部的「U2」**。

---

## Part 6:瀏覽器 helpers(復用 tixcraft 模式)

```js
// ============================
//   Browser
// ============================
async function launchBrowser() {
  log('正在啟動瀏覽器...');

  const browser = await puppeteer.launch({
    headless       : false,
    defaultViewport: null,
    executablePath : CONFIG.chromePath,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  const page = await browser.newPage();

  // 反偵測:隱藏 navigator.webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  });

  log('瀏覽器已啟動');
  return { browser, page };
}

// ---- 關掉年齡限制 modal(若有) ----
async function dismissAgeModal(page) {
  try {
    await page.waitForSelector('.v-dialog--active', { timeout: 3000 });
    const clicked = await page.evaluate(() => {
      const dialog = document.querySelector('.v-dialog--active');
      if (!dialog) return false;
      const btns = dialog.querySelectorAll('.v-btn');
      // 優先點「確定」
      for (const b of btns) {
        if (b.textContent.trim() === '確定') { b.click(); return true; }
      }
      // fallback:點最後一顆按鈕
      if (btns.length > 0) { btns[btns.length - 1].click(); return true; }
      return false;
    });
    if (clicked) {
      log('已關閉年齡限制 modal');
      await delay(500);
    }
  } catch {
    // 沒有 modal -> 略過
  }
}

// ---- 注入登入 token 到瀏覽器 ----
// U1 已確認：token 存放在 cookie 'user'（JSON 字串），沒有用 localStorage
async function injectAuth(page, loginResp) {
  // ticketplus 把整個 user 物件序列化成 JSON 塞進單一 cookie 'user'
  // loginResp 結構: { account, id, access_token, refresh_token, access_token_expires_in, verifyEmail }
  const userCookieValue = encodeURIComponent(JSON.stringify(loginResp));
  await page.setCookie({
    name:     'user',
    value:    userCookieValue,
    domain:   '.ticketplus.com.tw',
    path:     '/',
    secure:   true,
    httpOnly: false,
  });
}

// ---- 在場次頁點目標場次的「立即購買」按鈕 ----
async function clickBuySessionByName(page, targetName) {
  return page.evaluate((name) => {
    const items = document.querySelectorAll('#buyTicket .sesstion-item');
    for (const item of items) {
      const nameEl = item.querySelector(
        '.d-flex.text-left.font-weight-bold.text-regular'
      );
      const itemName = nameEl ? nameEl.textContent.trim() : '';
      if (itemName.includes(name)) {
        const btn = item.querySelector('.v-btn');
        if (btn && !btn.disabled && !btn.classList.contains('v-btn--disabled')) {
          btn.click();
          return { found: true, name: itemName };
        }
        return {
          found: false,
          reason: 'button-disabled-or-missing',
          name: itemName,
          btnText: btn ? btn.textContent.trim() : null,
        };
      }
    }
    return { found: false, reason: 'session-not-found' };
  }, targetName);
}
```

**為什麼 `dismissAgeModal` 用 `try/catch` 而不是先檢查 modal 存不存在?**
因為 `waitForSelector` 帶 timeout 的話,最乾淨的寫法就是讓它超時拋錯、catch 吞掉。先 `$(...)` 檢查反而會有 race condition(modal 正在 render 的半秒)。這是 puppeteer 常見的「optional wait」慣用法。

**為什麼 `injectAuth` 故意寫 throw?**
因為 U1 沒解掉前我們不該猜 — 瞎猜會造成「看似登入成功但實際不行」的最糟狀況(偵測不到錯誤,搶票到一半才發現被踢)。寧可主動爆炸提醒自己「先做 U1」。

---

## Part 7:Session discovery — 從 activityId 到 eventId/sessionId

```js
// ============================
//   Session discovery
// ============================

// 從活動網址解析 32 字元 activityId
function extractActivityId(url) {
  const m = url.match(/\/activity\/([a-f0-9]{32})/);
  if (!m) throw new Error(`無法從網址解析 activityId: ${url}`);
  return m[1];
}

// 在 sessions.json 中找出符合 CONFIG.targetName/targetDate 的場次
function matchTargetSession(sessionsJson, targetName, targetDate) {
  // TODO(U3): 等你跑一次 fetchSessions 印出實際 shape 後,修正這裡的欄位對應
  //
  // 目前為「防禦式猜測」—— 支援多種可能的 shape:
  const list =
    Array.isArray(sessionsJson)       ? sessionsJson :
    sessionsJson.sessions              ? sessionsJson.sessions :
    sessionsJson.data                  ? sessionsJson.data :
    sessionsJson.sessionList           ? sessionsJson.sessionList :
    [];

  for (const s of list) {
    const name =
      s.name || s.title || s.eventName || s.sessionName || '';
    const date =
      s.date || s.showDate || s.startDate || s.startTime || '';

    const nameOk = !targetName || name.includes(targetName);
    const dateOk = !targetDate || String(date).includes(targetDate);

    if (nameOk && dateOk) return s;
  }
  return null;
}

// 從單一 session 物件萃取 eventId + sessionId
function extractSessionIds(session) {
  // TODO(U3): 等 U3 解掉後改成確定欄位
  const eventId   = session.eventId   || session.event_id   || session.eventID;
  const sessionId = session.sessionId || session.session_id || session.sessionID;
  if (!eventId || !sessionId) {
    throw new Error(
      `無法從 session 物件取得 eventId/sessionId, 原始物件: ${JSON.stringify(session)}`
    );
  }
  return { eventId, sessionId };
}
```

**為什麼現在寫防禦式的 `||` 鏈而不等 U3?**
因為在 U3 解掉之前,我們還是希望腳本能「跑到報錯的那一行」— 那樣我們才有錯誤訊息去 debug。如果現在寫死一個欄位名,萬一猜錯,整個流程會靜默失敗(session 永遠找不到),反而更難 debug。防禦式寫法 + 清楚的 TODO 才是正確姿態。

**這裡是 Learning Mode 的關鍵決策點** —— 下次對話 U3 解掉後,你會需要把這個「通用 matcher」改成「精準 matcher」。那時你會做一個有意義的設計選擇:要不要支援多場次比對?要不要做時間段匹配('18:30' vs '18:35')?那時再談。

---

## Part 8:倒數等待(從 tixcraft.js 復用)

```js
// ============================
//   倒數等待開賣
// ============================
async function waitUntilSaleTime() {
  if (!CONFIG.saleTime) {
    log('未設定開賣時間,直接開始搶票');
    return;
  }

  const saleDate = new Date(CONFIG.saleTime);
  if (isNaN(saleDate.getTime())) {
    log(`開賣時間格式錯誤:「${CONFIG.saleTime}」,直接開始搶票`);
    return;
  }

  const startAt = new Date(saleDate.getTime() - CONFIG.headStartSeconds * 1000);

  log(`開賣時間:${CONFIG.saleTime}`);
  log(`將在開賣前 ${CONFIG.headStartSeconds} 秒進入搶票階段`);

  while (true) {
    const now = new Date();
    const diffMs = startAt.getTime() - now.getTime();

    if (diffMs <= 0) {
      log('時間到!進入搶票階段');
      return;
    }

    const totalSeconds = Math.ceil(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0)   parts.push(`${hours} 小時`);
    if (minutes > 0) parts.push(`${minutes} 分`);
    parts.push(`${seconds} 秒`);

    process.stdout.write(`\r  倒數中... ${parts.join(' ')} 後進入搶票階段   `);

    // 超過 60 秒每秒更新,最後 60 秒每 100ms 更新提高精度
    await delay(totalSeconds > 60 ? 1000 : 100);
  }
}
```

這一段你可以幾乎原封不動從 `tixcraft.js:96-139` 複製過來(只改了文字訊息)。復用現成已驗證的程式碼永遠比重寫安全。

---

## Part 9:主流程 main()

```js
// ============================
//   開賣狀態判斷 (TODO: U4)
// ============================
function isOnSale(status) {
  // TODO(U4): 等你實測 pre-sale vs on-sale 的 response 差異後,改成精準判斷
  //
  // 暫時用模糊 pattern(寧可多觸發也不要漏):
  if (!status || typeof status !== 'object') return false;

  const str = JSON.stringify(status).toLowerCase();
  // 常見 pattern
  if (str.includes('"onsale":true'))   return true;
  if (str.includes('"issale":true'))   return true;
  if (str.includes('"status":"sale"')) return true;
  if (str.includes('"status":"onsale"')) return true;
  if (str.includes('"salestatus":1'))  return true;
  return false;
}

// ============================
//   Main
// ============================
async function main() {
  console.log('');
  console.log('========================================');
  console.log('   遠大 (ticketplus) 搶票腳本 v0.1');
  console.log('========================================');
  console.log('');
  console.log(`  活動網址  : ${CONFIG.activityUrl || '(未設定)'}`);
  console.log(`  目標場次  : ${CONFIG.targetName || '(未設定)'}`);
  console.log(`  目標日期  : ${CONFIG.targetDate || '(不限)'}`);
  console.log(`  購買張數  : ${CONFIG.ticketCount}`);
  console.log(`  開賣時間  : ${CONFIG.saleTime || '(立即)'}`);
  console.log('');

  // --- 1. Prompt 帳號密碼 ---
  const mobile   = await promptVisible('請輸入手機號碼(例 912345678): ');
  const password = await promptHidden ('請輸入密碼: ');

  // --- 2. API 登入 ---
  const loginResp = await loginViaApi(mobile, password);
  // 下次對話需要這段 response 來解 U2
  console.log('---- [U2 資料] 登入 response ----');
  console.log(JSON.stringify(loginResp, null, 2));
  console.log('---- [U2 end] ----');

  // --- 3. 啟動瀏覽器 ---
  const { browser, page } = await launchBrowser();

  // --- 4. 注入 auth token (U1 解掉前會 throw) ---
  try {
    await injectAuth(page, loginResp);
  } catch (e) {
    log(`[WARN] ${e.message}`);
    log('降級:瀏覽器將用未登入狀態開啟,待 U1 解掉後會自動跳過此 warning');
  }

  // --- 5. 載入活動頁 & 關 age modal ---
  if (!CONFIG.activityUrl) {
    log('[ERROR] 未設定 CONFIG.activityUrl,無法繼續');
    return;
  }
  await page.goto(CONFIG.activityUrl, { waitUntil: 'domcontentloaded' });
  await dismissAgeModal(page);

  // --- 6. 抓 sessions.json & 鎖定目標場次 ---
  const activityId = extractActivityId(CONFIG.activityUrl);
  log(`activityId = ${activityId}`);

  const sessionsJson = await fetchSessions(activityId);
  console.log('---- [U3 資料] sessions.json ----');
  console.log(JSON.stringify(sessionsJson, null, 2));
  console.log('---- [U3 end] ----');

  const target = matchTargetSession(sessionsJson, CONFIG.targetName, CONFIG.targetDate);
  if (!target) {
    log('[ERROR] 找不到目標場次,請檢查 CONFIG.targetName/targetDate 或 U3 schema 是否對上');
    return;
  }
  const { eventId, sessionId } = extractSessionIds(target);
  log(`已鎖定場次: eventId=${eventId} sessionId=${sessionId}`);

  // --- 7. 倒數等待開賣 ---
  await waitUntilSaleTime();

  // --- 8. 激進 API 狀態輪詢 ---
  log('開始 API 輪詢場次狀態...');
  let attempts = 0;
  let sampleLogged = false;
  while (true) {
    attempts++;
    try {
      const status = await fetchSessionStatus(eventId, sessionId);

      // 第一次 response 印出來收集 U4 資料
      if (!sampleLogged) {
        console.log('---- [U4 資料] 首次 fetchSessionStatus response ----');
        console.log(JSON.stringify(status, null, 2));
        console.log('---- [U4 end] ----');
        sampleLogged = true;
      }

      if (isOnSale(status)) {
        log(`API 偵測到開賣(第 ${attempts} 次輪詢)`);
        break;
      }

      if (attempts % 20 === 1) {
        log(`輪詢中... (已第 ${attempts} 次)`);
      }
    } catch (err) {
      if (attempts % 20 === 1) log(`輪詢錯誤: ${err.message}`);
    }
    await delay(CONFIG.apiPollInterval);
  }

  // --- 9. 在瀏覽器點購買按鈕 ---
  // 先 reload 確保瀏覽器 DOM 也是開賣後狀態(Vue 可能 cache 舊 state)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await delay(300);
  await dismissAgeModal(page);  // reload 後 modal 可能再次出現

  const clickResult = await clickBuySessionByName(page, CONFIG.targetName);
  log(`點擊結果: ${JSON.stringify(clickResult)}`);

  if (!clickResult.found) {
    log('[WARN] 場次按鈕點擊失敗,可能開賣狀態尚未反映到 DOM,短暫等待後重試...');
    for (let i = 0; i < 10; i++) {
      await delay(300);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const r = await clickBuySessionByName(page, CONFIG.targetName);
      if (r.found) { log(`第 ${i + 2} 次嘗試成功`); break; }
    }
  }

  log('');
  log('=========================================');
  log('  v0.1 骨架流程結束');
  log('  後續選位 / 驗證碼 / 付款流程待 U5/U6 解掉後擴充');
  log('  瀏覽器保持開啟,請手動完成剩餘步驟');
  log('=========================================');
}

main().catch((e) => {
  console.error('腳本發生錯誤:', e.message);
  console.error(e.stack);
});
```

---

## 檢查點總表

| # | 階段 | 驗證方式 | 預期結果 |
|---|---|---|---|
| C0 | 前置 | `node -e "require('puppeteer');require('axios')"` | 無錯誤 |
| C1 | md5 驗證 | `console.log(md5('testpassword123'))` | `b3e508d6e62e50b49eefa3c464d79e00` |
| C2 | 登入 API | 單獨測 `loginViaApi` | 回傳 JSON 不含 errCode |
| C3 | sessions.json | 單獨測 `fetchSessions` | 回傳 JSON 陣列 / 物件 |
| C4 | 瀏覽器啟動 | 單獨測 `launchBrowser` + goto activity | 頁面正常顯示 |
| C5 | Age modal | 進活動頁若有 modal 應自動關閉 | modal 消失 |
| C6 | 場次輪詢 | 尚未開賣時跑全流程 | 卡在輪詢 loop 不崩 |
| C7 | 點購買 | 開賣時跑全流程 | clickResult.found = true |

---

## 給下次對話的備忘錄(**重要**)

下次開對話時,**貼整份這個 .md**,然後在最下面補一段「RESOLVED UNKNOWNS」,把你實測到的資料填進去,大概像這樣:

```yaml
# ==== RESOLVED UNKNOWNS (2026-04-XX) ====

U1_token_storage:
  method: localStorage       # localStorage | cookie | authorization_header
  localStorage_keys:
    - key: "token"
      sample_value: "eyJhbGc..."  # 前 20 字即可,敏感資料遮掉
    - key: "userInfo"
      sample_value: "{\"userId\":\"fetix.xxx\",...}"
  cookies_set_post_login:
    - name: "xxx"
      sample_value: "xxx"
  authorization_header_on_subsequent_xhr: "Bearer xxx"  # 若有的話
  notes: "從 DevTools > Application > LocalStorage 看到的實際 key"

U2_login_response_shape:
  # 從腳本執行時印出的 [U2 資料] 區塊複製貼上
  example: |
    {
      "userId": "fetix.xxxxxxxxxxxxxxxx",
      "token": "...",
      ...
    }

U3_sessions_json_shape:
  # 從腳本執行時印出的 [U3 資料] 區塊複製貼上
  example: |
    { ... }
  key_mapping:
    name_field: "xxx"         # 實際欄位名
    date_field: "xxx"
    eventId_field: "xxx"
    sessionId_field: "xxx"

U4_session_status_shape:
  pre_sale_example: |
    { ... }
  on_sale_example: |
    { ... }
  on_sale_detect_field: "xxx"   # 哪個欄位翻轉代表開賣

U5_captcha:
  present: false   # true | false
  # 若 true:
  image_selector: "xxx"
  input_selector: "xxx"
  type: "4-char-alpha"

U6_checkout_dom:
  # 下單頁的 DOM 結構(類似你第一份活動頁 JSON 的格式)
  quantity_selector: "xxx"
  ticket_type_selector: "xxx"
  confirm_button: "xxx"
```

填完這段後,下次對話 Claude 讀到就能直接:
1. 把 `injectAuth` 裡的 TODO 換成實作
2. 把 `matchTargetSession` 的欄位對應寫精準
3. 把 `isOnSale` 改成單一欄位判斷(比現在 JSON.stringify 快很多)
4. 加上驗證碼與後續下單流程

---

## 設計決策摘要(給下次 Claude 快速抓 context)

- **不換 Playwright**:repo 已用 Puppeteer,風格統一 > 新工具
- **API 登入而非 UI 登入**:速度、可靠性、錯誤處理都更好
- **瀏覽器 + API 混合**:登入/狀態輪詢走 API,點按鈕/驗證碼走瀏覽器
- **激進 200ms API 輪詢**:純 JSON 請求負擔小,搶票瞬間精度比 UI 刷新高
- **密碼走 runtime prompt**:不存檔案、不放環境變數,最低洩漏風險
- **復用 tixcraft 的 delay/log/launchBrowser/waitUntilSaleTime**:已驗證過的程式碼
- **故意在 `injectAuth` throw**:逼自己先解 U1 而不是亂猜
- **`isOnSale` 用模糊 pattern 暫代**:讓流程能跑起來、印出 U4 樣本、之後精準化

---

## 快速執行指令

```bash
cd "/Volumes/NVme/my project(vscode)/ticket-bot"
node ticketplus.js
```

第一次跑建議:
1. `CONFIG.saleTime` 留空(立即模式)
2. `CONFIG.activityUrl` 填一個現在就在售票的活動(從你第一份 JSON 的 `confirmed_on` 那個 `855545b98229fb404775ae0f0b48bf8f`)
3. 觀察會 throw 在 `injectAuth`(預期) — 這個 throw 是 warning 不是 error,流程會繼續
4. 觀察 `[U2 資料]` 和 `[U3 資料]` 有沒有印出來 → 複製備存
5. 因為 `U1` 未解,瀏覽器會是未登入狀態,手動登入後腳本會繼續跑場次偵測
6. 收集完 U1~U4 的資料,進下一個對話

---

**最後提醒:**
- 本腳本僅限個人自用(替自己買自己要去的票)
- 不要做帳號並發 / 轉售 — 會觸到 ToS 紅線
- 若未來遇到 reCAPTCHA,別亂用第三方破解服務,那就是該收手的訊號
