// End-to-end smoke test: home → endless jumps (timed taps via test hook) → splash/lose →
// continue → challenge level win → shop → daily → missions → pause → reload keeps best.
// Usage: npm run preview -w games/parasut, then node games/parasut/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4196/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let pass = 0;
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { pass++; console.log('ok', msg); }
};
const P = (expr) => page.evaluate(expr);
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const sheetOpen = () => page.isVisible('.m-overlay');
async function closeSheet() {
  await page.waitForTimeout(500);
  if (await sheetOpen()) await page.click('.m-sheet [data-close]');
}
async function landJump() {
  const k = await P(() => window.__parasut.jumpIdx);
  await page.waitForFunction(() => ['intro', 'fall'].includes(window.__parasut.stage));
  await P(() => window.__parasut.autoplay());
  await page.waitForFunction((k) => window.__parasut.jumpIdx === k + 1 || window.__parasut.stage === 'off', k, { timeout: 20000 });
  return (await P(() => window.__parasut.jumpIdx)) === k + 1;
}

await page.goto(url);
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home menu visible');
check((await P(() => document.documentElement.lang)) === 'tr', 'html lang = tr');
await shot('e1-home');

// endless
await page.click('[data-act="play-endless"]');
await P(() => window.__parasut.speed(3));
check(await landJump(), 'endless jump 1 landed');
check(await landJump(), 'endless jump 2 landed');
await page.waitForFunction(() => window.__parasut.stage === 'fall');
await P(() => window.__parasut.speed(1));
await page.mouse.click(200, 500); // real tap: open chute
await page.waitForTimeout(600);
check((await P(() => window.__parasut.diver.phase)) === 'chute', 'tap opens the parachute');
await shot('e2-chute');
await P(() => window.__parasut.speed(3));
await page.waitForFunction(() => window.__parasut.stage !== 'fall', null, { timeout: 20000 });
const score1 = await P(() => window.__parasut.score);
check(score1 > 0, `scored ${score1}`);

// splash → lose → continue
await page.waitForFunction(() => ['intro', 'fall', 'off'].includes(window.__parasut.stage));
if ((await P(() => window.__parasut.stage)) !== 'off') {
  await P(() => window.__parasut.splash());
  await page.waitForSelector('.m-result', { timeout: 20000 });
}
check(await page.isVisible('.m-result [data-cont-coins]'), 'lose sheet with continue');
await shot('e3-lose');
const scoreBefore = await P(() => window.__parasut.score);
await page.click('[data-cont-coins]');
await page.waitForTimeout(200);
check(!(await sheetOpen()) && (await P(() => window.__parasut.score)) === scoreBefore, 'continue keeps the run');
await P(() => window.__parasut.splash());
await page.waitForSelector('.m-result', { timeout: 20000 });
const best = await P(() => window.__parasut.profile.data.best);
check(best === scoreBefore, `best recorded (${best})`);
await page.click('.m-result [data-menu]');
await closeSheet();

// challenge level 1 (3 landings)
await page.click('[data-act="play-level"]');
await P(() => window.__parasut.speed(3));
for (let i = 0; i < 3; i++) check(await landJump(), `level 1 jump ${i + 1} landed`);
await page.waitForSelector('.m-result .m-stars', { timeout: 10000 });
check(true, 'win sheet shown');
await page.waitForTimeout(500);
await shot('e4-win');
await page.click('.m-result [data-menu]');
await closeSheet();
check((await P(() => window.__parasut.profile.data.unlocked)) === 2, 'level 2 unlocked');
check((await P(() => window.__parasut.profile.data.best)) === best, 'challenge did not overwrite best');

// shop (top up coins so a skin is affordable)
await P(() => window.__parasut.profile.addCoins(300));
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'shop shows ≥ 6 parachute skins');
await shot('e5-shop');
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(200);
check((await P(() => window.__parasut.profile.data.skin)) === 'ocean', 'bought + equipped ocean skin');
await page.click('.m-sheet [data-close]');

// daily
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('e6-daily');
const c0 = await P(() => window.__parasut.profile.data.coins);
await page.click('.m-sheet [data-claim]');
await page.waitForTimeout(200);
check((await P(() => window.__parasut.profile.data.coins)) > c0, 'daily reward claimed');
await page.click('.m-sheet [data-close]');

// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(200);
check((await page.locator('.m-mission').count()) === 3, '3 daily missions');
await shot('e7-missions');
await page.click('.m-sheet [data-close]');

// pause
await page.click('[data-act="play-endless"]');
await page.waitForFunction(() => window.__parasut.stage === 'fall');
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('.m-sheet [data-resume]'), 'pause sheet');
const tPaused = await P(() => window.__parasut.diver.t);
await page.waitForTimeout(300);
check((await P(() => window.__parasut.diver.t)) === tPaused, 'time frozen while paused');
await shot('e8-pause');
await page.click('.m-sheet [data-resume]');
await page.waitForTimeout(300);
check((await P(() => window.__parasut.diver.t)) > tPaused, 'resume continues');

// reload keeps best
await page.reload();
await page.waitForTimeout(600);
check((await P(() => window.__parasut.profile.data.best)) === best, 'best survives reload');
check((await P(() => window.__parasut.profile.data.skin)) === 'ocean', 'skin survives reload');
await browser.close();
console.log(`passed ${pass}, errors`, errors);
process.exit(errors.length ? 1 : 0);
