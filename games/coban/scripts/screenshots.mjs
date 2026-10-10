// Usage: npm run preview -w games/coban (port 4195), then
//   node games/coban/scripts/screenshots.mjs [url] [outDir]
// Captures scenes at phone size and composes captioned store images (en/tr × ios-6.9/ios-6.5/android).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const url = process.argv[2] ?? 'http://localhost:4195/';
const outDir = process.argv[3] ?? new URL('../store/screenshots', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const scenes = [
  { name: '1-home' },
  { name: '2-bark', level: 23, sim: 1, bark: true },
  { name: '3-animals', level: 44, sim: 0.5 },
  { name: '4-rush', rush: true, sim: 48 },
  { name: '5-wolf', level: 74, sim: 4 },
  { name: '6-train', train: true },
];
const captions = {
  en: ['Be the shepherd', 'Bark! Scatter them toward the pen', 'Lambs, goats, geese, mud & gates', 'Endless Rush — beat your best', '120 levels: ponds, fences, wolves', 'Train your dog, pick your breed'],
  tr: ['Çoban sensin', 'Havla! Sürüyü ağıla yönlendir', 'Kuzu, keçi, kaz, çamur ve kapı', 'Sonsuz koşu — rekorunu kır', '120 seviye: gölet, çit, kurt', 'Köpeğini eğit, cinsini seç'],
};
const profile = { coins: 940, unlocked: 45, stars: [3, 3, 2, 3, 3, 3, 2, 3, 3, 1, 3, 2, 3, 3, 3, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3], best: 37, firstRun: false, owned: ['collie', 'kangal'], skin: 'kangal' };
const tips = ['hint', 'bark', 'lamb', 'black', 'mud', 'goat', 'wolf', 'gate', 'goose'];

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript(([p, t]) => {
      const d = new Date();
      p.dailyLast = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem('coban.profile', JSON.stringify(p));
      localStorage.setItem('coban.settings', JSON.stringify({ sound: false, haptics: false }));
      localStorage.setItem('coban.upgrades', JSON.stringify({ speed: 2, bark: 1, cd: 1 }));
      localStorage.setItem('coban.tips', JSON.stringify(t));
    }, [profile, tips]);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(500);
    if (sc.level || sc.rush) {
      await page.evaluate(([l, s, rush]) => { rush ? window.__coban.rush() : window.__coban.start(l); window.__coban.sim(s); }, [sc.level, sc.sim, !!sc.rush]);
      if (sc.bark) {
        // wait until the herding bot lines up behind a group, then bark for real
        await page.evaluate(() => {
          const c = window.__coban;
          const near = () => {
            const s = c.state;
            return s.sheep.filter((a) => !a.penned && Math.hypot(a.x - s.dog.x, a.y - s.dog.y) < s.stats.barkR * 0.8).length;
          };
          for (let i = 0; i < 200 && !(c.plan().why === 'behind' && near() >= 3); i++) c.sim(0.1);
          c.bark();
        });
      }
      await page.evaluate(() => (document.getElementById('tip').hidden = true));
    }
    if (sc.train) await page.click('#train-btn');
    await page.waitForTimeout(sc.bark ? 140 : 300);
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
        background:linear-gradient(170deg,#9ad874,#4f9a44 45%,#2d5e2c);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.068}px;line-height:1.1;letter-spacing:-0.02em;text-shadow:0 ${w * 0.004}px 0 #2d5e2c">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(20,40,20,.45);border:${w * 0.012}px solid #ffffff"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
