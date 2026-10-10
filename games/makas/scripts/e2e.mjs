// End-to-end smoke test: home → level 1 (played by tapping switches) → win → map → shop →
// daily → missions → pause → lose/continue → reload keeps progress. No console errors allowed.
// Usage: npm run preview -w games/makas (port 4191), then node games/makas/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4191/';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
let fails = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => {
  if (!cond) fails++;
  console.log(cond ? 'ok  ' : 'FAIL', msg);
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const visible = (sel) => page.locator(sel).first().isVisible();

/** Taps switches until a result sheet appears. good=true routes trains right, false routes them wrong. */
async function drive(good, midShot) {
  const t0 = Date.now();
  let shotDone = !midShot;
  while (Date.now() - t0 < 90_000) {
    if (await visible('.m-result')) return true;
    const p = await page.evaluate(() => window.__makas.plan());
    if (p && p.ok !== good) {
      const at = await page.evaluate((n) => window.__makas.at(n), p.node);
      await page.mouse.click(at.x, at.y);
    }
    if (!shotDone && (await page.evaluate(() => window.__makas.sim.trains.length)) >= 1) {
      await shot(midShot);
      shotDone = true;
    }
    await page.waitForTimeout(60);
  }
  return false;
}

await page.goto(url);
await page.waitForTimeout(800);
check(await visible('.m-home'), 'home menu on launch');
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang = tr');
check((await page.textContent('.m-logo')) === 'Makas', 'Turkish title');
await shot('01-home');

// level 1
await page.click('[data-act=play-level]');
await page.waitForTimeout(300);
check(!(await visible('.m-home')), 'home hidden while playing');
check((await page.textContent('#level')) === 'Seviye 1', 'HUD shows level 1');
await page.evaluate(() => window.__makas.speed(3));
check(await drive(true, '02-play'), 'level 1 finished');
await page.waitForTimeout(400);
check(await visible('[data-next]'), 'win sheet');
check((await page.locator('.m-stars i.on').count()) === 3, '3 stars with all hearts');
await shot('03-win');
await page.click('[data-menu]');
await page.waitForTimeout(300);
check((await page.textContent('[data-level-title]')) === 'Seviye 2', 'home now offers level 2');

// daily: opens by itself on the first return home (first run is over)
await page.waitForTimeout(500);
check(await visible('[data-claim]'), 'daily reward pops up on returning home');
const coins0 = Number(await page.textContent('[data-coins]'));
await page.click('[data-claim]');
await page.waitForTimeout(300);
check(Number(await page.textContent('[data-coins]')) === coins0 + 20, 'daily reward +20 coins');
await shot('06-daily');
await page.click('.m-sheet [data-close]');

// map
await page.click('.m-nav [data-act=map]');
await page.waitForTimeout(300);
check((await page.locator('.m-lvl').count()) === 150, '150 levels on the map');
check((await page.locator('.m-lvl.locked').count()) === 148, 'levels 3+ locked');
await shot('04-map');
await page.click('.m-sheet [data-close]');

// shop
await page.click('.m-nav [data-act=shop]');
await page.waitForTimeout(300);
check((await page.locator('.m-skin').count()) >= 6, 'at least 6 skins');
await shot('05-shop');
await page.click('.m-sheet [data-close]');

// missions
await page.click('.m-nav [data-act=missions]');
await page.waitForTimeout(300);
check((await page.locator('.m-mission').count()) === 3, '3 daily missions');
await shot('07-missions');
await page.click('.m-sheet [data-close]');

// buy + equip a skin with the coins earned
await page.click('.m-nav [data-act=shop]');
await page.waitForTimeout(200);
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(200);
check(await page.locator('.m-skin').nth(1).evaluate((e) => e.classList.contains('using')), 'bought and equipped skin 2');
await page.click('.m-sheet [data-close]');

// level 2: pause, then lose on purpose, continue
await page.click('[data-act=play-level]');
await page.waitForTimeout(300);
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await visible('[data-resume]'), 'pause sheet');
const tPaused = await page.evaluate(() => window.__makas.sim.time);
await page.waitForTimeout(400);
check((await page.evaluate(() => window.__makas.sim.time)) === tPaused, 'simulation frozen while paused');
await shot('08-pause');
await page.click('[data-resume]');
await page.evaluate(() => window.__makas.speed(3));
check(await drive(false, '09-play-skin'), 'level 2 lost');
await page.waitForTimeout(300);
check(await visible('[data-cont-ad]'), 'lose sheet with continue');
check((await page.locator('#hearts svg.off').count()) === 3, 'no hearts left');
await shot('10-lose');
await page.click('[data-cont-ad]');
await page.waitForTimeout(300);
const s = await page.evaluate(() => ({ hearts: window.__makas.sim.hearts, status: window.__makas.sim.status }));
check(s.hearts === 1 && s.status === 'play', 'continue gives one heart back');

// reload keeps progress
await page.reload();
await page.waitForTimeout(800);
check((await page.textContent('[data-level-title]')) === 'Seviye 2', 'progress survives reload');
check((await page.locator('.m-mission, [data-strip-text]').count()) > 0, 'mission strip after reload');
await shot('11-reload');

await browser.close();
console.log('errors', errors);
console.log(fails || errors.length ? `FAILED (${fails} checks, ${errors.length} errors)` : 'ALL PASSED');
process.exit(fails || errors.length ? 1 : 0);
