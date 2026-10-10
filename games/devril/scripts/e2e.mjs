// End-to-end: meta home → daily → shop (buy + equip a skin) → missions → level map → level 1
// (tutorial, real taps) → meta win → next → failed push + reset → free hint, paid hint (coins,
// max 2 stars) → undo → pause (restart) → reload keeps progress → pinned tiles → v1.0 save migration.
// Usage: npm run preview -w games/devril -- --port 4181, then node games/devril/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4181/';
const browser = await chromium.launch();
const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' };
const context = await browser.newContext(ctxOpts);
const page = await context.newPage();
const errors = [];
let passed = 0;
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};
watch(page);
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok  ', msg); }
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const G = (fn, arg) => page.evaluate(fn, arg);
const phase = () => G(() => window.__devril.phase);
const coins = () => G(() => window.__devril.profile.data.coins);
const prof = () => G(() => JSON.parse(localStorage.getItem('devril.profile')));

async function tapCell(x, y) {
  const box = await page.locator('#stage').boundingBox();
  const L = JSON.parse(await page.locator('#stage').getAttribute('data-layout'));
  await page.mouse.click(box.x + L.bx + (x + 0.5) * L.cell, box.y + L.by + (y + 0.5) * L.cell);
}
/** Taps every tile the minimum number of times to reach the solver's optimal configuration. */
async function solveByTapping() {
  const plan = await G(() => ({ tiles: window.__devril.level.tiles, dirs: window.__devril.state.dirs.slice() }));
  const target = await G(() => window.__devril.optimal());
  let taps = 0;
  for (let i = 0; i < plan.tiles.length; i++) {
    const n = (target[i] - plan.dirs[i] + 4) % 4;
    for (let k = 0; k < n; k++) {
      await tapCell(plan.tiles[i].x, plan.tiles[i].y);
      taps++;
      await page.waitForTimeout(40);
    }
  }
  return taps;
}
async function pushAndWait() {
  await page.click('#push-btn');
  await page.waitForFunction(() => window.__devril.phase !== 'falling', null, { timeout: 15000 });
  await page.waitForTimeout(900);
}

// ── home ──
await page.goto(url);
await page.waitForTimeout(700);
check(await page.isVisible('.m-home'), 'home menu on boot');
check(await page.isVisible('.m-home .hero i'), 'domino hero artwork on home');
check((await page.textContent('[data-level-title]')).includes('1'), 'play card shows level 1');
check(await G(() => document.documentElement.lang) === 'tr', 'html lang tr');
await shot('d01-home');

// ── daily ──
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('d02-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');

// ── shop: buy + equip a skin ──
await G(() => { const p = window.__devril.profile; p.addCoins(1000 - p.data.coins); });
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'at least 6 skins in the shop');
const bgBefore = await G(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-top').trim());
await page.locator('.m-skin').nth(1).click(); // walnut, 300
await page.waitForTimeout(250);
await shot('d03-shop');
check((await coins()) === 700, 'skin bought for 300');
check((await prof()).skin === 'walnut', 'skin equipped and saved');
const bgAfter = await G(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-top').trim());
check(bgBefore !== bgAfter, 'applying the skin repaints the palette');
await page.click('[data-close]');

// ── missions ──
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('d04-missions');
await page.click('[data-close]');

// ── level map → level 1 ──
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(250);
check((await page.locator('.m-lvl').count()) === 200, 'map lists 200 levels');
check((await page.locator('.m-lvl.locked').count()) === 199, 'only level 1 unlocked');
await shot('d05-map');
await page.locator('.m-lvl').first().click();
await page.waitForTimeout(500);
check(await page.isHidden('.m-home'), 'map starts the level');
check(await page.textContent('#level') === '1', 'level 1 on the board');
check(await page.isVisible('#hand') && (await page.textContent('#tip')).length > 0, 'tutorial hand + tip on level 1');
await shot('d06-tutorial');
check((await solveByTapping()) === 1, 'level 1 needs one tap');
await page.waitForTimeout(350);
check(await page.isVisible('#hand'), 'tutorial moves to the push button');
await page.click('#push-btn');
await page.waitForTimeout(250);
check(await page.isVisible('.push[disabled]'), 'push disabled mid-chain');
await shot('d07-falling');
await page.waitForTimeout(1600);
check(await page.isVisible('.m-result'), 'meta win sheet after level 1');
check((await page.locator('.m-stars i.on').count()) === 3, '3 stars at par');
check((await coins()) === 700 + 25, 'win paid 10 + 3*5 coins');
await shot('d08-win');
await page.click('[data-next]');
await page.waitForTimeout(250);
check(await page.textContent('#level') === '2', 'next goes to level 2');
check((await page.locator('#level-stars i.on').count()) === 0, 'no stars yet on level 2');

// ── level 2: failed push, free hint, paid hint (coins), max 2 stars ──
await pushAndWait();
check(await phase() === 'failed', 'scrambled push fails');
check((await page.textContent('#push-label')) === 'Tekrar diz', 'push turns into reset');
await shot('d09-failed');
await page.click('#push-btn');
check(await phase() === 'edit', 'reset back to edit');
const taps0 = await page.textContent('#taps');
await page.click('#hint-btn');
await page.waitForTimeout(150);
check(await page.isHidden('#hint-sheet'), 'first hint is free (no sheet)');
check(await page.textContent('#taps') === taps0, 'hint does not count as a tap');
check(await page.isVisible('#meter-cap'), 'hinted level shows the 2-star cap');
await page.click('#hint-btn');
await page.waitForTimeout(200);
check(await page.isVisible('#hint-sheet'), 'second hint asks for coins or video');
await shot('d10-hint-sheet');
const cBefore = await coins();
const dirsBefore = await G(() => window.__devril.state.dirs.slice());
await page.click('#hint-coins');
await page.waitForTimeout(200);
check((await coins()) === cBefore - 40, 'paid hint costs 40 coins');
check((await G(() => window.__devril.state.dirs.slice())).some((d, i) => d !== dirsBefore[i]), 'paid hint turns a tile');
await page.click('#undo-btn');
await page.waitForTimeout(100);
check(await page.textContent('#taps') === taps0, 'undoing a hint never refunds a tap');
await solveByTapping();
await pushAndWait();
check(await page.isVisible('.m-result'), 'win after level 2');
check((await page.locator('.m-stars i.on').count()) <= 2, 'hinted level earns at most 2 stars');
await page.click('[data-next]');
await page.waitForTimeout(250);

// ── level 3: undo, pause → restart, reload keeps progress ──
const start3 = await G(() => JSON.stringify(window.__devril.state.dirs));
const t3 = await G(() => window.__devril.level.tiles);
await tapCell(t3[0].x, t3[0].y);
check(await page.textContent('#taps') === '1', 'tap counter increments');
await page.click('#undo-btn');
await page.waitForTimeout(80);
check(await G(() => JSON.stringify(window.__devril.state.dirs)) === start3 && (await page.textContent('#taps')) === '0', 'undo restores rotation + tap');
await tapCell(t3[1].x, t3[1].y);
await page.click('#settings-btn');
await page.waitForTimeout(250);
check(await page.isVisible('[data-resume]'), 'pause sheet');
await shot('d11-pause');
await page.click('[data-restart]');
await page.waitForTimeout(150);
check(await G(() => JSON.stringify(window.__devril.state.dirs)) === start3 && (await page.textContent('#taps')) === '0', 'pause → restart rescrambles');
await tapCell(t3[1].x, t3[1].y);
await page.waitForTimeout(100);
await page.reload();
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'reload opens home');
const p = await prof();
check(p.unlocked === 3 && p.stars[0] === 3 && p.stars[1] >= 1 && p.skin === 'walnut', 'profile keeps stars, unlocks and skin');
check((await page.textContent('[data-level-title]')).includes('3'), 'play card on level 3');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(await page.textContent('#level') === '3' && (await page.textContent('#taps')) === '1', 'play resumes the level-3 board');

// ── late level with pinned tiles ──
await G(() => window.__devril.goto(150));
await page.waitForTimeout(400);
check(await G(() => window.__devril.level.size) === 8, 'level 150 is 8x8');
const lockedIdx = await G(() => window.__devril.level.tiles.findIndex((t) => t.locked));
check(lockedIdx >= 0, 'late level has pinned tiles');
const lt = await G((i) => window.__devril.level.tiles[i], lockedIdx);
const lockedDir = await G((i) => window.__devril.state.dirs[i], lockedIdx);
await tapCell(lt.x, lt.y);
check(await G((i) => window.__devril.state.dirs[i], lockedIdx) === lockedDir, 'pinned tile does not rotate');
await page.waitForTimeout(500);
await shot('d12-level150');

// ── v1.0 save migration ──
const ctx2 = await browser.newContext(ctxOpts);
await ctx2.addInitScript(() => {
  if (localStorage.getItem('devril.profile')) return;
  localStorage.setItem('devril.stars', JSON.stringify([3, 2, 3, 1]));
  localStorage.setItem('devril.save', JSON.stringify({ level: 5, dirs: [], taps: 0, history: [], hintsUsed: 0, pushes: 0 }));
});
const page2 = await ctx2.newPage();
watch(page2);
await page2.goto(url);
await page2.waitForTimeout(600);
const p2 = await page2.evaluate(() => JSON.parse(localStorage.getItem('devril.profile')));
check(p2.unlocked === 5 && p2.stars.slice(0, 4).join() === '3,2,3,1', 'v1.0 stars + level migrate into the profile');
check((await page2.textContent('[data-level-title]')).includes('5'), 'migrated player continues at level 5');
await ctx2.close();

await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
