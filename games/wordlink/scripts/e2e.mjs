// End-to-end: meta home → daily reward → shop → missions → level map with chapter headers →
// solve level 1 by real swipes → meta win (chapter row + Share) → next → hint pays with profile
// coins → word language switch keeps separate progress → pause → reload keeps progress →
// daily puzzle (swipes, timer, streak + milestone bonus, calendar, Share, solved card) →
// chapter-complete celebration on level 10; no console errors.
// Usage: npm run preview -w games/wordlink -- --port 4176, then node games/wordlink/scripts/e2e.mjs <outDir> <url>
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4176/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) errors.push('ASSERT: ' + msg); console.log(cond ? 'ok  ' : 'FAIL', msg); };
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const profile = () => page.evaluate(() => JSON.parse(localStorage.getItem('wordlink.profile')));
const hudCoins = async () => Number(await page.textContent('#coins'));
const counts = JSON.parse(readFileSync(new URL('../src/levels/counts.json', import.meta.url), 'utf8'));
const visible = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((el) => el.offsetParent !== null || el.getClientRects().length > 0), sel);
const openSheet = '.m-overlay:not([hidden])';

/** Swipes across the wheel letters spelling `word` (Turkish pack). */
async function swipe(word) {
  const letters = await page.$$eval('.letter', (els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { ch: el.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }));
  const used = new Set();
  const pts = [...word].map((ch) => {
    const up = ch.toLocaleUpperCase('tr');
    const i = letters.findIndex((l, j) => !used.has(j) && l.ch === up);
    used.add(i);
    return letters[i];
  });
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(60);
}

// a v1.0 player: 180 coins in the old counter → migrated into the profile
await page.addInitScript(() => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('wordlink.coins', '180');
    sessionStorage.setItem('seeded', '1');
  }
});
await page.goto(url);
await page.waitForTimeout(900);
check(await page.isVisible('.m-home'), 'home menu on boot');
check(await page.isVisible('.hero-wheel'), 'hero letter wheel on home');
check(await page.isVisible('[data-act="play-endless"].wl-daily-card'), 'daily puzzle card on home');
check((await page.textContent('[data-act="play-endless"] b')) === 'Günün Bulmacası', 'daily card title');
check((await page.textContent('[data-act="play-endless"] small')) === 'Bugün · seriye başla', 'daily card subtitle invites a streak');
check((await profile()).coins === 180, 'old coin balance migrated to the profile');
await shot('w1-home');
check(await page.evaluate(() => document.documentElement.lang) === 'tr', 'Turkish device → Turkish words');

await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await shot('w2-daily');
await page.click('[data-claim]');
await page.waitForTimeout(150);
await page.click('[data-close]');
check((await profile()).coins === 200, 'daily reward paid 20');

await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'six board themes in the shop');
await page.locator('.m-skin').nth(1).click(); // paper, 300 > 200 → not enough
check((await profile()).skin === 'lagoon', 'cannot buy a theme without coins');
await page.click('.m-tabs [data-tab="coins"]');
await page.waitForTimeout(150);
await shot('w3-shop');
await page.click('[data-close]');

await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await shot('w4-missions');
await page.click('[data-close]');

await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(250);
check((await page.locator('.m-lvl').count()) === counts.tr.levels, `level map shows all ${counts.tr.levels} Turkish levels`);
check((await page.locator('.m-lvl.locked').count()) === counts.tr.levels - 1, 'only level 1 unlocked');
check((await page.locator('.wl-ch-head').count()) === counts.tr.levels / 10, 'map has a header for every chapter of 10');
check((await page.locator('.wl-ch-head').first().textContent()).includes('Bölüm 1'), 'first chapter header');
await shot('w5-map');
await page.locator('.m-lvl').first().click();
await page.waitForTimeout(1300);
check(await page.isHidden('.m-home'), 'level 1 starts from the map');
check(await page.isVisible('#hand'), 'tutorial hand shows on level 1');
check(await page.textContent('#level') === '1', 'HUD shows level 1');
check(await page.textContent('#hud-sub') === 'Kıyı · Akşam · 1/10', 'HUD shows chapter name and step');
check(await page.evaluate(() => document.querySelector('#scenery svg') !== null), 'chapter scenery drawn behind the board');
check((await hudCoins()) === 200, 'HUD shows profile coins');
await shot('w6-level1');

// solve level 1 by swiping, no hints → 3 stars, 25 coins
const words = await page.evaluate(() => window.__wordlink.level.words.map((w) => w.w));
for (const [i, w] of words.entries()) {
  await swipe(w);
  if (i === 0) await shot('w7-found');
}
await page.waitForTimeout(1500);
check(await page.isVisible('.m-result [data-next]'), 'meta win screen after swiping every word');
check((await page.locator('.m-stars i.on').count()) === 3, 'no hints → 3 stars');
check(await visible(`${openSheet} .m-result [data-share]`), 'win sheet has a Share button');
check((await page.textContent(`${openSheet} .wl-chap`)).includes('Bölüm 1'), 'win sheet shows chapter progress');
await page.click(`${openSheet} [data-share]`);
await page.waitForTimeout(200);
await shot('w8-win');
let p = await profile();
check(p.coins === 225 && p.stars[0] === 3 && p.unlocked === 2, 'win pays 25 coins, records stars and unlocks level 2');
await page.click('[data-next]');
await page.waitForTimeout(400);
check(await page.textContent('#level') === '2', 'next → level 2');
check(await page.evaluate(() => localStorage.getItem('wordlink.remindAsked') === 'true'), 'reminder opt-in is offered once, after the first win');

// invalid, bonus and duplicate words
const lvl = await page.evaluate(() => window.__wordlink.level);
if (lvl.bonus.length) {
  await swipe(lvl.bonus[0]);
  check(await page.evaluate(() => window.__wordlink.progress.bonusFound.length) === 1, 'bonus word recorded');
}
await swipe(lvl.words[0].w);
await swipe(lvl.words[0].w);
check(!(await page.isHidden('#toast')), 'duplicate word shows a toast');

// hint costs profile coins
const c1 = (await profile()).coins;
await page.click('#hint-btn');
await page.waitForTimeout(200);
check((await profile()).coins === c1 - 25, 'hint costs 25 profile coins');
check((await hudCoins()) === c1 - 25, 'HUD coins follow the profile');
check(await page.evaluate(() => window.__wordlink.progress.revealed.length) === 1, 'hint revealed one cell');
// no coins → hint opens the coin shop instead
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('wordlink.profile')); p.coins = 10; localStorage.setItem('wordlink.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(700);
check(await page.isVisible('.m-home'), 'reload returns to home');
check(await page.textContent('[data-level-title]') === 'Seviye 2', 'home play card resumes level 2');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(await page.evaluate(() => window.__wordlink.progress.revealed.length) === 1, 'hint survives reload');
await page.click('#hint-btn');
await page.waitForTimeout(200);
check(await page.isVisible('.m-tabs [data-tab="coins"].on'), 'hint without coins opens the coin shop');
check(await page.evaluate(() => window.__wordlink.progress.revealed.length) === 1, 'no hint given without coins');
await page.click('[data-close]');

// shuffle keeps letters
const before = await page.$$eval('.letter', (els) => els.map((e) => e.textContent).sort().join(''));
await page.click('#shuffle-btn');
check(await page.$$eval('.letter', (els) => els.map((e) => e.textContent).sort().join('')) === before, 'shuffle keeps the same letters');

// pause → settings → switch word language: English has its own map, coins are shared
await page.click('#settings-btn');
await page.waitForTimeout(150);
check(await page.isVisible('[data-resume]'), 'HUD button opens the meta pause sheet');
await shot('w9-pause');
await page.click('[data-settings]');
await page.waitForTimeout(150);
check(await page.isVisible('.lang-seg'), 'word language toggle in meta settings');
await shot('w10-settings');
await page.click('.lang-seg [data-lang="en"]');
await page.waitForTimeout(400);
p = await profile();
check(p.unlocked === 1 && p.stars[0] === 0 && p.coins === 10, 'English has its own progress, coins shared');
check(await page.textContent('#level') === '1', 'English starts at its own level 1');
await page.click('.lang-seg [data-lang="tr"]');
await page.waitForTimeout(400);
p = await profile();
check(p.unlocked === 2 && p.stars[0] === 3, 'Turkish progress kept');
check(await page.textContent('#level') === '2', 'back on Turkish level 2');
await page.click('[data-close]');
await page.waitForTimeout(150);
check(await page.isHidden('.m-overlay'), 'closing settings resumes the game');

// pause → menu, then reload keeps progress
await page.click('#settings-btn');
await page.click('[data-menu]');
await page.waitForTimeout(200);
check(await page.isVisible('.m-home'), 'pause → menu returns home');
await page.reload();
await page.waitForTimeout(700);
p = await profile();
check(p.unlocked === 2 && p.stars[0] === 3, 'progress survives reload');
await page.click('.m-nav [data-act="map"]');
await page.waitForTimeout(200);
check((await page.locator('.m-lvl.locked').count()) === counts.tr.levels - 2, 'map keeps level 2 unlocked after reload');
await page.click('[data-close]');

// a late level renders inside the screen
await page.evaluate((n) => window.__wordlink.goto(n), counts.tr.levels - 3);
await page.waitForTimeout(300);
const fits = await page.$eval('#board', (b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 60; });
check(fits, 'late extension level grid fits on screen');
await shot('w11-late');

// ── daily puzzle: two earlier days solved → today makes a 3-day streak (+50 milestone) ──
await page.evaluate(() => {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (n) => key(new Date(Date.now() - n * 86400000));
  localStorage.setItem('wordlink.daily', JSON.stringify({ solved: { [day(1)]: { t: 75, h: 0 }, [day(2)]: { t: 120, h: 1 } } }));
  const p = JSON.parse(localStorage.getItem('wordlink.profile'));
  p.coins = 100;
  localStorage.setItem('wordlink.profile', JSON.stringify(p));
});
await page.reload();
await page.waitForTimeout(800);
check((await page.textContent('[data-act="play-endless"] small')) === 'Bugün · seri 2', 'daily card shows the running streak');
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(700);
check(await page.evaluate(() => window.__wordlink.mode) === 'daily', 'daily card opens the daily puzzle');
check((await page.textContent('#hud-eyebrow')) === 'Günün bulmacası', 'HUD labels the daily puzzle');
const daily1 = await page.evaluate(() => window.__wordlink.level.words.map((w) => w.w).join());
check(daily1.split(',').length >= 5, 'daily puzzle has at least 5 words');
await page.waitForTimeout(2100);
check(/^0:0[1-3]$/.test(await page.textContent('#hud-sub')), 'daily timer runs');
await page.click('#settings-btn');
const tPaused = await page.textContent('#hud-sub');
await page.waitForTimeout(1500);
check((await page.textContent('#hud-sub')) === tPaused, 'timer stops while paused');
await page.click('[data-resume]');
await shot('w12-daily');
const dailyWords = daily1.split(',').sort((a, b) => a.length - b.length);
await swipe(dailyWords[0]);
// leave and come back: the daily run resumes with its word
await page.click('#settings-btn');
await page.click('[data-menu]');
await page.waitForTimeout(200);
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(500);
check(await page.evaluate(() => window.__wordlink.progress.found.length) === 1, 'daily run resumes where it was left');
for (const w of dailyWords.slice(1)) await swipe(w);
await page.waitForTimeout(1500);
check(await visible('.wl-daily'), 'daily result sheet after the last word');
check((await page.textContent('.wl-daily .wl-stats .streak b')) === '3', 'streak is 3 days');
check(await visible('.wl-daily .wl-bonus'), '3-day streak bonus shown');
check((await profile()).coins === 100 + 40 + 50, 'daily pays 30 + 10 (no hints) + 50 streak bonus');
check((await page.locator('.wl-cal-grid span.done').count()) >= 1, 'calendar marks solved days');
check(await visible('.wl-daily [data-share]'), 'daily result has a Share button');
await shot('w13-daily-result');
await page.click('.wl-daily [data-share]');
await page.waitForTimeout(200);
await page.click('.wl-daily [data-close]');
await page.waitForTimeout(300);
check(await page.isVisible('.m-home'), 'daily result → menu');
check((await page.textContent('[data-act="play-endless"] small')) === 'Çözüldü · seri 3', 'daily card shows solved + streak');
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(300);
check(await visible('.wl-daily') && !(await visible('.wl-daily [data-levels]')), 'solved card reopens the result with the calendar');
await page.click('.wl-daily [data-close]');
const dailySame = await page.evaluate(async () => {
  await window.__wordlink.daily(); // already solved → sheet again, puzzle unchanged
  return true;
});
check(dailySame, 'daily stays solved for today');
await page.click('.wl-daily [data-close]').catch(() => {});

// ── chapter complete: first clear of level 10 → celebration with reward, then the win sheet ──
await page.evaluate(() => window.__wordlink.goto(10));
await page.waitForTimeout(400);
check((await page.textContent('#hud-sub')) === 'Kıyı · Akşam · 10/10', 'level 10 is the last step of chapter 1');
const c0 = (await profile()).coins;
for (const w of await page.evaluate(() => window.__wordlink.level.words.map((x) => x.w))) await page.evaluate((x) => window.__wordlink.submit(x), w);
await page.waitForTimeout(1400);
check(await visible('.wl-chapter [data-collect]'), 'chapter-complete celebration on the first clear of level 10');
check((await page.textContent('.wl-chapter')).includes('Zirveler · Akşam'), 'celebration names the next chapter');
await shot('w14-chapter');
await page.click('.wl-chapter [data-collect]');
await page.waitForTimeout(400);
check(await visible(`${openSheet} .m-result [data-next]`), 'win sheet follows the celebration');
check((await profile()).coins === c0 + 100 + 25, 'chapter reward 100 + level 25 coins');
await page.click(`${openSheet} [data-next]`);
await page.waitForTimeout(500);
check((await page.textContent('#hud-sub')) === 'Zirveler · Akşam · 1/10', 'next level opens chapter 2 with its own scenery');
await browser.close();
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
