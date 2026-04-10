const puppeteer = require('puppeteer');
const axios = require('axios');
const crypto = require('crypto');
const readline = require('readline');

const config = {
  // 活動網址
  activityUrl: 'https://ticketplus.com.tw/activity/33c0f6ee608becee01068c72b014a653',
  // 目標場次名稱
  targetName: 'Hi-Fi Un!corn 2026 ASIA LIVEHOUSE TOUR - FIRST MOVE in TAIPEI',
  // 目標場次日期 (格式: YYYY-MM-DD, 會用 includes 比對 sessions.json 的 date 字串)
  targetDate: '2026-05-23',
  // 購買張數
  ticketCount: 1,
  // 開賣時間 (格式: 'YYYY-MM-DD HH:mm:ss'; 留空字串 '' 表示立即模式)
  saleTime: '',
  // 開賣前幾秒開始輪詢 API
  headStartSeconds: 5,
  // 倒數階段輪詢間隔（毫秒）
  apiPollInterval: 300,
  // 本機 Chrome 路徑
  chromePath: '/Volumes/NVme/Google Chrome.app/Contents/MacOS/Google Chrome',
  // 目標票區名稱 (A區/B區)
  targetArea: 'A區',
};

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function log(message) {
        const now=new Date().toLocaleTimeString('zh-TW', { hour12: false });
        console.log(`[${now}] ${message}`);
    }
    function md5(text) {
        return crypto.createHash('md5').update(text).digest('hex');
    }


    function promptVisible(question) {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }

    function promptHidden(question) {
        return new Promise((resolve) => {
            process.stdout.write(question);
            process .stdin.resume();
            process.stdin.setRawMode(true);
            process.stdin.setEncoding('utf8');
            let password = '';
            const onData = (char) => {
                char = char.toString();

                if (char === '\n' || char === '\r' || char === '\u0004') {
                    //Enter or Ctrl+D
                    process.stdout.write('\n');
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', onData);
                    resolve(password);
                } else if (char === '\u0003') {
                    // Ctrl+C
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

const API_BASE_URL   = 'https://api.ticketplus.com.tw';
const QUEUE_API_BASE = 'https://queue.ticketplus.com.tw';
const CONFIG_API_BASE = 'https://apis.ticketplus.com.tw';

// ---- v0.2 新增: 取得票區清單 ----
async function fetchTicketAreas(activityId) {
  const url = `${CONFIG_API_BASE}/config/api/v1/getS3?path=event/${activityId}/ticketAreas.json&_=${Date.now()}`;
  const res = await axios.get(url, { headers: COMMON_HEADERS, timeout: 10000 });
  return res.data.ticketAreas || [];
}

// ---- v0.2 新增: 取得票種清單 ----
async function fetchProducts(activityId) {
  const url = `${CONFIG_API_BASE}/config/api/v1/getS3?path=event/${activityId}/products.json&_=${Date.now()}`;
  const res = await axios.get(url, { headers: COMMON_HEADERS, timeout: 10000 });
  return res.data.products || [];
}

// ---- v0.2 新增: 以票區名稱匹配 ticketAreaId + productId ----
function findTargetProduct(ticketAreas, products, targetAreaName, sessionId) {
  const area = ticketAreas.find(a =>
    a.name === targetAreaName && (!sessionId || a.sessionId === sessionId)
  );
  if (!area) throw new Error(`找不到目標票區: ${targetAreaName}`);

  const product = products.find(p =>
    p.ticketAreaId === area.ticketAreaId && (!sessionId || p.sessionId === sessionId)
  );
  if (!product) throw new Error(`找不到「${targetAreaName}」對應的票種`);

  log(`目標票區: ${area.name} (${area.ticketAreaId}), 票種: ${product.name} (${product.productId}), 價格: NT.${product.price}`);
  return { area, product };
}

// ---- v0.2 新增: 排隊 (errCode=137 → 等 waitSecond → retry, errCode=00 → 回傳 uuid) ----
async function enqueue(accessToken, productId, count) {
  const body = {
    products: [{ productId, count }],
    reserveSeats: true,
    consecutiveSeats: false,
    finalizedSeats: true,
  };
  const authHeaders = {
    ...COMMON_HEADERS,
    'authorization': `Bearer ${accessToken}`,
    'content-type': 'application/json',
  };

  let attempt = 0;
  while (true) {
    attempt++;
    const url = `${QUEUE_API_BASE}/queue/api/v1/enqueue?_=${Date.now()}`;
    log(`enqueue 第 ${attempt} 次...`);
    const res = await axios.post(url, body, { headers: authHeaders, timeout: 15000 });
    const data = res.data;

    if (data.errCode === '00') {
      log(`排隊通過! uuid=${data.uuid}`);
      return data.uuid;
    }
    if (data.errCode === '137') {
      const waitSec = data.waitSecond || 10;
      log(`排隊中 (errCode=137), 等待 ${waitSec} 秒後重試...`);
      await delay(waitSec * 1000);
      continue;
    }
    throw new Error(`enqueue 失敗: errCode=${data.errCode} msg=${data.errMsg}`);
  }
}

// ---- v0.2 新增: 保留票券 ----
async function reserveTicket(accessToken, productId, count, uuid) {
  const url = `${API_BASE_URL}/ticket/api/v1/reserve?_=${Date.now()}`;
  const body = {
    products: [{ productId, count }],
    reserveSeats: true,
    consecutiveSeats: false,
    finalizedSeats: true,
    uuid,
  };
  const authHeaders = {
    ...COMMON_HEADERS,
    'authorization': `Bearer ${accessToken}`,
    'content-type': 'application/json',
  };

  log('呼叫 reserve API...');
  const res = await axios.post(url, body, { headers: authHeaders, timeout: 15000 });
  const data = res.data;
  if (data.errCode !== '00') throw new Error(`reserve 失敗: errCode=${data.errCode} msg=${data.errMsg}`);

  log(`保留成功! orderId=${data.orderId}, 剩餘 ${data.remainSecond} 秒`);
  return data;
}

// ---- v0.2 新增: 取消保留 (備用) ----
async function releaseOrder(accessToken, orderId) {
  const url = `${API_BASE_URL}/ticket/api/v1/release?_=${Date.now()}`;
  const authHeaders = {
    ...COMMON_HEADERS,
    'authorization': `Bearer ${accessToken}`,
    'content-type': 'application/json',
  };
  log(`取消保留 orderId=${orderId}...`);
  const res = await axios.post(url, { orderId }, { headers: authHeaders, timeout: 10000 });
  const data = res.data;
  if (data.errCode !== '00') log(`[WARN] release 失敗: errCode=${data.errCode}`);
  else log('已取消保留');
  return data;
}

const COMMON_HEADERS = {'accept'        : 'application/json, text/plain, */*',
  'accept-language': 'zh-TW,zh;q=0.9,en;q=0.8',
  'origin'        : 'https://ticketplus.com.tw',
  'referer'       : 'https://ticketplus.com.tw/',
  'user-agent'    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
//登入
async function loginViaApi(mobile, password,countryCode='886') {
    log('正在透過Ａpi登入...');
   const url = `${API_BASE_URL}/user/api/v1/login?_=${Date.now()}`;
   const body = {

      countryCode,
      mobile,
      password: md5(password),
    };
 try {
    const res = await axios.post(url, body, {
      headers: { ...COMMON_HEADERS, 'content-type': 'application/json' },
      timeout: 10000,
    });
    const data = res.data;

    // 錯誤不是 HTTP 4xx,而是 body.errCode
    if (data.errCode && data.errCode !== '00') {

      log(`登入失敗: errCode=${data.errCode} msg=${data.errMsg}`);
      if (data.errDetail) log(`  詳細: ${data.errDetail}`);
      throw new Error(`Login failed: ${data.errMsg}`);
    }

    log('API 登入成功');
    // U2 已確認: token 在 data.userInfo，cookie 需要 account + userInfo 的內容
    return { account: mobile, ...data.userInfo };
  } catch (err) {
    if (err.response) {
      log(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

// ---- 關掉年齡限制 modal（若有） ----
async function dismissAgeModal(page) {
  try {
    await page.waitForSelector('.v-dialog--active', { timeout: 3000 });
    const clicked = await page.evaluate(() => {
      const dialog = document.querySelector('.v-dialog--active');
      if (!dialog) return false;
      const btns = dialog.querySelectorAll('.v-btn');
      for (const b of btns) {
        if (b.textContent.trim() === '確定') { b.click(); return true; }
      }
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

// ---- 讀取瀏覽器 Vuex store 的場次狀態 ----
// U4 (MCP 實測結論): 原本想直打 config/api/v1/get，但這支 API 需要短 ID
// (e.g. e000001261 / s000001860)，而短 ID 並未出現在 sessions.json / event.json
// 的任何 top-level field，實際上是被某個 lazy chunk 透過未知 mapping 取得。
//
// Pivot: 不自己打 API，改從 browser 的 Vuex store 讀 —— Vue app 已經把完整狀態
// merge 進 store.state.event.campaign，包含 status / saleStart / saleEnd / id。
// 這跟 UI 100% 同步，而且不用碰短 ID 問題。
async function fetchSessionStatus(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#app');
    let store = null;
    try {
      if (el && el.__vue_app__) store = el.__vue_app__.config.globalProperties.$store;
      else if (el && el.__vue__) store = el.__vue__.$store;
    } catch (_) {}
    if (!store || !store.state || !store.state.event) return null;
    const c = store.state.event.campaign || {};
    return {
      id:          c.id          || null, // 短 ID, e.g. "e000001261"
      event_id:    c.event_id    || null, // 長 ID (32-char hex)
      status:      c.status      || null, // "onsale" / "pending" / "ended" / ...
      saleStart:   c.saleStart   || null,
      saleEnd:     c.saleEnd     || null,
      exposeStart: c.exposeStart || null,
      exposeEnd:   c.exposeEnd   || null,
      lock:        c.lock,
      hidden:      c.hidden,
    };
  });
}

// ---- 判斷是否代表「已開賣」 ----
// 主要判斷: campaign.status === 'onsale'
// 次要保險: saleStart 時間已過 AND saleEnd 時間未到 AND 未被 lock/hidden
function isOnSale(status) {
  if (!status) return false;
  if (status.status !== 'onsale') return false;
  if (status.lock) return false;
  if (status.hidden) return false;
  const now = Date.now();
  if (status.saleStart && now < new Date(status.saleStart).getTime()) return false;
  if (status.saleEnd   && now > new Date(status.saleEnd).getTime())   return false;
  return true;
}

async function launchBrowser(){
log('啟動瀏覽器...');

const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    executablePath: config.chromePath,
    args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
    ],
});
const page = await browser.newPage();

//反偵測
await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  });

  log('瀏覽器已啟動');
  return { browser, page };
}

//注入登入
async function injectLogin(page, loginResp){
  // U1.5 (MCP 實測): ticketplus 的 permission.js 會 JSON.parse(Cookies.get('expiredTime'))
  // 只設 user cookie 會讓 permission.js 炸 `JSON.parse("undefined")` -> Vue router guard throw -> 白屏
  // 必須同時設 user + expiredTime 兩個 cookie
  const userCookieValue = encodeURIComponent(JSON.stringify(loginResp));
  const expiredTimeMs   = Date.now() + (loginResp.access_token_expires_in || 3599) * 1000;

  await page.setCookie(
    {
      name:     'user',
      value:    userCookieValue,
      domain:   '.ticketplus.com.tw',
      path:     '/',
      secure:   true,
      httpOnly: false,
    },
    {
      name:     'expiredTime',
      value:    String(expiredTimeMs),
      domain:   '.ticketplus.com.tw',
      path:     '/',
      secure:   true,
      httpOnly: false,
    }
  );

  // localStorage.tp 看起來是 heartbeat 時間戳（非必要，但手動登入的瀏覽器會有）
  // 用 evaluateOnNewDocument 讓它在每次 navigation 的頁面 script 跑之前就存在
  await page.evaluateOnNewDocument((ts) => {
    try { localStorage.setItem('tp', String(ts)); } catch (_) {}
  }, Date.now());
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
  // 在 sessions.json 中找出符合 config.targetName/targetDate 的場次
function matchTargetSession(sessionsJson, targetName, targetDate) {
  // U3 已確認: 頂層為 { sessions: [...] }，欄位為 name / date
  // date 格式: "2026-05-23 ~ 2026-05-23"，用 includes 即可匹配
  const list = sessionsJson.sessions || [];

  for (const s of list) {
    const nameOk = !targetName || s.name.includes(targetName);
    const dateOk = !targetDate || s.date.includes(targetDate);
    if (nameOk && dateOk) return s;
  }
  return null;
}

// 從單一 session 物件萃取 eventId + sessionId
function extractSessionIds(session) {
  // U3 已確認: 欄位名稱為 eventId / sessionId
  const { eventId, sessionId } = session;
  if (!eventId || !sessionId) {
    throw new Error(
      `無法從 session 物件取得 eventId/sessionId, 原始物件: ${JSON.stringify(session)}`
    );
  }
  return { eventId, sessionId };
}

// ---- 取得該活動的所有場次 ----
async function fetchSessions(activityId) {
  const url = `${CONFIG_API_BASE}/config/api/v1/getS3?path=event/${activityId}/sessions.json&_=${Date.now()}`;
  const res = await axios.get(url, {
    headers: COMMON_HEADERS,
    timeout: 10000,
  });
  return res.data;
}

// ---- 從活動網址解析 activityId ----
function extractActivityId(url) {
  const m = url.match(/\/activity\/([a-f0-9]{32})/);
  if (!m) throw new Error(`無法從網址解析 activityId: ${url}`);
  return m[1];
}

//   倒數等待開賣
// ============================
async function waitUntilSaleTime() {
  if (!config.saleTime) {
    log('未設定開賣時間,直接開始搶票');
    return;
  }

  const saleDate = new Date(config.saleTime);
  if (isNaN(saleDate.getTime())) {
    log(`開賣時間格式錯誤:「${config.saleTime}」,直接開始搶票`);
    return;
  }

  const startAt = new Date(saleDate.getTime() - config.headStartSeconds * 1000);

  log(`開賣時間:${config.saleTime}`);
  log(`將在開賣前 ${config.headStartSeconds} 秒進入搶票階段`);

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

//   Main
// ============================
async function main() {
  console.log('');
  console.log('========================================');
  console.log('   遠大 (ticketplus) 搶票腳本 v0.1');
  console.log('========================================');
  console.log('');
  console.log(`  活動網址  : ${config.activityUrl || '(未設定)'}`);
  console.log(`  目標場次  : ${config.targetName || '(未設定)'}`);
  console.log(`  目標日期  : ${config.targetDate || '(不限)'}`);
  console.log(`  購買張數  : ${config.ticketCount}`);
  console.log(`  開賣時間  : ${config.saleTime || '(立即)'}`);
  console.log('');

  // --- 1. Prompt 帳號密碼 ---
  const mobile   = await promptVisible('請輸入手機號碼(例 912345678): ');
  const password = await promptHidden ('請輸入密碼: ');

  // --- 2. API 登入 ---
  const loginResp = await loginViaApi(mobile, password);

  // --- 3. 啟動瀏覽器 ---
  const { browser, page } = await launchBrowser();

  // --- 4. 注入 user cookie (U1/U2 已解) ---
  await injectLogin(page, loginResp);

  // --- 5. 載入活動頁 & 關 age modal ---
  if (!config.activityUrl) {
    log('[ERROR] 未設定 config.activityUrl,無法繼續');
    return;
  }
  await page.goto(config.activityUrl, { waitUntil: 'domcontentloaded' });
  await dismissAgeModal(page);

  // --- 6. 抓 sessions.json & 鎖定目標場次 ---
  const activityId = extractActivityId(config.activityUrl);
  log(`activityId = ${activityId}`);

  const sessionsJson = await fetchSessions(activityId);
  const target = matchTargetSession(sessionsJson, config.targetName, config.targetDate);
  if (!target) {
    log('[ERROR] 找不到目標場次,請檢查 config.targetName/targetDate 或 U3 schema 是否對上');
    return;
  }
  const { eventId, sessionId } = extractSessionIds(target);
  log(`已鎖定場次: eventId=${eventId} sessionId=${sessionId}`);

  // --- 7. 倒數等待開賣 ---
  await waitUntilSaleTime();

  // --- 8. 從瀏覽器 Vuex store 輪詢場次狀態 ---
  log('開始從瀏覽器 Vuex store 輪詢場次狀態...');
  let attempts = 0;
  let sampleLogged = false;
  while (true) {
    attempts++;
    try {
      const status = await fetchSessionStatus(page);

      // 第一次 response 印出來，方便確認 store 有正確載入
      if (!sampleLogged) {
        console.log('---- [狀態快照] 首次 store.state.event.campaign ----');
        console.log(JSON.stringify(status, null, 2));
        console.log('---- [end] ----');
        sampleLogged = true;
      }

      if (isOnSale(status)) {
        log(`偵測到開賣 (第 ${attempts} 次輪詢, status=${status.status})`);
        break;
      }

      if (attempts % 20 === 1) {
        const s = status ? status.status : 'null';
        log(`輪詢中... (已第 ${attempts} 次, status=${s})`);
      }
    } catch (err) {
      if (attempts % 20 === 1) log(`輪詢錯誤: ${err.message}`);
    }
    await delay(config.apiPollInterval);
  }

  // --- 9. 在瀏覽器點購買按鈕 ---
  // 先 reload 確保瀏覽器 DOM 也是開賣後狀態(Vue 可能 cache 舊 state)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await delay(300);
  await dismissAgeModal(page);  // reload 後 modal 可能再次出現

  const clickResult = await clickBuySessionByName(page, config.targetName);
  log(`點擊結果: ${JSON.stringify(clickResult)}`);

  if (!clickResult.found) {
    log('[WARN] 場次按鈕點擊失敗,可能開賣狀態尚未反映到 DOM,短暫等待後重試...');
    for (let i = 0; i < 10; i++) {
      await delay(300);
      await page.reload({ waitUntil: 'domcontentloaded' });
      const r = await clickBuySessionByName(page, config.targetName);
      if (r.found) { log(`第 ${i + 2} 次嘗試成功`); break; }
    }
  }

  // ===== v0.2 (U5) 選位+排隊+保留+確認流程 =====

  // --- Step 10: 等待頁面導航到 /order/ ---
  log('Step 10: 等待頁面導航到 /order/ ...');
  try {
    await page.waitForFunction(
      () => window.location.pathname.includes('/order/'),
      { timeout: 15000 }
    );
    log(`進入選票頁: ${page.url()}`);
  } catch {
    log('[WARN] 等待 /order/ 超時，嘗試直接導航...');
    await page.goto(
      `https://ticketplus.com.tw/order/${activityId}/${sessionId}`,
      { waitUntil: 'domcontentloaded' }
    );
  }
  await delay(1500); // 等 Vue + ticketAreas/products API 初始化完成

  // --- Step 11: 取得票區 + 票種 → 確認目標 productId ---
  log('Step 11: 取得票區與票種資料...');
  const ticketAreas = await fetchTicketAreas(activityId);
  const products = await fetchProducts(activityId);
  findTargetProduct(ticketAreas, products, config.targetArea, sessionId);

  // --- Step 12: UI 操作 — 展開票區 → 點 + → 點下一步 ---
  log(`Step 12: UI 操作，選「${config.targetArea}」× ${config.ticketCount} 張...`);

  // 12-A: 點擊目標票區展開
  // DOM 實測: 票區是 Vuetify v-expansion-panel，不是 .v-btn
  // 初始狀態所有票區皆收合，點擊 header 後展開 → 才出現 +/- 和數量控制
  const areaClicked = await page.evaluate((areaName) => {
    const headers = [...document.querySelectorAll('.v-expansion-panel-header')];
    const areaHeader = headers.find(h => h.textContent.includes(areaName));
    if (!areaHeader) return false;
    areaHeader.click();
    return true;
  }, config.targetArea);

  if (areaClicked) {
    log(`「${config.targetArea}」已展開`);
    await delay(600);
  } else {
    log(`[WARN] 找不到「${config.targetArea}」按鈕，繼續嘗試...`);
  }

  // 12-B: 點 + 按鈕 ticketCount 次
  // DOM 實測: + 是 icon button <i class="mdi mdi-plus">，無 textContent
  for (let i = 0; i < config.ticketCount; i++) {
    const added = await page.evaluate(() => {
      const plusIcon = document.querySelector('.mdi-plus');
      if (!plusIcon) return false;
      const plusBtn = plusIcon.closest('.v-btn');
      if (plusBtn) { plusBtn.click(); return true; }
      return false;
    });
    if (!added) log(`[WARN] 第 ${i + 1} 次點 + 失敗`);
    await delay(300);
  }
  log(`已選 ${config.ticketCount} 張票`);

  // 12-C: 點「下一步」
  // DOM 實測: 按鈕有專屬 class .nextBtn，disabled 時有 .v-btn--disabled
  await delay(500);
  const nextBtnResult = await page.evaluate(() => {
    const nextBtn = document.querySelector('.nextBtn');
    if (!nextBtn) return 'not-found';
    if (nextBtn.classList.contains('v-btn--disabled')) return 'disabled';
    nextBtn.click();
    return 'clicked';
  });

  if (nextBtnResult === 'clicked') {
    log('已點「下一步」，Vue app 正在處理排隊/保留...');
  } else if (nextBtnResult === 'disabled') {
    log('[WARN] 「下一步」仍為 disabled，張數可能未成功選取，等待後重試...');
    await delay(1500);
    // 重試: 再點一次 + 然後點下一步
    await page.evaluate(() => {
      const plusIcon = document.querySelector('.mdi-plus');
      if (plusIcon) { const btn = plusIcon.closest('.v-btn'); if (btn) btn.click(); }
    });
    await delay(500);
    await page.evaluate(() => {
      const btn = document.querySelector('.nextBtn');
      if (btn && !btn.classList.contains('v-btn--disabled')) btn.click();
    });
  } else {
    log('[WARN] 找不到「下一步」按鈕');
  }

  // --- Step 15: 等待確認選位結果頁 (排隊時間不定，最多等 3 分鐘) ---
  log('Step 15: 等待導航到 /confirmSeat/ ...');
  try {
    await page.waitForFunction(
      () => window.location.pathname.includes('/confirmSeat/'),
      { timeout: 180000 }
    );
    log('已進入確認選位結果頁!');
  } catch {
    log('[ERROR] 等待 /confirmSeat/ 超時，請手動確認頁面狀態');
    log('瀏覽器保持開啟，請手動繼續');
    return;
  }
  await delay(1000);

  // --- Step 16: log 座位資訊 + 點「下一步」 ---
  log('Step 16: 讀取座位資訊...');
  const seatTexts = await page.evaluate(() => {
    const els = document.querySelectorAll('p, span, h1, h2, h3, .v-list-item__title, .v-list-item__subtitle');
    return [...new Set([...els].map(el => el.textContent.trim()).filter(t => t.length > 0 && t.length < 80))].slice(0, 25);
  });
  log(`確認選位頁文字: ${JSON.stringify(seatTexts)}`);

  const confirmNext = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.v-btn')].find(b =>
      b.textContent.trim() === '下一步' &&
      !b.disabled &&
      !b.classList.contains('v-btn--disabled')
    );
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (confirmNext) {
    log('已點確認選位頁「下一步」，進入 Step 3 確認資料 (U6 待實作)');
  } else {
    log('[WARN] 確認選位頁「下一步」找不到，請手動確認');
  }

  log('');
  log('=========================================');
  log('  v0.2 (U5) 選位+排隊+保留 流程完成');
  log('  後續確認資料/付款流程待 U6 實作');
  log('  瀏覽器保持開啟');
  log('=========================================');
}

main().catch((e) => {
  console.error('腳本發生錯誤:', e.message);
  console.error(e.stack);
});

