// Usage: npm run preview -w games/yorunge -- --port 4185, then
//   node games/yorunge/scripts/screenshots.mjs <preview url> games/yorunge/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const scenes = [
  { name: '1-orbit', warp: 9 },
  { name: '2-hop', warp: 16, hop: true },
  { name: '3-best', warp: 27, over: true },
];
const captions = {
  en: ['One tap. Leave the orbit.', 'Hop from planet to planet', 'Chase your best score'],
  tr: ['Tek dokunuş. Yörüngeden çık.', 'Gezegenden gezegene atla', 'Rekorunu kovala'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(() => localStorage.setItem('yorunge.settings', JSON.stringify({ sound: false, haptics: false })));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    await page.evaluate((n) => window.__orbit.warp(n), sc.warp);
    await page.waitForTimeout(900);
    if (sc.hop) {
      await page.waitForFunction(() => window.__orbit.aligned(), null, { polling: 'raf' });
      await page.mouse.click(215, 700);
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__orbit.freeze(true));
    }
    if (sc.over) {
      await page.waitForFunction(() => window.__orbit.missing(), null, { polling: 'raf' });
      await page.mouse.click(215, 700);
      await page.waitForSelector('#gameover:not([hidden])');
      await page.waitForTimeout(500);
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
        background:radial-gradient(120% 70% at 50% 0%,#3a3f8f,#161a44 55%,#0b0f24);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 0 ${w * 0.08}px rgba(160,170,255,.35);border:${w * 0.012}px solid #c9d0ff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
for (const f of Object.values(raw)) rmSync(f);
console.log('done');
