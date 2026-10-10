// End-to-end smoke test: home → level 1 (real drag) → win (+share) → map → shop → daily → missions
// → dog training → level 3 bark → pause → fail/continue → rush (endless) → reload keeps progress
// → small-phone layout. Fails on any console error.
// Usage: npm run preview -w games/coban (port 4195), then node games/coban/scripts/e2e.mjs <outDir> [url]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4195/';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
let fails = 0;
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok', msg); };
const G = (fn, arg) => page.evaluate(fn, arg);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const sheetOpen = () => page.isVisible('.m-overlay');
const closeSheet = async () => { if (await sheetOpen()) await page.click('.m-sheet [data-close]'); await page.waitForTimeout(150); };

await page.goto(url);
await page.waitForTimeout(600);
check(await G(() => document.documentElement.lang) === 'tr', 'html lang = tr');
check(await page.isVisible('.m-home'), 'home menu visible');
check((await page.textContent('.m-logo')) === 'Çoban', 'title Çoban');
check(await page.isVisible('#train-btn'), 'dog training button on home');
check(await page.isVisible('[data-act="play-endless"]'), 'rush (endless) card on home');
await shot('01-home');

// level 1: the dog follows a real drag
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check(await G(() => window.__coban.running), 'level 1 running');
check(await page.isVisible('#tip'), 'first-level hint shown');
check(!(await page.isVisible('#bark-btn')), 'no bark button before it is learnt');
const box = await page.locator('#stage').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height - 60);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6, { steps: 20 });
await page.waitForTimeout(900);
const dog = await G(() => window.__coban.state.dog);
check(dog.y < 600, 'dog follows the finger');
await shot('02-play');
await page.mouse.up();
await G(() => window.__coban.win());
await page.waitForTimeout(500);
check(await page.isVisible('.m-result [data-next]'), 'win screen');
check(await page.isVisible('.m-result [data-share]'), 'win screen has a share button');
check(await G(() => window.__coban.profile.data.unlocked) === 2, 'level 2 unlocked');
check(await G(() => localStorage.getItem('coban.reminders')) === 'true', 'daily reminder requested after the first win');
await shot('03-win');
await page.click('.m-result [data-menu]');
await page.waitForTimeout(700);
if (await sheetOpen()) await shot('04-daily-auto');
await closeSheet();

// map
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(200);
check(await page.locator('.m-lvl').count() === 120, 'map shows 120 levels');
await shot('05-map');
await closeSheet();

// shop
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check(await page.locator('.m-skin').count() >= 6, 'shop has ≥6 dog skins');
await shot('06-shop');
await page.click('[data-tab="coins"]');
await page.waitForTimeout(100);
await shot('07-shop-coins');
await closeSheet();

// daily
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
const c0 = await G(() => window.__coban.profile.data.coins);
await page.click('.m-sheet [data-claim]');
await page.waitForTimeout(200);
check(await G(() => window.__coban.profile.data.coins) > c0, 'daily reward claimed');
await shot('08-daily');
await closeSheet();

// buy + equip a skin
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(150);
await page.locator('.m-skin').nth(1).click();
await page.waitForTimeout(150);
check(await G(() => window.__coban.profile.data.skin) === 'golden', 'golden skin bought & equipped');
await closeSheet();

// missions
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(200);
check(await page.locator('.m-mission').count() === 3, '3 daily missions');
await shot('09-missions');
await closeSheet();

// dog training (upgrades)
await G(() => window.__coban.profile.addCoins(200));
const c1 = await G(() => window.__coban.profile.data.coins);
await page.click('#train-btn');
await page.waitForTimeout(200);
check(await page.locator('.up-row').count() === 3, 'training sheet: speed, bark range, bark recharge');
await page.click('[data-up="bark"]');
await page.waitForTimeout(150);
check(await G(() => window.__coban.upgrades.bark) === 1, 'bark range upgraded');
check(await G(() => window.__coban.profile.data.coins) === c1 - 40, 'upgrade paid with coins');
await shot('10-training');
await page.click('[data-train-close]');
await page.waitForTimeout(150);

// level 3: bark
await G(() => window.__coban.start(3));
await page.waitForTimeout(300);
check(await page.isVisible('#bark-btn'), 'bark button from level 3');
check(await page.isVisible('#tip'), 'one-time bark tip');
check(await G(() => window.__coban.state.stats.barkR) > 125, 'upgraded bark range applied');
await page.locator('#bark-btn').dispatchEvent('pointerdown');
await page.waitForTimeout(120);
check(await G(() => window.__coban.state.barkCd) > 3, 'bark fired → cooldown running');
await shot('11-bark');
await page.locator('#bark-btn').dispatchEvent('pointerdown');
check(await G(() => window.__coban.state.barkCd) > 3, 'no second bark while cooling down');

// pause
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('.m-sheet [data-resume]'), 'pause sheet');
const tp = await G(() => window.__coban.state.time);
await page.waitForTimeout(400);
check(await G(() => window.__coban.state.time) === tp, 'time frozen while paused');
await shot('12-pause');
await page.click('.m-sheet [data-resume]');
await page.waitForTimeout(300);
check(await G(() => window.__coban.state.time) > tp, 'resumed');

// fail → continue
await G(() => window.__coban.lose());
await page.waitForTimeout(500);
check(await page.isVisible('.m-result [data-cont-ad]'), 'fail screen with continue');
await shot('13-fail');
await page.click('.m-result [data-cont-ad]');
await page.waitForTimeout(500);
const st = await G(() => ({ r: window.__coban.running, left: window.__coban.state.timeLimit - window.__coban.state.time }));
check(st.r && st.left > 13 && st.left <= 15, 'continue adds 15 s');
await G(() => window.__coban.state.result = null);
await page.click('#pause-btn');
await page.waitForTimeout(200);
await page.click('.m-sheet [data-menu]');
await page.waitForTimeout(400);
await closeSheet();

// rush (endless)
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(400);
check(await G(() => window.__coban.running && !!window.__coban.state.rush), 'rush running');
check(await page.isVisible('#miss-pill') && !(await page.isVisible('#time-pill')), 'rush HUD: misses instead of a clock');
await G(() => window.__coban.sim(40));
await page.waitForTimeout(300);
check(await G(() => window.__coban.state.rush.wave) >= 3, 'waves keep arriving');
check(await G(() => window.__coban.state.rush.score) > 0, 'rush scores penned sheep');
await shot('14-rush');
const score = await G(() => window.__coban.state.rush.score);
await G(() => window.__coban.lose());
await page.waitForTimeout(500);
check(await page.isVisible('.m-result [data-retry]'), 'rush over screen');
check(await page.isVisible('.m-result [data-share]'), 'rush over has a share button');
check(await G(() => window.__coban.profile.data.best) === score, 'rush best score recorded');
await shot('15-rush-over');
await page.click('.m-result [data-menu]');
await page.waitForTimeout(400);
await closeSheet();

// reload keeps progress
const before = await G(() => ({ coins: window.__coban.profile.data.coins, unlocked: window.__coban.profile.data.unlocked }));
await page.reload();
await page.waitForTimeout(600);
const after = await G(() => ({ coins: window.__coban.profile.data.coins, unlocked: window.__coban.profile.data.unlocked, skin: window.__coban.profile.data.skin, bark: window.__coban.upgrades.bark }));
check(after.unlocked === before.unlocked && after.coins === before.coins && after.skin === 'golden' && after.bark === 1, 'progress + upgrades survive reload');

// small and tall phones: HUD, field and bark button fit without overlap
for (const [w, h] of [[360, 640], [430, 932]]) {
  await page.setViewportSize({ width: w, height: h });
  await G(() => window.__coban.start(5));
  await page.waitForTimeout(300);
  const L = await G(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const hud = r('.hud'), bark = r('#bark-btn'), pills = r('.pills');
    return { hudBottom: hud.bottom, barkTop: bark.top, barkBottom: bark.bottom, barkRight: bark.right, pillsRight: pills.right, sw: document.documentElement.scrollWidth };
  });
  check(L.barkBottom <= h && L.barkRight <= w && L.pillsRight <= w && L.sw <= w, `${w}×${h}: nothing off-screen`);
  check(L.barkTop > L.hudBottom, `${w}×${h}: bark button clear of the HUD`);
  await shot(`16-layout-${w}x${h}`);
}

check(errors.length === 0, `no console errors ${errors.join(' | ')}`);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
