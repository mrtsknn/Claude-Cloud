// Usage: npm run preview -w games/liman -- --port 4189, then
//   node games/liman/scripts/screenshots.mjs http://localhost:4189/ games/liman/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

// Each scene: level + how many solution moves to play (+ optional extras) and the ship theme.
// 'wrong' stacks a later port's box on an earlier one so the red wrong-stack outline shows.
let scenes = [
  { name: '1-load', level: 24, play: 4, skin: 'classic' },
  { name: '2-rules', level: 44, play: 3, wrong: true, skin: 'classic' },
  { name: '3-sail', level: 120, play: 99, sail: 1500, skin: 'midnight' },
  { name: '4-home', level: 24, home: true, skin: 'classic' },
];
const captions = {
  en: ['Load the ship, port by port', 'Stack right, keep her level', 'Sail the route, unload in order', '150 levels, 7 ships, daily rewards'],
  tr: ['Gemiyi liman liman yükle', 'Doğru istifle, dengede tut', 'Rotayı izle, sırayla boşalt', '150 seviye, 7 gemi, günlük ödüller'],
};

if (process.env.ONLY) scenes = scenes.filter((s) => s.name.includes(process.env.ONLY));
const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((skin) => {
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const stars = Array.from({ length: 150 }, (_, i) => (i < 23 ? [3, 3, 2, 3, 3, 1, 3][i % 7] : 0));
      localStorage.setItem('liman.settings', JSON.stringify({ sound: false, haptics: false }));
      localStorage.setItem('liman.migrated', 'true');
      localStorage.setItem('liman.profile', JSON.stringify({
        coins: 640, stars, unlocked: 24, best: 0, dailyLast: day, dailyStreak: 3, owned: ['classic', 'midnight', 'coral'], skin, firstRun: false,
      }));
    }, sc.skin);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error(sc.name, e.message, e.stack));
    await page.goto(url);
    await page.waitForTimeout(400);
    if (!sc.home) {
      await page.evaluate(async ({ level, play, wrong }) => {
        const g = window.__liman;
        g.goto(level);
        const plan = g.solve();
        const stage = document.getElementById('stage');
        const ev = (p) => {
          const r = stage.getBoundingClientRect();
          return new PointerEvent('pointerdown', { clientX: p.x + r.left, clientY: p.y + r.top });
        };
        const tapMove = async (m) => {
          stage.dispatchEvent(ev(g.point({ id: m.id })));
          stage.dispatchEvent(ev(m.to === -1 ? g.point('dock') : g.point({ col: m.to })));
          while (g.busy()) await new Promise((r) => setTimeout(r, 30));
        };
        for (const m of plan.slice(0, play)) await tapMove(m);
        if (wrong) {
          // An early-port box on a column with two free slots, then a later port's box on top of it.
          const s = g.state.ship;
          const H = g.lv.height;
          const early = s.dock.reduce((a, b) => (b.port < a.port ? b : a));
          const late = s.dock.reduce((a, b) => (b.port > a.port ? b : a));
          if (late.port <= early.port) throw new Error('scene needs two ports on the dock');
          const col = s.cols.findIndex((c) => c.length <= H - 2 && (!c.length || c.at(-1).port >= early.port));
          if (col < 0) throw new Error('no column for the wrong stack');
          await tapMove({ id: early.id, to: col });
          await tapMove({ id: late.id, to: col });
          if (g.state.ship.cols[col].at(-1)?.id !== late.id) throw new Error('wrong stack not built');
        }
      }, sc);
    }
    if (sc.sail) {
      await page.click('#sail-btn', { force: true });
      await page.waitForTimeout(sc.sail);
      await page.evaluate(() => window.__liman.freeze(0));
    }
    await page.waitForTimeout(sc.home ? 1500 : 500);
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
        background:linear-gradient(170deg,#2cc1c4,#0f8b8d 50%,#0b5f78);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(5,40,60,.45);border:${w * 0.012}px solid #ffffff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
for (const f of Object.values(raw)) rmSync(f);
console.log('done');
