// End-to-end: meta home → daily reward → shop (buy + equip a crystal theme) → missions → level map →
// solve level 1 by real taps → meta win → next → hints (free, then coins) → pause → menu →
// reload keeps progress → neighbour (15) and mirror (40) levels → no console errors.
// Usage: npm run preview -w games/kristal -- --port 4190, then node games/kristal/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4190/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let passed = 0;
const check = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok  ', msg); } };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const K = (fn, arg) => page.evaluate(fn, arg);
const coins = async () => Number(await page.locator('.m-home [data-coins]').textContent());
const profile = () => K(() => JSON.parse(localStorage.getItem('kristal.profile')));

async function tapCell(i) {
  const [box, layout] = await Promise.all([page.locator('#stage').boundingBox(), page.locator('#stage').getAttribute('data-layout').then(JSON.parse)]);
  const [x, y] = layout[i];
  await page.mouse.click(box.x + x, box.y + y);
  await page.waitForTimeout(60);
}
async function solveLevel(shotName) {
  const sol = await K(() => window.__kristal.solve());
  const { par, level } = await K(() => ({ par: window.__kristal.level.par, level: window.__kristal.level.level }));
  check(sol.length <= par, `level ${level} solvable in ≤ par=${par} taps`);
  for (const [k, c] of sol.entries()) {
    await tapCell(c);
    if (shotName && k === 0) await shot(shotName);
  }
  await page.waitForTimeout(2000);
  check(await page.isVisible('[data-next]'), `meta win screen after solving level ${level}`);
}

// ── home & meta
await page.goto(url);
await page.waitForTimeout(700);
check(await page.isVisible('.m-home'), 'home menu on boot');
check(await K(() => document.documentElement.lang) === 'tr', 'html lang set to tr');
check(await page.isVisible('.m-home canvas.hero'), 'hero snowflake on home');
await shot('k1-home');
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('k2-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]:visible');
check((await coins()) === c0 + 20, 'daily reward paid 20');

await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'six or more crystal themes');
await page.locator('.m-skin').nth(1).click(); // aurora 300 > coins → not enough
check((await coins()) === c0 + 20, 'cannot buy a theme without coins');
await page.click('[data-close]:visible');
await K(() => { const p = JSON.parse(localStorage.getItem('kristal.profile')); p.coins = 1000; localStorage.setItem('kristal.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(500);
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(150);
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(250);
await shot('k3-shop');
check((await coins()) === 700, 'theme bought for 300');
check((await profile()).skin === 'aurora', 'theme equipped');
await page.locator('.m-skin').nth(0).click();
await page.waitForTimeout(100);
check((await profile()).skin === 'ice', 'switch back to an owned theme for free');
await page.locator('.m-skin').nth(1).click();
check((await coins()) === 700, 're-equipping an owned theme is free');
await page.click('[data-close]:visible');

await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('k4-missions');
await page.click('[data-close]:visible');

await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(200);
check((await page.locator('.m-lvl').count()) === 150, 'map lists 150 levels');
check((await page.locator('.m-lvl.locked').count()) === 149, 'only level 1 open');
await shot('k5-map');
await page.locator('.m-lvl').first().click();
await page.waitForTimeout(700);
check(await page.isHidden('.m-home'), 'map opens the level');
check(await page.textContent('#level') === '1', 'level 1');
await shot('k6-tutorial');

// ── level 1 by taps → win → next
await solveLevel('k7-tap');
await page.waitForTimeout(400);
await shot('k8-win');
const c1 = await coins();
await page.click('[data-next]');
await page.waitForTimeout(300);
check(await page.textContent('#level') === '2', 'next advances to level 2');
const p1 = await profile();
check(p1.stars[0] === 3 && p1.unlocked === 2, 'profile records 3 stars and unlocks level 2');
check(p1.coins === 725 && c1 === 725, 'win paid 25 coins (10 + 3 stars × 5)');
check(p1.missions.some((m) => m.id === 'taps' || m.id === 'flakes' || m.id === 'levels' || m.id === 'stars' || m.id === 'perfect'), 'missions dealt from kristal pool');

// ── level 2: undo free, first hint free, second hint for coins
const before = await K(() => window.__kristal.state.state);
await tapCell(0);
check(await K(() => window.__kristal.state.history.length) === 1, 'tap counted');
await page.click('#undo-btn');
check(await K(() => window.__kristal.state.state) === before, 'undo restores previous state');
await page.click('#hint-btn');
await page.waitForTimeout(150);
check(await K(() => window.__kristal.state.hintsUsed) === 1, 'first hint used (free)');
check((await page.textContent('#hint-badge')).includes('40'), 'next hint priced 40 coins');
await page.click('#outline-btn');
await page.waitForTimeout(150);
await shot('k9-hint-outline');
await page.click('#outline-btn');
const coinsBeforeHint = await K(() => window.__kristal.profile.coins);
await page.click('#hint-btn');
await page.waitForTimeout(150);
check(await page.isVisible('[data-coins]:visible'), 'paid hint chooser (coins or video)');
await shot('k10-hint-sheet');
await page.click('[data-coins]:visible');
await page.waitForTimeout(150);
check(await K(() => window.__kristal.state.hintsUsed) === 2, 'second hint granted');
check((await K(() => window.__kristal.profile.coins)) === coinsBeforeHint - 40, 'second hint cost 40 coins');

// ── pause → menu → reload keeps progress
await tapCell((await K(() => window.__kristal.solve()))[0]);
const saved = await K(() => window.__kristal.state.state);
await page.click('#pause-btn');
await page.waitForTimeout(150);
check(await page.isVisible('[data-resume]'), 'pause sheet');
await shot('k11-pause');
await page.click('[data-menu]');
await page.waitForTimeout(200);
check(await page.isVisible('.m-home'), 'pause → menu returns home');
await page.reload();
await page.waitForTimeout(600);
check((await page.textContent('[data-level-title]')).includes('2'), 'home play card shows level 2 after reload');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(await page.textContent('#level') === '2', 'play resumes level 2');
check(await K(() => window.__kristal.state.state) === saved, 'board state survives reload');
check((await profile()).skin === 'aurora', 'theme survives reload');
await shot('k12-resumed-aurora');

// ── neighbour rule level (gentle intro)
await K(() => window.__kristal.goto(15));
await page.waitForTimeout(500);
const intro = await K(() => ({ par: window.__kristal.level.par, on: window.__kristal.level.target.toString(2).replace(/0/g, '').length }));
check(intro.par >= 2 && intro.par <= 3 && intro.on <= 3, `level 15 is gentle (par ${intro.par}, ${intro.on} lit)`);
const mask = await K(() => { const k = window.__kristal; const c = (k.solve()[0] + 1) % 6; const s = k.state.state; k.tap(c); const d = k.state.state ^ s; k.tap(c); return d; });
check(mask.toString(2).replace(/0/g, '').length > 1, 'neighbour rule toggles several cells');
await shot('k13-neighbours');
await solveLevel();
await page.click('[data-next]');
await page.waitForTimeout(300);

// ── mirror level
await K(() => window.__kristal.goto(40));
await page.waitForTimeout(500);
await shot('k14-mirror');
await solveLevel();
await page.click('[data-menu]');
await page.waitForTimeout(300);
check(await page.isVisible('.m-home'), 'win → menu returns home');
const p2 = await profile();
check(p2.stars[14] >= 1 && p2.stars[39] === 3, `level 15 and 40 stars recorded (${p2.stars[14]}, ${p2.stars[39]})`);
await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
