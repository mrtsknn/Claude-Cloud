// Usage: npm run preview -w games/ikiz, then
//   node games/ikiz/scripts/screenshots.mjs <preview url> games/ikiz/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url = 'http://localhost:4193/', outDir = 'games/ikiz/store/screenshots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const scenes = [
  { name: '1-play', level: 6, moves: 2 },
  { name: '2-home' },
  { name: '3-spikes', level: 40, moves: 3 },
  { name: '4-keys', level: 80, moves: 4, hint: true },
];
const captions = {
  en: ['One swipe, two twins', 'Missions, daily rewards, styles', 'Mirror moves, tricky spikes', '150 levels with keys & doors'],
  tr: ['Tek kaydırma, iki ikiz', 'Görevler, günlük ödül, görünümler', 'Ayna hamleler, sinsi dikenler', 'Anahtar ve kapılarla 150 seviye'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(() => localStorage.setItem('ikiz.settings', JSON.stringify({ sound: false, haptics: false })));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(400);
    if (sc.level) {
      await page.evaluate((n) => window.__ikiz.play(n), sc.level);
      await page.waitForTimeout(200);
      const path = await page.evaluate(() => window.__ikiz.solve());
      for (const d of path.slice(0, sc.moves)) {
        await page.keyboard.press({ U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }[d]);
        await page.waitForTimeout(200);
      }
      if (sc.hint) await page.click('#hint-btn');
      await page.waitForTimeout(400);
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
        background:radial-gradient(120% 80% at 50% 0%,#6876e0,#3d4590);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
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
