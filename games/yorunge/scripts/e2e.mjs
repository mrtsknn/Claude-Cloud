// End-to-end: meta home → daily reward → shop (buy + equip a satellite) → missions → endless run
// (timed taps via the test hook) → lost → meta lose screen → continue with coins → lost again →
// level 1 cleared → win sheet → level map → pause → level miss restarts → reload keeps best/skin.
// Usage: npm run preview -w games/yorunge -- --port 4185, then node games/yorunge/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4185/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (c, msg) => { if (!c) errors.push('ASSERT ' + msg); console.log(c ? 'ok  ' : 'FAIL', msg); };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const S = (fn, arg) => page.evaluate(fn, arg);
const profile = () => S(() => JSON.parse(localStorage.getItem('yorunge.profile')));
const coins = async () => Number(await page.locator('.m-home [data-coins]').textContent());
const tap = () => page.mouse.click(195, 600);

async function capture() {
  const before = await S(() => window.__orbit.state.reached);
  await page.waitForFunction(() => window.__orbit.aligned(), null, { polling: 'raf', timeout: 8000 });
  await tap();
  await page.waitForFunction((b) => window.__orbit.state.reached > b || window.__orbit.state.phase === 'over', before, { timeout: 4000 });
  return (await S(() => window.__orbit.state.reached)) > before;
}
async function miss() {
  await page.waitForFunction(() => window.__orbit.missing(), null, { polling: 'raf', timeout: 8000 });
  await tap();
}

// ── home, daily, shop, missions ──
await page.goto(url);
await page.waitForTimeout(600);
check(await S(() => document.documentElement.lang) === 'tr', 'html lang set to tr');
check(await page.isVisible('.m-home'), 'home menu on boot');
check(await page.isVisible('.m-home .hero .hero-sat'), 'hero artwork with orbiting satellite');
check(await page.locator('.m-card').count() === 2, 'two mode cards (levels + endless)');
await shot('y1-home');
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('y2-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');

await S(() => { const p = JSON.parse(localStorage.getItem('yorunge.profile')); p.coins = 1000; localStorage.setItem('yorunge.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(400);
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check(await page.locator('.m-skin').count() >= 6, 'at least 6 satellite skins');
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(200);
await shot('y3-shop');
check((await coins()) === 700, 'skin bought for 300');
check((await profile()).skin === 'comet', 'skin equipped');
await page.click('[data-close]');
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('y4-missions');
await page.click('[data-close]');

// ── endless run ──
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(300);
check(await page.isHidden('.m-home'), 'endless starts from the play card');
check(await page.isVisible('#hint') && await page.isHidden('#goal'), 'tap-to-start hint (no level goal)');
await tap();
check(await S(() => window.__orbit.state.phase) === 'play', 'tap starts the run');
let caps = 0;
for (let i = 0; i < 3; i++) if (await capture()) caps++;
check(caps === 3, `3 timed taps captured the next planet (${caps})`);
check(await page.textContent('#score') === String(await S(() => window.__orbit.state.score)), 'HUD score matches state');
await page.waitForTimeout(250);
await shot('y5-endless');
const hops = (await profile()).missions.find((m) => m.id === 'hops');
if (hops) check(hops.progress >= 3, 'hops mission advanced');

await miss();
await page.waitForSelector('.m-result [data-cont-coins]', { timeout: 5000 });
const score1 = await S(() => window.__orbit.state.score);
check(await page.locator('.m-result .m-score').textContent() === String(score1), 'meta lose screen shows the score');
await shot('y6-lose');
const beforeCont = (await profile()).coins;
check(beforeCont === 700 + score1, `coins = score paid on lose (${beforeCont})`);
await page.click('[data-cont-coins]');
await page.waitForTimeout(250);
check(await S(() => window.__orbit.state.phase) === 'play' && (await profile()).coins === beforeCont - 100, 'continue for 100 coins respawns on the last planet');
check(await capture(), 'capture after continue');
await miss();
await page.waitForSelector('.m-result [data-retry]', { timeout: 5000 });
check(await page.locator('.m-result [data-cont-coins], .m-result [data-cont-ad]').count() === 0, 'only one continue per run');
const best = (await profile()).best;
check(best >= 4 && best === (await S(() => window.__orbit.state.score)), `best saved in profile (${best})`);
await page.click('.m-result [data-menu]');
await page.waitForTimeout(250);
check(await page.isVisible('.m-home') && (await page.textContent('.m-home [data-best]')) === String(best), 'menu shows the new best');

// ── level 1 ──
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check(JSON.stringify(await S(() => window.__orbit.mode)) === JSON.stringify({ kind: 'level', n: 1, target: 9 }), 'level 1 asks for planet 9');
check(await page.isVisible('#goal'), 'level goal shown');
check(await page.textContent('#score') === '0/9', 'HUD shows level progress');
await shot('y7-level');
await tap();
await S(() => window.__orbit.warp(8));
await page.waitForTimeout(300);
check(await capture(), 'final timed capture reaches the target');
await page.waitForSelector('.m-result [data-next]', { timeout: 4000 });
await page.waitForTimeout(500);
await shot('y8-win');
const p1 = await profile();
check(p1.stars[0] >= 1 && p1.unlocked === 2, `level 1 recorded (${p1.stars[0]} stars), level 2 unlocked`);
await page.click('.m-result [data-menu]');
await page.waitForTimeout(250);
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(250);
check(await page.locator('.m-lvl').count() === 100, '100 levels on the map');
check(await page.locator('.m-lvl.locked').count() === 98, 'levels beyond 2 locked');
await shot('y9-map');
await page.locator('.m-lvl').nth(1).click();
await page.waitForTimeout(300);
check((await S(() => window.__orbit.mode)).n === 2 && await page.isHidden('.m-home'), 'map starts level 2');

// ── pause, level miss ──
await tap();
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('[data-resume]'), 'pause sheet');
const t0 = await S(() => window.__orbit.state.time);
await page.waitForTimeout(300);
check(await S(() => window.__orbit.state.time) === t0, 'time stops while paused');
await shot('y10-pause');
await page.click('[data-resume]');
await page.waitForTimeout(100);
await miss();
await page.waitForFunction(() => window.__orbit.state.phase === 'ready', null, { timeout: 4000 });
check(await page.isVisible('.m-toast') && (await S(() => window.__orbit.mode)).n === 2, 'level miss restarts the level with a toast');

// ── reload ──
await page.reload();
await page.waitForTimeout(400);
check((await page.textContent('.m-home [data-best]')) === String(best), 'best survives reload');
check((await profile()).skin === 'comet', 'skin survives reload');
await browser.close();
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
