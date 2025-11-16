const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function createBrowser(cfg) {
  const launchArgs = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-zygote', '--disable-gpu', '--disable-breakpad',
    '--disable-blink-features=AutomationControlled'
  ];
  if (cfg.proxy) {
    const proxyArg = cfg.proxy.includes('://') ? cfg.proxy : `${cfg.proxyType}://${cfg.proxy}`;
    launchArgs.push(`--proxy-server=${proxyArg}`);
  }

  const opts = { headless: false, args: launchArgs, ignoreDefaultArgs: ['--enable-automation'] };
  if (cfg.chromePath) opts.executablePath = cfg.chromePath;
  if (cfg.userDataDir) opts.userDataDir = cfg.userDataDir;

  return puppeteer.launch(opts);
}

async function preparePage(page, cfg) {
  try { if (!fs.existsSync('logs')) fs.mkdirSync('logs'); } catch (e) {}

  page.on('response', async res => {
    try {
      const status = res.status();
      if (status >= 400) {
        const url = res.url();
        const headers = res.headers();
        let body = '';
        try { body = await res.text(); } catch (e) { body = '<no-body>'; }
        const safe = url.replace(/[^a-z0-9]/gi, '_').slice(0,200);
        const ts = Date.now();
        fs.writeFileSync(path.join('logs', `${ts}_${safe}_status${status}.html`), body);
        fs.writeFileSync(path.join('logs', `${ts}_${safe}_status${status}.json`), JSON.stringify({url, status, headers}, null, 2));
        console.log('Saved response error:', url, status);
      }
    } catch (e) { /* ignore */ }
  });

  if (cfg.proxy && cfg.proxyUser && cfg.proxyPass) {
    try { await page.authenticate({ username: cfg.proxyUser, password: cfg.proxyPass }); console.log('Proxy auth provided'); } catch (e) { console.warn('Proxy auth failed'); }
  }

  try {
    const ip = await page.evaluate(async () => {
      try { const r = await fetch('https://api.ipify.org?format=json'); return (await r.json()).ip; } catch (e) { return null; }
    });
    console.log('Outgoing IP (browser):', ip);
  } catch (e) {}

  await page.setUserAgent(cfg.userAgent);
  await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' });
  await page.setViewport({ width: 1280, height: 800 });

  await page.evaluateOnNewDocument(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) {}
    window.chrome = window.chrome || { runtime: {} };
    try { Object.defineProperty(navigator, 'languages', { get: () => ['es-CO', 'en-US'] }); } catch (e) {}
    try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }); } catch (e) {}
    try { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 1 }); } catch (e) {}
    try { Object.defineProperty(navigator, 'plugins', { get: () => [{name:'Chrome PDF Plugin'}] }); } catch (e) {}
  });
}

module.exports = { createBrowser, preparePage };
