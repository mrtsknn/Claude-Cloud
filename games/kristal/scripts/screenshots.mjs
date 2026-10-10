// Usage: npm run preview -w games/kristal -- --port 4190, then
//   node games/kristal/scripts/screenshots.mjs <preview url> games/kristal/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// home: meta home menu; keep: how many solution taps to play; freeze: ms after the last tap to
// pin the clock; skin: crystal theme from the shop
const scenes = [
  { name: '1-match', level: 33, keep: 2, outline: true, skin: 'ice' },
  { name: '2-ripple', level: 70, keep: 3, freeze: 140, skin: 'aurora' },
  { name: '3-home', home: true, skin: 'ice' },
  { name: '4-sparkle', level: 125, keep: 99, freeze: 520, skin: 'rose' },
];
const captions = {
  en: ['Match the snowflake', 'One tap, six reflections', '150 calm levels', 'Collect crystal themes'],
  tr: ['Kar tanesini eşleştir', 'Tek dokunuş, altı yansıma', '150 sakin seviye', 'Kristal temaları topla'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((skin) => {
      localStorage.setItem('kristal.settings', JSON.stringify({ sound: false, haptics: false }));
      // a returning player: some progress, a few coins, the scene's theme equipped
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const stars = Array.from({ length: 150 }, (_, i) => (i < 23 ? [3, 3, 2, 3][i % 4] : 0));
      localStorage.setItem('kristal.profile', JSON.stringify({ coins: 640, stars, unlocked: 24, owned: ['ice', 'aurora', 'rose'], skin, firstRun: false, dailyLast: day }));
      localStorage.setItem('kristal.save', JSON.stringify({ level: 24, state: 0, history: [], hintsUsed: 0 }));
    }, sc.skin);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(sc.home ? 900 : 300);
    if (sc.home) {
      const file = `${outDir}/raw-${lang}-${sc.name}.png`;
      await page.screenshot({ path: file });
      raw[`${lang}-${sc.name}`] = file;
      await ctx.close();
      continue;
    }
    await page.evaluate((s) => {
      const k = window.__kristal;
      k.goto(s.level);
      document.getElementById('toast').hidden = true;
      if (s.outline) k.outline(true);
    }, sc);
    await page.waitForTimeout(600);
    await page.evaluate((s) => {
      const k = window.__kristal;
      const sol = k.solve();
      sol.slice(0, s.keep).forEach((c) => k.tap(c));
      if (s.freeze) k.freeze(performance.now() + s.freeze);
    }, sc);
    await page.waitForTimeout(250);
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
        background:linear-gradient(175deg,#141a3a,#2b3070 55%,#8a7cc4);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#eef2ff;font-weight:800;font-size:${w * 0.072}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(5,8,30,.55);border:${w * 0.012}px solid rgba(238,242,255,.85)"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
for (const f of Object.values(raw)) rmSync(f);
console.log('done');
