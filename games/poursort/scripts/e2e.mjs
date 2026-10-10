// End-to-end smoke test: tutorial → solve levels 1-3 by tapping → win overlay → undo/hint/extra
// tube → stuck detection → late level with 12 colors and symbols.
// Usage: npm run preview -w games/poursort, then node games/poursort/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4175/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else console.log('ok', msg); };
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
    if (shotPrefix && k === 1) await page.screenshot({ path: `${out}/${shotPrefix}-selected.png` });
    await tapTube(b);
    if (shotPrefix && k === 1) { await page.waitForTimeout(330); await page.screenshot({ path: `${out}/${shotPrefix}-pouring.png` }); }
    await idle().catch(() => {});
    await page.waitForTimeout(30);
  }
}

await page.goto(url);
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/p1-tutorial.png` });
check(await page.textContent('#level') === '1', 'starts at level 1');
await solveLevel('p1');
await page.waitForTimeout(1200);
check(await page.isVisible('#win'), 'win overlay after solving level 1');
await page.screenshot({ path: `${out}/p2-win.png` });
await page.click('#next-btn');
check(await page.textContent('#level') === '2', 'advances to level 2');
await solveLevel();
await page.waitForTimeout(1100);
await page.click('#next-btn');

// level 3: undo, hint, extra tube
const t0 = await page.evaluate(() => JSON.stringify(window.__poursort.state.tubes));
const [a, b] = (await page.evaluate(() => window.__poursort.solve(window.__poursort.state.tubes)))[0];
await tapTube(a); await tapTube(b); await idle();
await page.click('#undo-btn'); await page.waitForTimeout(100);
check(await page.evaluate(() => JSON.stringify(window.__poursort.state.tubes)) === t0, 'undo restores previous state');
check(await page.textContent('#undo-count') === '4', 'undo counter decremented');
await page.click('#hint-btn'); await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/p3-hint.png` });
const n = await page.evaluate(() => window.__poursort.state.tubes.length);
await page.click('#tube-btn'); await page.waitForTimeout(200);
check(await page.evaluate(() => window.__poursort.state.tubes.length) === n + 1, 'extra tube added');
check(await page.isDisabled('#tube-btn'), 'extra tube button disabled after use');
await solveLevel();
await page.waitForTimeout(1100);
check(await page.isVisible('#win'), 'level 3 solved with extra tube');

// stuck detection on a crafted dead-end board
await page.click('#next-btn');
await page.evaluate(() => window.__poursort.load({ level: 9, tubes: [[1, 2, 1, 2], [1, 2, 1, 2], [3, 3, 3], [4, 4, 4, 3]], history: [], undos: 5, extraUsed: false, moves: 0, hintsUsed: 0 }));
await page.waitForTimeout(200);
await tapTube(3); await tapTube(2); await idle(); await page.waitForTimeout(200);
check(!(await page.isHidden('#toast')), 'stuck toast shown');
await page.screenshot({ path: `${out}/p5-stuck.png` });

// late level, 12 colours, symbols on
await page.evaluate(() => localStorage.setItem('poursort.settings', JSON.stringify({ sound: true, haptics: true, symbols: true })));
await page.reload(); await page.waitForTimeout(300);
await page.evaluate(() => window.__poursort.goto(120));
await page.waitForTimeout(400);
check(await page.evaluate(() => window.__poursort.state.tubes.length) === 14, 'level 120 has 12 colours + 2 empty tubes');
await page.screenshot({ path: `${out}/p4-level120-symbols.png` });
await page.reload(); await page.waitForTimeout(300);
check(await page.textContent('#level') === '120', 'progress survives reload');
await browser.close();
console.log('errors', errors);
