// End-to-end smoke test: tutorial → solve levels 1-3 by real taps → win → undo/hint/outline →
// neighbour-rule level 15 and mirror level 40 by taps → reload keeps progress → no console errors.
// Usage: npm run preview -w games/kristal -- --port 4190, then node games/kristal/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4190/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let passed = 0;
const check = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok', msg); } };
const K = (fn, arg) => page.evaluate(fn, arg);

async function tapCell(i) {
  const [box, layout] = await Promise.all([page.locator('#stage').boundingBox(), page.locator('#stage').getAttribute('data-layout').then(JSON.parse)]);
  const [x, y] = layout[i];
  await page.mouse.click(box.x + x, box.y + y);
  await page.waitForTimeout(60);
}
async function solveLevel(shot) {
  const sol = await K(() => window.__kristal.solve());
  const par = await K(() => window.__kristal.level.par);
  check(sol.length === par, `level solution has par=${par} taps`);
  for (const [k, c] of sol.entries()) {
    await tapCell(c);
    if (shot && k === 0) await page.screenshot({ path: `${out}/${shot}.png` });
  }
  await page.waitForTimeout(1900);
  check(await page.isVisible('#win'), `win overlay after solving level ${await page.textContent('#level')}`);
}

await page.goto(url);
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/k1-tutorial.png` });
check(await page.textContent('#level') === '1', 'starts at level 1');
check(await K(() => document.documentElement.lang) === 'tr', 'html lang set to tr');
await solveLevel('k1-tap');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/k2-win.png` });
await page.click('#next-btn');
check(await page.textContent('#level') === '2', 'advances to level 2');
await solveLevel();
await page.click('#next-btn');

// level 3: undo, hint, outline
const before = await K(() => window.__kristal.state.state);
await tapCell(0);
check(await K(() => window.__kristal.state.history.length) === 1, 'tap counted');
await page.click('#undo-btn');
check(await K(() => window.__kristal.state.state) === before, 'undo restores previous state');
await page.click('#hint-btn');
await page.waitForTimeout(150);
check(await K(() => window.__kristal.state.hintsUsed) === 1, 'first hint used (free)');
check(await page.textContent('#hint-badge') === 'AD', 'next hint marked as rewarded');
await page.click('#outline-btn');
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/k3-hint-outline.png` });
await page.click('#outline-btn');
await solveLevel();
await page.click('#next-btn');

// neighbour rule level
await K(() => window.__kristal.goto(15));
await page.waitForTimeout(500);
const mask = await K(() => { const k = window.__kristal; const c = (k.solve()[0] + 1) % 6; const s = k.state.state; k.tap(c); const d = k.state.state ^ s; k.tap(c); return d; });
check(mask.toString(2).replace(/0/g, '').length > 1, 'neighbour rule toggles several cells');
await page.screenshot({ path: `${out}/k4-neighbours.png` });
await solveLevel();
await page.click('#next-btn');

// mirror level
await K(() => window.__kristal.goto(40));
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/k5-mirror.png` });
await solveLevel();
await page.waitForTimeout(100);
await page.screenshot({ path: `${out}/k6-mirror-win.png` });

// resume
await page.click('#next-btn');
await tapCell(2);
const saved = await K(() => window.__kristal.state.state);
await page.reload();
await page.waitForTimeout(500);
check(await page.textContent('#level') === '41', 'progress survives reload');
check(await K(() => window.__kristal.state.state) === saved, 'board state survives reload');
await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
