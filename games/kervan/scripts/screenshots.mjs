// Usage: npm run preview -w games/kervan -- --port 4184, then
//   node games/kervan/scripts/screenshots.mjs http://localhost:4184/ games/kervan/store/screenshots
// Captures the home menu and mid-game scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const city = (level, camels, speed, merchant) => ({ level, camels, speed, merchant, stash: 0 });
const scenes = [
  {
    name: '1-route',
    state: { coins: 8.4e6, runEarned: 2e7, cities: [city(64, 5, 3, true), city(48, 4, 2, true), city(31, 3, 2, true), city(14, 2, 1, false)] },
    focus: 2,
    taps: [3, 3, 2],
  },
  {
    name: '2-upgrade',
    state: { coins: 3.2e9, runEarned: 9e9, stars: 4, cities: [city(110, 8, 6, true), city(84, 7, 5, true), city(66, 6, 4, true), city(52, 5, 3, true), city(26, 3, 1, false)] },
    focus: 4,
  },
  {
    name: '3-offline',
    state: { coins: 2.1e5, runEarned: 4e5, cities: [city(42, 4, 2, true), city(25, 3, 1, true), city(8, 1, 0, false)] },
    focus: 2,
    away: 3 * 3600,
  },
  {
    name: '4-home',
    home: true,
    state: { coins: 4.2e6, runEarned: 9e6, cities: [city(52, 5, 3, true), city(40, 4, 2, true), city(24, 3, 1, true), city(9, 1, 0, false)] },
    focus: 3,
  },
];
const captions = {
  en: ['Grow a desert trade route', 'Upgrade cities, hire camels', 'Merchants earn while you rest', 'Daily missions, rewards and map themes'],
  tr: ['Çölde ticaret yolunu büyüt', 'Şehirleri geliştir, deve al', 'Sen dinlenirken tüccarlar kazanır', 'Günlük görevler, ödüller ve harita temaları'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(() => {
      localStorage.setItem('kervan.settings', JSON.stringify({ sound: false, haptics: false }));
      const d = new Date();
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // a returning player: daily already claimed, a few coins, best = city 4
      localStorage.setItem('kervan.profile', JSON.stringify({ coins: 640, best: 4, dailyLast: k, dailyStreak: 3, firstRun: false }));
    });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    if (!sc.home) {
      await page.click('[data-act="play-endless"]');
      await page.waitForTimeout(300);
    }
    await page.evaluate(([s, f]) => {
      window.__kervan.load(s);
      window.__kervan.focus(f);
    }, [sc.state, sc.focus]);
    await page.waitForTimeout(1500);
    if (sc.away) await page.evaluate((sec) => window.__kervan.away(sec), sc.away);
    for (const i of sc.taps ?? []) {
      const box = await page.locator('#map').boundingBox();
      const p = await page.evaluate((i) => window.__kervan.cityScreen(i), i);
      await page.mouse.click(box.x + p.x, box.y + p.y);
      await page.waitForTimeout(90);
    }
    await page.waitForTimeout(sc.taps ? 260 : 600);
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
        background:linear-gradient(170deg,#f6c76a,#e39a52 50%,#c4583c);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#3d2817;font-weight:800;font-size:${w * 0.068}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(90,40,10,.45);border:${w * 0.012}px solid #fff8ea"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
for (const f of Object.values(raw)) rmSync(f);
await browser.close();
console.log('done');
