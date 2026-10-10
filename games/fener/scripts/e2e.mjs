// End-to-end with real pointer drags, around the kit meta layer:
// home → daily → shop (buy + equip a sky theme) → missions → level map → solve level 1
// (over-light, move to fix) → meta win sheet → next → free hint → paid hint sheet (coins) →
// pause → reload keeps progress → v1.0 save migration → late levels on small screens.
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

async function open(viewport, init) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return page;
}
const page = await open({ width: 390, height: 844 });
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const S = () => page.evaluate(() => window.__fener.state);
const L = () => page.evaluate(() => window.__fener.level);
const E = () => page.evaluate(() => window.__fener.eval);
const profile = () => page.evaluate(() => JSON.parse(localStorage.getItem('fener.profile')));
const coins = async () => Number(await page.locator('.m-home [data-coins]').textContent());

async function geo() {
  const box = await page.locator('#stage').boundingBox();
  const lay = JSON.parse(await page.locator('#stage').getAttribute('data-layout'));
  return {
    slot: (i) => ({ x: box.x + lay.slots[i].x, y: box.y + lay.slots[i].y }),
    cell: (p) => ({ x: box.x + lay.bx + (p.c + 0.5) * lay.cell, y: box.y + lay.by + (p.r + 0.5) * lay.cell }),
  };
}
async function drag(a, b, name) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 8, a.y + ((b.y - a.y) * k) / 8);
  if (name) { await page.waitForTimeout(150); await shot(name); }
  await page.mouse.up();
  await page.waitForTimeout(60);
}
async function dragToCell(i, pos, name) {
  const g = await geo();
  await drag(g.slot(i), g.cell(pos), name);
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

// ── home, daily, shop, missions
await page.goto(url);
await page.waitForTimeout(1800);
check(await page.isVisible('.m-home'), 'home menu on boot');
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang follows device language');
check((await page.locator('.m-home .hero .win').count()) >= 8, 'home artwork: a row of houses with windows');
await shot('e01-home');
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(250);
await shot('e02-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');

await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'shop lists at least 6 sky themes');
await page.locator('.m-skin').nth(1).click(); // 300 > coins → not enough
check((await profile()).skin === 'amber', 'cannot buy a theme without coins');
await page.click('[data-close]');
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('fener.profile')); p.coins = 1000; localStorage.setItem('fener.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(500);
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(150);
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(300);
await shot('e03-shop');
check((await coins()) === 700, 'theme bought for 300 coins');
check((await profile()).skin === 'moon', 'bought theme is equipped');
const bgTop = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--bg-top'));
check((await bgTop()) === '#1b2c4d', 'equipping a theme changes the palette');
await page.click('[data-close]');
await page.waitForTimeout(900);
await shot('e04-home-moon');
await page.click('.m-nav [data-act="shop"]');
await page.locator('.m-skin').nth(0).click();
check((await profile()).skin === 'amber' && (await bgTop()) === '#1d2457', 'owned default theme re-equips for free');
await page.click('[data-close]');

await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('e05-missions');
await page.click('[data-close]');

// ── level map → level 1
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(250);
check((await page.locator('.m-lvl').count()) === 200, 'level map has 200 levels');
check((await page.locator('.m-lvl.locked').count()) === 199, 'only level 1 is unlocked');
await shot('e06-map');
await page.locator('.m-lvl').first().click();
await page.waitForTimeout(1600);
check(await page.isHidden('.m-home'), 'level map starts the game');
check((await page.textContent('#level')) === '1', 'level 1 is playing');
await shot('e07-tutorial');

let lvl = await L();
await dragToCell(0, lvl.solution[0]);
check((await E()).lit >= 3, 'dragging a lamp onto a street lights windows');
const spot = await doubleSpot(1);
check(!!spot, 'found a spot that over-lights a window');
await dragToCell(1, spot, 'e08-drag-preview');
check((await E()).double.length > 0, 'double-lit window detected');
await page.waitForTimeout(300);
await shot('e09-too-bright');
let g = await geo();
const before = (await profile()).coins;
await drag(g.cell(spot), g.cell(lvl.solution[1]));
check((await E()).double.length === 0, 'moving the lamp clears the red window');
await page.waitForTimeout(700);
await shot('e10-town-lit');
await page.waitForSelector('.m-result', { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(700);
check(await page.isVisible('.m-result [data-next]'), 'meta win sheet after level 1');
check((await page.locator('.m-stars i.on').count()) === 3, '3 stars for a clean solve');
await shot('e11-win');
let p = await profile();
check(p.coins === before + 25, 'win pays 10 + 3×5 coins');
check(p.stars[0] === 3 && p.unlocked === 2, 'profile records stars and unlocks level 2');
await page.click('.m-result [data-next]');
await page.waitForTimeout(500);
check((await page.textContent('#level')) === '2', 'next goes to level 2');

// ── level 2: tap a placed lamp to send it back, then solve
lvl = await L();
await dragToCell(0, lvl.solution[0]);
g = await geo();
const c0cell = g.cell(lvl.solution[0]);
await page.mouse.click(c0cell.x, c0cell.y);
await page.waitForTimeout(300);
check((await S()).placement[0] === null, 'tapping a placed lamp returns it to the tray');
await solveRest();
await page.waitForSelector('.m-result [data-next]', { timeout: 5000 });
check(true, 'level 2 solved');
await page.click('.m-result [data-next]');
await page.waitForTimeout(500);

// ── level 3: free hint, then the paid hint sheet
lvl = await L();
check((await page.textContent('#level')) === '3' && lvl.tray.length === 3, 'level 3 with three lamps');
check((await page.textContent('#hint-badge')) === 'BEDAVA', 'first hint of the level is free');
await page.click('#hint-btn');
await page.waitForTimeout(400);
let s = await S();
const hinted = s.locked.findIndex(Boolean);
check(hinted >= 0 && s.placement[hinted]?.r === lvl.solution[hinted].r, 'hint places a correct lamp and locks it');
check((await page.textContent('#hint-badge')) === '40', 'next hint costs 40 coins');
g = await geo();
const hp = g.cell(lvl.solution[hinted]);
await page.mouse.click(hp.x, hp.y);
check((await S()).placement[hinted] !== null, 'locked lamp cannot be picked up');
const coinsBeforeHint = (await profile()).coins;
await page.click('#hint-btn');
await page.waitForTimeout(250);
check(await page.isVisible('.hint-sheet [data-hint="coins"]'), 'paid hint sheet offers coins or video');
await shot('e12-hint-sheet');
await page.click('.hint-sheet [data-hint="coins"]');
await page.waitForTimeout(400);
check((await profile()).coins === coinsBeforeHint - 40, 'paid hint charged 40 coins');
check((await S()).locked.filter(Boolean).length === 2, 'second hint placed another lamp');

// ── pause
await page.click('#pause-btn');
await page.waitForTimeout(250);
check(await page.isVisible('[data-resume]'), 'pause sheet from the HUD');
await shot('e13-pause');
await page.click('[data-resume]');
await page.waitForTimeout(200);
check(await page.isHidden('.meta-root:not(.hint-sheet) > .m-overlay'), 'resume closes the pause sheet');

// restart keeps the free hint used
await page.click('#restart-btn');
await page.waitForTimeout(300);
s = await S();
check(s.placement.every((x) => x === null) && s.hints === 0, 'restart clears the board');
check((await page.textContent('#hint-badge')) === '40', 'restart does not refill the free hint');

// ── reload keeps progress and the board
await dragToCell(0, lvl.solution[0]);
await page.reload();
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'reload opens the home menu');
check((await page.textContent('[data-level-title]')).includes('3'), 'play card continues at level 3');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(500);
check((await page.textContent('#level')) === '3', 'reload keeps the level');
check((await S()).placement[0] !== null, 'reload keeps placed lamps');
p = await profile();
check(p.stars[0] === 3 && p.stars[1] === 3 && p.unlocked === 3, 'reload keeps stars and unlocks');
await page.click('#pause-btn');
await page.waitForTimeout(200);
await page.click('[data-menu]');
await page.waitForTimeout(300);
check(await page.isVisible('.m-home'), 'pause → menu returns home');

// ── late levels: 390x844 and the smallest supported phone
await page.evaluate(() => window.__fener.goto(200));
await page.waitForTimeout(700);
await shot('e14-level200');
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
  await small.screenshot({ path: `${out}/e15-small-${n}.png` });
}
await small.goto(url);
await small.waitForTimeout(500);
await small.screenshot({ path: `${out}/e16-small-home.png` });

// ── v1.0 player: stars/completed/save keys migrate into the profile
const old = await open({ width: 390, height: 844 }, () => {
  if (localStorage.getItem('fener.profile')) return;
  localStorage.setItem('fener.stars', JSON.stringify({ 1: 3, 2: 2, 3: 1 }));
  localStorage.setItem('fener.completed', '3');
  localStorage.setItem('fener.save', JSON.stringify({ level: 4, placement: [null, null, null], locked: [false, false, false], history: [], moves: 0, hints: 0, undos: 0 }));
});
await old.goto(url);
await old.waitForTimeout(600);
const mp = await old.evaluate(() => JSON.parse(localStorage.getItem('fener.profile')));
check(mp.stars.slice(0, 3).join() === '3,2,1' && mp.unlocked === 4, 'v1.0 stars and progress migrate into the profile');
check((await old.textContent('[data-level-title]')).includes('4'), 'migrated player continues at level 4');

await browser.close();
console.log(`\n${passed} checks passed, ${errors.length} problems`, errors);
process.exit(errors.length ? 1 : 0);
