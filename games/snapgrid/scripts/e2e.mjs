// End-to-end, played like a real player (real pointer drags; the level bot only picks the move):
// home → daily reward → shop (buy + equip a skin) → missions → Adventure 1–N (win sheet, stars, share)
// → level fail → continue (+3 pieces) → boosters (bomb, single, shuffle, free/buy sheet) → endless
// stuck banner → game over → continue with coins → daily challenge + streak; no console errors.
// Usage: npm run preview -w games/snapgrid -- --port 4201, then
//        node games/snapgrid/scripts/e2e.mjs <outDir> [url] [levels=10] [width=390] [height=844]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const base = process.argv[3] ?? 'http://localhost:4201/';
const LEVELS = Number(process.argv[4] ?? 10);
const width = Number(process.argv[5] ?? 390);
const height = Number(process.argv[6] ?? 844);
const url = base + (base.includes('?') ? '&' : '?') + 'e2e';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
let passed = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (c, msg) => {
  if (!c) errors.push('ASSERT ' + msg);
  else passed++;
  console.log(c ? 'ok  ' : 'FAIL', msg);
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const coins = async () => Number(await page.locator('.m-home [data-coins]').textContent());
const profile = () => page.evaluate(() => JSON.parse(localStorage.getItem('snapgrid.profile')));
const state = () => page.evaluate(() => window.__snapgrid.state());
const layout = async () => ({ L: JSON.parse(await page.locator('#stage').getAttribute('data-layout')), box: await page.locator('#stage').boundingBox() });
const wait = (ms) => page.waitForTimeout(ms);
// Booster buttons gently bounce while the player is stuck; don't wait for them to settle.
const boost = (id) => page.click(`[data-boost="${id}"]`, { force: true });

/** Drags tray piece `slot` so its top-left lands on (row, col), like a finger would. */
async function drag(slot, row, col) {
  const piece = (await state()).game.tray[slot];
  const { L, box } = await layout();
  await page.mouse.move(box.x + L.bx + L.bs / 6 + (slot * L.bs) / 3, box.y + L.ty + L.th / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + L.bx + (col + piece.w / 2) * L.cell, box.y + L.by + (row + piece.h / 2) * L.cell, { steps: 5 });
  await page.mouse.up();
}
async function tapCell(row, col) {
  const { L, box } = await layout();
  await page.mouse.click(box.x + L.bx + (col + 0.5) * L.cell, box.y + L.by + (row + 0.5) * L.cell);
}
/** Plays the current level/daily with the bot's choices until a result sheet shows. */
async function playOut(maxMoves = 60) {
  for (let i = 0; i < maxMoves; i++) {
    if (await page.isVisible('.m-result')) return i;
    const m = await page.evaluate(() => window.__snapgrid.botMove());
    if (!m || (await state()).run === null) break;
    await drag(m.slot, m.row, m.col);
    await wait(380);
  }
  await page.waitForSelector('.m-result', { timeout: 4000 }).catch(() => {});
  return maxMoves;
}

// ── meta ──
await page.goto(url);
await wait(600);
check(await page.isVisible('.m-home'), 'home menu on boot');
check((await page.locator('.m-cards .m-card').count()) === 3, 'three mode cards: adventure, daily, classic');
await shot('s1-home');
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await wait(200);
await page.click('[data-claim]');
await wait(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('snapgrid.profile')); p.coins = 1000; localStorage.setItem('snapgrid.profile', JSON.stringify(p)); });
await page.reload();
await wait(400);
await page.click('.m-nav [data-act="shop"]');
await page.locator('.m-skin').nth(1).click();
await wait(200);
check((await coins()) === 700, 'skin bought for 300');
check((await profile()).skin === 'pastel', 'skin equipped');
await page.click('[data-close]');
await page.click('.m-nav [data-act="missions"]');
await wait(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await page.click('[data-close]');
const inv0 = await page.evaluate(() => JSON.parse(localStorage.getItem('snapgrid.boosters')));
check(inv0.bomb === 2 && inv0.shuffle === 2 && inv0.single === 2, 'starter pack: 2 of each booster');

// ── adventure 1..N ──
for (let n = 1; n <= LEVELS; n++) {
  await page.click('[data-act="play-level"]');
  await wait(350);
  if (n === 1) {
    check(await page.isVisible('#intro'), 'level intro card shows the goal');
    check(await page.isVisible('#goals .goal'), 'goal chips in the HUD');
    await shot('s2-level1');
  }
  await wait(n === 1 ? 2200 : 300);
  const moves = await playOut();
  const st = await state();
  const won = await page.isVisible('.m-stars');
  check(won, `level ${n} won in ${st.run?.used ?? moves} pieces`);
  if (n === 1) {
    check(await page.isVisible('[data-share]'), 'share button on the win sheet');
    await shot('s3-win');
  }
  await page.click('[data-menu]');
  await wait(400);
  if (await page.isVisible('.m-overlay:not([hidden]) [data-close]')) await page.click('.m-overlay:not([hidden]) [data-close]');
}
const prof = await profile();
check(prof.unlocked === LEVELS + 1, `level ${LEVELS + 1} unlocked`);
check(prof.stars.slice(0, LEVELS).every((s) => s >= 1), 'stars recorded for every level');

// ── fail → continue (+3 pieces) ──
await page.click('[data-act="play-level"]');
await wait(300);
await page.reload(); // the saved run resumes on the next play; make it one piece from the end
await wait(400);
await page.evaluate(() => {
  const run = JSON.parse(localStorage.getItem('snapgrid.run'));
  run.limit = run.used + 1;
  localStorage.setItem('snapgrid.run', JSON.stringify(run));
});
await page.click('[data-act="play-level"]');
await wait(400);
{
  const m = await page.evaluate(() => window.__snapgrid.botMove());
  await drag(m.slot, m.row, m.col);
}
await page.waitForSelector('.m-result [data-cont-coins]', { timeout: 4000 }).catch(() => {});
check(await page.isVisible('[data-cont-coins]'), 'level fail sheet offers a continue');
await shot('s4-fail');
const before = await coins();
await page.click('[data-cont-coins]');
await wait(400);
const afterCont = await state();
check((await coins()) === before - 100, 'continue charged 100 coins');
check(afterCont.run.limit - afterCont.run.used === 3, 'continue gave +3 pieces');

// ── boosters in adventure ──
await boost('bomb');
await wait(150);
check(await page.isVisible('#aim'), 'bomb waits for a target');
const filled = afterCont.game.board.findIndex((v) => v > 0);
await tapCell(Math.floor(filled / 8), filled % 8);
await wait(500);
check((await state()).inventory.bomb === 1, 'bomb used');
await boost('shuffle');
await wait(300);
check((await state()).inventory.shuffle === 1, 'shuffle used');
await boost('single');
const empty = (await state()).game.board.findIndex((v) => v === 0);
await tapCell(Math.floor(empty / 8), empty % 8);
await wait(400);
check((await state()).game.board[empty] > 0, 'single block placed');
await shot('s5-boosters');
// spend the remaining bomb, then the 0-count button opens the buy sheet
await boost('bomb');
const f2 = (await state()).game.board.findIndex((v) => v > 0);
await tapCell(Math.floor(f2 / 8), f2 % 8);
await wait(400);
await boost('bomb');
await wait(200);
check(await page.isVisible('[data-free]'), 'buy sheet with a free daily booster');
await shot('s6-booster-sheet');
await page.click('[data-free]');
await wait(200);
check((await state()).inventory.bomb === 1 && (await page.isVisible('#aim')), 'free bomb claimed and armed');
await boost('bomb');
await page.click('#settings-btn');
await wait(150);
await page.click('[data-menu]');
await wait(300);

// ── endless: stuck banner → game over → continue ──
await page.reload(); // (the page saves its own state on the way out, so inject afterwards)
await wait(300);
await page.evaluate(() => {
  // two isolated holes per row and column: a single block fits but never completes a line
  const board = new Array(64).fill(1);
  for (let r = 0; r < 8; r++) { board[r * 8 + r] = 0; board[r * 8 + ((r + 4) % 8)] = 0; }
  const sq = { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], w: 2, h: 2, color: 2 };
  localStorage.setItem('snapgrid.save', JSON.stringify({ board, tray: [{ cells: [[0, 0]], w: 1, h: 1, color: 3 }, sq, sq], score: 420, streak: 0, moves: 12, lines: 3 }));
});
await page.reload();
await wait(400);
await page.click('[data-act="play-endless"]');
await wait(300);
await drag(0, 0, 0);
await wait(800);
check(await page.isVisible('#stuck'), 'stuck banner offers boosters');
await shot('s7-stuck');
await page.click('#give-up');
await page.waitForSelector('[data-cont-coins]', { timeout: 4000 }).catch(() => {});
check(await page.isVisible('[data-cont-coins]'), 'meta lose screen with continue');
check(await page.isVisible('[data-share]'), 'share button on the game-over sheet');
await shot('s8-lose');
const b2 = await coins();
await page.click('[data-cont-coins]');
await wait(300);
check((await coins()) < b2 + 20, 'continue charged coins');
check(await page.evaluate(() => JSON.parse(localStorage.getItem('snapgrid.save')).tray.every(Boolean)), 'rescue tray dealt');
await page.click('#settings-btn');
await wait(150);
await page.click('[data-menu]');
await wait(300);

// ── daily challenge ──
const c3 = await coins();
await page.click('[data-daily]');
await wait(2400);
await playOut();
check(await page.isVisible('.m-stars'), 'daily challenge solved');
await shot('s9-daily-win');
const daily = await page.evaluate(() => JSON.parse(localStorage.getItem('snapgrid.daily')));
check(daily.streak === 1, 'daily streak started');
await page.click('[data-next]');
await wait(400);
if (await page.isVisible('.m-overlay:not([hidden]) [data-close]')) await page.click('.m-overlay:not([hidden]) [data-close]');
check((await coins()) >= c3 + 50, 'daily challenge paid coins');
check((await page.locator('[data-daily]').textContent()).includes('1'), 'home card shows the streak');
await shot('s10-home-after');

await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exitCode = errors.length ? 1 : 0;
