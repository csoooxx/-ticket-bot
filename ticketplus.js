const puppeteer = require('puppeteer');
const axios = require('axios');
const crypto = require('crypto');
const readline = require('readline');
//const { Activity } = require('react');

const config = {
    //活動網址
    ActivityUrl: 'https://ticketplus.com.tw/activity/33c0f6ee608becee01068c72b014a653',
    //目標場次名稱
    teagetName: 'Hi-Fi Un!corn 2026 ASIA LIVEHOUSE TOUR - FIRST MOVE in TAIPEI',
    //目標場次日期
    teagetDate: '2026-05-23',
    //購買張數
    ticketNum: 1,
    // 開賣前幾秒開始輪詢 API(與 tixcraft 一致)
  headStartSeconds: 5,
    //倒數階段
    configPollingInterval: 2000,
    // 倒數階段輪詢間隔（毫秒）
    apiPollingInterval: 2000,
    //Chrome 路徑
   // 本機 Chrome 路徑
  chromePath: '/Volumes/NVme/Google Chrome.app/Contents/MacOS/Google Chrome',


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

const API_BASE_URL = 'https://api.ticketplus.com.tw';
const CONFIG_API_BASE='https://apis.ticketplus.com.tw';

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
    return data;
  } catch (err) {
    if (err.response) {
      log(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
    }
    throw err;
  }
}

//取得該活動的event metadata
async function fetchEventMetadata(activityId) {
    const url =`${CONFIG_API_BASE}/config/api/v1/getS3?path=event/${activityId}/event.json&_=${Date.now()}`;
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
// 暫時測試,測完刪掉
(async () => {
  const r = await loginViaApi('', '');
  console.log(JSON.stringify(r, null, 2));
})();

