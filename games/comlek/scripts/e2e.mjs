// End-to-end smoke test: home → level 1 with real drags → fire (fail → retry) → perfect → glaze
// → win → map → shop → daily → missions → pause → reload keeps progress.
// Usage: npm run preview -w games/comlek, then node games/comlek/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4200/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else console.log('ok', msg); };
const S = () => page.evaluate(() => ({ ...window.__comlek.state }));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });

await page.goto(url);
await page.waitForTimeout(600);
check(await page.evaluate(() => document.documentElement.lang) === 'tr', 'html lang = tr');
check(await page.isVisible('.m-home'), 'home menu visible');
await shot('01-home');
// first run: daily may auto-open; close any sheet
if (await page.isVisible('.m-overlay')) await page.click('.m-overlay [data-close]');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check(!(await page.isVisible('.m-home')), 'level started');
check((await S()).level === 1, 'level 1');

// real drags on both sides of the clay
const box = await page.locator('#stage').boundingBox();
const cx = box.x + box.width / 2;
const pct0 = (await S()).pct;
for (const side of [-1, 1]) {
  await page.mouse.move(cx + side * 100, box.y + box.height - 80);
  await page.mouse.down();
  for (let k = 0; k <= 20; k++) {
    await page.mouse.move(cx + side * 100, box.y + box.height - 80 - k * 12);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
}
const s1 = await S();
check(s1.touched && s1.pct !== pct0, `drags shape the clay (${pct0}% → ${s1.pct}%)`);
await shot('02-shaping');

// fire too early → lose sheet → retry
if (s1.pct < 70) {
  await page.click('#fire-btn');
  await page.waitForTimeout(300);
  check(await page.isVisible('[data-retry]'), 'below 70% shows retry');
  await shot('03-lose');
  await page.click('[data-retry]');
  await page.waitForTimeout(300);
}

// perfect shape via hook → fire → glaze → win
await page.evaluate(() => window.__comlek.perfect());
await page.waitForTimeout(100);
check((await S()).pct === 100, 'perfect = 100%');
await page.click('#fire-btn');
await page.waitForTimeout(400);
check(await page.isVisible('#glazes'), 'glaze picker shown');
await page.click('#glazes button:last-child');
await page.waitForTimeout(900);
await shot('04-glaze');
await page.click('#fire-btn');
await page.waitForTimeout(500);
check(await page.isVisible('[data-next]'), 'win sheet');
check((await page.locator('.m-stars i.on').count()) === 3, '3 stars');
await shot('05-win');
await page.click('[data-next]');
await page.waitForTimeout(300);
check((await S()).level === 2, 'advanced to level 2');
await shot('06-level2');

// pause → menu
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('[data-resume]'), 'pause sheet');
await shot('07-pause');
await page.click('[data-menu]');
await page.waitForTimeout(300);
check(await page.isVisible('.m-home'), 'back to home');

// map
await page.click('[data-act="map"]');
await page.waitForTimeout(300);
check((await page.locator('.m-lvl:not(.locked)').count()) === 2, 'map: 2 levels unlocked');
await shot('08-map');
await page.click('.m-overlay [data-close]');
// shop
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'shop has ≥6 glazes');
await shot('09-shop');
await page.click('.m-overlay [data-close]');
// daily
await page.click('[data-act="daily"]');
await page.waitForTimeout(200);
const coins0 = Number(await page.textContent('[data-coins]'));
if (await page.isEnabled('[data-claim]')) await page.click('[data-claim]');
await page.waitForTimeout(200);
check(Number(await page.textContent('[data-coins]')) > coins0, 'daily reward claimed');
await shot('10-daily');
await page.click('.m-overlay [data-close]');
// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(200);
check((await page.locator('.m-mission').count()) === 3, '3 missions');
await shot('11-missions');
await page.click('.m-overlay [data-close]');

// reload keeps progress
await page.reload();
await page.waitForTimeout(600);
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('comlek.profile')));
check(prof.unlocked === 2 && prof.stars[0] === 3, 'progress survives reload');
check((await page.textContent('[data-level-title]')).includes('2'), 'home shows level 2');
await browser.close();
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
