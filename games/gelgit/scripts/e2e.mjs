// End-to-end with real taps, around the meta layer:
// home → daily reward → shop (buy + equip a beach skin) → missions → play (tutorial, build,
// preview, refund) → wave saves every castle → idle waves → meta lose sheet → continue with coins
// (castles rebuilt, +5 buckets) → pause → sound toggle mutes the surf synth → reload resumes
// mid-round → second game over → try again → 360×640 + English fit.
// Usage: npm run preview -w games/gelgit -- --port 4183, then
//   node games/gelgit/scripts/e2e.mjs <outDir> http://localhost:4183/
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4183/';
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok  ', msg); }
};
const newPage = async (w, h, locale = 'tr-TR') => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, locale });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return page;
};
const page = await newPage(390, 844);
const S = () => page.evaluate(() => window.__gelgit.state);
const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('gelgit.profile')));
const coins = async () => Number(await page.locator('.m-home [data-coins]').textContent());
const idle = () => page.waitForFunction(() => !window.__gelgit.busy(), null, { timeout: 8000 });
const tapCell = async (i) => {
  const p = await page.evaluate((i) => window.__gelgit.center(i), i);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(60);
};
const threats = () => page.evaluate(() => {
  const s = window.__gelgit.state;
  const d = window.__gelgit.preview();
  return s.terrain.filter((t, i) => t === 3 && d[i] >= 0).length;
});
const castles = async () => (await S()).terrain.filter((t) => t === 3).length;
const loseOpen = () => page.isVisible('.m-result [data-retry]');
const wave = async () => { await page.click('#wave-btn'); await page.waitForTimeout(50); await idle(); await page.waitForTimeout(80); };

// ── home & meta (a v1.0 player: best 12 saved the old way)
await page.goto(url);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('gelgit.best', '12'); });
await page.reload();
await page.waitForTimeout(600);
check(await page.isVisible('.m-home'), 'home menu on boot');
check(await page.isVisible('.m-home .hero svg'), 'hero artwork on home');
check((await page.textContent('.m-home [data-best]')) === '12', 'v1.0 best migrated into the profile');
await page.screenshot({ path: `${out}/m1-home.png` });
const c0 = await coins();
await page.click('.m-nav [data-act="daily"]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/m2-daily.png` });
await page.click('[data-claim]');
await page.waitForTimeout(200);
await page.click('[data-close]');
check((await coins()) === c0 + 20, 'daily reward paid 20');
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(200);
check((await page.locator('.m-skin').count()) >= 6, 'six beach skins in the shop');
await page.locator('.m-skin').nth(2).click(); // sunset 500 > coins → not enough
check((await P()).skin === 'classic', 'cannot buy a skin without coins');
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('gelgit.profile')); p.coins = 1000; localStorage.setItem('gelgit.profile', JSON.stringify(p)); });
await page.reload();
await page.waitForTimeout(500);
await page.click('.m-nav [data-act="shop"]');
await page.waitForTimeout(150);
await page.locator('.m-skin').nth(2).click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/m3-shop.png` });
check((await coins()) === 500, 'sunset skin bought for 500');
check((await P()).skin === 'sunset', 'sunset skin equipped');
await page.click('[data-close]');
await page.click('.m-nav [data-act="missions"]');
await page.waitForTimeout(150);
check((await page.locator('.m-mission').count()) === 3, 'three daily missions');
await page.screenshot({ path: `${out}/m4-missions.png` });
await page.click('[data-close]');

// ── play
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(900);
check(await page.isHidden('.m-home'), 'game starts from the play card');
check(await page.isVisible('#hand'), 'tutorial hand shown on first play');
check((await page.textContent('#round')) === 'Tur 1', 'Turkish UI, round 1');
check((await page.evaluate(() => document.documentElement.lang)) === 'tr', '<html lang> = tr');
await page.screenshot({ path: `${out}/e1-tutorial.png` });

let s = await S();
const b0 = s.buckets;
check((await threats()) > 0, 'round 1 preview threatens a castle');
const plan = await page.evaluate(() => window.__gelgit.plan());
const prev0 = JSON.stringify(await page.evaluate(() => window.__gelgit.preview()));
await tapCell(plan[0]);
s = await S();
check(s.buckets === b0 - 1 && s.walls[plan[0]] === 2, 'tap builds a wall and spends a bucket');
check(JSON.stringify(await page.evaluate(() => window.__gelgit.preview())) !== prev0, 'preview recomputed after building');
await tapCell(plan[0]);
s = await S();
check(s.buckets === b0 && s.walls[plan[0]] === 0, 'tapping a fresh wall removes it with a refund');
for (const i of plan) await tapCell(i);
check((await threats()) === 0, 'planned walls keep every castle out of reach');
await page.waitForTimeout(2800);
check(await page.isVisible('#hand'), 'tutorial hand moves on to the wave button');
await page.screenshot({ path: `${out}/e2-built.png` });

await page.click('#wave-btn');
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/e3-wave.png` });
await idle();
await page.waitForTimeout(100);
s = await S();
check(s.round === 2 && (await castles()) === 3, 'wave 1: all castles saved, round 2');
check(s.score === 5, 'score = 3 castles + perfect bonus 2');
check((await page.textContent('#score')) === '5', 'HUD score updated');
check(!(await page.isVisible('#hand')), 'tutorial finished after first wave');
const m = (await P()).missions;
const prog = (id) => m.find((x) => x.id === id)?.progress;
check(['castles', 'walls', 'rounds'].every((id) => prog(id) === undefined || prog(id) >= 1), `game missions advanced by the wave (${m.map((x) => `${x.id}:${x.progress}`).join(' ')})`);

// ── let the sea win → meta lose sheet → continue with coins
let lostSome = false;
for (let k = 0; k < 20 && !(await loseOpen()); k++) {
  const before = await castles();
  await wave();
  if ((await castles()) < before) lostSome = true;
  await page.waitForTimeout(700);
}
check(lostSome, 'unprotected castles are washed away');
check(await loseOpen(), 'meta lose sheet at game over');
check(await page.isVisible('[data-cont-coins]'), 'continue offered');
s = await S();
const reward = Number((await page.textContent('.m-result .m-reward b')).replace('+', ''));
check(reward === Math.round(s.score / 2), `coins = score/2 (${reward})`);
await page.screenshot({ path: `${out}/e4-lose.png` });
const coinsBefore = (await P()).coins;
await page.click('[data-cont-coins]');
await page.waitForTimeout(400);
const s2 = await S();
check(s2.terrain.filter((t) => t === 3).length === s.lastLost.length && s2.buckets === s.buckets + 5, 'continue restores castles and +5 buckets');
check((await P()).coins === coinsBefore - 100, 'continue charged 100 coins');
check(!(await page.evaluate(() => window.__gelgit.over)), 'game running again');
await page.screenshot({ path: `${out}/e5-continued.png` });

// ── pause → settings → sound off mutes the surf synth
await page.click('#pause-btn');
await page.waitForTimeout(200);
check(await page.isVisible('[data-resume]'), 'pause sheet');
await page.screenshot({ path: `${out}/e6-pause.png` });
await page.click('[data-settings]');
await page.waitForTimeout(150);
await page.click('label:has([data-k="sound"])');
await page.waitForTimeout(150);
const surf = await page.evaluate(() => window.__gelgit.surf());
check(surf && surf.gain === 0 && surf.state !== 'running', `sound off silences the surf AudioContext (${JSON.stringify(surf)})`);
check((await page.evaluate(() => JSON.parse(localStorage.getItem('gelgit.settings')).sound)) === false, 'sound setting saved');
await page.click('label:has([data-k="sound"])');
await page.waitForTimeout(100);
check((await page.evaluate(() => window.__gelgit.surf().gain)) === 1, 'sound on restores the surf');
await page.click('.m-sheet [data-close]');
await page.waitForTimeout(150);
check(!(await page.isVisible('.m-overlay')), 'back in the game after settings');

// ── reload resumes mid-round
const plan2 = await page.evaluate(() => window.__gelgit.plan());
if (plan2.length) await tapCell(plan2[0]);
const mid = await S();
await page.reload();
await page.waitForTimeout(500);
check(await page.isVisible('.m-home'), 'reload opens the home menu');
await page.click('[data-act="play-endless"]');
await page.waitForTimeout(300);
check(JSON.stringify(await S()) === JSON.stringify(mid), 'play resumes mid-round (walls + buckets)');
check(!(await page.isVisible('#hand')), 'no tutorial after it was completed');

// ── second game over: no continue, try again starts a fresh beach
for (let k = 0; k < 25 && !(await loseOpen()); k++) { await wave(); await page.waitForTimeout(700); }
check(await loseOpen() && !(await page.isVisible('[data-cont-coins]')), 'second game over has no continue');
const gamesProg = (await P()).missions.find((x) => x.id === 'games');
check(!gamesProg || gamesProg.progress >= 1, 'games mission counted');
await page.click('[data-retry]');
await page.waitForTimeout(300);
s = await S();
check(s.round === 1 && s.score === 0 && !(await loseOpen()), 'try again starts a fresh beach');
check((await P()).best >= 12, 'best kept in the profile');

// ── small phone + English
const small = await newPage(360, 640, 'en-US');
await small.goto(url);
await small.waitForTimeout(500);
await small.screenshot({ path: `${out}/e7-small-home-en.png` });
await small.click('[data-act="play-endless"]');
await small.waitForTimeout(600);
const fit = await small.evaluate(() => {
  const L = JSON.parse(document.getElementById('stage').dataset.layout);
  const hud = document.querySelector('.hud').getBoundingClientRect();
  const bar = document.querySelector('.bar').getBoundingClientRect();
  return { top: L.by >= hud.bottom - 1, bottom: L.by + 13 * L.cell <= bar.top + 1, cell: L.cell, barBottom: bar.bottom, sideOk: L.bx >= 0 };
});
check(fit.top && fit.bottom && fit.sideOk && fit.barBottom <= 640 && fit.cell >= 30, `360x640 fits (cell ${fit.cell}px)`);
check((await small.textContent('#wave-btn')).trim() === 'Wave!', 'English UI');
await small.screenshot({ path: `${out}/e8-small-en.png` });

await browser.close();
console.log(`${passed} checks passed`);
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
