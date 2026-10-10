// End-to-end: meta home → daily reward → shop (buy + equip a skin) → missions → play → pause →
// game over (meta lose screen) → continue with coins → play again; no console errors.
// Usage: npm run preview -w games/snapgrid -- --port 4201, then node games/snapgrid/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4201/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (c, msg) => { if (!c) errors.push('ASSERT ' + msg); console.log(c ? 'ok  ' : 'FAIL', msg); };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const coins = async () => Number(await page.locator('.m-home [data-coins]').textContent());

await page.goto(url);
await page.waitForTimeout(500);
check(await page.isVisible('.m-home'), 'home menu on boot');
await shot('s1-home');
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('s2-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
await page.locator('.m-skin').nth(1).click(); // pastel 300 > coins → not enough
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('snapgrid.profile')); p.coins = 1000; localStorage.setItem('snapgrid.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(400);
await page.click('.m-nav [data-act="shop"]');
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(200);
await shot('s3-shop');
check((await coins()) === 700, 'skin bought for 300');
check(await page.evaluate(() => JSON.parse(localStorage.getItem('snapgrid.profile')).skin) === 'pastel', 'skin equipped');
await page.click('.m-tabs [data-tab="coins"]');
await page.waitForTimeout(150);
await shot('s4-coins');
await page.click('[data-close]');
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('s5-missions');
await page.click('[data-close]');
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(400);
check(await page.isHidden('.m-home'), 'game starts from the play card');
await shot('s6-game');
await page.click('#settings-btn');
await page.waitForTimeout(150);
check(await page.isVisible('[data-resume]'), 'pause sheet');
await page.click('[data-resume]');
// force a game over: a board with one hole and a tray that cannot fit
await page.evaluate(() => {
  // two isolated holes per row and column: a single block fits but never completes a line
  const board = new Array(64).fill(1);
  for (let r = 0; r < 8; r++) { board[r * 8 + r] = 0; board[r * 8 + ((r + 4) % 8)] = 0; }
  const sq = { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], w: 2, h: 2, color: 2 };
  localStorage.setItem('snapgrid.save', JSON.stringify({ board, tray: [{ cells: [[0, 0]], w: 1, h: 1, color: 3 }, sq, sq], score: 420, streak: 0, moves: 12, lines: 3 }));
});
await page.reload();
await page.waitForTimeout(400);
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(300);
const L = JSON.parse(await page.locator('#stage').getAttribute('data-layout'));
const box = await page.locator('#stage').boundingBox();
// drag the single block (slot 0) to cell (0,0)
await page.mouse.move(box.x + L.bx + L.bs / 6, box.y + L.ty + L.th / 2);
await page.mouse.down();
await page.mouse.move(box.x + L.bx + L.cell / 2, box.y + L.by + L.cell / 2, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(1600);
check(await page.isVisible('[data-cont-coins]'), 'meta lose screen with continue');
await shot('s7-lose');
const before = await coins();
await page.click('[data-cont-coins]');
await page.waitForTimeout(300);
check((await coins()) < before + 20, 'continue charged coins');
check(await page.evaluate(() => JSON.parse(localStorage.getItem('snapgrid.save')).tray.every(Boolean)), 'rescue tray dealt');
await browser.close();
console.log('errors', errors);
