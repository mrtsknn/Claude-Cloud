// Usage: npm run preview -w games/karisim -- --port 4186, then
//   node games/karisim/scripts/screenshots.mjs <preview url> games/karisim/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// level, how many solution drops to add before capturing, extra: 'swirl' | 'win'
const scenes = [
  { name: '1-swirl', level: 23, add: 2, extra: 'swirl' },
  { name: '2-match', level: 12, add: 99, extra: 'win' },
  { name: '3-tubes', level: 128, add: 6 },
];
const captions = {
  en: ['Drop by drop, find the colour', 'Match the shade, earn three stars', '150 calm levels, up to 6 paints'],
  tr: ['Damla damla rengi bul', 'Tonu tuttur, üç yıldızı kap', '150 sakin seviye, 6 renge kadar'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(() => localStorage.setItem('karisim.settings', JSON.stringify({ sound: false, haptics: false })));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    await page.evaluate((l) => window.__karisim.goto(l), sc.level);
    await page.waitForTimeout(300);
    const seq = await page.evaluate(() => window.__karisim.solution());
    const n = Math.min(sc.add, seq.length);
    for (let k = 0; k < n; k++) {
      await page.click(`.tube[data-i="${seq[k]}"]`);
      await page.waitForTimeout(k === n - 1 && sc.extra === 'swirl' ? 0 : 160);
    }
    if (sc.extra === 'swirl') {
      await page.waitForTimeout(480 + 260); // drop has landed, ribbon still spiralling
      await page.evaluate(() => window.__karisim.freeze(0));
    } else if (sc.extra === 'win') await page.waitForSelector('#win:not([hidden])');
    await page.waitForTimeout(sc.extra === 'win' ? 900 : 1200);
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
        background:linear-gradient(180deg,#f4f5f7,#cdd2da);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#1b1e24;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(27,30,36,.28);border:${w * 0.012}px solid #ffffff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
for (const f of Object.values(raw)) rmSync(f);
console.log('done');
