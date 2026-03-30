

const puppeteer = require('puppeteer');

// ============================
//  設定區（每次搶票前修改這裡）
// ============================
const CONFIG = {
  //活動頁面網址（開賣前就能拿到）
  // 到拓元找到你要的活動，點進「節目場次」頁面，複製網址貼在這裡
  activityUrl:'https://tixcraft.com/activity/detail/25_lioneers',

  //目標場次的日期時間（用這個來找到正確的場次）
  // 填你在頁面上看到的日期時間文字，不用完全一樣，「包含」就會匹配
  // 例如：'2026/05/03' 或 '05/03 18:30' 或 '05/03'
  targetDate: '2026/04/11 ',

  //想要的票區關鍵字（腳本會自動選包含這個文字的票區）

  targetArea: '獅心瘋',

  //想買的張數
  ticketCount: 2,

  // 刷新間隔（毫秒），不建議低於 300
  refreshInterval: 400,

};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  const now = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  console.log(`[${now}] ${message}`);
}

async function launchBrowser() {
  log('正在啟動瀏覽器...');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    executablePath: '/Volumes/NVme/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  });

  log('瀏覽器已啟動');
  return { browser, page };
}

async function waitForLogin(page) {
  await page.goto('https://tixcraft.com/login');
  log('');
  log('請在瀏覽器中手動登入拓元帳號...');
  log('   （登入完成後腳本會自動繼續）');
  log('');

  await page.waitForFunction(
    () => {
      if (!window.location.hostname.includes('tixcraft.com')) return false;
      return !!document.querySelector('a[href*="logout"]');
    },
    { timeout: 300000, polling: 500 }
  );

  log('登入成功！');
  await delay(1000);
}

async function waitAndSelectSession(page) {
  log(`正在前往活動頁面：${CONFIG.activityUrl}`);
  await page.goto(CONFIG.activityUrl, { waitUntil: 'domcontentloaded' });
  await delay(1000);

  const buyNowClicked = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a, button'));
    for (const el of links) {
      if (el.textContent.includes('立即購票') || el.textContent.includes('立刻購票')) {
        el.click();
        return true;
      }
    }
    return false;
  });

  if (buyNowClicked) {
    log('已點擊「立即購票」，等待場次列表載入...');
    await delay(2000);
  }

  log(`目標場次：包含「${CONFIG.targetDate}」的場次`);
  log('開始監控，等待開賣...');
  log('');

  let attemptCount = 0;

  while (true) {
    attemptCount++;
    try {
      const result = await page.evaluate((targetDate) => {
        const rows = document.querySelectorAll('tr, .list-group-item, li');

        for (const row of rows) {
          const rowText = row.textContent || '';

          if (rowText.includes(targetDate)) {
            const link = row.querySelector('a[href*="/ticket/area/"]');
            const btn = row.querySelector('button[data-href*="/ticket/area/"]');

            const target = link || btn;
            if (target) {
              const rawUrl = link ? link.href : btn.getAttribute('data-href');
                              const url = rawUrl && rawUrl.startsWith('http')
                                ? rawUrl
                                : new URL(rawUrl, window.location.origin).href;
              const isDisabled =
                target.classList.contains('disabled') ||
                target.hasAttribute('disabled') ||
                target.closest('.disabled') !== null;

              if (!isDisabled) {
                return { found: true, url, text: rowText.trim().substring(0, 50) };
              } else {
                return { found: false, reason: 'disabled', text: rowText.trim().substring(0, 50) };
              }
            }

            return { found: false, reason: 'no-link', text: rowText.trim().substring(0, 50) };
          }
        }

        return { found: false, reason: 'not-found' };
      }, CONFIG.targetDate);

      if (result.found) {
        log(`找到可購票的場次！「${result.text}」`);
        log(`   前往：${result.url}`);
        await page.goto(result.url, { waitUntil: 'domcontentloaded' });
        return;
      }

      if (attemptCount % 10 === 1) {
        if (result.reason === 'disabled') {
          log(`找到場次「${result.text}」但尚未開賣，持續監控中...（第 ${attemptCount} 次）`);
        } else if (result.reason === 'no-link') {
          log(`找到場次但沒有購票連結，持續監控中...（第 ${attemptCount} 次）`);
        } else {
          log(`找不到包含「${CONFIG.targetDate}」的場次，持續監控中...（第 ${attemptCount} 次）`);
        }
      }

      await delay(CONFIG.refreshInterval);
      await page.reload({ waitUntil: 'domcontentloaded' });
    } catch (error) {
      log(`刷新時發生錯誤：${error.message}，重試中...`);
      await delay(1000);
      await page.goto(CONFIG.activityUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
}

async function selectArea(page) {
  log(`正在尋找包含「${CONFIG.targetArea}」的票區...`);
  await delay(2000);

  const clicked = await page.evaluate((keyword) => {
    const links = Array.from(document.querySelectorAll('a[id]'));
    for (const link of links) {
      if (link.textContent.includes(keyword) && !link.textContent.includes('已售完')) {
        link.click();
        return { found: true, text: link.textContent.trim() };
      }
    }
    for (const link of links) {
      if (link.textContent.includes('剩餘') && !link.textContent.includes('已售完')) {
        link.click();
        return { found: true, text: link.textContent.trim(), fallback: true };
      }
    }
    return { found: false };
  }, CONFIG.targetArea);

  if (clicked.found) {
    if (clicked.fallback) {
      log(`找不到「${CONFIG.targetArea}」，改選：${clicked.text}`);
    } else {
      log(`找到票區：${clicked.text}`);
    }
    await delay(1000);
  } else {
    log('沒有找到任何可用票區！');
  }
}

async function selectTicketCount(page) {
  log(`正在選擇 ${CONFIG.ticketCount} 張票...`);

  try {
    await page.waitForSelector('select', { timeout: 5000 });

    const selected = await page.evaluate((count) => {
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const name = (select.name || select.id || '').toLowerCase();
        if (name.includes('ticket') || name.includes('amount') || name.includes('qty')) {
          select.value = String(count);
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      if (selects.length > 0) {
        selects[0].value = String(count);
        selects[0].dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, CONFIG.ticketCount);

    if (selected) {
      log(`已選擇 ${CONFIG.ticketCount} 張`);
    } else {
      log('沒有找到張數選單，請手動選擇');
    }
  } catch (error) {
    log(`選擇張數時發生問題：${error.message}`);
    log('請手動選擇張數');
  }
}

async function waitForCaptcha(page) {
  log('');
  log('==========================================');
  log('  請到瀏覽器視窗手動完成驗證碼！');
  log('  驗證碼通過後，腳本會自動繼續下一步');
  log('==========================================');
  log('');

  try {
    await page.waitForFunction(
      () => {
        const url = window.location.href;
        return (
          url.includes('/ticket/order') ||
          url.includes('/ticket/checkout') ||
          url.includes('/order')
        );
      },
      { timeout: 120000 }
    );
    log('驗證碼已通過！');
  } catch (error) {
    log('等待驗證碼逾時（2 分鐘），請確認頁面狀態');
  }
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('   拓元搶票腳本 v2.0（依日期選場次）');
  console.log('========================================');
  console.log('');
  console.log(`  活動網址  ：${CONFIG.activityUrl}`);
  console.log(`  目標場次  ：包含「${CONFIG.targetDate}」`);
  console.log(`  目標票區  ：包含「${CONFIG.targetArea}」`);
  console.log(`  購買張數  ：${CONFIG.ticketCount}`);
  console.log('');

  try {
    const { browser, page } = await launchBrowser();
    await waitForLogin(page);
    await waitAndSelectSession(page);
    await selectArea(page);
    await selectTicketCount(page);
    await waitForCaptcha(page);

    log('');
    log('腳本流程執行完畢！');
    log('瀏覽器視窗會保持開啟，你可以手動操作。');
  } catch (error) {
    console.error('腳本執行發生錯誤：', error.message);
    console.error(error.stack);
  }
}

main();
