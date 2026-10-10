// Usage: npm run preview -w games/comlek, then
//   node games/comlek/scripts/screenshots.mjs <preview url> games/comlek/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url = 'http://localhost:4200/', outDir = 'games/comlek/store/screenshots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const ALL = ['terracotta', 'celadon', 'honey', 'cobalt', 'speckle', 'rose', 'iznik', 'obsidian'];
const profile = { coins: 640, unlocked: 31, stars: Array.from({ length: 120 }, (_, i) => (i < 30 ? 1 + ((i * 7) % 3) : 0)), owned: ALL, skin: 'iznik', firstRun: false, dailyLast: new Date().toISOString().slice(0, 10) };
const scenes = [
  { name: '1-home' },
  { name: '2-shape', level: 30, sculpt: 0.55 },
  { name: '3-glaze', level: 31, glaze: 'cobalt' },
  { name: '4-map', map: true },
];
const captions = {
  en: ['Relaxing pottery', 'Press the spinning clay into shape', 'Fire it and pick a glaze', '120 pots to master'],
  tr: ['Rahatlatan çömlekçilik', 'Dönen çamura şekil ver', 'Fırınla, sırını seç', 'Ustalaşacak 120 çömlek'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((p) => {
      p.dailyLast = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
      localStorage.setItem('comlek.profile', JSON.stringify(p));
      localStorage.setItem('comlek.settings', JSON.stringify({ sound: false, haptics: false }));
    }, profile);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(400);
    if (sc.map) await page.click('[data-act="map"]');
    if (sc.level) {
      await page.evaluate((n) => window.__comlek.start(n), sc.level);
      if (sc.sculpt) {
        await page.evaluate((k) => {
          const s = window.__comlek.state;
          window.__comlek.set(s.target.map((r, i) => (i < 60 * k ? r : Math.min(0.88, r + 0.18 * ((i / 60 - k) / (1 - k))))));
        }, sc.sculpt);
      }
      if (sc.glaze) {
        await page.evaluate((g) => {
          window.__comlek.set(window.__comlek.state.target);
          window.__comlek.fire();
          window.__comlek.glaze(g);
        }, sc.glaze);
        await page.waitForTimeout(1000);
      }
    }
    await page.waitForTimeout(400);
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
        background:linear-gradient(170deg,#e09468,#b8603a 50%,#6e3820);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.072}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(40,20,10,.45);border:${w * 0.012}px solid #fffaf3"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
