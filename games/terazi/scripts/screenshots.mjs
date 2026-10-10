// Usage: npm run preview -w games/terazi -- --port 4187, then
//   node games/terazi/scripts/screenshots.mjs http://localhost:4187/ games/terazi/store/screenshots
// Captures gameplay scenes and the home menu at phone size and composes captioned images at store
// resolutions. Each scene uses a different material from the shop.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// keep: indexes of the solution that are already hanging.
const scenes = [
  { name: '1-tilt', level: 14, keep: [0, 1, 2], skin: 'brass' },
  { name: '2-balanced', level: 22, keep: 'all', skin: 'marble' },
  { name: '3-stack', level: 120, keep: [0, 1, 2, 3, 4], skin: 'wood' },
  { name: '4-home', home: true, skin: 'brass' },
];
const captions = {
  en: ['Find the perfect balance', 'Every weight counts', 'Stack, plan, level out', '150 calm levels & daily rewards'],
  tr: ['Mükemmel dengeyi bul', 'Her ağırlık önemli', 'Üst üste as, planla, dengele', '150 sakin seviye, günlük ödüller'],
};
// A player a few days in: progress on the map, some coins, materials owned, today's reward claimed.
const today = new Date();
const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const profileFor = (skin) => ({
  coins: 1240,
  stars: Array.from({ length: 150 }, (_, i) => (i < 23 ? [3, 3, 2, 3, 3, 1, 3, 2][i % 8] : 0)),
  unlocked: 24,
  dailyLast: dayKey,
  dailyStreak: 3,
  owned: ['brass', 'wood', 'marble'],
  skin,
  firstRun: false,
});

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((profile) => {
      localStorage.setItem('terazi.settings', JSON.stringify({ sound: false, haptics: false }));
      localStorage.setItem('terazi.migrated', 'true');
      localStorage.setItem('terazi.profile', JSON.stringify(profile));
    }, profileFor(sc.skin));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(sc.home ? 3200 : 300); // home: let the hero scale settle level
    if (!sc.home) await page.evaluate(({ level, keep }) => {
      const api = window.__terazi;
      api.goto(level);
      const sol = api.level.solution;
      const pos = sol.map((d, i) => (keep === 'all' || keep.includes(i) ? d : null));
      api.load({ level, pos, locked: pos.map(() => false), history: [], moves: pos.filter((d) => d !== null).length, hintsUsed: 0 });
      api.freeze(true);
    }, sc);
    await page.evaluate(() => (document.getElementById('toast').hidden = true));
    if (sc.home) await page.evaluate(() => document.querySelector('.m-toast')?.setAttribute('hidden', ''));
    await page.waitForTimeout(300);
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
        background:linear-gradient(170deg,#557688,#3e5c6e 50%,#26333d);font-family:Georgia,'Times New Roman',serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fbfaf7;font-weight:700;font-size:${w * 0.07}px;line-height:1.1">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(10,20,30,.45);border:${w * 0.012}px solid #e6c47a"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
for (const f of Object.values(raw)) rmSync(f);
await browser.close();
console.log('done');
