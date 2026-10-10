// End-to-end test with real pointer drags: tutorial → levels 1-3 → double-lit → pick-up/move →
// win overlay → undo → hint → restart → reload keeps progress → late levels on small screens.
// Usage: npm run preview -w games/fener -- --port 4182, then node games/fener/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4182/';
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok  ', msg); }
};

async function open(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return page;
}
const page = await open({ width: 390, height: 844 });
const S = () => page.evaluate(() => window.__fener.state);
const L = () => page.evaluate(() => window.__fener.level);
const E = () => page.evaluate(() => window.__fener.eval);

async function geo() {
  const box = await page.locator('#stage').boundingBox();
  const lay = JSON.parse(await page.locator('#stage').getAttribute('data-layout'));
  return {
    slot: (i) => ({ x: box.x + lay.slots[i].x, y: box.y + lay.slots[i].y }),
    cell: (p) => ({ x: box.x + lay.bx + (p.c + 0.5) * lay.cell, y: box.y + lay.by + (p.r + 0.5) * lay.cell }),
  };
}
async function drag(a, b, shot) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8);
  if (shot) { await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${shot}.png` }); }
  await page.mouse.up();
  await page.waitForTimeout(60);
}
async function dragToCell(i, pos, shot) {
  const g = await geo();
  await drag(g.slot(i), g.cell(pos), shot);
}
async function solveRest() {
  const lvl = await L();
  for (let i = 0; i < lvl.tray.length; i++) {
    const s = await S();
    const p = s.placement[i];
    const want = lvl.solution[i];
    if (p && p.r === want.r && p.c === want.c) continue;
    const g = await geo();
    if (p) await drag(g.cell(p), g.cell(want));
    else await dragToCell(i, want);
  }
}
/** A free street cell where tray lamp `i` would make some window too bright. */
const doubleSpot = (i) => page.evaluate((i) => {
  const f = window.__fener;
  const lvl = f.level;
  for (let k = 0; k < lvl.cells.length; k++) {
    const pos = { r: Math.floor(k / lvl.size), c: k % lvl.size };
    if (lvl.cells[k] !== 0 || f.state.placement.some((p) => p && p.r === pos.r && p.c === pos.c)) continue;
    const pl = f.state.placement.slice();
    pl[i] = pos;
    if (f.evaluate(pl).double.length) return pos;
  }
  return null;
}, i);

await page.goto(url);
await page.waitForTimeout(1600);
await page.screenshot({ path: `${out}/e1-tutorial.png` });
check((await page.textContent('#level')) === '1', 'starts at level 1');
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang follows device language');

// ── level 1: light, over-light, move to fix, win
let lvl = await L();
await dragToCell(0, lvl.solution[0]);
check((await E()).lit >= 3, 'dragging a lamp onto a street lights windows');
const spot = await doubleSpot(1);
check(!!spot, 'found a spot that over-lights a window');
await dragToCell(1, spot, 'e2-drag-preview');
check((await E()).double.length > 0, 'double-lit window detected');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/e3-too-bright.png` });
let g = await geo();
await drag(g.cell(spot), g.cell(lvl.solution[1]));
check((await E()).double.length === 0, 'moving the lamp clears the red window');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/e4-town-lit.png` });
await page.waitForSelector('#win:not([hidden])', { timeout: 4000 }).catch(() => {});
check(await page.isVisible('#win'), 'win overlay after level 1');
check((await page.locator('#win-stars svg.on').count()) === 3, '3 stars for a clean solve');
await page.screenshot({ path: `${out}/e5-win.png` });
await page.click('#next-btn');
check((await page.textContent('#level')) === '2', 'advances to level 2');

// ── level 2: tap a placed lamp to pick it up
await page.waitForTimeout(400);
lvl = await L();
await dragToCell(0, lvl.solution[0]);
g = await geo();
const c0 = g.cell(lvl.solution[0]);
await page.mouse.click(c0.x, c0.y);
await page.waitForTimeout(300);
check((await S()).placement[0] === null, 'tapping a placed lamp returns it to the tray');
await solveRest();
await page.waitForSelector('#win:not([hidden])', { timeout: 4000 });
check(true, 'level 2 solved');
await page.click('#next-btn');

// ── level 3: undo, hint (locks), restart, solve
await page.waitForTimeout(400);
lvl = await L();
await dragToCell(1, lvl.solution[1]);
check((await S()).placement[1] !== null, 'lamp placed on level 3');
await page.click('#undo-btn');
await page.waitForTimeout(100);
check((await S()).placement[1] === null, 'undo returns the lamp');
check((await S()).undos === 1, 'undo counted');
await page.click('#hint-btn');
await page.waitForTimeout(400);
let s = await S();
const hinted = s.locked.findIndex(Boolean);
check(hinted >= 0 && s.placement[hinted]?.r === lvl.solution[hinted].r, 'hint places a correct lamp and locks it');
check((await page.textContent('#hint-badge')) === 'AD', 'second hint is behind a rewarded ad');
await page.screenshot({ path: `${out}/e6-hint.png` });
g = await geo();
const hp = g.cell(lvl.solution[hinted]);
await page.mouse.click(hp.x, hp.y);
check((await S()).placement[hinted] !== null, 'locked lamp cannot be picked up');
await page.click('#restart-btn');
await page.waitForTimeout(300);
s = await S();
check(s.placement.every((p) => p === null) && s.hints === 0, 'restart clears the board');
await solveRest();
await page.waitForSelector('#win:not([hidden])', { timeout: 4000 });
check(true, 'level 3 solved');
await page.click('#next-btn');

// ── reload keeps progress and the board
await page.waitForTimeout(400);
lvl = await L();
await dragToCell(0, lvl.solution[0]);
await page.reload();
await page.waitForTimeout(500);
check((await page.textContent('#level')) === '4', 'reload keeps the level');
check((await S()).placement[0] !== null, 'reload keeps placed lamps');

// settings sheet
await page.click('#settings-btn');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/e7-settings.png` });
check(await page.isVisible('#privacy-link'), 'settings show privacy link');
await page.click('#close-settings');

// ── late levels: 390x844 and the smallest supported phone
await page.evaluate(() => window.__fener.goto(200));
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/e8-level200.png` });
const small = await open({ width: 360, height: 640 });
await small.goto(url);
await small.waitForTimeout(300);
for (const n of [150, 200]) {
  await small.evaluate((n) => window.__fener.goto(n), n);
  await small.waitForTimeout(700);
  const lay = JSON.parse(await small.locator('#stage').getAttribute('data-layout'));
  const box = await small.locator('#stage').boundingBox();
  const lastSlot = lay.slots[lay.slots.length - 1];
  check(lay.by + lay.cell * lay.size < lay.slots[0].y - lay.slot / 2 && lastSlot.y + lay.slot / 2 <= box.height, `360x640 level ${n}: board and tray fit without overlap`);
  await small.screenshot({ path: `${out}/e9-small-${n}.png` });
}
await browser.close();
console.log(`\n${passed} checks passed, ${errors.length} problems`, errors);
process.exit(errors.length ? 1 : 0);
