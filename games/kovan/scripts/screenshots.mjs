// Usage: npm run preview -w games/kovan -- --port 4197, then
//   node games/kovan/scripts/screenshots.mjs http://localhost:4197/ games/kovan/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// 6x6 hive (expansion 3), a healthy mid-game spread of levels
const cells = [
  9, 7, 0, 8, 6, 5,
  4, 8, 3, 0, 7, 2,
  6, 5, 9, 4, 0, 6,
  0, 3, 7, 5, 8, 1,
  2, 6, 0, 4, 3, 7,
  1, 0, 5, 2, 0, 4,
];
const hive = { honey: 1_284_500, cells, expansion: 3, spawnLevel: 3, spawns: 640, best: 9, merges: 900 };
const scenes = [
  { name: '1-hive', skin: 'amber' },
  { name: '2-merge', skin: 'amber', merge: true },
  { name: '3-home', skin: 'amber', home: true },
  { name: '4-themes', skin: 'night', themes: true },
];
const captions = {
  en: ['Merge bees, make honey', '20 bees to discover', 'Missions & daily rewards', 'Hive themes to collect'],
  tr: ['Arıları birleştir, bal yap', 'Keşfedilecek 20 arı', 'Görevler ve günlük ödüller', 'Koleksiyonluk kovan temaları'],
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
      if (!localStorage.getItem('kovan.profile'))
        localStorage.setItem('kovan.profile', JSON.stringify({ coins: 1240, best: 9, dailyLast: day, dailyStreak: 3, firstRun: false, owned: ['amber', 'mint', skin], skin }));
    }, [sc.merge ? { ...hive, best: 8, cells: cells.map((c) => (c === 9 ? 8 : c)) } : hive, sc.skin]);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(500);
    if (sc.home) {
      await page.evaluate(() => window.__kovan.profile.progress('merges', 12));
    } else {
      await page.click('[data-act="play-endless"]');
      await page.waitForTimeout(1500);
      if (sc.merge) {
        const a = await page.evaluate(() => window.__kovan.center(0));
        const b = await page.evaluate(() => window.__kovan.center(14));
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(700);
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
