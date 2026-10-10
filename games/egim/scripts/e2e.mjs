// End-to-end smoke test: home → solve levels 1-2 with real swipes → win → map → shop → daily →
// missions → pause → undo/hint → reload keeps progress. No console errors allowed.
// Usage: npm run preview -w games/egim, then node games/egim/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4194/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
let passed = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok', msg); }
};
const S = () => page.evaluate(() => window.__egim.state);
const idle = () => page.waitForFunction(() => !window.__egim.busy());

async function swipe(dir) {
  const box = await page.locator('#stage').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx * 30, cy + dy * 30, { steps: 3 });
  await page.mouse.move(cx + dx * 90, cy + dy * 90, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(40);
  await idle();
}
async function solveLevel(shot) {
  const sol = await page.evaluate(() => window.__egim.solve());
  for (const [k, d] of sol.entries()) {
    await swipe(d);
    if (shot && k === 0) await page.screenshot({ path: `${out}/${shot}` });
  }
  await page.waitForSelector('.m-result', { timeout: 3000 });
}

await page.goto(url);
await page.waitForTimeout(600);
check(await page.evaluate(() => document.documentElement.lang) === 'tr', 'html lang = tr');
check(await page.isVisible('.m-home'), 'home menu shown');
await page.screenshot({ path: `${out}/01-home.png` });
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check((await S()).n === 1, 'level 1 started');
await page.screenshot({ path: `${out}/02-level1.png` });
await solveLevel('03-level1-tilted.png');
await page.waitForTimeout(500);
check(await page.isVisible('.m-result'), 'win screen after level 1');
await page.screenshot({ path: `${out}/04-win.png` });
await page.click('[data-next]');
await page.waitForTimeout(300);
check((await S()).n === 2, 'level 2 started');
await solveLevel();
await page.waitForTimeout(500);
check(await page.isVisible('.m-result'), 'win screen after level 2');
await page.click('[data-menu]');
await page.waitForTimeout(300);
check(await page.isVisible('.m-home'), 'back to home');

await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(300);
check(await page.locator('.m-lvl').count() === 150, 'map has 150 levels');
check(await page.locator('.m-lvl:not(.locked)').count() === 3, '3 levels unlocked');
await page.screenshot({ path: `${out}/05-map.png` });
await page.click('.m-sheet [data-close]');

await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/06-shop.png` });
await page.click('.m-sheet [data-close]');

await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(300);
const coins0 = await page.evaluate(() => JSON.parse(localStorage.getItem('egim.profile')).coins);
await page.click('[data-claim]');
await page.waitForTimeout(200);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('egim.profile')).coins) > coins0, 'daily reward claimed');
await page.screenshot({ path: `${out}/07-daily.png` });
await page.click('.m-sheet [data-close]');

await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(300);
check(await page.locator('.m-sheet').textContent().then((t) => t.length > 20), 'missions sheet shows missions');
await page.screenshot({ path: `${out}/08-missions.png` });
await page.click('.m-sheet [data-close]');

// level 3: undo, hint, pause
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check((await S()).n === 3, 'continues at level 3');
const before = JSON.stringify((await S()).marbles);
const first = (await page.evaluate(() => window.__egim.solve()))[0];
await swipe(first);
check(JSON.stringify((await S()).marbles) !== before, 'swipe moved marbles');
await page.click('#undo-btn');
check(JSON.stringify((await S()).marbles) === before, 'undo restores marbles');
await page.click('#hint-btn');
await page.waitForTimeout(250);
check(await page.textContent('#hint-badge') === 'AD', 'first hint free, next is rewarded');
await page.screenshot({ path: `${out}/09-hint.png` });
await page.click('#pause-btn');
await page.waitForTimeout(250);
check(await page.isVisible('.m-sheet [data-resume]'), 'pause sheet shown');
await page.screenshot({ path: `${out}/10-pause.png` });
await page.click('[data-resume]');

// late level with pits and 4 colours
await page.evaluate(() => window.__egim.goto(120));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/11-level120.png` });

await page.reload();
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home after reload');
check((await page.textContent('[data-level-title]')).includes('3'), 'progress survives reload (level 3)');
await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
