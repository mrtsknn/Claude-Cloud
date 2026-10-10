// End-to-end smoke test: home (no game_start at boot) → order 1 with real push drags → fire
// (fail → retry) → perfect → fire → decorate with real brush strokes + stamp + undo → shelf/win
// (reward scales with match) → order 2 (bowl) with a real outward pull → free studio → keep →
// viewer + share image → collection shelf → map / shop / daily / missions → reload keeps
// progress and the shelf → all 8 glazes fit one row at 360 px.
// Usage: npm run preview -w games/comlek, then
//   node games/comlek/scripts/e2e.mjs <outDir> [url] [WxH]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4200/';
const [VW, VH] = (process.argv[4] ?? '390x844').split('x').map(Number);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let passed = 0;
const check = (cond, msg) => {
  if (!cond) {
    errors.push('ASSERT: ' + msg);
    console.log('FAIL', msg);
  } else {
    passed++;
    console.log('ok', msg);
  }
};
const S = () => page.evaluate(() => ({ ...window.__comlek.state }));
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const events = (name) => page.evaluate((n) => JSON.parse(localStorage.getItem('studio.analytics.buffer') ?? '[]').filter((e) => e.e === n).length, name);
const closeSheet = async () => {
  await page.waitForTimeout(450);
  if (await page.isVisible('.m-overlay')) await page.click('.m-overlay [data-close]');
};
/** Stage-space helpers: where the pot is on screen. */
const potGeom = () =>
  page.evaluate(() => {
    const c = document.getElementById('stage').getBoundingClientRect();
    return { x: c.x, y: c.y, w: c.width, h: c.height };
  });
const drag = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(28);
  }
  await page.mouse.up();
};

await page.goto(url);
await page.waitForTimeout(600);
check((await page.evaluate(() => document.documentElement.lang)) === 'tr', 'html lang = tr');
check(await page.isVisible('.m-home'), 'home menu visible');
check(await page.isVisible('[data-shelf]'), 'home shows the collection shelf');
check((await events('game_start')) === 0, 'no game_start fired at boot');
await shot('01-home');
await closeSheet();
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(!(await page.isVisible('.m-home')), 'level started');
check((await S()).level === 1, 'level 1');
check((await events('game_start')) === 1, 'exactly one game_start on play');
check(await page.isVisible('#order'), 'customer order bubble shown');
check(((await page.textContent('#order-who')) ?? '').length > 2 && ((await page.textContent('#order-req')) ?? '').length > 5, 'order names a customer and a request');

// real drags pressing in on both sides of the clay
let g = await potGeom();
const cx = g.x + g.w / 2;
const pct0 = (await S()).pct;
for (const side of [-1, 1]) {
  const pts = [];
  for (let k = 0; k <= 20; k++) pts.push([cx + side * (g.w * 0.3), g.y + g.h - 70 - k * 10]);
  await drag(pts);
}
const s1 = await S();
check(s1.touched && s1.pct !== pct0, `push drags shape the clay (${pct0}% → ${s1.pct}%)`);
check(Math.max(...s1.rings) > 0.05, 'fingers leave throwing rings');
await shot('02-shaping');

// fire too early → fail sheet → retry
if (s1.pct < 70) {
  await page.click('#fire-btn');
  await page.waitForTimeout(300);
  check(await page.isVisible('[data-retry]'), 'below 70% shows retry');
  await shot('03-lose');
  await page.click('[data-retry]');
  await page.waitForTimeout(300);
}

// perfect shape via hook → fire → decorate
await page.evaluate(() => window.__comlek.perfect());
await page.waitForTimeout(100);
check((await S()).pct === 100, 'perfect = 100%');
await page.click('#fire-btn');
await page.waitForTimeout(1300);
check((await S()).phase === 'decorate', 'fired → decorate step');
check(await page.isVisible('#deco'), 'decorate toolbars shown');
check(await page.isVisible('#share-btn'), 'share button on the finished pot');
// brush: pick red, stroke up the pot
await page.click('#paints [data-paint="2"]');
g = await potGeom();
const base = await page.evaluate(() => {
  const s = window.__comlek.state;
  return s.clay[0];
});
const strokeX = cx + 4;
const pts = [];
for (let k = 0; k <= 8; k++) pts.push([strokeX, g.y + g.h * 0.75 - k * 6]);
await drag(pts);
let st = await S();
check(st.decor.b.length >= 1 && st.decor.b[0].k === 'ring' && st.decor.b[0].c === 2, `brush lays a red ring band (${JSON.stringify(st.decor.b[0])})`);
// stamp: waves in teal, tap the pot
await page.click('#tools [data-tool="waves"]');
await page.click('#paints [data-paint="1"]');
const nBefore = st.decor.b.length;
await page.mouse.click(cx, g.y + g.h * 0.62);
st = await S();
check(st.decor.b.length === nBefore + 1 && st.decor.b.at(-1).k === 'waves', 'tapping with a stamp adds a pattern band');
await page.click('#tools [data-tool="leaves"]');
await page.mouse.click(cx, g.y + g.h * 0.55);
await page.click('#tools [data-tool="undo"]');
check((await S()).decor.b.length === nBefore + 1, 'undo removes the last band');
await page.click('#tools [data-tool="dots"]');
await page.click('#paints [data-paint="0"]');
await page.mouse.click(cx, g.y + g.h * 0.68);
await page.waitForTimeout(500);
check(base > 0, 'clay present');
await shot('04-decorate');
await page.click('#fire-btn');
await page.waitForTimeout(600);
check(await page.isVisible('[data-next]'), 'win sheet');
check((await page.locator('.m-stars i.on').count()) === 3, '3 stars');
check((await page.textContent('[data-reward]')).trim() === '+47', `order reward scales with match + decor tip (${await page.textContent('[data-reward]')})`);
check((await page.evaluate(() => window.__comlek.shelf().length)) === 1, 'pot saved to the shelf');
await shot('05-win');
await page.click('[data-next]');
await page.waitForTimeout(400);
st = await S();
check(st.level === 2 && st.kind === 'bowl', 'advanced to order 2 (a bowl)');

// real outward pull: finger lands inside the clay near the top and drags out past the rim
g = await potGeom();
const h0 = await page.evaluate(() => window.__comlek.state.clay.reduce((m, r) => Math.max(m, r), 0));
const pct2 = st.pct;
for (let pass = 0; pass < 2; pass++) {
  const p2 = [];
  for (let k = 0; k <= 26; k++) p2.push([cx + 20 + k * (g.w * 0.016), g.y + g.h - 150 + (pass ? 30 : 0) - k * 1.5]);
  await drag(p2);
}
st = await S();
check(Math.max(...st.clay) > h0 + 0.1, `pulling from inside widens the clay (${h0.toFixed(2)} → ${Math.max(...st.clay).toFixed(2)})`);
check(st.pct > pct2, `outward pull moves toward the wide bowl (${pct2}% → ${st.pct}%)`);
await shot('06-pull');

// pause → menu
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('[data-resume]'), 'pause sheet');
await page.click('[data-menu]');
await closeSheet();
check(await page.isVisible('.m-home'), 'back to home');
check((await page.textContent('[data-shelf] b')).includes('1'), 'home shelf counts 1 pot');

// free studio
const gs = await events('game_start');
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(400);
st = await S();
check(st.mode === 'free' && !(await page.isVisible('#order')), 'free studio: no order, no target');
check((await events('game_start')) === gs + 1, 'free studio counts one game_start');
g = await potGeom();
await drag(Array.from({ length: 16 }, (_, k) => [cx + g.w * 0.32 - k * 2, g.y + g.h - 200 - k * 6]));
await page.click('#fire-btn');
await page.waitForTimeout(1200);
check((await S()).phase === 'decorate', 'free pot fires without a target');
await page.click('#paints [data-paint="5"]');
await drag(Array.from({ length: 6 }, (_, k) => [cx, g.y + g.h * 0.7 - k * 5]));
await page.click('#fire-btn');
await page.waitForTimeout(500);
check(await page.isVisible('#viewer') && (await page.isVisible('[data-share]')) && (await page.isVisible('[data-again]')), 'kept: viewer with share / new pot');
await shot('07-kept');
await page.click('[data-share]');
await page.waitForTimeout(600);
const img = await page.evaluate(() => window.__comlek.lastShare());
check(img.startsWith('data:image/jpeg;base64,') && img.length > 30000, `share renders the pot to an image (${Math.round(img.length / 1024)} KB)`);
check((await events('share')) >= 1, 'share tracked');
check((await page.evaluate(() => window.__comlek.shelf().length)) === 2, 'free pot kept on the shelf');
await page.click('[data-home]');
await closeSheet();

// collection shelf → viewer
await page.click('[data-shelf]');
await page.waitForTimeout(400);
check(await page.isVisible('#shelf'), 'shelf screen open');
check((await page.locator('.shelf-row canvas').count()) === 2, 'shelf shows 2 pots');
await shot('08-shelf');
await page.click('.shelf-row button >> nth=1');
await page.waitForTimeout(300);
check((await page.textContent('#viewer-sub')).includes('%'), 'order pot shows its match %');
await shot('09-viewer');
await page.click('[data-close]');
await page.click('#shelf-back');
await page.waitForTimeout(200);
check(!(await page.isVisible('#shelf')), 'shelf closed');

// map
await page.click('[data-act="map"]');
await page.waitForTimeout(300);
check((await page.locator('.m-lvl:not(.locked)').count()) === 2, 'map: 2 levels unlocked');
await shot('10-map');
await page.click('.m-overlay [data-close]');
// shop
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'shop has ≥6 glazes');
await shot('11-shop');
await page.click('.m-overlay [data-close]');
// daily
await page.click('[data-act="daily"]');
await page.waitForTimeout(200);
const coins0 = Number(await page.textContent('[data-coins]'));
if (await page.isEnabled('[data-claim]')) await page.click('[data-claim]');
await page.waitForTimeout(200);
check(Number(await page.textContent('[data-coins]')) > coins0, 'daily reward claimed');
await page.click('.m-overlay [data-close]');
// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(200);
check((await page.locator('.m-mission').count()) === 3, '3 missions');
await page.click('.m-overlay [data-close]');

// reload keeps progress + shelf
await page.reload();
await page.waitForTimeout(600);
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('comlek.profile')));
check(prof.unlocked === 2 && prof.stars[0] === 3, 'progress survives reload');
check((await page.evaluate(() => window.__comlek.shelf().length)) === 2, 'shelf survives reload');
check((await page.textContent('[data-level-title]')).includes('2'), 'home shows level 2');
check((await events('game_start')) === gs + 1, 'reload does not fire game_start');

// all 8 glazes owned: the glaze row stays one line at 360 px
const narrow = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
narrow.on('pageerror', (e) => errors.push(e.message));
await narrow.addInitScript(() => {
  const ALL = ['terracotta', 'celadon', 'honey', 'cobalt', 'speckle', 'rose', 'iznik', 'obsidian'];
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  localStorage.setItem('comlek.profile', JSON.stringify({ coins: 0, unlocked: 5, stars: [3, 3, 3, 3], owned: ALL, skin: 'cobalt', firstRun: false, dailyLast: today }));
});
await narrow.goto(url);
await narrow.waitForTimeout(500);
await narrow.evaluate(() => {
  window.__comlek.start(5);
  window.__comlek.perfect();
  window.__comlek.fire();
});
await narrow.waitForTimeout(400);
const tops = await narrow.$$eval('#glazes button', (bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
check(tops.length === 8 && Math.max(...tops) - Math.min(...tops) <= 3, `8 glazes in a single row at 360 px (${tops.length})`);
const over = await narrow.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!over, 'no horizontal overflow at 360 px');
await narrow.screenshot({ path: `${out}/12-glazes-360.png` });

await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
