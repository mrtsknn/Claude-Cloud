// End-to-end smoke test: tutorial → solve levels 1-3 by real taps → win overlay + stars →
// failed push + reset → undo → hint → restart → late level → reload keeps progress.
// Usage: npm run preview -w games/devril -- --port 4181, then node games/devril/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4181/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
let passed = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok', msg); }
};
const G = (fn, arg) => page.evaluate(fn, arg);
const phase = () => G(() => window.__devril.phase);

async function tapCell(x, y) {
  const box = await page.locator('#stage').boundingBox();
  const L = JSON.parse(await page.locator('#stage').getAttribute('data-layout'));
  await page.mouse.click(box.x + L.bx + (x + 0.5) * L.cell, box.y + L.by + (y + 0.5) * L.cell);
}
/** Taps every tile of the current level the minimum number of times to reach the optimal solution. */
async function solveByTapping(shot) {
  const plan = await G(() => {
    const d = window.__devril;
    const lv = d.level;
    const dirs = d.state.dirs.slice();
    return { tiles: lv.tiles, dirs, start: lv.start };
  });
  // Ask the game's own solver for the optimal configuration.
  const target = await G(() => window.__devril.optimal());
  let taps = 0;
  for (let i = 0; i < plan.tiles.length; i++) {
    const n = (target[i] - plan.dirs[i] + 4) % 4;
    for (let k = 0; k < n; k++) {
      await tapCell(plan.tiles[i].x, plan.tiles[i].y);
      taps++;
      await page.waitForTimeout(40);
    }
    if (shot && taps === 1) await page.screenshot({ path: `${out}/${shot}-rotating.png` });
  }
  return taps;
}

await page.goto(url);
await page.waitForTimeout(600);
check(await page.isVisible('#hand'), 'tutorial hand visible on level 1');
check((await page.textContent('#tip')).length > 0, 'tutorial tip text');
check(await page.textContent('#level') === '1', 'starts at level 1');
check(await G(() => document.documentElement.lang) === 'tr', 'html lang tr');
await page.screenshot({ path: `${out}/d1-tutorial.png` });
const taps1 = await solveByTapping();
check(taps1 === 1, 'level 1 needs one tap');
await page.waitForTimeout(350);
check(await page.textContent('#tip') !== '' && await page.isVisible('#hand'), 'tutorial moves to push button');
await page.screenshot({ path: `${out}/d2-tutorial-push.png` });
await page.click('#push-btn');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/d3-falling.png` });
await page.waitForTimeout(1500);
check(await page.isVisible('#win'), 'win overlay after level 1');
check(await page.locator('#win-stars svg.on').count() === 3, '3 stars at par');
await page.screenshot({ path: `${out}/d4-win.png` });
await page.click('#next-btn');
await page.waitForTimeout(200);
check(await page.textContent('#level') === '2', 'advances to level 2');
check(await page.locator('#level-stars i.on').count() === 0, 'no stars yet on level 2');

// Level 2: push the scrambled board first -> failure, standing tiles shown, reset
await page.click('#push-btn');
await page.waitForTimeout(1600);
check(await phase() === 'failed', 'scrambled push fails');
check(!(await page.isHidden('#toast')), 'standing toast shown');
check((await page.textContent('#push-label')) === 'Tekrar diz', 'push button turns into reset');
await page.screenshot({ path: `${out}/d5-failed.png` });
await page.click('#push-btn');
check(await phase() === 'edit', 'reset back to edit');
await solveByTapping('d6');
await page.click('#push-btn');
await page.waitForTimeout(2600);
check(await page.isVisible('#win'), 'win overlay after level 2');
await page.click('#next-btn');
await page.waitForTimeout(200);

// Level 3: undo, hint, restart, then solve
const start3 = await G(() => JSON.stringify(window.__devril.state.dirs));
const t3 = await G(() => window.__devril.level.tiles);
await tapCell(t3[0].x, t3[0].y);
check(await page.textContent('#taps') === '1', 'tap counter increments');
await page.click('#undo-btn');
await page.waitForTimeout(80);
check(await G(() => JSON.stringify(window.__devril.state.dirs)) === start3, 'undo restores rotation');
check(await page.textContent('#taps') === '0', 'undo gives the tap back');
const before = await G(() => window.__devril.state.dirs.slice());
await page.click('#hint-btn');
await page.waitForTimeout(150);
const after = await G(() => window.__devril.state.dirs.slice());
check(before.some((d, i) => d !== after[i]), 'hint turns one tile');
check(await page.textContent('#hint-badge') === 'AD', 'second hint is rewarded');
await page.screenshot({ path: `${out}/d7-hint.png` });
await tapCell(t3[1].x, t3[1].y);
await page.click('#restart-btn');
await page.waitForTimeout(80);
check(await G(() => JSON.stringify(window.__devril.state.dirs)) === start3 && (await page.textContent('#taps')) === '0', 'restart rescrambles and resets taps');
await solveByTapping();
await page.click('#push-btn');
await page.waitForTimeout(2800);
check(await page.isVisible('#win'), 'win overlay after level 3');
await page.click('#next-btn');

// Late level with locks
await G(() => window.__devril.goto(150));
await page.waitForTimeout(400);
check(await G(() => window.__devril.level.size) === 8, 'level 150 is 8x8');
check(await G(() => window.__devril.level.tiles.some((t) => t.locked)), 'late level has pinned tiles');
const lockedIdx = await G(() => window.__devril.level.tiles.findIndex((t) => t.locked));
const lt = await G((i) => window.__devril.level.tiles[i], lockedIdx);
const lockedDir = await G((i) => window.__devril.state.dirs[i], lockedIdx);
await tapCell(lt.x, lt.y);
check(await G((i) => window.__devril.state.dirs[i], lockedIdx) === lockedDir, 'pinned tile does not rotate');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/d8-level150.png` });
const t150 = await G(() => window.__devril.level.tiles);
await tapCell(t150[2].x, t150[2].y);
await page.reload();
await page.waitForTimeout(400);
check(await page.textContent('#level') === '150', 'progress survives reload');
check(Number(await page.textContent('#taps')) >= 1, 'taps survive reload');
await G(() => window.__devril.goto(4));
await page.waitForTimeout(200);
await G(() => window.__devril.goto(1));
await page.waitForTimeout(300);
check(await page.locator('#level-stars i.on').count() === 3, 'level 1 shows its 3 stars');
await page.click('#settings-btn');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/d9-settings.png` });
await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
