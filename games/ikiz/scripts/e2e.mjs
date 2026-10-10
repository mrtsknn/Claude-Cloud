// End-to-end smoke test: home → play & solve levels 1-2 with real swipes → win → map → shop →
// daily → missions → pause → undo/hint → reload keeps progress.
// Usage: npm run preview -w games/ikiz, then node games/ikiz/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4193/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let fails = 0;
const check = (cond, msg) => {
  if (!cond) { fails++; errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else console.log('ok', msg);
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const idle = () => page.waitForFunction(() => !window.__ikiz.busy());
const V = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

async function swipe(d) {
  const box = await page.locator('#stage').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const [dx, dy] = V[d];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx * 40, cy + dy * 40, { steps: 3 });
  await page.mouse.move(cx + dx * 80, cy + dy * 80, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(160);
}
async function closeSheet() {
  const c = page.locator('.m-overlay:not([hidden]) [data-close]');
  if (await c.count()) await c.first().click();
  await page.waitForTimeout(150);
}
async function solveLevel(n) {
  const path = await page.evaluate(() => window.__ikiz.solve());
  for (const [i, d] of path.entries()) {
    await swipe(d);
    if (n === 1 && i === 1) await shot('e2-playing');
  }
  await page.waitForSelector('.m-result', { timeout: 3000 }).catch(() => {});
  check(await page.isVisible('.m-result'), `win sheet after solving level ${n} with ${path.length} swipes`);
}

await page.goto(url);
await page.waitForTimeout(600);
check(await page.getAttribute('html', 'lang') === 'tr', 'html lang set to tr');
check(await page.isVisible('.m-home'), 'home menu visible');
await closeSheet();
await shot('e1-home');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check((await page.textContent('#level')).includes('1'), 'level 1 started');
await solveLevel(1);
await page.waitForTimeout(600);
await shot('e3-win');
await page.click('[data-next]');
await page.waitForTimeout(300);
check((await page.textContent('#level')).includes('2'), 'advanced to level 2');
await solveLevel(2);
await page.waitForTimeout(600);
await page.click('[data-menu]');
await page.waitForTimeout(400);
await closeSheet();
check(await page.isVisible('.m-home'), 'back on home after menu');

await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(300);
check((await page.locator('.m-lvl').count()) === 150, 'map shows 150 levels');
check((await page.locator('.m-lvl:not(.locked)').count()) === 3, 'levels 1-3 unlocked');
await shot('e4-map');
await closeSheet();

await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(300);
check((await page.locator('.m-skin').count()) >= 6, 'shop has >= 6 skins');
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(200);
await shot('e5-shop');
await closeSheet();

await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(300);
const claim = page.locator('[data-claim]:not([disabled])');
if (await claim.count()) await claim.click();
await page.waitForTimeout(200);
await shot('e6-daily');
await closeSheet();

await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(300);
check((await page.locator('.m-mission').count()) === 3, '3 missions shown');
await shot('e7-missions');
await closeSheet();

// level 3: hint, undo, pause
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check((await page.textContent('#level')).includes('3'), 'play continues at level 3');
await page.click('#hint-btn');
await page.waitForTimeout(200);
await shot('e8-hint');
const s0 = await page.evaluate(() => JSON.stringify(window.__ikiz.state));
const first = (await page.evaluate(() => window.__ikiz.solve()))[0];
await swipe(first);
await idle();
check(await page.evaluate(() => window.__ikiz.moves) === 1, 'swipe counted as a move');
await page.click('#undo-btn');
check(await page.evaluate(() => JSON.stringify(window.__ikiz.state)) === s0, 'undo restores state');
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('.m-overlay:not([hidden]) [data-resume]'), 'pause sheet shown');
await shot('e9-pause');
await page.click('[data-resume]');
await page.waitForTimeout(150);

await page.reload();
await page.waitForTimeout(600);
await closeSheet();
check((await page.textContent('[data-level-title]')).includes('3'), 'progress kept after reload');
await browser.close();
console.log(`fails ${fails}`, 'errors', errors);
process.exit(errors.length ? 1 : 0);
