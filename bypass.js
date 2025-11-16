require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

(async () => {
  const CHROME_PATH = ''; // opcional: ruta a Chrome/Chromium real
  const USER_DATA_DIR = process.env.USER_DATA_DIR; // opcional: perfil de usuario para hacer el navegador más "real"
  const PROXY = process.env.PROXY; // formato: host:port  o protocol://host:port
  const PROXY_TYPE = (process.env.PROXY_TYPE || 'http').toLowerCase();
  const PROXY_USER = process.env.PROXY_USER;
  const PROXY_PASS = process.env.PROXY_PASS;
  const USER_AGENT = process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-breakpad',
    '--disable-blink-features=AutomationControlled',
  ];

  if (PROXY) {
    const proxyArg = PROXY.includes('://') ? PROXY : `${PROXY_TYPE}://${PROXY}`;
    launchArgs.push(`--proxy-server=${proxyArg}`);
  }

  const launchOpts = {
    headless: false, // usar headful para reducir detección
    args: launchArgs,
    ignoreDefaultArgs: ['--enable-automation'],
  };
  if (CHROME_PATH) launchOpts.executablePath = CHROME_PATH;
  if (USER_DATA_DIR) launchOpts.userDataDir = USER_DATA_DIR;

  const browser = await puppeteer.launch(launchOpts);

  const page = await browser.newPage();

  // prepare logs folder
  try {
    if (!fs.existsSync('logs')) fs.mkdirSync('logs');
  } catch (e) {
    console.warn('Could not create logs folder:', e.message);
  }

  // Log responses with status >= 400 for post-mortem analysis
  page.on('response', async (response) => {
    try {
      const status = response.status();
      if (status >= 400) {
        const url = response.url();
        const headers = response.headers();
        let body = '';
        try { body = await response.text(); } catch (e) { body = '<no-body>'; }
        const safeName = url.replace(/[^a-z0-9]/gi, '_').slice(0,200);
        const ts = Date.now();
        fs.writeFileSync(path.join('logs', `${ts}_${safeName}_status${status}.html`), body);
        fs.writeFileSync(path.join('logs', `${ts}_${safeName}_status${status}.json`), JSON.stringify({url, status, headers}, null, 2));
        console.log('Saved blocked/failed response:', url, status);
      }
    } catch (e) { /* ignore logging errors */ }
  });

  // Si el proxy usa autenticación HTTP (user:pass), autenticar la página
  if (PROXY && PROXY_USER && PROXY_PASS) {
    try {
      await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
      console.log('Proxy authentication provided');
    } catch (e) {
      console.warn('Proxy authentication failed:', e.message);
    }
  }

  // Mostrar la IP saliente vista por el navegador para verificar el proxy
  try {
    const ipInfo = await page.evaluate(async () => {
      try {
        const r = await fetch('https://api.ipify.org?format=json');
        return await r.json();
      } catch (e) { return { error: e.message }; }
    });
    console.log('Outgoing IP (browser sees):', ipInfo.ip || ipInfo.error || ipInfo);
  } catch (e) {
    console.warn('Could not determine outgoing IP:', e.message);
  }

  // Cabecera y viewport más realistas
  await page.setUserAgent(USER_AGENT);
  await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' });
  await page.setViewport({ width: 1280, height: 800 });

  // Navegar a la URL objetivo (configurable)
  const TARGET_URL = process.env.TARGET_URL;
  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    console.log('Loaded target URL:', TARGET_URL);
  } catch (e) {
    console.warn('Navigation to target URL failed or timed out:', e.message || e);
  }

  // Inyecta medidas anti-detección más completas antes de que se cargue la página
  await page.evaluateOnNewDocument(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) {}
    window.chrome = window.chrome || { runtime: {} };
    try { Object.defineProperty(navigator, 'languages', { get: () => ['es-CO', 'en-US'] }); } catch (e) {}
    try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }); } catch (e) {}
    try { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 1 }); } catch (e) {}
    try { Object.defineProperty(navigator, 'plugins', { get: () => [{name:'Chrome PDF Plugin'}] }); } catch (e) {}
    try { Object.defineProperty(navigator, 'mimeTypes', { get: () => [{type:'application/pdf'}] }); } catch (e) {}

    // permissions spoof
    try {
      const originalQuery = navigator.permissions.query;
      navigator.permissions.__proto__.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    } catch (e) {}

    // WebGL fingerprint adjustments
    try {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return getParameter.apply(this, [parameter]);
      };
    } catch (e) {}
  });

  // Simula comportamiento humano básico: movimientos de ratón y scroll
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  async function humanMouseMovements(page, moves = 6) {
    const box = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    for (let i = 0; i < moves; i++) {
      const x = Math.floor(Math.random() * box.w * 0.9) + 10;
      const y = Math.floor(Math.random() * box.h * 0.9) + 10;
      await page.mouse.move(x, y, { steps: randomBetween(10, 25) });
      await sleep(randomBetween(100, 400));
    }
  }

  async function humanScrollAndPause(page) {
    const height = await page.evaluate(() => document.body.scrollHeight);
    const segments = 3;
    for (let i = 1; i <= segments; i++) {
      const pos = Math.floor((height / segments) * i);
      await page.evaluate((p) => window.scrollTo({ top: p, behavior: 'smooth' }), pos);
      await sleep(randomBetween(500, 1200));
    }
    await page.evaluate(() => window.scrollBy({ top: -100, behavior: 'smooth' }));
    await sleep(randomBetween(300, 800));
  }

  

  // Ejecutar acciones humanas iniciales
  try {
    await humanMouseMovements(page, 5);
    await humanScrollAndPause(page);
  } catch (err) {
    console.warn('Human simulation failed:', err.message);
  }

  try {
    // Intentaremos varias estrategias para localizar el input del documento
    const TEST_DOCUMENT = process.env.TEST_DOCUMENT;

    // pequeña espera para que React renderice
    await sleep(5000);
    
    // Intento 1: buscar el contenedor que contiene el texto indicativo
    let inputHandle = null;
    const labelText = 'Escribe tu número de documento';
    try {
      // Buscar el div por su texto en el DOM y devolver el input relacionado usando evaluateHandle
      const handle = await page.evaluateHandle((label) => {
        const divs = Array.from(document.querySelectorAll('div'));
        const div = divs.find(d => d.textContent && d.textContent.trim().includes(label));
        if (!div) return null;
        // Preferir input como sibling previo
        const prev = div.previousElementSibling;
        if (prev && prev.tagName === 'INPUT') return prev;
        // Luego sibling siguiente
        const next = div.nextElementSibling;
        if (next && next.tagName === 'INPUT') return next;
        // Input dentro del mismo contenedor
        const inside = div.querySelector('input');
        if (inside) return inside;
        // Buscar en el padre inmediato
        if (div.parentElement) {
          const pInput = div.parentElement.querySelector('input');
          if (pInput) return pInput;
        }
        return null;
      }, labelText);
      const asEl = handle && handle.asElement ? handle.asElement() : null;
      if (asEl) inputHandle = asEl;
      else {
        // liberar handle si no es elemento
        if (handle) await handle.dispose();
      }
    } catch (e) {
      console.warn('DOM search error (evaluateHandle):', e.message || e);
    }

    // Focus, clear and type (sólo si encontramos el input)
    if (inputHandle) {
      try {
        await inputHandle.focus();
        await page.evaluate(el => { el.value = ''; }, inputHandle);
        await inputHandle.type(TEST_DOCUMENT, { delay: 100 });
      } catch (e) {
        console.warn('Error interacting with input:', e.message || e);
      }
    } else {
      console.warn('No inputHandle found — skipping type/focus.');
    }

    // Esperar a que el botón submit se habilite (si aplica)
    try {
      await page.waitForFunction(() => {
        const b = document.querySelector('button[type="submit"]');
        return b && !b.disabled;
      }, { timeout: 7000 });
    } catch (e) { /* ignore */ }

    // Click en continuar
    try {
      const submit = await page.$('button[type="submit"]');
      if (submit) {
        await submit.click();
        console.log('Clicked submit button');
      } else {
        console.warn('Submit button not found');
      }
    } catch (e) {
      console.warn('Error clicking submit:', e.message);
    }

    // Esperar navegación / network activity o un poco de tiempo para que la app haga la consulta
    try {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 8000 }),
        sleep(5000)
      ]);
    } catch (e) { /* ignore navigation timeout */ }

    
  } catch (err) {
    console.warn('Form fill failed:', err.message);
  }
  

  // Espera para poder inspeccionar manualmente en modo headful
  await sleep(5000);
  await browser.close();
})();
