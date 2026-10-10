// Usage: npm run preview -w games/kovan -- --port 4197, then
//   node games/kovan/scripts/screenshots.mjs http://localhost:4197/ games/kovan/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// 6x6 meadow hive (expansion 3), a healthy mid-game spread of levels
const meadow = [
  9, 7, 0, 8, 6, 5,
  4, 8, 3, 0, 7, 2,
  6, 5, 9, 4, 0, 6,
  0, 3, 7, 5, 8, 1,
  2, 6, 0, 4, 3, 7,
  1, 0, 5, 2, 0, 4,
];
const base = { spawns: 640, merges: 900, gifts: 60, earned: 5e6, flowers: ['tulip'] };
const early = { ...base, honey: 1_284_500, hives: [{ cells: meadow, expansion: 3 }], world: 0, spawnLevel: 3, best: 9, quest: 15 };
// late game: four worlds, celestial bees in the forest
const forest = [
  17, 0, 19, 18, 16,
  15, 18, 0, 17, 21,
  16, 20, 17, 0, 15,
  0, 21, 16, 19, 18,
  18, 15, 0, 17, 16,
];
const orchard = Array.from({ length: 36 }, (_, i) => (i % 7 === 3 ? 0 : 10 + (i % 6)));
const late = {
  ...base, honey: 8.42e12, spawnLevel: 12, best: 21, quest: 34, merges: 9200, earned: 3e13, flowers: ['tulip', 'daisy', 'poppy'],
  hives: [{ cells: meadow.map((c) => (c ? c + 6 : 0)), expansion: 3 }, { cells: orchard, expansion: 3 }, { cells: forest, expansion: 1 }],
  world: 2,
};
const scenes = [
  { name: '1-hive', skin: 'amber', state: early },
  { name: '2-merge', skin: 'amber', state: late, merge: [9, 16] },
  { name: '3-worlds', skin: 'amber', state: late, worldSheet: 3 },
  { name: '4-quests', skin: 'night', state: { ...late, world: 1 } },
  { name: '5-festival', skin: 'amber', state: { ...late, flowers: ['tulip', 'daisy'], festival: { merges: 260 } }, festival: true },
  { name: '6-home', skin: 'amber', state: early, home: true },
  { name: '7-themes', skin: 'night', state: early, themes: true },
];
const captions = {
  en: ['Merge bees, make honey', '30 bees to discover', '4 worlds, all making honey', 'A quest chain full of rewards', 'Weekly flower festivals', 'Missions & daily rewards', 'Hive themes to collect'],
  tr: ['Arıları birleştir, bal yap', 'Keşfedilecek 30 arı', '4 dünya, hepsi bal yapıyor', 'Ödül dolu görev zinciri', 'Haftalık çiçek festivalleri', 'Görevler ve günlük ödüller', 'Koleksiyonluk kovan temaları'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(([h, skin]) => {
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem('kovan.hive', JSON.stringify({ ...h, lastSeen: Date.now() }));
      localStorage.setItem('kovan.settings', JSON.stringify({ sound: false, haptics: false }));
      localStorage.setItem('kovan.notif', JSON.stringify('on'));
      if (!localStorage.getItem('kovan.profile'))
        localStorage.setItem('kovan.profile', JSON.stringify({ coins: 1240, best: h.best, dailyLast: day, dailyStreak: 3, firstRun: false, owned: ['amber', 'mint', skin], skin }));
    }, [sc.merge ? { ...sc.state, best: 21 } : sc.state, sc.skin]);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(500);
    if (sc.festival) await page.evaluate((m) => (window.__kovan.state.festival.merges = m), sc.state.festival.merges);
    if (sc.home) {
      await page.evaluate(() => window.__kovan.profile.progress('merges', 12));
    } else {
      await page.click('[data-act="play-endless"]');
      await page.waitForTimeout(1500);
      if (sc.merge) {
        const [i, j] = sc.merge;
        const a = await page.evaluate((k) => window.__kovan.center(k), i);
        const b = await page.evaluate((k) => window.__kovan.center(k), j);
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(700);
      }
      if (sc.worldSheet) {
        await page.evaluate(() => (window.__kovan.state.best = 24));
        await page.click(`#worlds [data-w="${sc.worldSheet}"]`);
        await page.waitForTimeout(600);
      }
      if (sc.festival) {
        await page.click('#fest-btn');
        await page.waitForTimeout(600);
      }
      if (sc.themes) {
        await page.click('#menu-btn');
        await page.click('.m-sheet [data-menu]');
        await page.click('.m-nav [data-act="shop"]');
        await page.waitForTimeout(300);
      }
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
        background:linear-gradient(170deg,#ffc83d,#f39c12 50%,#a5560f);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#2b1a08;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(60,30,0,.45);border:${w * 0.012}px solid #ffffff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
