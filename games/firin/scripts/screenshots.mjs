// Usage: npm run preview -w games/firin, then
//   node games/firin/scripts/screenshots.mjs http://localhost:4192/ games/firin/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const profile = (skin) =>
  JSON.stringify({ coins: 1240, unlocked: 31, stars: Array.from({ length: 120 }, (_, i) => (i < 30 ? 2 + (i % 2) : 0)), skin, owned: ['classic', 'mint', 'sun'], firstRun: false, dailyLast: new Date().toISOString().slice(0, 10) });
const scenes = [
  { name: '1-play', level: 30, skin: 'classic', run: 3200 },
  { name: '2-home', skin: 'classic' },
  { name: '3-rush', level: 90, skin: 'sun', run: 3600 },
  { name: '4-shop', skin: 'mint', shop: true },
];
const captions = {
  en: ['Bake it golden, serve it fast', 'Missions, daily rewards, 120 levels', 'Busier counters, hotter ovens', 'Make the bakery yours'],
  tr: ['Altın gibi pişir, hızlı servis et', 'Görevler, günlük ödül, 120 seviye', 'Kalabalık tezgâh, kızgın fırınlar', 'Fırınını kendine göre süsle'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((p) => {
      localStorage.setItem('firin.profile', p);
      localStorage.setItem('firin.settings', JSON.stringify({ sound: false, haptics: false }));
    }, profile(sc.skin));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(600);
    if (sc.level) {
      await page.evaluate((l) => window.__firin.meta.hideHome() || window.__firin.start(l), sc.level);
      await page.evaluate(() => window.__firin.autoplay(2));
      await page.waitForTimeout(sc.run);
      await page.evaluate(() => window.__firin.autoplay(0));
      await page.waitForTimeout(150);
    }
    if (sc.shop) {
      await page.evaluate(() => window.__firin.meta.openShop('skins'));
      await page.waitForTimeout(300);
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
        background:linear-gradient(170deg,#c0602f,#8a3f1e 45%,#3a2318);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(30,10,0,.5);border:${w * 0.012}px solid #fff4e0"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
