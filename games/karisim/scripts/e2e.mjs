// End-to-end: meta home → daily reward → shop (buy + equip a bowl) → missions → level map →
// solve level 1 → kit win sheet → next → pause → paid hint → "almost!" cue → reload keeps
// progress → v1.0 progress migration; no console errors.
// Usage: npm run preview -w games/karisim -- --port 4186, then
//   node games/karisim/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4186/';
const browser = await chromium.launch();
const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' };
const page = await browser.newPage(ctxOpts);
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};
watch(page);
const check = (c, msg) => { if (!c) errors.push('ASSERT ' + msg); console.log(c ? 'ok  ' : 'FAIL', msg); };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const K = (fn, arg) => page.evaluate(fn, arg);
const tap = (i) => page.click(`.tube[data-i="${i}"]`);
const coins = async () => Number(await page.locator('.m-home [data-coins]').textContent());
const profile = () => K(() => JSON.parse(localStorage.getItem('karisim.profile')));

await page.goto(url);
await page.waitForTimeout(600);
check(await page.getAttribute('html', 'lang') === 'tr', 'html lang set to tr');
check(await page.isVisible('.m-home'), 'home menu on boot');
check(await page.isVisible('.m-home .hero svg'), 'hero artwork on home');
check((await page.textContent('.m-logo')) === 'Karışım', 'Turkish title');
await page.waitForTimeout(1200);
await shot('k1-home');

// daily reward
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('k2-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');

// shop: buy + equip the terracotta bowl
await K(() => { const p = JSON.parse(localStorage.getItem('karisim.profile')); p.coins = 1000; localStorage.setItem('karisim.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(500);
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'at least six bowl skins');
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(250);
await shot('k3-shop');
check((await coins()) === 700, 'bowl bought for 300');
check((await profile()).skin === 'terracotta', 'terracotta equipped');
check((await K(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-top').trim())) === '#f7eee7', 'studio backdrop follows the skin');
await page.click('[data-close]');

// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('k4-missions');
await page.click('[data-close]');

// map → level 1
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(250);
check((await page.locator('.m-lvl').count()) === 150, 'map lists 150 levels');
check((await page.locator('.m-lvl.locked').count()) === 149, 'only level 1 unlocked');
await shot('k5-map');
await page.locator('.m-lvl').first().click();
await page.waitForTimeout(400);
check(await page.isHidden('.m-home'), 'level starts from the map');
check(await page.textContent('#level') === '1', 'level 1');
check(await page.isVisible('#hand'), 'tutorial hand on level 1');
await shot('k6-level1');

// solve level 1 by tapping tubes
const seq1 = await K(() => window.__karisim.solution());
for (const [k, i] of seq1.entries()) {
  await tap(i);
  if (k === 0) { await page.waitForTimeout(250); await shot('k7-falling'); }
  await page.waitForTimeout(150);
}
await page.waitForSelector('.m-result', { timeout: 5000 }).catch(() => {});
check(await page.isVisible('.m-result'), 'kit win sheet after solving level 1');
check(await page.textContent('#pct') === '100%', 'meter shows 100%');
await page.waitForTimeout(700);
check((await page.locator('.m-stars i.on').count()) === 3, '3 stars at par');
check(await page.isVisible('.m-result .win-swatch'), 'win sheet shows the matched colour');
check((await page.textContent('.m-result [data-reward]')) === '+25', 'win pays 10 + 3×5 coins');
await shot('k8-win');
const p1 = await profile();
check(p1.stars[0] === 3 && p1.unlocked === 2, 'profile records 3 stars, unlocks level 2');
await page.click('[data-next]');
await page.waitForTimeout(300);
check(await page.textContent('#level') === '2', 'next goes to level 2');
check(!(await page.isVisible('#hand')), 'no tutorial hand on level 2');

// pause sheet
await page.click('#settings-btn');
await page.waitForTimeout(200);
check(await page.isVisible('[data-resume]'), 'pause sheet from the HUD');
check(await page.isVisible('[data-settings]'), 'settings reachable from pause');
await shot('k9-pause');
await page.click('[data-resume]');
await page.waitForTimeout(200);

// hints: first free, second costs 40 coins (or a video)
const before = (await profile()).coins;
await page.click('#hint-btn');
await page.waitForTimeout(700);
check((await K(() => window.__karisim.state.hints)) === 1, 'first hint is free');
check((await profile()).coins === before, 'free hint costs nothing');
await page.click('#hint-btn');
await page.waitForTimeout(200);
check(await page.isVisible('#hint-sheet'), 'second hint asks coins or video');
await shot('k10-hint');
await page.click('#hint-coins');
await page.waitForTimeout(700);
check((await profile()).coins === before - 40, 'paid hint took 40 coins');
check((await K(() => window.__karisim.state.hints)) === 2, 'second hint given');

// late level: drive the bowl to an "almost" mix and check the cue
await K(() => window.__karisim.goto(140));
await page.waitForTimeout(400);
check((await page.locator('.tube').count()) === 6, 'level 140 shows 6 tubes');
const almostSeq = await K(() => {
  const k = window.__karisim;
  const sol = k.solution();
  const n = k.level.tubes.length;
  for (const reps of [2, 3]) {
    const base = Array(reps).fill(sol).flat();
    for (let i = 0; i < n; i++) {
      const s = [...base, i];
      const m = k.meter(s);
      if (s.length <= 30 && m >= 0.95 && m < 1) return s;
    }
  }
  return null;
});
check(!!almostSeq, 'found a near-miss bowl on level 140');
if (almostSeq) {
  await K((seq) => window.__karisim.load({ level: 140, seq, used: seq.length, hints: 0, startedAt: Date.now() }), almostSeq);
  await page.waitForTimeout(500);
  const pct = parseInt(await page.textContent('#pct'));
  check(pct >= 95 && pct < 100, `meter near the bowl reads ${pct}%`);
  check(await page.isVisible('#almost'), '"almost!" cue shown above 95%');
  await shot('k11-almost');
}
await K(() => window.__karisim.goto(2));
await page.waitForTimeout(300);

// reload keeps progress: bowl mid-level, stars, coins, skin
const seq2 = await K(() => window.__karisim.solution());
await tap(seq2[0]);
await page.waitForTimeout(700);
const coinsBefore = (await profile()).coins;
await page.reload();
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'reload opens home');
check((await page.textContent('[data-level-title]')).includes('2'), 'play card offers level 2');
check((await profile()).coins === coinsBefore && (await profile()).skin === 'terracotta', 'coins and skin survive reload');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(await page.textContent('#level') === '2', 'resumes level 2');
check((await K(() => window.__karisim.state.seq)).join() === String(seq2[0]), 'bowl survives reload');
await browser.close().catch(() => {});

// v1.0 players keep their progress
const b2 = await chromium.launch();
const ctx2 = await b2.newContext(ctxOpts);
await ctx2.addInitScript(() => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('karisim.completed', '12');
  localStorage.setItem('karisim.save', JSON.stringify({ level: 13, seq: [0], used: 1, hints: 1, startedAt: 0 }));
});
const page2 = await ctx2.newPage();
watch(page2);
await page2.goto(url);
await page2.waitForTimeout(800);
check(await page2.isVisible('[data-claim]'), 'returning player is offered the daily reward');
await page2.click('[data-close]');
const mp = await page2.evaluate(() => JSON.parse(localStorage.getItem('karisim.profile')));
check(mp.unlocked === 13 && mp.stars[11] === 3, 'v1.0 progress migrated into the profile');
await page2.click('[data-act="play-level"]');
await page2.waitForTimeout(300);
check((await page2.textContent('#level')) === '13', 'migrated player continues at level 13');
await b2.close();
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
