// End-to-end smoke test: first-run hint → play to game over → revive → game over → play again.
// Usage: npm run preview -w games/snapgrid, then node games/snapgrid/scripts/e2e.mjs <outDir> <url>
import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4174/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, locale: 'tr-TR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(1900);
await page.screenshot({ path: out + '/a-hint.png' });
const box = await page.locator('#stage').boundingBox();
const L = JSON.parse(await page.locator('#stage').getAttribute('data-layout'));
    const bs = L.bs, cell = L.cell, bx = L.bx + box.x, by = L.by + box.y, ty = L.ty + box.y + L.th / 2;
const moves = () => page.evaluate(() => JSON.parse(localStorage.getItem('snapgrid.save') || '{"moves":0}').moves);
async function playUntilOver(shotAt) {
  for (let round = 0; round < 80; round++) {
    let moved = false;
    const m0 = await moves();
    for (let slot = 0; slot < 3 && !moved; slot++) {
      const sx = bx + bs / 6 + slot * bs / 3;
      for (let r = 7; r >= 0 && !moved; r--) for (let c = 0; c < 8 && !moved; c++) {
        await page.mouse.move(sx, ty); await page.mouse.down();
        await page.mouse.move(bx + (c + 0.5) * cell, by + (r + 0.5) * cell, { steps: 2 });
        if (shotAt && round === shotAt && r === 4 && c === 3) await page.screenshot({ path: out + '/a2-drag.png' });
        await page.mouse.up();
        if ((await moves()) > m0) moved = true;
      }
    }
    if (!moved) return;
  }
}
await playUntilOver(5);
await page.waitForTimeout(1600);
await page.screenshot({ path: out + '/b-over1.png' });
await page.click('#revive-btn');
await page.waitForTimeout(700);
await page.screenshot({ path: out + '/c-revived.png' });
await playUntilOver();
await page.waitForTimeout(1600);
console.log('revive visible after 2nd over:', await page.isVisible('#revive-btn'));
await page.screenshot({ path: out + '/d-over2.png' });
await page.click('#again-btn');
await page.waitForTimeout(600);
console.log('gamesPlayed', await page.evaluate(() => localStorage.getItem('snapgrid.gamesPlayed')), 'errors', errors);
const ev = await page.evaluate(() => JSON.parse(localStorage.getItem('studio.analytics.buffer')).map((e) => e.e).join(','));
console.log(ev);
await browser.close();
