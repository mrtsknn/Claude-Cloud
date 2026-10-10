// End-to-end smoke test: home → level 1 (real taps, then bot autoplay) → win → map → shop →
// daily → missions → pause → lose/continue → reload keeps progress.
// Usage: npm run preview -w games/firin (port 4192), then node games/firin/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4192/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else console.log('ok', msg); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const visible = (sel) => page.locator(sel).first().isVisible();
const closeSheet = () => page.locator('.m-sheet [data-close]').first().click();

await page.goto(url);
await page.waitForTimeout(600);
check(await visible('.m-home'), 'home menu shown');
check((await ev(() => document.documentElement.lang)) === 'tr', 'html lang = tr');
await page.screenshot({ path: `${out}/1-home.png` });

// level 1: real taps
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check(await visible('#game'), 'game screen shown');
check((await page.textContent('#level-label')) === 'Seviye 1', 'level 1 label');
await page.locator('.station').first().dispatchEvent('pointerdown');
check((await ev(() => window.__firin.state.ovens[0].item)) === 'bread', 'tap dough → oven 0 baking bread');
await page.waitForTimeout(3900);
await page.locator('.oven').first().dispatchEvent('pointerdown');
check((await ev(() => window.__firin.state.tray.length)) === 1, 'golden bread moved to tray');
const seat = await ev(() => window.__firin.state.seats.findIndex((c) => c && c.order.includes('bread')));
if (seat >= 0) {
  await page.locator('.seat').nth(seat).dispatchEvent('pointerdown');
  check((await ev(() => window.__firin.state.served)) === 1, 'customer served with bread');
}
await page.screenshot({ path: `${out}/2-play.png` });

// autoplay the rest at 8x with the greedy bot
await ev(() => window.__firin.autoplay(8));
await page.waitForSelector('.m-result', { timeout: 30000 });
await page.waitForTimeout(500);
check(await visible('[data-next]'), 'win screen with Next');
await page.screenshot({ path: `${out}/3-win.png` });
await ev(() => window.__firin.autoplay(0));
await page.click('[data-next]');
await page.waitForTimeout(300);
check((await page.textContent('#level-label')) === 'Seviye 2', 'next → level 2');

// pause → menu
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await visible('[data-resume]'), 'pause sheet');
await page.screenshot({ path: `${out}/4-pause.png` });
const t0 = await ev(() => window.__firin.state.time);
await page.waitForTimeout(500);
check((await ev(() => window.__firin.state.time)) === t0, 'timer frozen while paused');
await page.click('[data-menu]');
await page.waitForTimeout(300);
check(await visible('.m-home'), 'back to home');

// daily
const c0 = await ev(() => window.__firin.profile.data.coins);
await page.waitForTimeout(500);
if (!(await visible('[data-claim]'))) await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(300);
await page.click('[data-claim]');
await page.waitForTimeout(300);
check((await ev(() => window.__firin.profile.data.coins)) === c0 + 20, 'daily reward +20');
await page.screenshot({ path: `${out}/7-daily.png` });
await closeSheet();

// map
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(300);
check((await page.locator('.m-lvl:not(.locked)').count()) === 2, 'map: 2 levels unlocked');
await page.screenshot({ path: `${out}/5-map.png` });
await closeSheet();

// shop
await ev(() => window.__firin.profile.addCoins(500));
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(300);
check((await page.locator('.m-skin').count()) === 6, 'shop: 6 bakery themes');
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(200);
check((await ev(() => document.documentElement.dataset.skin)) === 'mint', 'bought + equipped mint theme');
await page.screenshot({ path: `${out}/6-shop.png` });
await closeSheet();

// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(300);
check((await page.locator('.m-mission').count()) === 3, 'missions: 3 dealt');
await page.screenshot({ path: `${out}/8-missions.png` });
await closeSheet();

// lose → continue (+20 s)
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
await ev(() => window.__firin.setTime(0.2));
await page.waitForSelector('[data-cont-coins]', { timeout: 5000 });
await page.waitForTimeout(300);
check(await visible('[data-retry]'), 'lose screen');
await page.screenshot({ path: `${out}/9-lose.png` });
await page.click('[data-cont-coins]');
await page.waitForTimeout(300);
const tl = await ev(() => window.__firin.state.time);
check(tl > 18 && tl <= 20, 'continue adds 20 s');
check(!(await visible('.m-result')), 'game resumed');

// reload keeps progress
const before = await ev(() => ({ coins: window.__firin.profile.data.coins, unlocked: window.__firin.profile.data.unlocked }));
await page.reload();
await page.waitForTimeout(600);
const after = await ev(() => ({ coins: window.__firin.profile.data.coins, unlocked: window.__firin.profile.data.unlocked }));
check(after.unlocked === 2 && after.coins === before.coins, 'progress survives reload');
check((await ev(() => document.documentElement.dataset.skin)) === 'mint', 'skin survives reload');
await browser.close();
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
