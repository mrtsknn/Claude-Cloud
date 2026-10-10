// End-to-end with real taps: meta home → daily reward → shop (buy + equip a map theme) → missions →
// play → tutorial (tap city, buy upgrades) → Bazaar boosts spend meta coins → unlock city 2 →
// offline sheet (deferred until the map is open) → pause → menu → New Era → reload keeps state →
// 360x640 fit (home, HUD, bottom city label).
// Usage: npm run preview -w games/kervan -- --port 4184, then node games/kervan/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4184/';
const browser = await chromium.launch();
const errors = [];
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
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const page = await ctx.newPage();
watch(page);
const K = (fn, arg) => page.evaluate(fn, arg);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const tokens = async () => Number(await page.locator('.m-home [data-coins]').textContent());
const profile = () => K(() => window.__kervan.profile);
async function tapEl(sel) {
  await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const b = await page.locator(sel).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
async function tapCity(i) {
  const box = await page.locator('#map').boundingBox();
  const p = await K((i) => window.__kervan.cityScreen(i), i);
  await page.mouse.click(box.x + p.x, box.y + p.y);
}
async function play() {
  await page.click('[data-act="play-endless"]');
  await page.waitForTimeout(400);
}

// ── home ──
await page.goto(url);
await page.waitForTimeout(900);
check((await K(() => document.documentElement.lang)) === 'tr', 'html lang is tr');
check(await page.isVisible('.m-home'), 'home menu on launch');
check((await page.locator('.m-card b').first().textContent()) === 'Kervanım', 'mode card is "Kervanım"');
check(await page.isVisible('.m-art canvas.hero'), 'hero artwork on home');
check(await page.isHidden('#welcome'), 'no offline sheet over the home menu');
await shot('k01-home');

// ── daily ──
const t0 = await tokens();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('k02-daily');
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await tokens()) === t0 + 20, `daily reward paid 20 (${t0} → ${await tokens()})`);

// ── shop: too poor, then buy + equip "Desert dusk" ──
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'shop lists at least 6 map themes');
await page.locator('.m-skin').nth(1).click();
check((await profile()).skin === 'sands', 'cannot buy a theme without enough coins');
await K(() => {
  const p = JSON.parse(localStorage.getItem('kervan.profile'));
  p.coins = 1000;
  localStorage.setItem('kervan.profile', JSON.stringify(p));
});
await page.reload();
await page.waitForTimeout(500);
await page.click('.m-nav [data-act="shop"]');
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(250);
await shot('k03-shop');
check((await tokens()) === 850, 'theme bought for 150 coins');
check((await profile()).skin === 'dusk' && (await K(() => window.__kervan.theme)) === 'dusk', 'theme equipped and applied to the map');
await page.click('[data-close]');

// ── missions ──
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('k04-missions');
await page.click('[data-close]');

// ── play: tutorial ──
await play();
check(await page.isHidden('.m-home'), 'map opens from the mode card');
check(await page.isVisible('#tut'), 'tutorial pill visible');
await shot('k05-map-dusk');
for (let k = 0; k < 4; k++) {
  await tapCity(0);
  await page.waitForTimeout(120);
}
const coins1 = await K(() => window.__kervan.state.coins);
check(coins1 >= 4, `tapping city collects gold (${coins1.toFixed(1)})`);
await K(() => window.__kervan.grant(20));
await page.waitForTimeout(250);
await tapEl('[data-up="0-prod"]');
check((await K(() => window.__kervan.state.cities[0].level)) === 2, 'production upgrade bought by tap');
await K(() => window.__kervan.grant(200));
await page.waitForTimeout(250);
await tapEl('[data-up="0-camel"]');
check((await K(() => window.__kervan.state.cities[0].camels)) === 2, 'camel hired');
await page.waitForTimeout(200);
check(await page.isHidden('#tut'), 'tutorial finished');
// missions advance from game events (taps, upgrades)
await K(() => window.__kervan.flush());
const ms = (await profile()).missions;
const prog = (id) => ms.find((m) => m.id === id)?.progress;
check(prog('taps') === undefined || prog('taps') >= 4, `taps mission advanced (${prog('taps')})`);
check(prog('upgrades') === undefined || prog('upgrades') >= 2, `upgrades mission advanced (${prog('upgrades')})`);

// ── Bazaar: meta coins → boosts ──
await page.click('#bazaar-btn');
await page.waitForTimeout(250);
check(await page.isVisible('#bazaar'), 'bazaar sheet opens');
check((await page.locator('#bazaar-tokens').textContent()) === '850', 'bazaar shows meta coins');
await shot('k06-bazaar');
const g0 = await K(() => window.__kervan.state.coins);
const base = await K(() => window.__kervan.baseRate());
await page.click('#buy-instant');
await page.waitForTimeout(200);
const g1 = await K(() => window.__kervan.state.coins);
check((await profile()).coins === 800, 'instant hour costs 50 coins');
check(Math.abs(g1 - g0 - base * 3600) / (base * 3600) < 0.02, `instant hour pays ~1h of gold (+${(g1 - g0).toFixed(0)})`);
await page.click('#buy-boost');
await page.waitForTimeout(250);
const st0 = await K(() => window.__kervan.state);
check((await profile()).coins === 720 && st0.boost > 1790, 'x2 boost costs 80 coins and runs 30 min');
check(await page.isVisible('#boost-chip'), 'HUD shows the x2 boost timer');
await shot('k07-bazaar-boost');
await page.click('#bazaar-close');
check((await page.locator('#tokens').textContent()) === '720', 'HUD bazaar button shows coins');
await page.waitForTimeout(2600);

// ── unlock city 2 ──
await K(() => window.__kervan.grant(2000));
await page.waitForTimeout(250);
await page.click('#unlock-btn');
await page.waitForTimeout(300);
check((await K(() => window.__kervan.state.cities.length)) === 2, 'city 2 unlocked');
check(await page.isVisible('#banner'), 'unlock celebration banner');
check((await profile()).best === 2, 'profile best = highest city (2)');
await shot('k08-unlock');
await page.waitForTimeout(2500);

// ── merchant + offline sheet (boosted part doubles) ──
await K(() => window.__kervan.grant(1000));
await page.waitForTimeout(250);
await tapEl('[data-up="0-merchant"]');
check(await K(() => window.__kervan.state.cities[0].merchant), 'merchant hired');
const expected = await K(() => window.__kervan.awayCoins(2 * 3600));
await K(() => window.__kervan.away(2 * 3600));
await page.waitForTimeout(300);
check(await page.isVisible('#welcome'), 'welcome-back sheet after 2h away');
await shot('k09-offline');
const before = await K(() => window.__kervan.state.coins);
await page.click('#claim2-btn');
await page.waitForTimeout(300);
const after = await K(() => window.__kervan.state.coins);
check(Math.abs(after - before - expected * 2) / (expected * 2) < 0.05, `x2 claim credits ~2x offline earnings (${(after - before).toFixed(0)})`);
check(await page.isHidden('#welcome'), 'welcome sheet closed');
check((await K(() => window.__kervan.state.boost)) === 0, 'boost time is used up by the 2h away');

// ── pause → menu → play ──
await page.click('#settings-btn');
await page.waitForTimeout(200);
check(await page.isVisible('[data-resume]'), 'pause sheet from HUD');
check(await page.isHidden('[data-restart]'), 'no restart row on the idle map');
await shot('k10-pause');
await page.click('[data-menu]');
await page.waitForTimeout(300);
check(await page.isVisible('.m-home'), 'pause → menu returns home');
// offline time detected on the home screen waits until the map is open
await K(() => window.__kervan.away(3 * 3600));
await page.waitForTimeout(200);
check(await page.isHidden('#welcome'), 'offline sheet deferred while on home');
await play();
check(await page.isVisible('#welcome'), 'offline sheet appears after entering the map');
await page.click('#claim-btn');
await page.waitForTimeout(200);

// ── late run → New Era ──
await K(() =>
  window.__kervan.load({
    coins: 5e9,
    runEarned: 2.6e11,
    cities: Array.from({ length: 6 }, (_, i) => ({ level: 60 - i * 8, camels: 4, speed: 3, merchant: true, stash: 0 })),
  }),
);
await page.waitForTimeout(400);
check((await profile()).best === 6, 'profile best follows the furthest city (6)');
await shot('k11-late');
await page.click('.tab[data-tab="rep"]');
await page.waitForTimeout(200);
check(!(await page.isDisabled('#prestige-btn')), 'New Era available with all cities');
await page.click('#prestige-btn');
await page.click('#confirm-yes');
await page.waitForTimeout(400);
const st = await K(() => window.__kervan.state);
check(st.stars === 5 && st.cities.length === 1 && st.prestiges === 1, `prestige: 5 stars, reset to 1 city (stars=${st.stars})`);
check((await profile()).best === 6, 'best survives a New Era');

// ── reload keeps state ──
await K(() => window.__kervan.grant(123));
await K(() => window.__kervan.save());
await page.reload();
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home menu again after reload');
const st2 = await K(() => window.__kervan.state);
const p2 = await profile();
check(st2.stars === 5 && st2.coins >= 123, 'game state survives reload');
check(p2.coins === 720 && p2.skin === 'dusk' && p2.best === 6, 'meta profile survives reload (coins, theme, best)');

// ── small phone ──
const small = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, locale: 'en-US' });
const sp = await small.newPage();
watch(sp);
await sp.goto(url);
await sp.waitForTimeout(600);
check((await sp.evaluate(() => document.documentElement.lang)) === 'en', 'english locale');
check(await sp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '360x640 home has no horizontal overflow');
await sp.screenshot({ path: `${out}/k12-small-home.png` });
await sp.click('[data-act="play-endless"]');
await sp.waitForTimeout(300);
await sp.evaluate(() =>
  window.__kervan.load({ coins: 3e6, runEarned: 5e6, cities: [{ level: 40, camels: 3, speed: 2, merchant: true }, { level: 22, camels: 2, speed: 1, merchant: true }, { level: 9 }] }),
);
await sp.waitForTimeout(400);
const fits = await sp.evaluate(
  () =>
    document.documentElement.scrollWidth <= window.innerWidth &&
    document.querySelector('.ups').getBoundingClientRect().right <= window.innerWidth &&
    document.querySelector('#settings-btn').getBoundingClientRect().right <= window.innerWidth,
);
check(fits, '360x640 map has no horizontal overflow, HUD fits');
await sp.screenshot({ path: `${out}/k13-small.png` });
// a city sitting on the map's bottom edge keeps its whole label inside the map
await sp.evaluate(() => window.__kervan.focus(1));
await sp.waitForTimeout(300);
await sp.screenshot({ path: `${out}/k14-bottom-label.png` });

await browser.close();
console.log(`${passed} checks passed`);
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
