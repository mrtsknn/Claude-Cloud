// End-to-end smoke test: tutorial → solve levels 1-3 with real taps → rule violation shows red
// → sail + win → undo → hint → reload keeps progress → no console errors.
// Usage: npm run preview -w games/liman -- --port 4189, then node games/liman/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4189/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else console.log('ok', msg); };
const idle = () => page.waitForFunction(() => !window.__liman.busy());
const state = () => page.evaluate(() => window.__liman.state);

async function tapAt(target) {
  const box = await page.locator('#stage').boundingBox();
  const p = await page.evaluate((t) => window.__liman.point(t), target);
  await page.mouse.click(box.x + p.x, box.y + p.y);
}
async function play(move) {
  await tapAt({ id: move.id });
  await tapAt(move.to === -1 ? 'dock' : { col: move.to });
  await idle();
  await page.waitForTimeout(40);
}
async function solveLevel(shot) {
  const moves = await page.evaluate(() => window.__liman.solve());
  for (const [k, m] of moves.entries()) {
    await play(m);
    if (shot && k === 1) await page.screenshot({ path: `${out}/${shot}-loading.png` });
  }
  check((await state()).ship.dock.length === 0, 'dock emptied');
  await page.click('#sail-btn', { force: true });
  if (shot) { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${shot}-sailing.png` }); }
  await page.waitForSelector('#win:not([hidden])', { timeout: 8000 }).catch(() => {});
}

await page.goto(url);
await page.waitForTimeout(700);
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang set to tr');
await page.screenshot({ path: `${out}/l1-tutorial.png` });
check((await page.textContent('#level')) === '1', 'starts at level 1');
await solveLevel('l1');
check(await page.isVisible('#win'), 'win overlay after sailing level 1');
check((await page.locator('#win-stars span:not(.off)').count()) === 3, '3 stars on a clean run');
await page.screenshot({ path: `${out}/l1-win.png` });
await page.click('#next-btn');
check((await page.textContent('#level')) === '2', 'advances to level 2');
await solveLevel();
check(await page.isVisible('#win'), 'level 2 won');
await page.click('#next-btn');

// level 3: violation, undo, hint, then solve
const s3 = await state();
const ports = s3.ship.dock.map((b) => b.port);
const early = s3.ship.dock.find((b) => b.port === Math.min(...ports));
const late = s3.ship.dock.find((b) => b.port === Math.max(...ports));
await tapAt({ id: early.id }); await tapAt({ col: 0 }); await idle();
await tapAt({ id: late.id }); await tapAt({ col: 0 }); await idle();
await page.waitForTimeout(400);
check(await page.evaluate((id) => window.__liman.state.ship.cols[0].at(-1).id === id, late.id), 'late-port box stacked on early-port box');
await page.screenshot({ path: `${out}/l3-violation.png` });
const px = await page.evaluate(() => window.__liman.point({ col: 0 }));
const red = await page.evaluate(async ({ x, y }) => {
  const c = document.getElementById('stage');
  const g = c.getContext('2d');
  const d = window.devicePixelRatio;
  const img = g.getImageData((x - 45) * d, (y - 60) * d, 90 * d, 60 * d).data;
  let n = 0;
  for (let i = 0; i < img.length; i += 4) if (img[i] > 200 && img[i + 1] < 60 && img[i + 2] > 50 && img[i + 2] < 110) n++;
  return n;
}, px);
check(red > 20, `red outline drawn on offending box (${red} px)`);
await page.click('#undo-btn'); await page.waitForTimeout(100);
check((await state()).ship.cols[0].length === 1, 'undo removes the last placement');
await page.click('#undo-btn'); await page.waitForTimeout(100);
check((await state()).ship.dock.length === s3.ship.dock.length, 'second undo restores the dock');
await page.click('#hint-btn'); await page.waitForTimeout(300);
check((await state()).hints === 1, 'hint used');
await page.screenshot({ path: `${out}/l3-hint.png` });
await solveLevel();
check(await page.isVisible('#win'), 'level 3 won');
check((await page.locator('#win-stars span:not(.off)').count()) === 1, 'undo/hint and extra moves cost stars');
await page.click('#next-btn');

// balance failure on sail: load level 4 all on one side
const s4 = await state();
const h4 = await page.evaluate(() => window.__liman.lv.height);
for (const [i, b] of s4.ship.dock.entries()) {
  await tapAt({ id: b.id }); await tapAt({ col: i < h4 ? 0 : 1 }); await idle();
}
await page.click('#sail-btn', { force: true }); await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/l4-sail-fail.png` });
check(!(await page.isVisible('#win')), 'invalid ship does not sail');

// reload keeps progress
await page.reload(); await page.waitForTimeout(500);
check((await page.textContent('#level')) === '4', 'level survives reload');
check((await state()).moves === s4.ship.dock.length, 'moves survive reload');
await browser.close();
console.log('errors', errors);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
