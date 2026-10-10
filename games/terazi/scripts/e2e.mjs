// End-to-end: meta home → daily reward → shop (buy + equip a material) → missions → level map →
// solve level 1 with real drags → meta win sheet → next → pick-up/undo/free hint/paid hint →
// pause → reload keeps progress → late level (span 6) → v1.0 save migration; no console errors.
// Usage: npm run preview -w games/terazi -- --port 4187, then
//   node games/terazi/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4187/';
const browser = await chromium.launch();
const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' };
const context = await browser.newContext(ctxOpts);
const page = await context.newPage();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};
watch(page);
let passed = 0;
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok  ', msg); }
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const api = (fn, arg) => page.evaluate(fn, arg);
const prof = () => api(() => JSON.parse(localStorage.getItem('terazi.profile')));
const coins = async () => Number(await page.locator('.m-home [data-coins]').first().textContent());
const box = async () => page.locator('#stage').boundingBox();

async function dragTo(from, to) {
  const b = await box();
  await page.mouse.move(b.x + from.x, b.y + from.y);
  await page.mouse.down();
  await page.mouse.move(b.x + (from.x + to.x) / 2, b.y + (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(b.x + to.x, b.y + to.y, { steps: 4 });
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(60);
}
async function placeWeight(i, d) {
  const from = await api((i) => window.__terazi.trayPoint(i), i);
  const to = await api((d) => window.__terazi.dropPoint(d), d);
  await dragTo(from, to);
}
async function solveLevel(shotName) {
  const sol = await api(() => window.__terazi.solution());
  for (const [i, d] of sol.entries()) {
    if (await api((i) => window.__terazi.state.pos[i] !== null, i)) continue;
    await page.waitForTimeout(250); // let the spring settle so pegs sit where expected
    await placeWeight(i, d);
    if (shotName && i === 0) await shot(shotName);
  }
}

// ── home ──
await page.goto(url);
await page.waitForTimeout(3000); // hero scale settles
check(await page.isVisible('.m-home'), 'home menu on boot');
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang set to tr');
check((await page.locator('.m-home .hero svg').boundingBox()).width > 200, 'hero scale artwork is full size');
await shot('e1-home');

// ── daily ──
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('e2-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');

// ── shop: buy + equip a material ──
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'shop lists at least 6 materials');
await page.locator('.m-skin').nth(1).click(); // wood 300 > coins → not enough
check((await prof()).skin === 'brass', 'cannot buy without coins');
await page.click('[data-close]');
await api(() => { const p = JSON.parse(localStorage.getItem('terazi.profile')); p.coins = 1000; localStorage.setItem('terazi.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(500);
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(250);
await shot('e3-shop');
check((await coins()) === 700, 'material bought for 300');
check((await prof()).skin === 'wood', 'wood equipped');
await page.click('[data-close]');

// ── missions ──
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('e4-missions');
await page.click('[data-close]');

// ── level map → level 1 ──
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(250);
check((await page.locator('.m-lvl').count()) === 150, 'map shows 150 levels');
check((await page.locator('.m-lvl.locked').count()) === 149, 'only level 1 unlocked');
await shot('e5-map');
await page.locator('.m-lvl').first().click();
await page.waitForTimeout(400);
check(await page.isHidden('.m-home'), 'map starts the level');
check((await page.textContent('#level')) === '1', 'level 1 in the HUD');
check(await page.isVisible('#toast'), 'tutorial toast visible');
await shot('e6-tutorial');
await solveLevel('e7-placed');
check(await api(() => window.__terazi.state.pos.every((d) => d !== null)), 'level 1 all weights placed by drag');
await page.waitForTimeout(1500);
check(await page.isVisible('.m-result [data-next]'), 'meta win sheet after level 1');
check((await page.locator('.m-result .m-stars i.on').count()) === 3, '3 stars at par');
check((await page.textContent('.m-result [data-reward]')).trim() === '+25', 'win pays 10 + 3×5 coins');
await shot('e8-win');
const p1 = await prof();
check(p1.stars[0] === 3 && p1.unlocked === 2, 'profile records stars and unlocks level 2');
check(p1.coins === 725, 'coins credited');
await page.click('.m-result [data-next]');
await page.waitForTimeout(300);
check((await page.textContent('#level')) === '2', 'next → level 2');

// ── level 2: pick-up by tap, undo, free hint, paid hint ──
const sol2 = await api(() => window.__terazi.solution());
await placeWeight(0, sol2[0]);
check(await api(() => window.__terazi.state.pos[0] !== null), 'placed first weight');
const pp = await api(() => window.__terazi.placedPoint(0));
const b = await box();
await page.mouse.click(b.x + pp.x, b.y + pp.y);
await page.waitForTimeout(100);
check(await api(() => window.__terazi.state.pos[0] === null), 'tap on placed weight returns it to tray');
check(await api(() => window.__terazi.state.moves === 2), 'moves count placement + pickup');
await page.click('#undo-btn');
await page.waitForTimeout(100);
check(await api(() => window.__terazi.state.pos[0] !== null), 'undo restores the placed weight');
await page.click('#undo-btn');
await page.click('#hint-btn');
await page.waitForTimeout(300);
check(await api(() => window.__terazi.state.locked.some(Boolean) && window.__terazi.state.hintsUsed === 1), 'first hint is free, places and locks');
check((await page.textContent('#hint-badge')) === '40', 'hint badge shows the coin price');
const beforeHint = (await prof()).coins;
await page.click('#hint-btn');
await page.waitForTimeout(150);
check(await page.isVisible('#hint-sheet'), 'second hint asks for coins or a video');
await shot('e9-hint');
await page.click('#hint-coins');
await page.waitForTimeout(300);
check((await prof()).coins === beforeHint - 40, 'paid hint costs 40 coins');
check(await api(() => window.__terazi.state.hintsUsed === 2), 'paid hint placed a weight');
await solveLevel();
await page.waitForTimeout(1500);
check(await page.isVisible('.m-result [data-next]'), 'level 2 solved after hints');
await page.click('.m-result [data-next]');
await page.waitForTimeout(300);
check((await page.textContent('#level')) === '3', 'next → level 3');

// ── pause ──
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('[data-resume]'), 'pause sheet');
await shot('e10-pause');
await page.click('[data-resume]');
await page.waitForTimeout(150);
check(await page.isHidden('.m-overlay'), 'resume closes pause');

// ── reload keeps progress ──
const sol3 = await api(() => window.__terazi.solution());
await placeWeight(0, sol3[0]);
await page.reload();
await page.waitForTimeout(500);
check(await page.isVisible('.m-home'), 'reload lands on home');
const p2 = await prof();
check(p2.unlocked === 3 && p2.stars[1] >= 1 && p2.skin === 'wood', 'profile survives reload');
check((await page.textContent('[data-level-title]')).includes('3'), 'home card offers level 3');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check((await page.textContent('#level')) === '3', 'progress survives reload');
check(await api(() => window.__terazi.state.pos[0] !== null && window.__terazi.state.moves === 1), 'placement survives reload');
await page.click('#pause-btn');
await page.waitForTimeout(150);
await page.click('[data-menu]');
await page.waitForTimeout(200);
check(await page.isVisible('.m-home'), 'pause → menu returns home');

// ── late level: span 6, stacking, blocked pegs ──
await api(() => window.__terazi.goto(120));
await page.waitForTimeout(400);
const lv = await api(() => window.__terazi.level);
check(lv.stack && lv.blocked.length === 2 && lv.n === 6, 'level 120 has stacking, 2 blocked pegs, span 6');
const span = await api(() => { const a = window.__terazi.dropPoint(-6).x; const z = window.__terazi.dropPoint(6).x; return z - a; });
check(span > 390 * 0.8, `span-6 plank uses the width (${Math.round(span)}px between end pegs)`);
await solveLevel();
await page.waitForTimeout(600);
await shot('e11-level120');
check(await api(() => window.__terazi.busy()), 'level 120 solved with real drags');
await page.waitForTimeout(1200);
await page.click('.m-result [data-menu]');
await page.waitForTimeout(200);

// ── bubble follows torque even for a loaded, finished state (no win event) ──
await api(() => {
  const t = window.__terazi;
  t.goto(22);
  const sol = t.level.solution;
  t.load({ level: 22, pos: sol, locked: sol.map(() => false), history: [], moves: sol.length, hintsUsed: 0 });
});
await page.waitForTimeout(200);
check(await api(() => window.__terazi.balanced() && !window.__terazi.busy()), 'loaded balanced state shows level without a win');
await shot('e12-balanced');

// ── v1.0 save migration ──
const ctx2 = await browser.newContext(ctxOpts);
await ctx2.addInitScript(() => {
  if (localStorage.getItem('terazi.migrated')) return;
  localStorage.setItem('terazi.stars', JSON.stringify({ 1: 3, 2: 3, 3: 2, 4: 1 }));
  localStorage.setItem('terazi.completed', '4');
  localStorage.setItem('terazi.save', JSON.stringify({ level: 5, pos: [null, null, null], locked: [false, false, false], history: [], moves: 0, hintsUsed: 0 }));
});
const page2 = await ctx2.newPage();
watch(page2);
await page2.goto(url);
await page2.waitForTimeout(400);
const mp = await page2.evaluate(() => JSON.parse(localStorage.getItem('terazi.profile')));
check(mp.unlocked === 5 && mp.stars.slice(0, 4).join() === '3,3,2,1', 'v1.0 stars and progress migrate into the profile');
check((await page2.textContent('[data-level-sub]')).startsWith('9 '), 'home shows migrated stars');
await ctx2.close();

await browser.close();
console.log(`passed ${passed}`, 'errors', errors);
process.exit(errors.length ? 1 : 0);
