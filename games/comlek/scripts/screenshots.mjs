// Usage: npm run preview -w games/comlek, then
//   node games/comlek/scripts/screenshots.mjs <preview url> games/comlek/store/screenshots
// Captures scenes at phone size and composes captioned images at store resolutions:
// shaping close-up (finger on wet clay), decorated pot, collection shelf, home.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
const [url = 'http://localhost:4200/', outDir = 'games/comlek/store/screenshots'] = process.argv.slice(2);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const ALL = ['terracotta', 'celadon', 'honey', 'cobalt', 'speckle', 'rose', 'iznik', 'obsidian'];
const profile = { coins: 640, unlocked: 31, stars: Array.from({ length: 120 }, (_, i) => (i < 30 ? 1 + ((i * 7) % 3) : 0)), owned: ALL, skin: 'iznik', firstRun: false, best: 9 };
const scenes = [{ name: '1-shape' }, { name: '2-decorate' }, { name: '3-shelf' }, { name: '4-home' }];
const captions = {
  en: ['Feel the wet clay spin', 'Paint rings & patterns', 'Fill your collection shelf', 'Customer orders & a free studio'],
  tr: ['Islak çamuru parmaklarında hisset', 'Halkalar ve desenler boya', 'Koleksiyon rafını doldur', 'Siparişler ve serbest atölye'],
};

/** Fills the shelf through the real game flow (free studio pots, glazed and painted). */
async function seedShelf(page) {
  await page.evaluate(() => {
    const c = window.__comlek;
    const looks = [
      { lv: 41, g: 'iznik', b: [['ring', 6, 0], ['dots', 22, 0], ['ring', 52, 0]] },
      { lv: 2, g: 'honey', b: [['waves', 10, 0], ['ring', 4, 5]] },
      { lv: 33, g: 'celadon', b: [['leaves', 30, 6], ['ring', 50, 4]] },
      { lv: 57, g: 'obsidian', b: [['zigzag', 26, 3], ['ring', 8, 3]] },
      { lv: 7, g: 'speckle', b: [['ring', 12, 1], ['dots', 20, 2]] },
      { lv: 18, g: 'rose', b: [['waves', 34, 4], ['leaves', 16, 6]] },
      { lv: 64, g: 'cobalt', b: [] },
      { lv: 10, g: 'terracotta', b: [['zigzag', 18, 4], ['ring', 40, 5]] },
      { lv: 25, g: 'celadon', b: [['dots', 40, 4]] },
    ];
    for (const l of looks) {
      c.start(l.lv);
      const target = c.state.target.slice();
      c.free();
      c.set(target);
      c.fire();
      c.glaze(l.g);
      for (const [k, row, col] of l.b) (k === 'ring' ? c.paint(row, col) : c.stamp(k, row, col));
      c.finish();
    }
  });
}

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((p) => {
      const d = new Date();
      p.dailyLast = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!localStorage.getItem('comlek.profile')) localStorage.setItem('comlek.profile', JSON.stringify(p));
      localStorage.setItem('comlek.settings', JSON.stringify({ sound: false, haptics: false }));
    }, profile);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(400);
    if (sc.name === '1-shape') {
      await page.evaluate(() => window.__comlek.start(30));
      // a part-thrown pot: lower body matched, top still wide
      await page.evaluate(() => {
        const s = window.__comlek.state;
        window.__comlek.set(s.target.map((r, i) => (i < 36 ? r : Math.min(0.88, r + 0.2 * ((i - 36) / 24)))));
        window.__comlek.rings(0.75);
      });
      await page.waitForTimeout(1200);
      // a real finger pressing on the wet clay (slurry flicks, rings, hum)
      const box = await page.locator('#stage').boundingBox();
      const s = await page.evaluate(() => window.__comlek.state.clay[44]);
      const x = box.x + box.width / 2 + s * ((box.width / 2 - 12) / 1.3) + 4;
      const y = box.y + box.height * 0.42;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let k = 0; k < 10; k++) {
        await page.mouse.move(x - k * 0.6, y + k * 4);
        await page.waitForTimeout(40);
      }
    } else if (sc.name === '2-decorate') {
      await page.evaluate(() => {
        const c = window.__comlek;
        c.start(41);
        c.perfect();
        c.rings(0.5);
        c.fire();
        c.glaze('iznik');
        c.paint(5, 0);
        c.paint(6, 0);
        c.stamp('leaves', 16, 1);
        c.paint(25, 3);
        c.stamp('dots', 33, 0);
        c.stamp('waves', 44, 0);
        c.paint(57, 0);
      });
      await page.waitForTimeout(1600);
    } else if (sc.name === '3-shelf') {
      await seedShelf(page);
      await page.evaluate(() => window.__comlek.openShelf());
      await page.waitForTimeout(600);
    } else {
      await seedShelf(page);
      await page.reload();
      await page.waitForTimeout(600);
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
        background:linear-gradient(170deg,#e09468,#b8603a 50%,#6e3820);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.07}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(40,20,10,.45);border:${w * 0.012}px solid #fffaf3"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
for (const f of Object.values(raw)) rmSync(f, { force: true });
console.log('done');
