// End-to-end smoke test: home → level 1 (drag + test hook) → win → map → shop → daily → missions
// → pause → lose/continue → reload keeps progress. Fails on any console error.
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
await shot('01-home');

// level 1
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check(await G(() => window.__coban.running), 'level 1 running');
check(await page.isVisible('#tip'), 'first-level hint shown');
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
check(await G(() => window.__coban.profile.data.unlocked) === 2, 'level 2 unlocked');
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

// level 2: pause
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(await G(() => window.__coban.state.level) === 2, 'level 2 started');
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('.m-sheet [data-resume]'), 'pause sheet');
const tp = await G(() => window.__coban.state.time);
await page.waitForTimeout(400);
check(await G(() => window.__coban.state.time) === tp, 'time frozen while paused');
await shot('10-pause');
await page.click('.m-sheet [data-resume]');
await page.waitForTimeout(300);
check(await G(() => window.__coban.state.time) > tp, 'resumed');

// lose → continue
await G(() => window.__coban.lose());
await page.waitForTimeout(500);
check(await page.isVisible('.m-result [data-cont-ad]'), 'lose screen with continue');
await shot('11-lose');
await page.click('.m-result [data-cont-ad]');
await page.waitForTimeout(500);
const st = await G(() => ({ r: window.__coban.running, left: window.__coban.state.timeLimit - window.__coban.state.time }));
check(st.r && st.left > 13 && st.left <= 15, 'continue adds 15 s');
await shot('12-continued');

// reload keeps progress
const before = await G(() => ({ coins: window.__coban.profile.data.coins, unlocked: window.__coban.profile.data.unlocked }));
await page.reload();
await page.waitForTimeout(600);
const after = await G(() => ({ coins: window.__coban.profile.data.coins, unlocked: window.__coban.profile.data.unlocked, skin: window.__coban.profile.data.skin }));
check(after.unlocked === before.unlocked && after.coins === before.coins && after.skin === 'golden', 'progress survives reload');

check(errors.length === 0, `no console errors ${errors.join(' | ')}`);
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
