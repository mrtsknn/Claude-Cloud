// Usage: npm run preview -w games/katla -- --port 4198, then
//   node games/katla/scripts/screenshots.mjs http://localhost:4198/ games/katla/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const scenes = [
  { name: '1-home', home: true },
  { name: '2-fold', level: 48, folds: 1, freeze: 330 },
  { name: '3-target', level: 104, folds: 2, skin: 'washi' },
  { name: '4-skins', shop: true },
];
const captions = {
  en: ['Calm paper-folding puzzles', 'Swipe to fold, watch it flip', '150 hand-checked levels', 'Collect beautiful papers'],
  tr: ['Sakin kâğıt katlama bulmacası', 'Kaydır, katla, dönüşünü izle', '150 çözücüyle denetlenmiş seviye', 'Güzel kâğıtlar topla'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((skin) => {
      localStorage.setItem('katla.settings', JSON.stringify({ sound: false, haptics: false }));
      if (skin) localStorage.setItem('katla.profile', JSON.stringify({ owned: ['plain', skin], skin, coins: 1240 }));
    }, sc.skin ?? null);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(500);
    if (sc.shop) {
      await page.click('.m-nav [data-act="shop"]');
      await page.waitForTimeout(400);
    } else if (!sc.home) {
      await page.evaluate((n) => window.__katla.goto(n), sc.level);
      await page.waitForTimeout(400);
      for (let i = 0; i < sc.folds; i++) {
        const last = i === sc.folds - 1;
        await page.evaluate(() => window.__katla.fold(window.__katla.level.solution[window.__katla.state.moves.length]));
        if (last && sc.freeze) await page.evaluate((ms) => window.__katla.freeze(ms), sc.freeze);
        else await page.waitForTimeout(700);
      }
      await page.waitForTimeout(sc.freeze ? 150 : 700);
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
        background:radial-gradient(120% 80% at 50% 0%,#fdf8ee,#e6d5b8);font-family:Georgia,'Times New Roman',serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#3b3530;font-style:italic;font-weight:700;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.01em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.07}px rgba(90,60,20,.3);border:${w * 0.012}px solid #fffdf8"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
for (const f of Object.values(raw)) rmSync(f);
await browser.close();
console.log('done');
