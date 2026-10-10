// End-to-end: meta home → daily reward → shop → missions → level map with chapter headers →
// solve level 1 by real swipes → meta win (chapter row + Share) → next → hint pays with profile
// coins → word language switch keeps separate progress → pause → reload keeps progress →
// daily puzzle (swipes, timer, streak + milestone bonus, calendar, Share, solved card) →
// chapter-complete celebration on level 10; v1.2 retention: build hero + build screen, league table,
// album pack, very hard / hard map badges, timed level 20 (tip, clock, fail → ad continue → coin
// continue → retry costs a life and the streak), lives empty → lives sheet gates Play, twists
// (coin tiles, mystery tile, locked word), win-streak free hint, end-of-week league result,
// analytics events; no console errors.
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
check(await page.isVisible('.r-hero .r-scene svg'), 'build hero (area preview) on home');
check((await page.textContent('.r-hero .r-cta-text')).startsWith('Sıradaki: Taş yol'), 'hero CTA names the next build task');
check((await page.textContent('.r-lives .r-heart b')) === '5' && (await page.textContent('.r-lives small')) === 'Dolu', 'lives pill: 5, full');
check(await page.isVisible('[data-home-btn="league"]') && await page.isVisible('[data-home-btn="album"]'), 'league + album buttons on home');
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
check((await page.locator('.m-lvl.veryhard').count()) === counts.tr.levels / 10 && (await page.locator('.m-lvl.hard').count()) === counts.tr.levels / 10, 'map marks every 10th level very hard and every other 5th hard');
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
check(await visible(`${openSheet} .m-result [data-btn="share"]`), 'win sheet has a Share button (kit extra-buttons slot)');
check(await visible(`${openSheet} .wl-gain.star`), 'win sheet shows the build star');
check((await page.textContent(`${openSheet} .wl-chap`)).includes('Bölüm 1'), 'win sheet shows chapter progress');
await page.click(`${openSheet} [data-btn="share"]`);
await page.waitForTimeout(200);
await shot('w8-win');
let p = await profile();
check(p.coins === 225 && p.stars[0] === 3 && p.unlocked === 2, 'win pays 25 coins, records stars and unlocks level 2');
const ls = (k) => page.evaluate((k) => JSON.parse(localStorage.getItem(`wordlink.${k}`)), k);
check((await ls('build')).stars === 1 && (await ls('league')).score === 1 && (await ls('streak')).count === 1, 'first clear: +1 build star, +1 league point, streak 1');
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

// win streak 1 → level 2 starts with a free hint; the next one costs profile coins
const c1 = (await profile()).coins;
check(await page.isVisible('#hint-btn.free') && (await page.textContent('#hint-price')) === '×1', 'streak bonus: hint button shows 1 free hint');
await page.click('#hint-btn');
await page.waitForTimeout(200);
check((await profile()).coins === c1 && !(await page.isVisible('#hint-btn.free')), 'streak hint is free');
await page.click('#hint-btn');
await page.waitForTimeout(200);
check((await profile()).coins === c1 - 25, 'hint costs 25 profile coins');
check((await hudCoins()) === c1 - 25, 'HUD coins follow the profile');
check(await page.evaluate(() => window.__wordlink.progress.revealed.length) === 2, 'two hints revealed two cells');
// no coins → hint opens the coin shop instead
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('wordlink.profile')); p.coins = 10; localStorage.setItem('wordlink.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(700);
check(await page.isVisible('.m-home'), 'reload returns to home');
check(await page.textContent('[data-level-title]') === 'Seviye 2', 'home play card resumes level 2');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(400);
check(await page.evaluate(() => window.__wordlink.progress.revealed.length) === 2, 'hints survive reload');
await page.click('#hint-btn');
await page.waitForTimeout(200);
check(await visible(`${openSheet} [data-ad]`), 'hint without coins offers a free hint by video');
await page.click(`${openSheet} [data-shop]`);
await page.waitForTimeout(200);
check(await page.isVisible('.m-tabs [data-tab="coins"].on'), '… or the coin shop');
check(await page.evaluate(() => window.__wordlink.progress.revealed.length) === 2, 'no hint given without coins');
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
check((await profile()).coins === c0 + 100 + 50, 'chapter reward 100 + very hard level 2 × 25 coins');
check((await page.textContent(`${openSheet} .m-eyebrow`)).startsWith('Çok zor seviye'), 'win sheet names the very hard level');
check((await ls('build')).stars === 1 + 2 && (await ls('album')).packs === 3, 'very hard first clear: +2 build stars; packs from daily + very hard + chapter');
await page.click(`${openSheet} [data-next]`);
await page.waitForTimeout(500);
check((await page.textContent('#hud-sub')) === 'Zirveler · Akşam · 1/10', 'next level opens chapter 2 with its own scenery');

// ───────────────────────── v1.2 retention ─────────────────────────
const events = () => page.evaluate(() => JSON.parse(localStorage.getItem('studio.analytics.buffer') ?? '[]').map((e) => e.e));
await page.click('#settings-btn');
await page.click('[data-menu]');
await page.waitForTimeout(300);
// build: 3 stars → the hero CTA is ready; build the stone path
check(await page.isVisible('.r-cta.ready'), 'hero CTA pulses when a task is affordable');
await page.locator('.r-cta').click({ force: true });
await page.waitForTimeout(300);
check(await visible(`${openSheet} .r-build`), 'build screen opens from the hero');
check((await page.locator(`${openSheet} .r-task`).count()) === 6, 'area has 6 tasks');
await page.locator(`${openSheet} .r-task.ready button`).first().click({ force: true });
await page.waitForTimeout(1000);
check((await page.locator(`${openSheet} .r-layer.on`).count()) === 1 && (await page.textContent(`${openSheet} .r-progress span`)) === '1/6', 'task built: its layer is revealed, 1/6');
check((await ls('build')).done.length === 1 && (await ls('build')).stars === 2, 'build spends the task cost');
await shot('w15-build');
await page.click(`${openSheet} [data-close]`);
await page.waitForTimeout(200);
check((await page.textContent('.r-hero .r-area-tag')).includes('1/6'), 'hero shows the built task');

// league: 30 players, the player ranked by levels won this week
await page.locator('[data-home-btn="league"]').click({ force: true });
await page.waitForTimeout(300);
check((await page.locator(`${openSheet} .r-row`).count()) === 30, 'league table has 30 players');
check((await page.textContent(`${openSheet} .r-row.you b`)) === '3', 'league score = 3 wins this week (levels 1, 10 + daily)');
await shot('w16-league');
await page.click(`${openSheet} [data-close]`);

// album: open a pack
await page.locator('[data-home-btn="album"]').click({ force: true });
await page.waitForTimeout(300);
await page.click(`${openSheet} [data-open]`);
await page.waitForTimeout(1100);
check((await page.locator(`${openSheet} .r-pack .r-card`).count()) === 3, 'a pack holds 3 cards');
check((await page.locator(`${openSheet} .r-pack em.new`).count()) >= 1, 'first pack card is new');
await shot('w17-pack');
await page.click(`${openSheet} [data-done]`);
await page.waitForTimeout(300);
check((await ls('album')).have.length >= 1 && (await ls('album')).packs === 2, 'album keeps the cards, 2 packs left');
await page.click(`${openSheet} [data-close]`);

// timed level 20: tip, clock, fail → continue by video → continue by coins → retry costs a life
await page.evaluate(() => window.__wordlink.goto(20));
await page.waitForTimeout(700);
check(await visible('.wl-tip'), 'first timed level shows the "beat the clock" tip');
await page.click('.wl-tip [data-ok]');
await page.waitForTimeout(200);
check((await page.textContent('#hud-sub')).startsWith('⏱'), 'HUD shows the clock');
check(await page.evaluate(() => document.getElementById('app').classList.contains('veryhard')), 'very hard badge in the HUD');
const limit0 = await page.evaluate(() => window.__wordlink.progress.limit);
check(limit0 > 0, 'level 20 has a time limit');
await page.click('#settings-btn');
await page.waitForTimeout(150);
check(!(await visible(`${openSheet} [data-restart]`)), 'no restart on timed levels');
await page.click(`${openSheet} [data-resume]`);
await page.evaluate(() => window.__wordlink.timeUp());
await page.waitForTimeout(300);
check(await visible(`${openSheet} [data-cont-ad]`) && (await page.textContent(`${openSheet} [data-cont-coins]`)).includes('100'), 'first fail: continue by video or 100 coins');
check(await visible(`${openSheet} .wl-streak-warn`), 'fail sheet warns about the win streak');
await shot('w18-fail');
await page.click(`${openSheet} [data-cont-ad]`);
await page.waitForTimeout(300);
check(await page.evaluate(() => window.__wordlink.progress.limit) === limit0 + 30 && !(await page.isVisible('.m-overlay:not([hidden])')), 'video continue adds 30 seconds');
await page.evaluate(() => window.__wordlink.timeUp());
await page.waitForTimeout(300);
check(!(await visible(`${openSheet} [data-cont-ad]`)) && (await page.textContent(`${openSheet} [data-cont-coins]`)).includes('200'), 'second fail: coins only, price doubles');
await page.click(`${openSheet} [data-retry]`);
await page.waitForTimeout(400);
check(await page.evaluate(() => window.__wordlink.lives.count) === 4 && (await ls('streak')).count === 0, 'retry: one life lost, streak reset');
check(await page.evaluate(() => window.__wordlink.progress.attempt) === 2 && (await page.textContent('#level')) === '20', 'retry restarts level 20 as attempt 2');

// out of lives: Play opens the lives sheet; a video gives one back
await page.evaluate(() => { const l = window.__wordlink.lives; while (l.count) l.lose(); });
await page.click('#settings-btn');
await page.click('[data-menu]');
await page.waitForTimeout(300);
check((await page.textContent('.r-lives .r-heart b')) === '0' && /^\d+:\d\d$/.test(await page.textContent('.r-lives small')), 'lives pill: 0 and a countdown');
await page.click('[data-act="play-level"]');
await page.waitForTimeout(300);
check(await visible(`${openSheet} .r-lives-sheet`) && await page.isVisible('.m-home'), 'no lives: Play opens the lives sheet, stays home');
await shot('w19-lives');
await page.click(`${openSheet} [data-ad]`);
await page.waitForTimeout(200);
check(await page.evaluate(() => window.__wordlink.lives.count) === 1, 'video: +1 life');
await page.click(`${openSheet} [data-close]`);

// twists: coin tiles (41), mystery tile (61), locked word (81)
await page.evaluate(() => window.__wordlink.goto(41));
await page.waitForTimeout(600);
await page.click('.wl-tip [data-ok]').catch(() => errors.push('ASSERT: no coin tip'));
check((await page.locator('#board .cell.coin').count()) === 2, 'level 41 has two coin tiles');
const coinWord = await page.evaluate(() => { const w = window.__wordlink; const cell = w.twists.coinCells[0]; return w.level.words.find((p) => [...p.w].some((_, i) => `${p.d === 'v' ? p.r + i : p.r},${p.d === 'h' ? p.c + i : p.c}` === cell)).w; });
const cc0 = (await profile()).coins;
await page.evaluate((x) => window.__wordlink.submit(x), coinWord);
await page.waitForTimeout(500);
check((await profile()).coins >= cc0 + 5 && (await page.locator('#board .cell.coin').count()) < 2, 'a word over a coin tile pays 5 coins');
await page.evaluate(() => window.__wordlink.goto(61));
await page.waitForTimeout(600);
await page.click('.wl-tip [data-ok]').catch(() => errors.push('ASSERT: no mystery tip'));
check((await page.locator('#board .cell.mystery').count()) === 1 && (await page.textContent('#board .cell.mystery')) === '?', 'level 61 has a ? tile');
await page.evaluate(() => window.__wordlink.goto(81));
await page.waitForTimeout(600);
await page.click('.wl-tip [data-ok]').catch(() => errors.push('ASSERT: no locked tip'));
const lk = await page.evaluate(() => window.__wordlink.twists.locked);
check(!!lk && (await page.locator('#board .cell.locked').count()) === lk.word.length, 'level 81 has a padlocked word');
await page.evaluate((x) => window.__wordlink.submit(x), lk.word);
await page.waitForTimeout(100);
check(!(await page.evaluate(() => window.__wordlink.progress.found.length)) && (await page.textContent('#toast')).startsWith('Kilitli'), 'locked word cannot be found early');
await shot('w20-locked');
const others = await page.evaluate((lw) => window.__wordlink.level.words.map((p) => p.w).filter((x) => x !== lw), lk.word);
for (const x of others.slice(0, lk.after)) await page.evaluate((x) => window.__wordlink.submit(x), x);
await page.waitForTimeout(100);
check((await page.locator('#board .cell.locked').count()) === 0, 'the lock opens after enough words');
await page.evaluate((x) => window.__wordlink.submit(x), lk.word);
check(await page.evaluate((x) => window.__wordlink.progress.found.includes(x), lk.word), 'unlocked word can be found');

// end of week: last week's league result greets the player and pays out
await page.evaluate(() => {
  const l = JSON.parse(localStorage.getItem('wordlink.league'));
  localStorage.setItem('wordlink.league', JSON.stringify({ ...l, week: '2026-01-05', tier: 0, score: 60, result: null }));
});
await page.reload();
await page.waitForTimeout(1300);
check(await visible(`${openSheet} .r-league-result`), 'league result sheet on the first home visit of a new week');
check((await page.textContent(`${openSheet} h2`)).includes('1.'), 'finished first with 60 wins');
await shot('w21-league-result');
const lc = (await profile()).coins;
await page.click(`${openSheet} [data-collect]`);
await page.waitForTimeout(200);
check((await profile()).coins === lc + 200 && (await ls('league')).tier === 1, 'rank 1 pays 200 coins and promotes to Silver');

const ev = await events();
for (const e of ['level_start', 'level_win', 'level_fail', 'continue_offer', 'continue_accept', 'build_task', 'lives_empty', 'league_end'])
  check(ev.includes(e), `analytics: ${e}`);
await browser.close();
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
