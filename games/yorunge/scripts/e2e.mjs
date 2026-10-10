// End-to-end smoke test: start → timed tap captures the next planet → miss → game over →
// continue → miss again → play again → reload keeps best.
// Usage: npm run preview -w games/yorunge -- --port 4185, then node games/yorunge/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4185/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const check = (cond, msg) => { if (!cond) { errors.push('ASSERT: ' + msg); console.log('FAIL', msg); } else console.log('ok', msg); };
const S = (expr) => page.evaluate(expr);
const tap = () => page.mouse.click(195, 600);

async function capture() {
  const before = await S(() => window.__orbit.state.reached);
  await page.waitForFunction(() => window.__orbit.aligned(), null, { polling: 'raf', timeout: 8000 });
  await tap();
  await page.waitForFunction((b) => window.__orbit.state.reached > b || window.__orbit.state.phase === 'over', before, { timeout: 4000 });
  return (await S(() => window.__orbit.state.reached)) > before;
}
async function miss() {
  await page.waitForFunction(() => window.__orbit.missing(), null, { polling: 'raf', timeout: 8000 });
  await tap();
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 5000 });
}

await page.goto(url);
await page.waitForTimeout(600);
check(await S(() => document.documentElement.lang) === 'tr', 'html lang set to tr');
check(await page.isVisible('#hint'), 'tap-to-start hint visible');
await page.screenshot({ path: `${out}/y1-start.png` });
await tap();
check(await S(() => window.__orbit.state.phase) === 'play', 'tap starts the run');
check(await page.isHidden('#hint'), 'hint hidden after start');

let caps = 0;
for (let i = 0; i < 3; i++) if (await capture()) caps++;
check(caps === 3, `3 timed taps captured the next planet (${caps})`);
check(await page.textContent('#score') === String(await S(() => window.__orbit.state.score)), 'HUD score matches state');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/y2-captured.png` });


await miss();
check(await page.isVisible('#continue-btn'), 'continue offered on first game over');
check(await page.textContent('#go-score') === String(await S(() => window.__orbit.state.score)), 'game over shows score');
await page.screenshot({ path: `${out}/y3-gameover.png` });

await page.click('#continue-btn');
await page.waitForTimeout(200);
check(await S(() => window.__orbit.state.phase) === 'play' && await page.isHidden('#gameover'), 'continue resumes on the last planet');
check(await capture(), 'capture after continue');
await miss();
check(await page.isHidden('#continue-btn'), 'only one continue per run');
const best = await page.textContent('#best');
check(Number(best) >= 4, `best saved (${best})`);

await page.click('#again-btn');
await page.waitForTimeout(200);
check(await S(() => window.__orbit.state.phase) === 'ready' && await page.textContent('#score') === '0', 'play again resets to ready');

// settings sheet
await page.click('#settings-btn');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/y4-settings.png` });
await page.click('#close-settings');

await page.reload();
await page.waitForTimeout(400);
check(await page.textContent('#best') === best, 'best survives reload');
await browser.close();
console.log('errors', errors);
process.exit(errors.length ? 1 : 0);
