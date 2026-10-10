// End-to-end test: home → hive → spawn → real drag merge (celebration, share, reminder opt-in,
// gift) → 15 minutes of fast-forwarded real play (eggs, drags, gifts, quest card, upgrades) →
// festival claim → worlds (build, switch) → offline sheet with fake time → daily → shop →
// missions → reload keeps state → 360×640 layout check on a full 6×7 hive.
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
const cells = () => K(() => window.__kovan.state.hives[window.__kovan.state.world].cells);
async function drag(a, b) {
  const pa = await K((i) => window.__kovan.center(i), a);
  const pb = await K((i) => window.__kovan.center(i), b);
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, { steps: 3 });
  await page.mouse.move(pb.x, pb.y, { steps: 3 });
  await page.mouse.up();
}

await page.goto(url);
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home menu visible on launch');
check((await page.getAttribute('html', 'lang')) === 'tr', 'html lang = tr');
await shot('k1-home');

// ── hive ──
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(400);
check(!(await page.isVisible('.m-home')), 'hive opened from main card');
check((await cells()).length === 20, '4x5 hive');
check(await page.isVisible('#quest'), 'quest card in the HUD');
check((await page.textContent('#q-text')).includes('3'), 'first quest: merge 3 bees');
check((await page.locator('#worlds .wbtn').count()) === 4, 'world picker with 4 worlds');
check((await page.locator('#worlds .wbtn.locked').count()) === 3, '3 worlds locked at start');
check(await page.isVisible('#fest-btn'), 'festival chip visible');
check((await K(() => window.__kovan.notif)) === 'unasked', 'no notification prompt at launch');
await K(() => (window.__kovan.state.honey = 200));
for (let i = 0; i < 3; i++) await page.click('#egg-btn');
check((await K(() => window.__kovan.state.spawns)) === 3, 'spawned 3 eggs');
check((await cells()).filter((c) => c > 0).length === 5, '5 bees on the board');

// real drag merge: two level-1 bees
const [a, b] = await K(() => {
  const c = window.__kovan.state.hives[0].cells;
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
check((await cells())[b] === 2, 'drag merged two level-1 bees into level 2');
check((await K(() => window.__kovan.state.best)) === 2, 'best bee level 2');
check(await page.isVisible('.celebrate canvas'), 'new bee celebration shown');
check(await page.isVisible('#sheet-body [data-share]'), 'share button on the celebration');
await shot('k3-newbee');
await page.click('#sheet-body [data-share]'); // web: Web Share / clipboard fallback, must not throw
await page.waitForTimeout(200);
await page.click('#sheet-body [data-close]');
await page.waitForTimeout(400);
check(await page.isVisible('#sheet-body [data-yes]'), 'reminder opt-in asked after the first celebration');
await shot('k3b-remind');
await page.click('#sheet-body [data-yes]');
check((await K(() => window.__kovan.notif)) === 'on', 'reminders enabled');
const gift = (await cells()).findIndex((c) => c < 0);
check(gift >= 0, 'gift box dropped');
const pg = await K((i) => window.__kovan.center(i), gift);
await page.mouse.click(pg.x, pg.y);
check((await cells())[gift] > 0, 'gift box opened into a bee');

// ── 15 minutes of real play, time fast-forwarded through the test hook ──
let claimed = 0;
let celebrations = 0;
let upgrades = 0;
for (let step = 0; step < 90; step++) {
  await K(() => window.__kovan.advance(10)); // 10 s of production per step
  for (let k = 0; k < 6; k++) {
    if (await page.isVisible('#sheet')) {
      if (await page.isVisible('#sheet-body .celebrate canvas.hero')) celebrations++;
      if (await page.isVisible('#sheet-body [data-close]')) await page.click('#sheet-body [data-close]');
      else await page.click('#sheet', { position: { x: 10, y: 10 } });
      await page.waitForTimeout(80);
      continue;
    }
    const c = await cells();
    const g = c.findIndex((v) => v < 0);
    if (g >= 0) {
      const p = await K((i) => window.__kovan.center(i), g);
      await page.mouse.click(p.x, p.y);
      continue;
    }
    if (await page.locator('#quest.done').count()) {
      await page.click('#quest');
      claimed++;
      continue;
    }
    let pair = null;
    for (let i = 0; i < c.length && !pair; i++) if (c[i] > 0) { const j = c.indexOf(c[i], i + 1); if (j > 0) pair = [i, j]; }
    if (pair) { await drag(...pair); continue; }
    const s = await K(() => ({ h: window.__kovan.state.honey, free: window.__kovan.state.hives[window.__kovan.state.world].cells.filter((v) => v === 0).length, ...window.__kovan.costs() }));
    const target = Math.min(s.expand, s.eggs);
    if (!(await page.isHidden('#up-badge'))) {
      await page.click('#up-btn');
      const btn = page.locator('#sheet-body [data-up]:not([disabled])').first();
      if (await btn.count()) { await btn.click(); upgrades++; }
      if (await page.isVisible('#sheet-body [data-close]')) await page.click('#sheet-body [data-close]');
      continue;
    }
    // like a real player following the upgrade bar: save up when an upgrade is a minute away
    if (s.free > 0 && !(target <= s.h + s.rate * 60)) await page.click('#egg-btn');
  }
  if (step === 45) await shot('k4-hive');
}
const s15 = await K(() => ({ ...window.__kovan.state }));
console.log('after 15 min:', { best: s15.best, quest: s15.quest, merges: s15.merges, spawnLevel: s15.spawnLevel, exp: s15.hives[0].expansion, claimed, celebrations, upgrades });
check(s15.best >= 7, 'reached a level-7+ bee in 15 minutes of play');
check(claimed >= 5 && s15.quest >= 6, 'quest card claimed 5+ steps');
check(s15.hives[0].expansion >= 1 || s15.spawnLevel >= 2, 'bought an upgrade');
check((await page.textContent('#q-num')).includes(String(s15.quest + 1)), 'quest card shows the current step');
await shot('k4b-15min');

// golden egg (meta coins)
await K(() => { const h = window.__kovan.state.hives[0]; h.cells = h.cells.map((v, i) => (i < 4 ? 0 : v)); window.__kovan.profile.addCoins(100); });
const coins0 = await K(() => window.__kovan.profile.data.coins);
await page.click('#gold-btn');
check((await K(() => window.__kovan.profile.data.coins)) === coins0 - 40, 'golden egg costs 40 coins');

// ── festival ──
await K(() => { window.__kovan.state.festival.merges = 0; });
await page.click('#fest-btn');
await page.waitForTimeout(300);
check(await page.isVisible('#sheet-body .fest-sheet'), 'festival sheet opens');
check((await page.locator('#sheet-body .collection canvas').count()) === 6, '6 festival bees to collect');
check(await page.isDisabled('#sheet-body [data-claim]'), 'festival claim locked before the goal');
await page.click('#sheet-body [data-close]');
await K(() => { window.__kovan.state.festival.merges = 400; });
await page.waitForTimeout(100);
check(await page.isVisible('#fest-badge'), 'festival badge when the goal is reached');
await page.click('#fest-btn');
await page.waitForTimeout(200);
await shot('k5-festival');
const fc = await K(() => window.__kovan.profile.data.coins);
await page.click('#sheet-body [data-claim]');
check((await K(() => window.__kovan.state.flowers.length)) === 1, 'festival bee collected');
check((await K(() => window.__kovan.profile.data.coins)) === fc + 50, 'festival paid 50 coins');
await page.click('#sheet-body [data-close]');

// ── worlds ──
await page.click('#worlds [data-w="3"]');
check(!(await page.isVisible('#sheet')), 'far locked world: only a toast');
await page.click('#worlds [data-w="1"]');
await page.waitForTimeout(200);
check(await page.isDisabled('#sheet-body [data-build]'), 'next world previewed, build locked until bee 12');
await page.click('#sheet-body [data-close]');
await K(() => { const s = window.__kovan.state; s.best = Math.max(12, s.best); s.honey = 3e6; });
await page.waitForTimeout(100);
check((await page.locator('#worlds [data-w="1"].open .dot').count()) === 1, 'Orchard ready badge');
await page.click('#worlds [data-w="1"]');
await page.waitForTimeout(300);
await shot('k6-world');
await page.click('#sheet-body [data-build]');
await page.waitForTimeout(300);
check((await K(() => window.__kovan.state.hives.length)) === 2, 'Orchard hive built');
check((await K(() => window.__kovan.state.world)) === 1, 'switched to Orchard');
check((await cells()).length === 20, 'Orchard starts with a 4x5 hive');
const r2 = await K(() => window.__kovan.state.honey);
await K(() => window.__kovan.advance(1));
check((await K(() => window.__kovan.state.honey)) > r2, 'all worlds keep producing');
await page.waitForTimeout(600);
await shot('k6b-orchard');
await page.click('#worlds [data-w="0"]');
check((await K(() => window.__kovan.state.world)) === 0, 'switched back to Meadow');
check((await cells()).length === s15.hives[0].cells.length, 'Meadow hive kept');

// ── offline earnings with fake time (+2h) ──
const before = await K(() => { window.__kovan.save(); return JSON.stringify(window.__kovan.state.hives); });
await page.goto('about:blank'); // leaving saves lastSeen with the real clock
await page.clock.setSystemTime(new Date(Date.now() + 2 * 3600_000));
await page.goto(url);
await page.waitForTimeout(800);
check((await K(() => JSON.stringify(window.__kovan.state.hives))) === before, 'reload keeps every hive');
if (await page.isVisible('.m-overlay [data-claim]')) {
  const c = await K(() => window.__kovan.profile.data.coins);
  await page.click('.m-overlay [data-claim]');
  check((await K(() => window.__kovan.profile.data.coins)) > c, 'daily reward claimed');
  await shot('k7-daily');
  await page.click('.m-overlay [data-close]');
} else check(false, 'daily popup on home');
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(300);
check(await page.isVisible('[data-double]'), 'offline sheet shown after 2h away');
check((await page.locator('#sheet-body .big svg').count()) === 1, 'offline sheet uses a drawn honey icon');
await shot('k8-offline');
const h0 = await K(() => window.__kovan.state.honey);
const away = await K(() => window.__kovan.costs().rate * 7200 * 0.5);
await page.click('[data-double]');
await page.waitForTimeout(200);
const gotOff = (await K(() => window.__kovan.state.honey)) - h0;
check(gotOff > away * 1.9, `x2 video collected offline honey (${gotOff.toExponential(2)} vs ${away.toExponential(2)})`);
check(!(await page.isVisible('#sheet')), 'offline sheet closed');

// ── upgrades sheet ──
await K(() => (window.__kovan.state.honey = 1e9));
const exp0 = await K(() => window.__kovan.state.hives[0].expansion);
await page.click('#up-btn');
check((await page.locator('#sheet-body .up-row svg').count()) >= 2, 'upgrade prices use drawn icons');
await page.click('[data-up="expand"]');
check((await K(() => window.__kovan.state.hives[0].expansion)) === exp0 + 1, 'Meadow hive expanded');
await shot('k9-upgrades');
await page.click('#sheet-body [data-close]');

// ── pause → menu → shop ──
await page.click('#menu-btn');
check(await page.isVisible('.m-sheet [data-resume]'), 'pause sheet');
check(!(await page.isVisible('.m-sheet [data-restart]')), 'idle pause has no restart');
await page.click('.m-sheet [data-menu]');
await page.waitForTimeout(300);
check(await page.isVisible('.m-home'), 'back to home');
await K(() => window.__kovan.profile.addCoins(500));
await page.click('.m-nav [data-act="shop"]');
await page.locator('.m-skin').nth(1).click();
check((await K(() => window.__kovan.profile.data.skin)) === 'mint', 'bought + equipped mint theme');
check((await K(() => getComputedStyle(document.documentElement).getPropertyValue('--cell').trim())) === '#7fe0b5', 'theme vars applied');
check((await page.locator('.m-skin').count()) >= 6, '>= 6 hive themes');
await page.click('.m-overlay [data-close]');

// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(200);
check((await page.locator('.m-mission').count()) === 3, '3 missions');
await page.click('.m-overlay [data-close]');

// reload keeps everything
const snap = await K(() => { window.__kovan.save(); const s = window.__kovan.state; return JSON.stringify({ h: s.hives, q: s.quest, f: s.flowers, sk: window.__kovan.profile.data.skin }); });
await page.reload();
await page.waitForTimeout(500);
check((await K(() => { const s = window.__kovan.state; return JSON.stringify({ h: s.hives, q: s.quest, f: s.flowers, sk: window.__kovan.profile.data.skin }); })) === snap, 'reload keeps hives, quest, flowers and theme');

// ── small phone: a full 6×7 hive must stay playable at 360×640 ──
const small = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, locale: 'en-US' });
const sp = await small.newPage();
sp.on('pageerror', (e) => errors.push(e.message));
await sp.goto(url);
await sp.waitForTimeout(400);
await sp.click('[data-act="play-endless"]');
await sp.evaluate(() => { window.__kovan.state = { honey: 1e5, hives: [{ cells: Array.from({ length: 42 }, (_, i) => 1 + (i % 12)), expansion: 4 }], best: 12, spawnLevel: 3 }; });
await sp.waitForTimeout(500);
const R = await sp.evaluate(() => window.__kovan.R);
check(R >= 27, `6x7 cells stay big at 360px (R=${R.toFixed(1)})`);
const box = async (sel) => sp.locator(sel).boundingBox();
const [stage, quest, bar, strip] = [await box('#stage'), await box('#quest'), await box('.bar'), await box('.strip')];
check(strip.y + strip.height <= stage.y + 1 && stage.y + stage.height <= quest.y + 1 && quest.y + quest.height <= bar.y + 1, 'HUD rows do not overlap');
check(bar.y + bar.height <= 640, 'bottom bar fits on screen');
const sc = await sp.evaluate(() => [window.__kovan.center(0), window.__kovan.center(41)]);
check(sc[0].y - R >= stage.y - 1 && sc[1].y + R <= stage.y + stage.height + 1, 'whole comb visible inside the stage');
await sp.screenshot({ path: `${out}/k10-small.png` });
await small.close();

await browser.close();
console.log(`passed ${passed}, errors`, errors);
process.exit(errors.length ? 1 : 0);
