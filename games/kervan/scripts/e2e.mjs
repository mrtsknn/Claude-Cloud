// End-to-end smoke test with real taps: tutorial → tap city → buy upgrades → hire camel →
// unlock city 2 → offline earnings sheet → New Era (prestige) → reload keeps state → 360x640 fit.
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

await page.goto(url);
await page.waitForTimeout(800);
check((await K(() => document.documentElement.lang)) === 'tr', 'html lang is tr');
check(await page.isVisible('#tut'), 'tutorial pill visible');
await page.screenshot({ path: `${out}/k1-tutorial.png` });

// step 1: tap the city
for (let k = 0; k < 4; k++) {
  await tapCity(0);
  await page.waitForTimeout(120);
}
const coins1 = await K(() => window.__kervan.state.coins);
check(coins1 >= 4, `tapping city collects coins (${coins1.toFixed(1)})`);
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/k2-tapped.png` });

// step 2: buy production
await K(() => window.__kervan.grant(20));
await page.waitForTimeout(250);
await tapEl('[data-up="0-prod"]');
check((await K(() => window.__kervan.state.cities[0].level)) === 2, 'production upgrade bought by tap');
// step 3: hire a camel
await K(() => window.__kervan.grant(200));
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/k3-camel-step.png` });
await tapEl('[data-up="0-camel"]');
check((await K(() => window.__kervan.state.cities[0].camels)) === 2, 'camel hired');
await page.waitForTimeout(200);
check(await page.isHidden('#tut'), 'tutorial finished');

// unlock city 2 via the card button
await K(() => window.__kervan.grant(2000));
await page.waitForTimeout(250);
await page.click('#unlock-btn');
await page.waitForTimeout(300);
check((await K(() => window.__kervan.state.cities.length)) === 2, 'city 2 unlocked');
check(await page.isVisible('#banner'), 'unlock celebration banner');
await page.screenshot({ path: `${out}/k4-unlock.png` });
await page.waitForTimeout(2500);

// merchant + offline earnings
await K(() => window.__kervan.grant(1000));
await page.waitForTimeout(250);
await tapEl('[data-up="0-merchant"]');
check(await K(() => window.__kervan.state.cities[0].merchant), 'merchant hired');
await K(() => window.__kervan.away(2 * 3600));
await page.waitForTimeout(300);
check(await page.isVisible('#welcome'), 'welcome-back sheet after 2h away');
await page.screenshot({ path: `${out}/k5-offline.png` });
const before = await K(() => window.__kervan.state.coins);
const rate = await K(() => window.__kervan.idleRate());
await page.click('#claim2-btn');
await page.waitForTimeout(300);
const after = await K(() => window.__kervan.state.coins);
check(Math.abs(after - before - rate * 7200 * 2) / (rate * 7200 * 2) < 0.05, `x2 claim credits ~2x offline earnings (${(after - before).toFixed(0)})`);
check(await page.isHidden('#welcome'), 'welcome sheet closed');

// prestige: jump to a late run with all cities
await K(() =>
  window.__kervan.load({
    coins: 5e9,
    runEarned: 2.6e11,
    cities: Array.from({ length: 6 }, (_, i) => ({ level: 60 - i * 8, camels: 4, speed: 3, merchant: true, stash: 0 })),
  }),
);
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/k6-late.png` });
await page.click('.tab[data-tab="rep"]');
await page.waitForTimeout(200);
check(!(await page.isDisabled('#prestige-btn')), 'New Era available with all cities');
await page.screenshot({ path: `${out}/k7-reputation.png` });
await page.click('#prestige-btn');
await page.click('#confirm-yes');
await page.waitForTimeout(400);
const st = await K(() => window.__kervan.state);
check(st.stars === 5 && st.cities.length === 1 && st.prestiges === 1, `prestige: 5 stars, reset to 1 city (stars=${st.stars})`);
await page.screenshot({ path: `${out}/k8-newera.png` });

// reload keeps state
await K(() => window.__kervan.grant(123));
await K(() => window.__kervan.save());
await page.reload();
await page.waitForTimeout(500);
const st2 = await K(() => window.__kervan.state);
check(st2.stars === 5 && st2.coins >= 123, 'state survives reload');

// small phone fits: no horizontal overflow, buttons visible
const small = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, locale: 'en-US' });
const sp = await small.newPage();
watch(sp);
await sp.goto(url);
await sp.waitForTimeout(500);
await sp.evaluate(() =>
  window.__kervan.load({ coins: 3e6, runEarned: 5e6, cities: [{ level: 40, camels: 3, speed: 2, merchant: true }, { level: 22, camels: 2, speed: 1, merchant: true }, { level: 9 }] }),
);
await sp.waitForTimeout(400);
const fits = await sp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('.ups').getBoundingClientRect().right <= window.innerWidth);
check(fits, '360x640 has no horizontal overflow');
check((await sp.evaluate(() => document.documentElement.lang)) === 'en', 'english locale');
await sp.screenshot({ path: `${out}/k9-small.png` });

await browser.close();
console.log(`${passed} checks passed`);
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
