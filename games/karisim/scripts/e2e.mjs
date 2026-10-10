// End-to-end smoke test: tutorial → solve levels 1-3 by tapping tubes → win sheet → undo, hint,
// empty bowl → progress survives reload → no console errors.
// Usage: npm run preview -w games/karisim -- --port 4186, then
//   node games/karisim/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4186/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else console.log('ok', msg); };
const K = (fn, arg) => page.evaluate(fn, arg);
const tap = (i) => page.click(`.tube[data-i="${i}"]`);

async function solveLevel(shot) {
  const seq = await K(() => window.__karisim.solution());
  for (const [k, i] of seq.entries()) {
    await tap(i);
    if (shot && k === 0) { await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${shot}-falling.png` }); }
    await page.waitForTimeout(120);
  }
  await page.waitForSelector('#win:not([hidden])', { timeout: 4000 }).catch(() => {});
}

await page.goto(url);
await page.waitForTimeout(600);
check(await page.getAttribute('html', 'lang') === 'tr', 'html lang set to tr');
check(await page.textContent('#level') === '1', 'starts at level 1');
check(await page.isVisible('#hand'), 'tutorial hand visible on level 1');
await page.screenshot({ path: `${out}/k1-tutorial.png` });
await solveLevel('k1');
check(await page.isVisible('#win'), 'win sheet after solving level 1');
await page.waitForTimeout(600);
check(await page.locator('#stars i.on').count() === 3, '3 stars at par');
await page.screenshot({ path: `${out}/k2-win.png` });
await page.click('#next-btn');
check(await page.textContent('#level') === '2', 'advances to level 2');
check(!(await page.isVisible('#hand')), 'no tutorial hand on level 2');
await solveLevel();
check(await page.isVisible('#win'), 'level 2 solved');
await page.click('#next-btn');

// level 3: wrong drop + undo, empty bowl, hint
const seq = await K(() => window.__karisim.solution());
await tap(seq[0]); await tap(seq[0]); await page.waitForTimeout(700);
check((await K(() => window.__karisim.state.seq.length)) === 2, 'two drops in bowl');
await page.click('#undo-btn'); await page.waitForTimeout(300);
check((await K(() => window.__karisim.state.seq.length)) === 1, 'undo removes last drop');
await page.click('#restart-btn'); await page.waitForTimeout(300);
check((await K(() => window.__karisim.state.seq.length)) === 0, 'empty bowl clears drops');
check(await page.textContent('#pct') === '0%', 'meter resets to 0%');
await page.click('#hint-btn'); await page.waitForTimeout(800);
check((await K(() => window.__karisim.state.seq)).join() === String(seq[0]), 'hint adds the next correct drop');
check((await K(() => window.__karisim.state.hints)) === 1, 'hint counted');
await page.screenshot({ path: `${out}/k3-hint.png` });
const pct = parseInt(await page.textContent('#pct'));
check(pct > 0 && pct < 100, `meter shows partial closeness (${pct}%)`);

// reload keeps the bowl mid-level
await page.reload(); await page.waitForTimeout(500);
check(await page.textContent('#level') === '3', 'level survives reload');
check((await K(() => window.__karisim.state.seq)).join() === String(seq[0]), 'bowl survives reload');
for (const i of seq.slice(1)) { await tap(i); await page.waitForTimeout(120); }
await page.waitForSelector('#win:not([hidden])', { timeout: 4000 }).catch(() => {});
check(await page.isVisible('#win'), 'level 3 solved after reload');
await page.reload(); await page.waitForTimeout(400);
check(await page.textContent('#level') === '4', 'win persisted: reload lands on level 4');

// late level layout
await K(() => window.__karisim.goto(140)); await page.waitForTimeout(400);
check((await page.locator('.tube').count()) === 6, 'level 140 shows 6 tubes');
await page.screenshot({ path: `${out}/k4-level140.png` });
await browser.close();
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
