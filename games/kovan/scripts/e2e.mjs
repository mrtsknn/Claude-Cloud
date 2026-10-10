// End-to-end smoke test: home → hive → spawn → real drag merge (celebration + gift) → offline
// sheet with fake time → daily → shop skin → missions → golden egg → reload keeps state.
// Usage: npm run preview -w games/kovan -- --port 4197, then node games/kovan/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4197/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const page = await ctx.newPage();
const errors = [];
let passed = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok', msg); }
};
const K = (fn, arg) => page.evaluate(fn, arg);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });

await page.goto(url);
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home menu visible on launch');
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang = tr');
await shot('k1-home');

// hive
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(400);
check(!(await page.isVisible('.m-home')), 'hive opened from main card');
check((await K(() => window.__kovan.state.cells.length)) === 20, '4x5 hive');
await K(() => (window.__kovan.state.honey = 200));
for (let i = 0; i < 3; i++) await page.click('#egg-btn');
check((await K(() => window.__kovan.state.spawns)) === 3, 'spawned 3 eggs');
check((await K(() => window.__kovan.state.cells.filter((c) => c > 0).length)) === 5, '5 bees on the board');

// real drag merge: two level-1 bees
const [a, b] = await K(() => {
  const c = window.__kovan.state.cells;
  const i = c.indexOf(1);
  return [i, c.indexOf(1, i + 1)];
});
const pa = await K((i) => window.__kovan.center(i), a);
const pb = await K((i) => window.__kovan.center(i), b);
await page.mouse.move(pa.x, pa.y);
await page.mouse.down();
await page.mouse.move((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, { steps: 5 });
await page.mouse.move(pb.x, pb.y, { steps: 5 });
await shot('k2-drag');
await page.mouse.up();
await page.waitForTimeout(300);
check((await K((i) => window.__kovan.state.cells[i], b)) === 2, 'drag merged two level-1 bees into level 2');
check((await K(() => window.__kovan.state.best)) === 2, 'best bee level 2');
check(await page.isVisible('.celebrate canvas'), 'new bee celebration shown');
await shot('k3-newbee');
await page.click('#sheet-body [data-close]');
const gift = await K(() => window.__kovan.state.cells.findIndex((c) => c < 0));
check(gift >= 0, 'gift box dropped');
const pg = await K((i) => window.__kovan.center(i), gift);
await page.mouse.click(pg.x, pg.y);
check((await K((i) => window.__kovan.state.cells[i], gift)) > 0, 'gift box opened into a bee');
await page.waitForTimeout(1200);
await shot('k4-hive');

// golden egg (meta coins)
const coins0 = await K(() => window.__kovan.profile.data.coins);
await page.click('#gold-btn');
check((await K(() => window.__kovan.profile.data.coins)) === coins0 - 40, 'golden egg costs 40 coins');
check((await K(() => window.__kovan.state.cells.includes(4))), 'golden egg hatched a level-4 bee');

// offline earnings with fake time (+2h)
const before = await K(() => { window.__kovan.save(); return { cells: JSON.stringify(window.__kovan.state.cells), best: window.__kovan.state.best }; });
await page.goto('about:blank'); // leaving saves lastSeen with the real clock
await page.clock.setSystemTime(new Date(Date.now() + 2 * 3600_000));
await page.goto(url);
await page.waitForTimeout(800);
check((await K(() => JSON.stringify(window.__kovan.state.cells))) === before.cells, 'reload keeps the hive');
// daily reward auto-opens on home after the first session
if (await page.isVisible('.m-overlay [data-claim]')) {
  const c = await K(() => window.__kovan.profile.data.coins);
  await page.click('.m-overlay [data-claim]');
  check((await K(() => window.__kovan.profile.data.coins)) > c, 'daily reward claimed');
  await shot('k5-daily');
  await page.click('.m-overlay [data-close]');
} else check(false, 'daily popup on home');
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(300);
check(await page.isVisible('[data-double]'), 'offline sheet shown after 2h away');
await shot('k6-offline');
const h0 = await K(() => window.__kovan.state.honey);
await page.click('[data-double]');
await page.waitForTimeout(200);
check((await K(() => window.__kovan.state.honey)) > h0 * 2, 'x2 video collected offline honey');
check(!(await page.isVisible('#sheet')), 'offline sheet closed');

// upgrades sheet
await K(() => (window.__kovan.state.honey = 1e6));
await page.click('#up-btn');
await page.click('[data-up="expand"]');
check((await K(() => window.__kovan.state.cells.length)) === 25, 'hive expanded to 5x5');
await shot('k7-upgrades');
await page.click('#sheet-body [data-close]');

// pause → menu → shop
await page.click('#menu-btn');
check(await page.isVisible('.m-sheet [data-resume]'), 'pause sheet');
await page.click('.m-sheet [data-menu]');
await page.waitForTimeout(300);
check(await page.isVisible('.m-home'), 'back to home');
await K(() => window.__kovan.profile.addCoins(500));
await page.click('.m-nav [data-act="shop"]');
await page.locator('.m-skin').nth(1).click();
check((await K(() => window.__kovan.profile.data.skin)) === 'mint', 'bought + equipped mint theme');
check((await K(() => getComputedStyle(document.documentElement).getPropertyValue('--cell').trim())) === '#7fe0b5', 'theme vars applied');
check((await page.locator('.m-skin').count()) >= 6, '>= 6 hive themes');
await shot('k8-shop');
await page.click('.m-overlay [data-close]');

// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(200);
check((await page.locator('.m-mission').count()) === 3, '3 missions');
const prog = await K(() => window.__kovan.profile.data.missions.map((m) => m.progress).reduce((x, y) => x + y, 0));
check(prog > 0, 'missions progressed by merges/spawns/new bees');
await shot('k9-missions');
await page.click('.m-overlay [data-close]');

// reload keeps everything
const snap = await K(() => { window.__kovan.save(); return JSON.stringify({ c: window.__kovan.state.cells, s: window.__kovan.profile.data.skin }); });
await page.reload();
await page.waitForTimeout(500);
check((await K(() => JSON.stringify({ c: window.__kovan.state.cells, s: window.__kovan.profile.data.skin }))) === snap, 'reload keeps hive, expansion and theme');

await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
