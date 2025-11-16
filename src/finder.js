const { sleep, randBetween } = require('./utils');

async function findDocumentInput(page, cfg, labelText = 'Escribe tu número de documento') {
  for (let attempt = 1; attempt <= Math.max(1, cfg.findInputRetries || 1); attempt++) {
    try {
      const idx = await page.evaluate((label) => {
        const divs = Array.from(document.querySelectorAll('div'));
        const div = divs.find(d => d.textContent && d.textContent.trim().includes(label));
        if (!div) return -1;
        const inputs = Array.from(document.querySelectorAll('input'));
        const candidates = [];
        const prev = div.previousElementSibling; if (prev && prev.tagName === 'INPUT') candidates.push(prev);
        const next = div.nextElementSibling; if (next && next.tagName === 'INPUT') candidates.push(next);
        const inside = div.querySelector('input'); if (inside) candidates.push(inside);
        if (div.parentElement) {
          const p = div.parentElement.querySelector('input'); if (p) candidates.push(p);
        }
        for (const c of candidates) {
          const i = inputs.indexOf(c);
          if (i !== -1) return i;
        }
        return -1;
      }, labelText);

      if (idx >= 0) {
        const inputs = await page.$$('input');
        if (inputs[idx]) return inputs[idx];
      }
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      console.warn('findDocumentInput attempt', attempt, 'error:', msg);
      if (msg.includes('Execution context was destroyed') || msg.includes('Cannot find context')) {
        await sleep((cfg.retryDelayMs || 1500) + randBetween(0, 500));
        continue;
      }
    }
    await sleep((cfg.retryDelayMs || 1500) + randBetween(0, 500));
  }
  return null;
}

async function fillAndSubmit(page, inputHandle, value, cfg) {
  if (!inputHandle) return false;
  try {
    await inputHandle.focus();
    await page.evaluate(el => el.value = '', inputHandle);
    await inputHandle.type(value, { delay: 100 });

    try { await page.waitForFunction(() => { const b = document.querySelector('button[type="submit"]'); return b && !b.disabled; }, { timeout: 7000 }); } catch (e) {}

    const submit = await page.$('button[type="submit"]');
    if (submit) { await submit.click(); console.log('Clicked submit'); }
    else console.warn('Submit button not found');

    try { await Promise.race([ page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 8000 }), sleep(5000) ]); } catch (e) {}
    return true;
  } catch (e) {
    console.warn('fillAndSubmit error:', e.message || e);
    return false;
  }
}

module.exports = { findDocumentInput, fillAndSubmit };
