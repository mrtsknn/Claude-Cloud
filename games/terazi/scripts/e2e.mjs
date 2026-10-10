// End-to-end smoke test: tutorial → solve levels 1-3 with real drags → win overlay → undo,
// hint, pick-up → late level → reload keeps progress, no console errors.
// Usage: npm run preview -w games/terazi -- --port 4187, then
//   node games/terazi/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4187/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let passed = 0;
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok', msg); }
};
const api = (fn, arg) => page.evaluate(fn, arg);
const box = async () => page.locator('#stage').boundingBox();

async function dragTo(from, to) {
  const b = await box();
  await page.mouse.move(b.x + from.x, b.y + from.y);
  await page.mouse.down();
  await page.mouse.move(b.x + (from.x + to.x) / 2, b.y + (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(b.x + to.x, b.y + to.y, { steps: 4 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(60);
}
async function placeWeight(i, d) {
  const from = await api((i) => window.__terazi.trayPoint(i), i);
  const to = await api((d) => window.__terazi.dropPoint(d), d);
  await dragTo(from, to);
}
async function solveLevel(shot) {
  const sol = await api(() => window.__terazi.solution());
  for (const [i, d] of sol.entries()) {
    if (await api((i) => window.__terazi.state.pos[i] !== null, i)) continue;
    await page.waitForTimeout(250); // let the spring settle so pegs sit where expected
    await placeWeight(i, d);
    if (shot && i === 0) await page.screenshot({ path: `${out}/${shot}` });
  }
}

await page.goto(url);
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/t1-tutorial.png` });
check((await page.textContent('#level')) === '1', 'starts at level 1');
check(await page.isVisible('#toast'), 'tutorial toast visible');
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang set to tr');
await solveLevel('t2-placed.png');
check(await api(() => window.__terazi.state.pos.every((d) => d !== null)), 'level 1 all weights placed by drag');
await page.waitForTimeout(1400);
check(await page.isVisible('#win'), 'win overlay after level 1');
check((await page.locator('#win-stars i.off').count()) === 0, '3 stars at par');
await page.screenshot({ path: `${out}/t3-win.png` });
await page.click('#next-btn');
check((await page.textContent('#level')) === '2', 'advances to level 2');
await solveLevel();
await page.waitForTimeout(1400);
await page.click('#next-btn');
check((await page.textContent('#level')) === '3', 'advances to level 3');

// level 3: pick-up by tap, undo, hint
const sol3 = await api(() => window.__terazi.solution());
await placeWeight(0, sol3[0]);
check(await api(() => window.__terazi.state.pos[0] !== null), 'placed first weight');
const pp = await api(() => window.__terazi.placedPoint(0));
const b = await box();
await page.mouse.click(b.x + pp.x, b.y + pp.y);
await page.waitForTimeout(100);
check(await api(() => window.__terazi.state.pos[0] === null), 'tap on placed weight returns it to tray');
check(await api(() => window.__terazi.state.moves === 2), 'moves count placement + pickup');
await page.click('#undo-btn');
await page.waitForTimeout(100);
check(await api(() => window.__terazi.state.pos[0] !== null), 'undo restores the placed weight');
await page.click('#undo-btn');
await page.click('#hint-btn');
await page.waitForTimeout(300);
check(await api(() => window.__terazi.state.locked.some(Boolean) && window.__terazi.state.hintsUsed === 1), 'hint places and locks a weight');
await page.screenshot({ path: `${out}/t4-hint.png` });
await solveLevel();
await page.waitForTimeout(1400);
check(await page.isVisible('#win'), 'level 3 solved after hint');
await page.click('#next-btn');

// late level with stacking + blocked pegs
await api(() => window.__terazi.goto(120));
await page.waitForTimeout(400);
const lv = await api(() => window.__terazi.level);
check(lv.stack && lv.blocked.length === 2 && lv.n === 6, 'level 120 has stacking, 2 blocked pegs, span 6');
await solveLevel();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/t5-level120.png` });
check(await api(() => window.__terazi.busy()), 'level 120 solved with real drags');
await page.waitForTimeout(900);
await page.click('#next-btn');
await placeWeight(0, (await api(() => window.__terazi.solution()))[0]);
await page.reload();
await page.waitForTimeout(500);
check((await page.textContent('#level')) === '121', 'progress survives reload');
check(await api(() => window.__terazi.state.pos[0] !== null && window.__terazi.state.moves === 1), 'placement survives reload');
await browser.close();
console.log(`passed ${passed}`, 'errors', errors);
process.exit(errors.length ? 1 : 0);
