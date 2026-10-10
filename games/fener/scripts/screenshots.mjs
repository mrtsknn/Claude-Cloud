// Usage: npm run preview -w games/fener -- --port 4182, then
//   node games/fener/scripts/screenshots.mjs <preview url> games/fener/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// Each scene sets up a board in the page through the window.__fener test hook.
// `home: true` shows the meta home menu instead of a board; `skin` equips a lamp-light theme.
const scenes = [
  { name: '1-light', level: 22, placed: 0.5, drag: true },
  { name: '2-too-bright', level: 45, placed: 0.5, double: true },
  { name: '3-town', level: 130, placed: 1, skin: 'moon' },
  { name: '4-home', home: true },
];
const captions = {
  en: ['Light up every window', 'Exactly once. Too bright glows red', '200 calm night-town puzzles', 'Lamp colors, missions, daily gifts'],
  tr: ['Her pencereyi aydınlat', 'Tam bir kez. Fazlası kırmızı yanar', '200 huzurlu gece bulmacası', 'Fener renkleri, görevler, günlük hediye'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((skin) => {
      localStorage.setItem('fener.settings', JSON.stringify({ sound: false, haptics: false }));
      // A player some way in: stars on the first levels, coins, today's daily already claimed.
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const stars = Array.from({ length: 200 }, (_, i) => (i < 23 ? (i % 5 === 3 ? 2 : 3) : 0));
      localStorage.setItem('fener.profile', JSON.stringify({ coins: 1240, stars, unlocked: 24, firstRun: false, dailyLast: today, dailyStreak: 3, owned: ['amber', 'moon', 'firefly'], skin }));
    }, sc.skin ?? 'amber');
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    if (!sc.home) await page.evaluate((sc) => {
      const f = window.__fener;
      f.goto(sc.level);
      const lvl = f.level;
      const n = lvl.tray.length;
      const k = Math.round(n * sc.placed);
      const placement = lvl.tray.map((_, i) => (i < k ? { ...lvl.solution[i] } : null));
      if (sc.double) {
        // put the next lamp somewhere that over-lights a window
        for (let c = 0; c < lvl.cells.length; c++) {
          const pos = { r: Math.floor(c / lvl.size), c: c % lvl.size };
          if (lvl.cells[c] !== 0 || placement.some((p) => p && p.r === pos.r && p.c === pos.c)) continue;
          const pl = placement.slice();
          pl[k] = pos;
          if (f.evaluate(pl).double.length) { placement[k] = pos; break; }
        }
      }
      f.load({ level: sc.level, placement, locked: placement.map(() => false), history: [], moves: k + 2, hints: 0, undos: 0 });
      if (sc.drag) f.dragTo(k, lvl.solution[k]);
    }, sc);
    await page.waitForTimeout(sc.home ? 2600 : 900);
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
        background:radial-gradient(120% 70% at 50% 0%,#2b3478,#0b0f2a);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#ffd27a;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.01em;text-shadow:0 0 ${w * 0.04}px rgba(255,190,90,.45)">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.1}px rgba(0,0,0,.6),0 0 ${w * 0.08}px rgba(255,190,90,.18);border:${w * 0.01}px solid rgba(255,255,255,.14)"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
for (const f of Object.values(raw)) rmSync(f);
console.log('done');
