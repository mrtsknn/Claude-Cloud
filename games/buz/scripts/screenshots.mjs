// Usage: npm run preview -w games/buz (port 4199), then
//   node games/buz/scripts/screenshots.mjs http://localhost:4199/ games/buz/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url = 'http://localhost:4199/', outDir = 'games/buz/store/screenshots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const scenes = [
  { name: '1-play', level: 14, moves: 2 },
  { name: '2-home' },
  { name: '3-mechanics', level: 160, moves: 1 },
  { name: '4-shop', shop: true },
];
const captions = {
  en: ['Swipe and slide on the ice', 'Missions, daily gifts, 200 levels', 'Portals, arrows and cracking ice', 'Dress up your little skater'],
  tr: ['Kaydır, buzda kay', 'Görevler, günlük hediyeler, 200 seviye', 'Portallar, oklar, çatlayan buz', 'Minik kaykçını giydir'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(() => {
      localStorage.setItem('buz.settings', JSON.stringify({ sound: false, haptics: false }));
    });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(400);
    if (sc.level) {
      await page.click('[data-act="play-level"]');
      await page.evaluate((n) => window.__buz.goto(n), sc.level);
      const sol = await page.evaluate(() => window.__buz.solve());
      for (const d of sol.slice(0, sc.moves)) {
        await page.evaluate((d) => window.__buz.move(d), d);
        await page.waitForFunction(() => !window.__buz.animating());
      }
      await page.waitForTimeout(600);
    } else if (sc.shop) {
      await page.click('.m-nav [data-act="shop"]');
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
        background:linear-gradient(170deg,#8fdcfa,#2a86c9 50%,#154f86);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(10,40,80,.45);border:${w * 0.012}px solid #ffffff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
