// End-to-end test with real taps: tutorial → build walls (preview updates, refund) → wave saves
// all castles → idle waves wash castles → game over → continue → game over → play again →
// reload resumes mid-round → 360×640 fits.
// Usage: npm run preview -w games/gelgit -- --port 4183, then
//   node games/gelgit/scripts/e2e.mjs <outDir> http://localhost:4183/
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4183/';
const browser = await chromium.launch();
const errors = [];
let passed = 0;
const check = (cond, msg) => {
  if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else { passed++; console.log('ok', msg); }
};
const newPage = async (w, h, locale = 'tr-TR') => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, locale });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return page;
};
const page = await newPage(390, 844);
const S = () => page.evaluate(() => window.__gelgit.state);
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
const wave = async () => { await page.click('#wave-btn'); await page.waitForTimeout(50); await idle(); await page.waitForTimeout(80); };

await page.goto(url);
await page.waitForTimeout(900);
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
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/e2-preview.png` });
await tapCell(plan[0]);
s = await S();
check(s.buckets === b0 && s.walls[plan[0]] === 0, 'tapping a fresh wall removes it with a refund');
for (const i of plan) await tapCell(i);
check((await threats()) === 0, 'planned walls keep every castle out of reach');
await page.waitForTimeout(2800);
check(await page.isVisible('#hand'), 'tutorial hand moves on to the wave button');
await page.screenshot({ path: `${out}/e3-built.png` });

await page.click('#wave-btn');
await page.waitForTimeout(450);
await page.screenshot({ path: `${out}/e4-wave.png` });
await idle();
await page.waitForTimeout(100);
s = await S();
check(s.round === 2 && s.terrain.filter((t) => t === 3).length === 3, 'wave 1: all castles saved, round 2');
check(s.score === 5, 'score = 3 castles + perfect bonus 2');
check((await page.textContent('#score')) === '5', 'HUD score updated');
check(!(await page.isVisible('#hand')), 'tutorial finished after first wave');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/e5-after.png` });

// let the sea win
let lostSome = false;
for (let k = 0; k < 20 && !(await page.isVisible('#gameover')); k++) {
  const before = (await S()).terrain.filter((t) => t === 3).length;
  await wave();
  if ((await S()).terrain.filter((t) => t === 3).length < before) lostSome = true;
  await page.waitForTimeout(700);
}
check(lostSome, 'unprotected castles are washed away');
check(await page.isVisible('#gameover'), 'game over sheet');
check(await page.isVisible('#revive-btn'), 'continue offered');
await page.screenshot({ path: `${out}/e6-gameover.png` });
s = await S();
await page.click('#revive-btn');
await page.waitForTimeout(400);
const s2 = await S();
check(s2.terrain.filter((t) => t === 3).length === s.lastLost.length && s2.buckets === s.buckets + 5, 'continue restores castles and +5 buckets');
await page.screenshot({ path: `${out}/e7-continued.png` });
for (let k = 0; k < 20 && !(await page.isVisible('#gameover')); k++) { await wave(); await page.waitForTimeout(700); }
check(await page.isVisible('#gameover') && !(await page.isVisible('#revive-btn')), 'second game over has no continue');
const best = Number(await page.textContent('#best'));
check(best >= 5, 'best score kept');
await page.click('#again-btn');
await page.waitForTimeout(300);
s = await S();
check(s.round === 1 && s.score === 0 && !(await page.isVisible('#gameover')), 'play again starts a fresh beach');

// mid-round resume
const plan2 = await page.evaluate(() => window.__gelgit.plan());
await tapCell(plan2[0]);
await tapCell(plan2[1] ?? plan2[0]);
const mid = await S();
await page.reload();
await page.waitForTimeout(500);
const res = await S();
check(JSON.stringify(res) === JSON.stringify(mid), 'reload resumes mid-round (walls + buckets)');
check(!(await page.isVisible('#hand')), 'no tutorial after it was completed');

// settings
await page.click('#settings-btn');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/e8-settings.png` });
await page.click('#close-settings');

// small phone + English
const small = await newPage(360, 640, 'en-US');
await small.goto(url);
await small.waitForTimeout(700);
const fit = await small.evaluate(() => {
  const L = JSON.parse(document.getElementById('stage').dataset.layout);
  const hud = document.querySelector('.hud').getBoundingClientRect();
  const bar = document.querySelector('.bar').getBoundingClientRect();
  return { top: L.by >= hud.bottom - 1, bottom: L.by + 13 * L.cell <= bar.top + 1, cell: L.cell, barBottom: bar.bottom, sideOk: L.bx >= 0 };
});
check(fit.top && fit.bottom && fit.sideOk && fit.barBottom <= 640 && fit.cell >= 30, `360x640 fits (cell ${fit.cell}px)`);
check((await small.textContent('#wave-btn')).trim() === 'Wave!', 'English UI');
await small.screenshot({ path: `${out}/e9-small-en.png` });

await browser.close();
console.log(`${passed} checks passed`);
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
