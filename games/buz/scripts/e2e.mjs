// End-to-end smoke test: home → solve levels 1-2 with real swipes → win → map → shop → daily →
// missions → pause → fall + continue → reload keeps progress. No console errors allowed.
// Usage: npm run preview -w games/buz (port 4199), then node games/buz/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4199/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
let passed = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok', msg); }
};
const sheetVisible = (sel) => page.locator(`.m-overlay:not([hidden]) ${sel}`).count().then((n) => n > 0);

async function swipe(dir) {
  const b = await page.evaluate(() => window.__buz.board());
  const x = b.rect.x + b.rect.width / 2;
  const y = b.rect.y + b.rect.height / 2;
  const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + d[0] * 30, y + d[1] * 30, { steps: 3 });
  await page.mouse.move(x + d[0] * 80, y + d[1] * 80, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction(() => !window.__buz.animating());
  await page.waitForTimeout(40);
}
async function solveLevel(shot) {
  const moves = await page.evaluate(() => window.__buz.solve());
  for (const [i, d] of moves.entries()) {
    await swipe(d);
    if (shot && i === 0) await page.screenshot({ path: `${out}/${shot}` });
  }
  await page.waitForSelector('.m-overlay:not([hidden]) .m-result', { timeout: 4000 });
}

await page.goto(url);
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home menu shown on launch');
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang = tr');
await page.screenshot({ path: `${out}/e1-home.png` });
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check(await page.textContent('#level') === '1', 'starts level 1');
await page.screenshot({ path: `${out}/e2-level1.png` });
await solveLevel('e3-swiped.png');
check(await sheetVisible('.m-result'), 'win sheet after level 1');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/e4-win.png` });
await page.click('.m-overlay:not([hidden]) [data-next]');
await page.waitForTimeout(300);
check(await page.textContent('#level') === '2', 'advances to level 2');
await solveLevel();
check(await sheetVisible('.m-result'), 'win sheet after level 2');
await page.click('.m-overlay:not([hidden]) [data-menu]');
await page.waitForTimeout(300);
check(await page.isVisible('.m-home'), 'menu returns home');

await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(300);
check((await page.locator('.m-lvl').count()) === 200, 'map lists 200 levels');
check((await page.locator('.m-lvl.locked').count()) === 197, 'levels 1-3 unlocked');
await page.screenshot({ path: `${out}/e5-map.png` });
await page.click('.m-overlay:not([hidden]) [data-close]');

await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(300);
check((await page.locator('.m-skin').count()) >= 6, 'shop has >= 6 outfits');
await page.screenshot({ path: `${out}/e6-shop.png` });
await page.click('.m-overlay:not([hidden]) [data-close]');

await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(300);
const coins0 = Number(await page.textContent('[data-coins]'));
await page.click('.m-overlay:not([hidden]) [data-claim]');
await page.waitForTimeout(300);
check(Number(await page.textContent('[data-coins]')) > coins0, 'daily reward adds coins');
await page.screenshot({ path: `${out}/e7-daily.png` });
await page.click('.m-overlay:not([hidden]) [data-close]');

await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(300);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await page.screenshot({ path: `${out}/e8-missions.png` });
await page.click('.m-overlay:not([hidden]) [data-close]');

// pause
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check(await page.textContent('#level') === '3', 'continue plays level 3');
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await sheetVisible('[data-resume]'), 'pause sheet opens');
await page.screenshot({ path: `${out}/e9-pause.png` });
await page.click('.m-overlay:not([hidden]) [data-resume]');

// fall into water → lose sheet → continue undoes the move
// (search levels for a start position next to open water; never wins a level here)
const fallDir = await page.evaluate(() => {
  for (let n = 35; n <= 120; n++) {
    window.__buz.goto(n);
    const d = [0, 1, 2, 3].find((d) => window.__buz.falls(d));
    if (d !== undefined) return d;
  }
  return -1;
});
await page.waitForTimeout(200);
check(fallDir >= 0, 'found a move into water');
if (fallDir >= 0) {
  const before = await page.evaluate(() => window.__buz.state);
  await swipe(fallDir);
  await page.waitForSelector('.m-overlay:not([hidden]) [data-retry]', { timeout: 3000 });
  await page.screenshot({ path: `${out}/e10-fell.png` });
  await page.click('.m-overlay:not([hidden]) [data-cont-ad]');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__buz.state);
  check(after.pos === before.pos && after.swipes === before.swipes, 'continue undoes the fall');
}

// hint + undo
await page.click('#hint-btn');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/e11-hint.png` });

await page.reload();
await page.waitForTimeout(600);
check((await page.textContent('[data-level-title]')).includes('3'), 'progress survives reload');
await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
