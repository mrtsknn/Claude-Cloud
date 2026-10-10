// Usage: npm run preview -w games/parasut, then
//   node games/parasut/scripts/screenshots.mjs <preview url> games/parasut/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url = 'http://localhost:4196/', outDir = 'games/parasut/store/screenshots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const scenes = ['1-drop', '2-land', '3-home', '4-shop'];
const captions = {
  en: ['Tap to open, tap to cut away', 'Hit the bullseye, build combos', 'Endless jumps + 100 challenges', 'Unlock parachute styles'],
  tr: ['Dokun aç, dokun kes', 'Tam isabet, kombo yap', 'Sonsuz atlayış + 100 meydan okuma', 'Paraşüt desenlerini aç'],
};
const seed = (skin) => ({
  coins: 640, stars: Array(100).fill(0).map((_, i) => (i < 14 ? 3 - (i % 2) : 0)), unlocked: 15, best: 480,
  dailyLast: new Date().toISOString().slice(0, 10), dailyStreak: 3, missionsDay: '', missions: [],
  owned: ['classic', 'ocean', 'sunset', 'rainbow'], skin, noAds: false, starterPack: false, adCoinsDay: '', adCoinsCount: 0, firstRun: false,
});

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    const skin = sc === '2-land' ? 'sunset' : 'rainbow';
    await ctx.addInitScript((p) => {
      localStorage.setItem('parasut.profile', JSON.stringify(p));
      localStorage.setItem('parasut.settings', JSON.stringify({ sound: false, haptics: false }));
      localStorage.setItem('parasut.landings', '10');
    }, seed(skin));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(500);
    const H = (fn, arg) => page.evaluate(fn, arg);
    if (sc === '1-drop' || sc === '2-land') {
      await page.click('[data-act="play-endless"]');
      await H((n) => window.__parasut.goto(n), sc === '1-drop' ? 14 : 3);
      await H(() => window.__parasut.speed(3));
      await H(() => window.__parasut.autoplay());
      if (sc === '1-drop') {
        await page.waitForFunction(() => window.__parasut.diver.phase === 'chute' && window.__parasut.diver.y < 70);
        await H(() => window.__parasut.speed(0));
      } else {
        await page.waitForFunction(() => window.__parasut.stage === 'landed', null, { timeout: 20000 });
        await H(() => window.__parasut.speed(0));
        await page.waitForTimeout(220);
      }
    } else if (sc === '4-shop') {
      await page.click('.m-nav [data-act="shop"]');
    }
    await page.waitForTimeout(sc === '2-land' ? 0 : 300);
    const file = `${outDir}/raw-${lang}-${sc}.png`;
    await page.screenshot({ path: file });
    raw[`${lang}-${sc}`] = file;
    await ctx.close();
  }
}

const sizes = { 'ios-6.9': [1290, 2796], 'ios-6.5': [1242, 2688], android: [1080, 1920] };
for (const [lang, caps] of Object.entries(captions)) {
  for (const [i, sc] of scenes.entries()) {
    const img = readFileSync(raw[`${lang}-${sc}`]).toString('base64');
    for (const [label, [w, h]] of Object.entries(sizes)) {
      mkdirSync(`${outDir}/${lang}/${label}`, { recursive: true });
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const shotH = h * 0.78;
      const shotW = (shotH * 430) / 932;
      await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;
        background:linear-gradient(170deg,#ff8a5c,#ff6b3d 40%,#1f7fc2);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(20,20,60,.45);border:${w * 0.012}px solid #ffffff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
