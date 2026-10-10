// End-to-end: meta home → daily reward → shop (buy + equip a ship theme) → missions → level map →
// solve level 1 with real taps → sail → kit win sheet → next → pause → free + paid hint →
// red wrong-stack outline → reload keeps progress → v1.0 progress migration; no console errors.
// Usage: npm run preview -w games/liman -- --port 4189, then node games/liman/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4189/';
const browser = await chromium.launch();
const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' };
const page = await browser.newPage(ctxOpts);
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};
watch(page);
let fails = 0;
const check = (c, msg) => { if (!c) { fails++; errors.push('ASSERT ' + msg); } console.log(c ? 'ok  ' : 'FAIL', msg); };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const K = (fn, arg) => page.evaluate(fn, arg);
const idle = () => page.waitForFunction(() => !window.__liman.busy());
const state = () => K(() => window.__liman.state);
const coins = async () => Number(await page.locator('.m-home [data-coins]').textContent());
const profile = () => K(() => JSON.parse(localStorage.getItem('liman.profile')));

async function tapAt(target) {
  const box = await page.locator('#stage').boundingBox();
  const p = await K((t) => window.__liman.point(t), target);
  await page.mouse.click(box.x + p.x, box.y + p.y);
}
async function play(move) {
  await tapAt({ id: move.id });
  await tapAt(move.to === -1 ? 'dock' : { col: move.to });
  await idle();
  await page.waitForTimeout(40);
}
/** Red (#e11d48-ish) pixels around the top of column `col`. */
const redAround = (col) =>
  K((c) => {
    const g = window.__liman;
    const p = g.point({ col: c });
    const h = g.state.ship.cols[c].length;
    const cv = document.getElementById('stage');
    const d = window.devicePixelRatio;
    const img = cv.getContext('2d').getImageData((p.x - 50) * d, (p.y - 40 * h - 30) * d, 100 * d, (40 * h + 40) * d).data;
    let n = 0;
    for (let i = 0; i < img.length; i += 4) if (img[i] > 200 && img[i + 1] < 60 && img[i + 2] > 50 && img[i + 2] < 110) n++;
    return n;
  }, col);

await page.goto(url);
await page.waitForTimeout(600);
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang set to tr');
check(await page.isVisible('.m-home'), 'home menu on boot');
check(await page.isVisible('.m-home .hero svg'), 'hero ship artwork on home');
check((await page.textContent('.m-logo')) === 'Liman', 'Turkish title');
check(!(await page.isVisible('.m-overlay')), 'no daily popup on the very first run');
await page.waitForTimeout(1200);
await shot('h1-home');

// daily reward
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('h2-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');

// shop: buy + equip the coral ship
await K(() => { const p = JSON.parse(localStorage.getItem('liman.profile')); p.coins = 1000; localStorage.setItem('liman.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(500);
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'at least six ship themes');
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(250);
await shot('h3-shop');
check((await coins()) === 700, 'theme bought for 300');
check((await profile()).skin === 'coral', 'coral theme equipped');
check((await page.innerHTML('.m-home .hero')).includes('#0b4f5c'), 'home ship repainted in the new hull colour');
await page.click('[data-close]');

// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
check(!(await page.textContent('.m-list')).includes('mission_'), 'mission texts translated');
await shot('h4-missions');
await page.click('[data-close]');

// map → level 1
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(250);
check((await page.locator('.m-lvl').count()) === 150, 'map lists 150 levels');
check((await page.locator('.m-lvl.locked').count()) === 149, 'only level 1 unlocked');
await shot('h5-map');
await page.locator('.m-lvl').first().click();
await page.waitForTimeout(400);
check(await page.isHidden('.m-home'), 'level starts from the map');
check((await page.textContent('#level')) === '1', 'level 1');
await shot('h6-tutorial');

// solve level 1 with real taps
const moves1 = await K(() => window.__liman.solve());
for (const [k, m] of moves1.entries()) {
  await play(m);
  if (k === 1) await shot('h7-loading');
}
check((await state()).ship.dock.length === 0, 'dock emptied');
await page.click('#sail-btn', { force: true });
await page.waitForTimeout(900);
await shot('h8-sailing');
await page.waitForSelector('.m-result', { timeout: 8000 }).catch(() => {});
check(await page.isVisible('.m-result'), 'kit win sheet after sailing level 1');
await page.waitForTimeout(700);
check((await page.locator('.m-stars i.on').count()) === 3, '3 stars on a clean run');
check((await page.textContent('.m-result [data-reward]')) === '+25', 'win pays 10 + 3×5 coins');
check(await page.isVisible('.m-result .win-moves'), 'win sheet shows moves vs par');
await shot('h9-win');
const p1 = await profile();
check(p1.stars[0] === 3 && p1.unlocked === 2, 'profile records 3 stars, unlocks level 2');
check(p1.firstRun === false, 'first run finished after the first win');
const voy = p1.missions.find((m) => m.id === 'voyages');
const cont = p1.missions.find((m) => m.id === 'containers');
if (voy) check(voy.progress === 1, 'voyage mission advanced');
if (cont) check(cont.progress === 4, 'container mission advanced by 4');
check((await K(() => JSON.parse(localStorage.getItem('liman.save')).level)) === 2, 'next level saved before tapping Next');
await page.click('[data-next]');
await page.waitForTimeout(300);
check((await page.textContent('#level')) === '2', 'next goes to level 2');

// pause sheet
await page.click('#settings-btn');
await page.waitForTimeout(200);
check(await page.isVisible('[data-resume]'), 'pause sheet from the HUD');
check(await page.isVisible('[data-settings]'), 'settings reachable from pause');
await shot('h10-pause');
await page.click('[data-resume]');
await page.waitForTimeout(200);

// hints: first free, second costs 40 coins (or a video)
const before = (await profile()).coins;
await page.click('#hint-btn');
await page.waitForTimeout(300);
check((await state()).hints === 1, 'first hint is free');
check((await profile()).coins === before, 'free hint costs nothing');
await page.click('#hint-btn');
await page.waitForTimeout(200);
check(await page.isVisible('#hint-sheet'), 'second hint asks coins or video');
await shot('h11-hint');
await page.click('#hint-coins');
await page.waitForTimeout(300);
check((await profile()).coins === before - 40, 'paid hint took 40 coins');
check((await state()).hints === 2, 'second hint given');

// wrong stack: an earlier port's box under a later port's box glows red
const s2 = await state();
const ports = s2.ship.dock.map((b) => b.port);
const early = s2.ship.dock.find((b) => b.port === Math.min(...ports));
const late = s2.ship.dock.find((b) => b.port === Math.max(...ports));
await play({ id: early.id, to: 0 });
await play({ id: late.id, to: 0 });
await page.waitForTimeout(400);
check(await K((id) => window.__liman.state.ship.cols[0].at(-1).id === id, late.id), 'late-port box stacked on early-port box');
const red = await redAround(0);
check(red > 20, `red outline drawn on the offending box (${red} px)`);
await shot('h12-violation');

// reload keeps progress: home → play card resumes level 2 with both moves
await page.reload();
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home after reload');
check((await page.textContent('.m-home [data-level-title]')).includes('2'), 'play card shows level 2');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check((await page.textContent('#level')) === '2', 'level survives reload');
const s2b = await state();
check(s2b.moves === 2 && s2b.ship.cols[0].length === 2, 'ship and moves survive reload');
check(s2b.hints === 2, 'hint count survives reload (no new free hint)');
check((await profile()).skin === 'coral', 'theme survives reload');

// v1.0 progress migration
const old = await browser.newPage(ctxOpts);
watch(old);
await old.goto(url);
await old.evaluate(() => {
  localStorage.clear();
  const stars = {};
  for (let n = 1; n <= 11; n++) stars[n] = n % 3 ? 3 : 2;
  localStorage.setItem('liman.stars', JSON.stringify(stars));
  localStorage.setItem('liman.save', JSON.stringify({ level: 12, ship: { cols: [[], [], [], [], []], dock: [] }, history: [], moves: 3, undos: 0, hints: 0 }));
});
await old.reload();
await old.waitForTimeout(500);
const mp = await old.evaluate(() => JSON.parse(localStorage.getItem('liman.profile')));
check(mp.unlocked === 12 && mp.stars[0] === 3 && mp.stars[2] === 2 && !mp.firstRun, 'v1.0 stars and level migrated into the profile');
check((await old.textContent('.m-home [data-level-title]')).includes('12'), 'migrated player continues at level 12');
check(await old.isVisible('.m-days'), 'returning player gets the daily reward popup');
await old.click('[data-close]');
await old.waitForTimeout(150);
await old.click('[data-act="play-level"]');
await old.waitForTimeout(300);
const ms = await old.evaluate(() => window.__liman.state);
check(ms.level === 12 && ms.moves === 0 && ms.ship.cols.flat().length === 0 && ms.ship.dock.length > 0, 'stale v1.0 ship is re-dealt for the new level');
await old.close();

await browser.close();
console.log('errors', errors);
console.log(fails ? `${fails} FAILED` : 'ALL OK');
process.exit(fails || errors.length ? 1 : 0);
