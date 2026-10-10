// Usage: npm run preview -w games/makas (port 4191), then
//   node games/makas/scripts/screenshots.mjs http://localhost:4191/ games/makas/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url = 'http://localhost:4191/', outDir = 'games/makas/store/screenshots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const scenes = [
  { name: '1-play', level: 12, seconds: 9 },
  { name: '2-junctions', level: 90, seconds: 16, skin: 'night' },
  { name: '3-home', home: true },
  { name: '4-neon', level: 140, seconds: 12, skin: 'neon' },
];
const captions = {
  en: ['Flip switches, route the trains', 'Two tunnels, seven stations, one cool head', 'Missions, daily rewards, 150 levels', 'Unlock seven train themes'],
  tr: ['Makası çevir, treni yönlendir', 'İki tünel, yedi istasyon, soğukkanlılık', 'Görevler, günlük ödül, 150 seviye', 'Yedi tren temasının kilidini aç'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((skin) => {
      localStorage.setItem('makas.settings', JSON.stringify({ sound: false, haptics: false }));
      const stars = Array(150).fill(0).map((_, i) => (i < 23 ? 3 - (i % 3 === 2 ? 1 : 0) : 0));
      localStorage.setItem('makas.profile', JSON.stringify({ coins: 1240, stars, unlocked: 24, firstRun: false, dailyLast: new Date().toISOString().slice(0, 10), owned: ['classic', 'night', 'neon'], skin: skin ?? 'classic' }));
    }, sc.skin);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(500);
    if (!sc.home) {
      await page.evaluate(([n, s]) => window.__makas.scene(n, s), [sc.level, sc.seconds]);
      await page.waitForTimeout(400);
    } else {
      await page.evaluate(() => document.querySelector('.m-overlay')?.setAttribute('hidden', ''));
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
        background:linear-gradient(170deg,#ffcf3f,#ff9f1c 55%,#e85d04);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#1c2a20;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(60,30,0,.45);border:${w * 0.012}px solid #1c2a20"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
