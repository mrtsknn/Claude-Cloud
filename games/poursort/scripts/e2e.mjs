// End-to-end: meta home → daily reward → shop (buy + equip a palette) → missions → level map →
// solve level 1 by tapping → win sheet (stars + coins) → next → pause → paid helps (undo, hint,
// extra tube) → stuck detection → reload keeps progress → v1.0 save migration; no console errors.
// Usage: npm run preview -w games/poursort -- --port 4175, then node games/poursort/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4175/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let passed = 0;
const check = (c, msg) => { if (!c) errors.push('ASSERT ' + msg); else passed++; console.log(c ? 'ok  ' : 'FAIL', msg); };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const coins = async () => Number(await page.locator('.m-home [data-coins]').first().textContent());
const profile = () => page.evaluate(() => JSON.parse(localStorage.getItem('poursort.profile')));
const state = () => page.evaluate(() => window.__poursort.state);
const idle = () => page.waitForFunction(() => !window.__poursort.busy());

async function tapTube(i) {
  const [box, slots] = await Promise.all([page.locator('#stage').boundingBox(), page.locator('#stage').getAttribute('data-layout').then(JSON.parse)]);
  const s = slots[i];
  await page.mouse.click(box.x + s.x, box.y + s.y + s.h / 2);
}
async function solveLevel(shotPrefix) {
  const moves = await page.evaluate(() => window.__poursort.solve(window.__poursort.state.tubes));
  for (const [k, [a, b]] of moves.entries()) {
    await tapTube(a);
    if (shotPrefix && k === 0) await shot(`${shotPrefix}-selected`);
    await tapTube(b);
    if (shotPrefix && k === 0) { await page.waitForTimeout(330); await shot(`${shotPrefix}-pouring`); }
    await idle().catch(() => {});
    await page.waitForTimeout(30);
  }
}

// ── home ──
await page.goto(url);
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home menu on boot');
check(await page.isVisible('.m-home .hero svg'), 'hero tubes artwork on home');
await shot('s01-home');
const c0 = await coins();

// ── daily ──
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('s02-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');

// ── shop: buy + equip a palette ──
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'at least 6 skins in the shop');
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('poursort.profile')); p.coins = 1000; localStorage.setItem('poursort.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(400);
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(150);
await page.locator('.m-skin').nth(3).click(); // jewel, 500
await page.waitForTimeout(250);
await shot('s03-shop');
check((await coins()) === 500, 'skin bought for 500');
check((await profile()).skin === 'jewel', 'skin equipped');
check(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-top').trim()) === '#fdfaf2', 'skin applied to the game palette');
await page.click('[data-close]');
await page.waitForTimeout(150);
await shot('s04-home-jewel');

// ── missions ──
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('s05-missions');
await page.click('[data-close]');

// ── level map ──
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(250);
check((await page.locator('.m-lvl').count()) === 500, 'map lists 500 levels');
check((await page.locator('.m-lvl.locked').count()) === 499, 'only level 1 unlocked');
await shot('s06-map');
await page.locator('.m-lvl').first().click();
await page.waitForTimeout(400);
check(await page.isHidden('.m-home'), 'level 1 opens from the map');
check(await page.textContent('#level') === '1', 'HUD shows level 1');

// ── play + solve level 1 → win sheet ──
await shot('s07-tutorial');
await solveLevel('s08');
await page.waitForTimeout(1300);
check(await page.isVisible('.m-result [data-next]'), 'meta win sheet after solving level 1');
check((await page.locator('.m-stars i.on').count()) === 3, '3 stars with no help');
await shot('s09-win');
let p = await profile();
check(p.unlocked === 2 && p.stars[0] === 3, 'profile: level 2 unlocked, 3 stars on level 1');
check(p.coins === 500 + 25, 'win paid 10 + 3*5 coins');
await page.click('[data-next]');
await page.waitForTimeout(300);
check(await page.textContent('#level') === '2', 'next goes to level 2');

// ── pause ──
await page.click('#settings-btn');
await page.waitForTimeout(150);
check(await page.isVisible('[data-resume]'), 'pause sheet');
await page.click('[data-settings]');
await page.waitForTimeout(150);
check(await page.isVisible('.m-sheet .m-row input.m-switch'), 'settings with symbols toggle inside meta');
await shot('s10-settings');
await page.click('.m-sheet [data-close]');
await page.waitForTimeout(150);

// ── helps: undo / free hint / free extra tube, then paid ones ──
const t0 = JSON.stringify((await state()).tubes);
const [a, b] = (await page.evaluate(() => window.__poursort.solve(window.__poursort.state.tubes)))[0];
await tapTube(a); await tapTube(b); await idle();
await page.click('#undo-btn'); await page.waitForTimeout(100);
check(JSON.stringify((await state()).tubes) === t0, 'undo restores previous state');
check(await page.textContent('#undo-count') === '4', 'undo counter decremented');
check(await page.textContent('#hint-badge') !== '' && (await page.getAttribute('#hint-badge', 'class')).includes('free'), 'first hint marked free');
await page.click('#hint-btn'); await page.waitForTimeout(200);
check(await page.isHidden('.pay'), 'first hint is free');
await page.click('#hint-btn'); await page.waitForTimeout(200);
check(await page.isVisible('.pay [data-coins]'), 'second hint offers coins or video');
await shot('s11-pay-hint');
const before = (await profile()).coins;
await page.click('.pay [data-coins]'); await page.waitForTimeout(150);
check((await profile()).coins === before - 30, 'second hint charged 30 coins');
const n = (await state()).tubes.length;
await page.click('#tube-btn'); await page.waitForTimeout(200);
check((await state()).tubes.length === n + 1, 'free extra tube added');
await page.click('#tube-btn'); await page.waitForTimeout(200);
await page.click('.pay [data-video]'); await page.waitForTimeout(200);
check((await state()).tubes.length === n + 2, 'second extra tube via video');
check(await page.isDisabled('#tube-btn'), 'extra tube button disabled at the cap');
await shot('s12-helps');
await solveLevel();
await page.waitForTimeout(1300);
check((await page.locator('.m-stars i.on').count()) === 1, 'helped level earns 1 star');
await page.click('[data-next]');
await page.waitForTimeout(300);

// ── stuck detection on a crafted dead-end board ──
await page.evaluate(() => window.__poursort.load({ level: 3, tubes: [[1, 2, 1, 2], [1, 2, 1, 2], [3, 3, 3], [4, 4, 4, 3]], history: [], undos: 5, extra: 0, moves: 0, hintsUsed: 0, undosUsed: 0 }));
await page.waitForTimeout(200);
await tapTube(3); await tapTube(2); await idle(); await page.waitForTimeout(200);
check(!(await page.isHidden('#toast')), 'stuck toast shown');
await shot('s13-stuck');
await page.evaluate(() => window.__poursort.goto(3));

// ── reload keeps progress ──
await page.reload();
await page.waitForTimeout(500);
check(await page.isVisible('.m-home'), 'home after reload');
check((await page.textContent('[data-level-title]')).includes('3'), 'play card resumes at level 3');
p = await profile();
check(p.unlocked === 3 && p.skin === 'jewel', 'unlocked level and skin survive reload');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check(await page.textContent('#level') === '3', 'play card continues at level 3');

// ── late level with symbols ──
await page.evaluate(() => localStorage.setItem('poursort.settings', JSON.stringify({ sound: true, haptics: true, symbols: true })));
await page.reload(); await page.waitForTimeout(300);
await page.click('[data-act="play-level"]');
await page.evaluate(() => window.__poursort.goto(120));
await page.waitForTimeout(400);
check((await state()).tubes.length === 14, 'level 120 has 12 colours + 2 empty tubes');
await shot('s14-level120-symbols');

// ── v1.0 save migration (fresh browser profile) ──
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
await ctx2.addInitScript(() => {
  if (localStorage.getItem('poursort.save')) return;
  localStorage.setItem('poursort.save', JSON.stringify({ level: 42, tubes: [[1, 2, 1, 2], [2, 1, 2, 1], [], []], history: [], undos: 3, extraUsed: true, moves: 7, hintsUsed: 1 }));
  localStorage.setItem('poursort.completed', '41');
});
const page2 = await ctx2.newPage();
page2.on('pageerror', (e) => errors.push('v1: ' + e.message));
await page2.goto(url);
await page2.waitForTimeout(500);
const p2 = await page2.evaluate(() => JSON.parse(localStorage.getItem('poursort.profile')));
check(p2.unlocked === 42 && p2.stars[40] === 1 && p2.stars[41] === 0, 'v1.0 save migrated to unlocked level 42');
const s2 = await page2.evaluate(() => window.__poursort.state);
check(s2.extra === 1 && s2.undosUsed === 2, 'v1.0 in-progress level keeps its helps');
await page2.screenshot({ path: `${out}/s15-migrated-home.png` });
await ctx2.close();

await browser.close();
console.log(`${passed} checks passed`);
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
