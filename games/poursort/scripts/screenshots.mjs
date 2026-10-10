// Usage: npm run preview -w games/poursort, then
//   node games/poursort/scripts/screenshots.mjs <preview url> games/poursort/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const scenes = [
  {
    name: '1-pour',
    // mid-game level with two sealed tubes, captured mid-pour
    state: { level: 18, tubes: [[1, 1, 1, 1], [2, 3, 3], [4, 2, 2, 5], [5, 5, 4], [3, 6, 6, 6], [7, 7, 7, 7], [8, 8, 3], [2, 4, 4, 5], [6, 8, 8], []], history: [], undos: 5, extraUsed: false, moves: 23, hintsUsed: 0 },
    pour: [6, 1],
  },
  {
    name: '2-levels',
    level: 60,
  },
  {
    name: '3-symbols',
    level: 120,
    symbols: true,
  },
];
const captions = {
  en: ['Pour, sort, relax', 'Hundreds of levels, all solvable', 'Colour symbols for every eye'],
  tr: ['Dök, sırala, rahatla', 'Yüzlerce seviye, hepsi çözülebilir', 'Herkes için renk sembolleri'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((symbols) => {
      localStorage.setItem('poursort.settings', JSON.stringify({ sound: false, haptics: false, symbols }));
    }, !!sc.symbols);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    if (sc.state) await page.evaluate((s) => window.__poursort.load(s), sc.state);
    else await page.evaluate((l) => window.__poursort.goto(l), sc.level);
    await page.waitForTimeout(500);
    if (sc.pour) {
      await page.evaluate(([a, b]) => {
        window.__poursort.tap(a);
        window.__poursort.tap(b);
        window.__poursort.freezePour(330); // mid-flow: tilted tube, stream, rising level
      }, sc.pour);
      await page.waitForTimeout(150);
    }
    const file = `${outDir}/raw-${lang}-${sc.name}.png`;
    await page.screenshot({ path: file });
    raw[`${lang}-${sc.name}`] = file;
    await ctx.close();
  }
}

const sizes = { 'ios-6.9': [1290, 2796], 'ios-6.5': [1242, 2688], android: [1080, 1920] };
for (const [lang, caps] of Object.entries(captions)) {
  for (const [i, sc] of scenes.entries()) {
    const img = readFileSync(raw[`${lang}-${sc.name}`]).toString('base64');
    for (const [label, [w, h]] of Object.entries(sizes)) {
      mkdirSync(`${outDir}/${lang}/${label}`, { recursive: true });
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const shotH = h * 0.78;
      const shotW = (shotH * 430) / 932;
      await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;
        background:linear-gradient(170deg,#4d82ff,#2f6bff 45%,#7c3aed);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.072}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(20,20,60,.45);border:${w * 0.012}px solid #ffffff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
