// Usage: npm run preview -w games/cark -- --port 4188, then
//   node games/cark/scripts/screenshots.mjs <preview url> games/cark/store/screenshots
// Captures gameplay scenes + the home menu at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// level + how many solution gears to place (all = solved and spinning); home = the meta menu
const scenes = [
  { name: '1-chain', level: 14, placed: 'all', skin: 'brass' },
  { name: '2-belts', level: 47, placed: 'all', skin: 'copper' },
  { name: '3-home', home: true, skin: 'brass' },
  { name: '4-levels', level: 128, placed: 3, skin: 'neon' },
];
const captions = {
  en: ['Connect the gears, start the clocks', 'Mind the spin: belts flip it', 'Daily missions, rewards & styles', '150 levels — use the fewest gears'],
  tr: ['Çarkları bağla, saatleri çalıştır', 'Yöne dikkat: kayış çevirir', 'Günlük görevler, ödüller, görünümler', '150 seviye — en az çarkla çöz'],
};
// a mid-game profile: some stars, coins, all styles owned
const profile = (skin) => ({
  coins: 1240,
  stars: Array.from({ length: 150 }, (_, i) => (i < 22 ? [3, 3, 2, 3, 1, 3][i % 6] : 0)),
  unlocked: 23,
  owned: ['brass', 'steel', 'copper', 'wood', 'candy', 'neon'],
  skin,
  firstRun: true,
});

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((p) => {
      if (location.protocol === 'about:') return;
      localStorage.setItem('cark.settings', JSON.stringify({ sound: false, haptics: false }));
      localStorage.setItem('cark.profile', JSON.stringify(p));
    }, profile(sc.skin));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    if (!sc.home) await page.evaluate(({ level, placed }) => {
      const c = window.__cark;
      c.goto(level);
      const sol = c.level.solution;
      const gears = placed === 'all' ? sol : sol.slice(0, placed);
      c.load({ level, gears: [...gears], locked: [], history: [], hintsUsed: 0 });
      c.freeze(4321);
    }, sc);
    await page.waitForTimeout(sc.home ? 1200 : 400);
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
        background:linear-gradient(170deg,#2c5d68,#173840 55%,#0d1d22);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#f6d47e;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(0,0,0,.5);border:${w * 0.012}px solid #d9a441"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
for (const f of Object.values(raw)) rmSync(f);
await browser.close();
console.log('done');
