// End-to-end smoke test with real swipes on the letter wheel.
// Usage: npm run preview -w games/wordlink, then node games/wordlink/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4176/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) errors.push('ASSERT: ' + msg); console.log(cond ? 'ok  ' : 'FAIL', msg); };

/** Swipes across the wheel letters spelling `word`. */
async function swipe(word) {
  const letters = await page.$$eval('.letter', (els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { ch: el.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }));
  const used = new Set();
  const pts = [...word].map((ch) => {
    const up = ch.toLocaleUpperCase('tr'); // the test plays the Turkish pack
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

await page.goto(url);
await page.waitForTimeout(1300);
check(await page.isVisible('#hand'), 'tutorial hand shows on level 1');
await page.screenshot({ path: `${out}/w1-start.png` });
const lang = await page.evaluate(() => document.documentElement.lang);
check(lang === 'tr', 'Turkish device → Turkish words');

async function solveLevel(shot) {
  const words = await page.evaluate(() => window.__wordlink.level.words.map((w) => w.w));
  for (const [i, w] of words.entries()) {
    await swipe(w);
    if (shot && i === 0) await page.screenshot({ path: `${out}/${shot}.png` });
  }
  await page.waitForTimeout(900);
}

const coins0 = Number(await page.textContent('#coins'));
await solveLevel('w2-found');
check(await page.isVisible('#win'), 'level 1 solved by swiping');
await page.screenshot({ path: `${out}/w3-win.png` });
check(Number(await page.textContent('#coins')) === coins0 + 10, 'level reward paid');
await page.click('#next-btn');
check(await page.textContent('#level') === '2', 'advances to level 2');

// invalid, bonus and duplicate words
const lvl = await page.evaluate(() => window.__wordlink.level);
await swipe([...lvl.letters].slice(0, 3).join('') === lvl.words[0].w ? [...lvl.letters].reverse().slice(0, 3).join('') : [...lvl.letters].slice(0, 3).join(''));
if (lvl.bonus.length) {
  await swipe(lvl.bonus[0]);
  check(await page.evaluate(() => window.__wordlink.progress.bonusFound.length) === 1 || (await page.evaluate(() => window.__wordlink.level.bonus.length)) === 0, 'bonus word recorded');
}
await swipe(lvl.words[0].w);
await swipe(lvl.words[0].w);
check(!(await page.isHidden('#toast')), 'duplicate word shows a toast');

// hint reveals a letter and costs coins
const c1 = Number(await page.textContent('#coins'));
await page.click('#hint-btn');
await page.waitForTimeout(150);
check(Number(await page.textContent('#coins')) === c1 - 25, 'hint costs 25 coins');
check(await page.evaluate(() => window.__wordlink.progress.revealed.length) === 1, 'hint revealed one cell');

// shuffle keeps letters
const before = await page.$$eval('.letter', (els) => els.map((e) => e.textContent).sort().join(''));
await page.click('#shuffle-btn');
check(await page.$$eval('.letter', (els) => els.map((e) => e.textContent).sort().join('')) === before, 'shuffle keeps the same letters');

// language switch keeps separate progress
await page.click('#settings-btn');
await page.click('#lang-en');
await page.waitForTimeout(300);
check(await page.textContent('#level') === '1', 'English starts at its own level 1');
await page.click('#lang-tr');
await page.waitForTimeout(300);
check(await page.textContent('#level') === '2', 'Turkish progress kept');
await page.click('#close-settings');

// persistence across reload
await page.reload();
await page.waitForTimeout(800);
check(await page.textContent('#level') === '2', 'level survives reload');
check(await page.evaluate(() => window.__wordlink.progress.revealed.length) === 1, 'hint survives reload');

// a late level renders inside the screen
await page.evaluate(() => window.__wordlink.goto(390));
await page.waitForTimeout(300);
const fits = await page.$eval('#board', (b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 60; });
check(fits, '7-letter level grid fits on screen');
await page.screenshot({ path: `${out}/w4-late.png` });
await browser.close();
console.log('errors', errors);
