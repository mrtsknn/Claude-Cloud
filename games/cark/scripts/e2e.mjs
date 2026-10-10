// End-to-end: meta home → daily reward → shop (buy + equip a style) → missions → level map →
// solve level 1 by dragging gears (gear phase stays continuous + meshes) → meta win → next →
// pause → reload keeps progress → hints (free, then coins) → jam on a belt level → level 150
// completion message → v1.0 save migration; no console errors.
// Usage: npm run preview -w games/cark -- --port 4188, then node games/cark/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4188/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'tr-TR' });
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};
watch(page);
let passed = 0;
const check = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok  ', msg); } };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const state = () => page.evaluate(() => ({ ...window.__cark.state, ...window.__cark.eval }));
const prof = () => page.evaluate(() => JSON.parse(localStorage.getItem('cark.profile')));
const coins = async () => Number(await page.locator('.m-home [data-coins]').first().textContent());
const STEP = (Math.PI * 2) / 12;

async function geom() {
  const box = await page.locator('#stage').boundingBox();
  const L = JSON.parse(await page.locator('#stage').getAttribute('data-layout'));
  const at = (cell) => [box.x + L.bx + ((cell % L.cols) + 0.5) * L.cell, box.y + L.by + (Math.floor(cell / L.cols) + 0.5) * L.cell];
  return { at, tray: [box.x + L.trayX, box.y + L.trayY] };
}
async function dragTo(cell, shotName) {
  const g = await geom();
  const [tx, ty] = g.at(cell);
  await page.mouse.move(...g.tray);
  await page.mouse.down();
  await page.mouse.move((g.tray[0] + tx) / 2, (g.tray[1] + ty) / 2, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 4 });
  if (shotName) await shot(shotName);
  await page.mouse.up();
  await page.waitForTimeout(40);
}
async function solveLevel(shotName) {
  const sol = await page.evaluate(() => window.__cark.level.solution.filter((c) => !window.__cark.state.gears.includes(c)));
  for (const [i, c] of sol.entries()) await dragTo(c, i === 0 ? shotName : undefined);
  await page.waitForTimeout(1500);
}

// ── home, daily, shop, missions ──
await page.goto(url);
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home menu on boot');
check(await page.isVisible('.m-home .hero'), 'hero artwork (two gears) on home');
check(await page.evaluate(() => document.documentElement.lang) === 'tr', 'html lang follows device (tr)');
await shot('c1-home');
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('c2-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('cark.profile')); p.coins = 1000; localStorage.setItem('cark.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(400);
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'shop lists at least 6 styles');
await page.locator('.m-skin').nth(1).click(); // steel, 300
await page.waitForTimeout(200);
await shot('c3-shop');
check((await coins()) === 700, 'style bought for 300');
check((await prof()).skin === 'steel', 'style equipped');
check(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--g-mid').trim()) === '#aebdc6', 'style recolors gears');
await page.click('[data-close]');
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('c4-missions');
await page.click('[data-close]');

// ── map → level 1 ──
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(250);
check((await page.locator('.m-lvl').count()) === 150, 'map shows 150 levels');
check((await page.locator('.m-lvl.locked').count()) === 149, 'only level 1 unlocked');
await shot('c5-map');
await page.locator('.m-lvl').first().click();
await page.waitForTimeout(300);
check(await page.isHidden('.m-home') && (await page.textContent('#level')) === '1', 'map starts level 1');
await shot('c6-tutorial');

// place all but the last gear, then check the clock starts from its own angle (no jump)
const sol1 = await page.evaluate(() => window.__cark.level.solution);
for (const c of sol1.slice(0, -1)) await dragTo(c);
const clock = await page.evaluate(() => window.__cark.level.clocks[0].cell);
await page.evaluate(() => window.__cark.freeze(0));
const before = await page.evaluate((c) => window.__cark.angle(c), clock);
await dragTo(sol1.at(-1), 'c7-dragging');
const after = await page.evaluate((c) => window.__cark.angle(c), clock);
check(Math.abs(after - before) < 1e-6, `newly powered clock keeps its angle (Δ=${(after - before).toFixed(4)})`);
await page.evaluate(() => window.__cark.freeze(null));
await page.waitForTimeout(400);
const meshErr = await page.evaluate((STEP) => {
  const c = window.__cark;
  const lv = c.level;
  const on = new Set(c.eval.powered);
  let worst = 0;
  for (const a of on) for (const b of on) {
    if (b <= a) continue;
    const adj = (Math.abs(a - b) === 1 && Math.floor(a / lv.cols) === Math.floor(b / lv.cols)) || Math.abs(a - b) === lv.cols;
    if (!adj) continue;
    const r = ((((c.angle(a) + c.angle(b) - STEP / 2) % STEP) + STEP) % STEP);
    worst = Math.max(worst, Math.min(r, STEP - r));
  }
  return worst;
}, STEP);
check(meshErr < 0.02, `driven neighbours mesh half a tooth apart (err ${meshErr.toFixed(4)})`);
await page.waitForTimeout(1300);
check(await page.isVisible('[data-next]'), 'meta win screen after solving level 1');
await page.waitForTimeout(500);
await shot('c8-win');
const p1 = await prof();
check(p1.stars[0] === 3 && p1.unlocked === 2, 'stars recorded and level 2 unlocked');
check(p1.coins === 700 + 25, 'win paid 10 + 3×5 coins');
await page.click('[data-next]');
await page.waitForTimeout(300);
check((await page.textContent('#level')) === '2', 'next goes to level 2');

// ── pause ──
await page.click('#settings-btn');
await page.waitForTimeout(150);
check(await page.isVisible('[data-resume]'), 'HUD button opens meta pause');
await shot('c9-pause');
await page.click('[data-resume]');
await page.waitForTimeout(100);

// tap a placed gear to take it back, then leave one placed for the reload check
const first = await page.evaluate(() => window.__cark.level.solution[0]);
await dragTo(first);
check((await state()).gears.length === 1, 'gear placed by drag');
await page.mouse.click(...(await geom()).at(first));
check((await state()).gears.length === 0, 'tapping a gear picks it up');
await dragTo(first);

// ── reload keeps progress ──
await page.reload();
await page.waitForTimeout(500);
check(await page.isVisible('.m-home'), 'reload opens home');
check((await page.textContent('[data-level-title]')).includes('2'), 'home play card shows level 2');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
let s = await state();
check(s.level === 2 && s.gears.length === 1 && s.gears[0] === first, 'level 2 board survives reload');
await solveLevel();
await page.click('[data-next]');
await page.waitForTimeout(300);

// ── hints: first free, second costs 40 coins ──
const coinsBeforeHint = (await prof()).coins;
await page.click('#hint-btn');
await page.waitForTimeout(150);
s = await state();
check(s.gears.length === 1 && s.locked.length === 1, 'first hint is free and places a locked gear');
check((await prof()).coins === coinsBeforeHint, 'free hint costs nothing');
await page.click('#hint-btn');
await page.waitForTimeout(150);
check(await page.isVisible('#hint-sheet'), 'second hint asks coins or video');
await shot('c10-hint');
await page.click('#hint-coins');
await page.waitForTimeout(150);
s = await state();
check(s.locked.length === 2 && (await prof()).coins === coinsBeforeHint - 40, 'second hint paid with 40 coins');
await page.mouse.click(...(await geom()).at(s.gears[0]));
check((await state()).gears.length === 2, 'hint gear cannot be picked up');

// ── jam on a belt level ──
await page.evaluate(() => window.__cark.goto(31));
await page.waitForTimeout(200);
const chain = await page.evaluate(() => {
  const lv = window.__cark.level;
  const [a, b] = lv.belts[0];
  const fixed = new Set([lv.motor, ...lv.clocks.map((c) => c.cell), ...lv.belts.flat(), ...lv.rocks]);
  const nb = (c) => { const r = Math.floor(c / lv.cols), k = c % lv.cols; return [r > 0 && c - lv.cols, r < lv.rows - 1 && c + lv.cols, k > 0 && c - 1, k < lv.cols - 1 && c + 1].filter((x) => x !== false); };
  const prev = new Map();
  const q = nb(a).filter((c) => !fixed.has(c));
  q.forEach((c) => prev.set(c, -1));
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (nb(c).includes(b)) { const path = []; for (let x = c; x !== -1; x = prev.get(x)) path.push(x); return path; }
    for (const n of nb(c)) if (!fixed.has(n) && !prev.has(n)) { prev.set(n, c); q.push(n); }
  }
  return null;
});
check(!!chain, 'found a jam chain on level 31');
for (const c of chain ?? []) await dragTo(c);
await page.waitForTimeout(120);
check((await state()).jammed.length > 0, 'closing a belt loop jams the group');
await shot('c11-jam');
await page.click('#undo-btn');
check((await state()).jammed.length === 0, 'undo clears the jam');

// ── level 150: completion message, no level 151 ──
await page.evaluate(() => window.__cark.goto(150));
await page.waitForTimeout(300);
await shot('c12-level150');
await solveLevel();
check(await page.isVisible('[data-next]'), 'level 150 win screen');
await page.click('[data-next]');
await page.waitForTimeout(300);
check(await page.isVisible('#done') && await page.isVisible('.m-home'), 'after level 150: completion message over the menu');
check((await prof()).unlocked === 150, 'unlocked stays capped at 150');
await shot('c13-complete');
await page.click('#done-ok');

// ── v1.0 save migration ──
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
await ctx2.addInitScript(() => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('cark.stars', JSON.stringify({ 1: 3, 2: 2, 3: 3, 4: 1, 5: 3 }));
  localStorage.setItem('cark.save', JSON.stringify({ level: 6, gears: [], locked: [], history: [], hintsUsed: 0 }));
});
const p2 = await ctx2.newPage();
watch(p2);
await p2.goto(url);
await p2.waitForTimeout(500);
const mig = await p2.evaluate(() => JSON.parse(localStorage.getItem('cark.profile')));
check(mig && mig.unlocked === 6 && mig.stars.slice(0, 5).join() === '3,2,3,1,3', 'v1.0 stars and level migrate into the profile');
check(await p2.evaluate(() => localStorage.getItem('cark.stars')) === null, 'legacy star map removed');
check((await p2.textContent('.m-logo')) === 'Cogwork', 'English title');
await ctx2.close();

await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
