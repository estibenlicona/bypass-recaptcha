require('dotenv').config();
const { getConfig } = require('./src/config');
const { sleep } = require('./src/utils');
const { createBrowser, preparePage } = require('./src/browser');
const { navigateTo } = require('./src/navigation');
const { findDocumentInput, fillAndSubmit } = require('./src/finder');

async function main() {
  const cfg = getConfig();
  const browser = await createBrowser(cfg);
  const page = await browser.newPage();
  await preparePage(page, cfg);

  const ok = await navigateTo(page, cfg.targetUrl, cfg);
  if (!ok) {
    console.error('Could not load target URL, exiting');
    await sleep(2000);
    await browser.close();
    process.exit(1);
  }

  // small human-like actions
  try { await page.mouse.move(100, 100, { steps: 10 }); } catch (e) {}
  try { await sleep(500); } catch (e) {}

  // locate input, fill and submit with retries
  const inputEl = await findDocumentInput(page, cfg);
  const okFill = await fillAndSubmit(page, inputEl, cfg.testDocument, cfg);
  if (!okFill) console.warn('Fill and submit did not complete successfully');

  // wait a bit for manual inspection in headful mode
  await sleep(5000);
}

main().catch(err => { console.error('Script failed:', err); process.exit(1); });
