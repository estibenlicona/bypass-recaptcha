const { sleep, randBetween } = require('./utils');

async function navigateTo(page, url, cfg) {
  let attempt = 0;
  const retries = Math.max(1, cfg.navigationRetries || 1);
  while (attempt < retries) {
    try {
      attempt++;
      console.log(`Navigating to ${url} (attempt ${attempt})`);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: cfg.navigationTimeout });
      console.log('Loaded', url);
      return true;
    } catch (e) {
      console.warn('Navigation failed (attempt', attempt, '):', e.message || e);
      if (attempt < retries) await sleep((cfg.retryDelayMs || 1500) + randBetween(0, 800));
    }
  }
  return false;
}

module.exports = { navigateTo };
