// End-to-end smoke test: tutorial → solve levels 1-3 by dragging gears from the tray → win
// overlay → tap to pick up → hint/undo → jam on a belt level → reload keeps progress.
// Usage: npm run preview -w games/cark -- --port 4188, then node games/cark/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4188/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let passed = 0;
const check = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok', msg); } };
const state = () => page.evaluate(() => ({ ...window.__cark.state, ...window.__cark.eval }));

async function geom() {
  const box = await page.locator('#stage').boundingBox();
  const L = JSON.parse(await page.locator('#stage').getAttribute('data-layout'));
  const at = (cell) => [box.x + L.bx + ((cell % L.cols) + 0.5) * L.cell, box.y + L.by + (Math.floor(cell / L.cols) + 0.5) * L.cell];
  return { at, tray: [box.x + L.trayX, box.y + L.trayY] };
}
async function dragTo(cell, shot) {
  const g = await geom();
  const [tx, ty] = g.at(cell);
  await page.mouse.move(...g.tray);
  await page.mouse.down();
  await page.mouse.move((g.tray[0] + tx) / 2, (g.tray[1] + ty) / 2, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 4 });
  if (shot) await page.screenshot({ path: `${out}/${shot}.png` });
  await page.mouse.up();
  await page.waitForTimeout(40);
}
async function solveLevel(shot) {
  const sol = await page.evaluate(() => window.__cark.level.solution.filter((c) => !window.__cark.state.gears.includes(c)));
  for (const [i, c] of sol.entries()) await dragTo(c, i === 0 ? shot : undefined);
  await page.waitForTimeout(1400);
}

await page.goto(url);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/c1-tutorial.png` });
check(await page.textContent('#level') === '1', 'starts at level 1');
check(await page.evaluate(() => document.documentElement.lang) === 'tr', 'html lang follows device (tr)');
await solveLevel('c1-dragging');
check(await page.isVisible('#win'), 'win overlay after solving level 1');
await page.screenshot({ path: `${out}/c2-win.png` });
await page.click('#next-btn');
check(await page.textContent('#level') === '2', 'advances to level 2');

// tap a placed gear to take it back
const first = await page.evaluate(() => window.__cark.level.solution[0]);
await dragTo(first);
check((await state()).gears.length === 1, 'gear placed by drag');
const g2 = await geom();
await page.mouse.click(...g2.at(first));
check((await state()).gears.length === 0, 'tapping a gear picks it up');
await solveLevel();
check(await page.isVisible('#win'), 'level 2 solved');
await page.click('#next-btn');

// level 3: hint (free, locked), undo, then solve
await page.click('#hint-btn');
await page.waitForTimeout(150);
let s = await state();
check(s.gears.length === 1 && s.locked.length === 1, 'hint places one locked gear');
check(await page.isVisible('#hint-badge'), 'next hint shows the ad badge');
await page.screenshot({ path: `${out}/c3-hint.png` });
await page.mouse.click(...(await geom()).at(s.gears[0]));
check((await state()).gears.length === 1, 'hint gear cannot be picked up');
await page.click('#undo-btn');
check((await state()).gears.length === 0, 'undo removes the last placement');
await solveLevel();
check(await page.isVisible('#win'), 'level 3 solved');
await page.click('#next-btn');

// jam: connect both pulleys of a belt through gears on a belt level
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
check(!(await page.isHidden('#toast')), 'jam toast shown');
await page.screenshot({ path: `${out}/c4-jam.png` });
await page.click('#undo-btn');
check((await state()).jammed.length === 0, 'undo clears the jam');

await page.reload();
await page.waitForTimeout(400);
s = await state();
check(await page.textContent('#level') === '31' && s.gears.length === (chain?.length ?? 1) - 1, 'progress and board survive reload');
await page.evaluate(() => window.__cark.goto(150));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/c5-level150.png` });
await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
