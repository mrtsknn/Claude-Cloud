// End-to-end smoke test: home → levels 1-2 solved with real swipes → win → map → shop → daily →
// missions → pause → reload keeps progress. No console errors allowed.
// Usage: npm run preview -w games/katla -- --port 4198, then node games/katla/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4198/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
let passed = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => {
  if (!cond) {
    errors.push('ASSERT: ' + msg);
    console.log('FAIL', msg);
  } else {
    passed++;
    console.log('ok', msg);
  }
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const idle = () => page.waitForFunction(() => !window.__katla.busy() || document.querySelector('.m-result'));

async function swipe(move) {
  const box = await page.locator('#stage').boundingBox();
  const s = await page.evaluate((m) => window.__katla.swipeFor(m), move);
  await page.mouse.move(box.x + s.x0, box.y + s.y0);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + s.x0 + ((s.x1 - s.x0) * i) / 8, box.y + s.y0 + ((s.y1 - s.y0) * i) / 8);
  await page.mouse.up();
}
async function solveLevel(prefix) {
  const moves = await page.evaluate(() => window.__katla.level.solution);
  for (const [k, m] of moves.entries()) {
    await swipe(m);
    if (prefix && k === 0) {
      await page.waitForTimeout(200);
      await shot(`${prefix}-folding`);
    }
    await page.waitForTimeout(600);
  }
  await page.waitForSelector('.m-result', { timeout: 4000 }).catch(() => {});
}

await page.goto(url);
await page.waitForTimeout(600);
check(await page.evaluate(() => document.documentElement.lang) === 'tr', 'html lang follows locale');
check(await page.isVisible('.m-home'), 'home menu on launch');
await shot('e1-home');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(await page.textContent('#level') === '1', 'level 1 starts');
await shot('e2-level1');
await solveLevel('e2');
check(await page.isVisible('.m-result'), 'win sheet after solving level 1 with swipes');
check((await page.locator('.m-stars i.on').count()) === 3, '3 stars at par');
await shot('e3-win');
await page.click('[data-next]');
await page.waitForTimeout(400);
check(await page.textContent('#level') === '2', 'advances to level 2');
// one wrong-ish fold + undo, then hint, then solve
const before = await page.evaluate(() => JSON.stringify(window.__katla.state.sheet));
const sol = await page.evaluate(() => window.__katla.level.solution);
await swipe({ ...sol[0], dir: -sol[0].dir });
await page.waitForTimeout(600);
await page.click('#undo-btn');
await page.waitForTimeout(100);
check(await page.evaluate(() => JSON.stringify(window.__katla.state.sheet)) === before, 'undo restores the sheet');
await page.click('#hint-btn');
await page.waitForTimeout(300);
check(await page.textContent('#hint-badge') === 'AD', 'first hint is free, next one is a video');
await shot('e4-hint');
await solveLevel();
check(await page.isVisible('.m-result'), 'level 2 solved');
await page.click('[data-menu]');
await page.waitForTimeout(400);
check(await page.isVisible('.m-home'), 'back to home from win');
await page.waitForTimeout(500);
if (await page.isVisible('.m-overlay:not([hidden])')) await page.click('.m-sheet [data-close]');
// map
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(300);
check((await page.locator('.m-lvl:not(.locked)').count()) === 3, 'map shows 3 unlocked levels');
await shot('e5-map');
await page.click('.m-sheet [data-close]');
// shop
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(300);
check((await page.locator('.m-skin').count()) >= 6, 'shop lists 6 paper skins');
await shot('e6-shop');
await page.click('.m-sheet [data-close]');
// daily
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(300);
const coins0 = Number(await page.textContent('.m-home [data-coins]'));
await page.click('[data-claim]');
await page.waitForTimeout(300);
check(Number(await page.textContent('.m-home [data-coins]')) > coins0, 'daily reward adds coins');
await shot('e7-daily');
await page.click('.m-sheet [data-close]');
// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(300);
check((await page.locator('.m-mission').count()) === 3, '3 daily missions');
await shot('e8-missions');
await page.click('.m-sheet [data-close]');
// play level 3, fold once, pause
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(await page.textContent('#level') === '3', 'play continues at level 3');
const sol3 = await page.evaluate(() => window.__katla.level.solution);
await swipe(sol3[0]);
await page.waitForTimeout(700);
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('[data-resume]'), 'pause sheet');
await shot('e9-pause');
await page.click('[data-resume]');
// reload keeps progress
await page.reload();
await page.waitForTimeout(600);
check((await page.textContent('[data-level-title]')).includes('3'), 'home shows level 3 after reload');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(await page.evaluate(() => window.__katla.state.folds) === 1, 'mid-level fold survives reload');
await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
