// Usage: npm run preview -w games/kristal -- --port 4190, then
//   node games/kristal/scripts/screenshots.mjs <preview url> games/kristal/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// keep: how many solution taps to play; freeze: ms after the last tap to pin the clock
const scenes = [
  { name: '1-match', level: 33, keep: 2, outline: true },
  { name: '2-ripple', level: 70, keep: 3, freeze: 140 },
  { name: '3-sparkle', level: 125, keep: 99, freeze: 520 },
];
const captions = {
  en: ['Match the snowflake', 'One tap, six reflections', 'Calm, crystal-clear puzzles'],
  tr: ['Kar tanesini eşleştir', 'Tek dokunuş, altı yansıma', 'Sakin, kristal gibi bulmacalar'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(() => localStorage.setItem('kristal.settings', JSON.stringify({ sound: false, haptics: false })));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
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
