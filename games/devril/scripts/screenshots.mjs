// Usage: npm run preview -w games/devril -- --port 4181, then
//   node games/devril/scripts/screenshots.mjs <preview url> games/devril/store/screenshots
// Captures gameplay scenes at phone size and composes captioned images at store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const scenes = [
  { name: '1-chain', level: 46, chain: 0.55 }, // frozen mid-topple
  { name: '2-puzzle', level: 128, skin: 'midnight' }, // big board with pinned tiles, shop theme
  { name: '3-stars', level: 18, win: true },
  { name: '4-home', home: true }, // meta home: hero dominoes, missions, level card
];
const captions = {
  en: ['Turn the tiles. Push once.', 'Plan the perfect chain', 'Beat par for three stars', '200 levels, daily missions & themes'],
  tr: ['Taşları çevir, tek seferde devir', 'Kusursuz zinciri kur', 'Hedefi tuttur, üç yıldız al', '200 seviye, günlük görevler ve temalar'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(() => localStorage.setItem('devril.settings', JSON.stringify({ sound: false, haptics: false })));
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(300);
    if (sc.home) {
      // A player a few days in: 17 levels done, some coins; hero frozen mid-topple.
      await page.evaluate(() => {
        const p = window.__devril.profile;
        p.data.unlocked = 18;
        for (let i = 0; i < 17; i++) p.data.stars[i] = i % 4 === 2 ? 2 : 3;
        p.data.coins = 340;
        p.progress('levels', 1);
        document.querySelectorAll('.hero i').forEach((el, i) => {
          el.style.animationDelay = `${-(1.25 - i * 0.16)}s`;
          el.style.animationPlayState = 'paused';
        });
      });
      await page.waitForTimeout(200);
    } else {
      if (sc.skin) await page.evaluate((id) => window.__devril.skin(id), sc.skin);
      await page.evaluate((l) => window.__devril.goto(l), sc.level);
      await page.waitForTimeout(300);
    }
    if (sc.chain || sc.win) {
      await page.evaluate(() => {
        const d = window.__devril;
        const s = d.state;
        const target = d.optimal();
        const taps = target.reduce((n, t, i) => n + ((t - s.dirs[i] + 4) % 4), 0);
        d.load({ ...s, dirs: target, taps });
        d.push();
      });
    }
    if (sc.chain) {
      await page.evaluate((f) => {
        const n = window.__devril.level.tiles.length;
        window.__devril.freeze(n * 150 * f);
      }, sc.chain);
      await page.waitForTimeout(200);
    }
    if (sc.win) await page.waitForTimeout(6000);
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
        background:linear-gradient(170deg,#7fa886,#4f7a5a 50%,#3c5a44);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fffdf8;font-weight:800;font-size:${w * 0.072}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(20,40,25,.45);border:${w * 0.012}px solid #fffdf8"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
for (const f of Object.values(raw)) rmSync(f);
console.log('done');
