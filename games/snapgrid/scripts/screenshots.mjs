// Usage: node games/snapgrid/scripts/screenshots.mjs <preview url> games/snapgrid/store/screenshots
// Store screenshots: captures gameplay scenes at phone size, then composes framed, captioned
// marketing images at the exact store resolutions.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
const [url, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const B = (rows) => rows.join('').split('').map((ch) => (ch === '.' ? 0 : Number(ch)));
const P = (rows, color) => {
  const cells = [];
  rows.forEach((l, r) => [...l].forEach((ch, c) => ch === '#' && cells.push([r, c])));
  return { cells, w: Math.max(...rows.map((l) => l.length)), h: rows.length, color };
};

const scenes = [
  {
    name: '1-play',
    save: {
      board: B(['........', '..55....', '..5...7.', '.....77.', '1..44...', '11.44.33', '222.6633', '22..6633']),
      tray: [P(['##'], 2), P(['.#', '##'], 6), P(['###'], 4)],
      score: 860, streak: 1, moves: 31, lines: 12,
    },
    drag: { slot: 1, row: 6, col: 2 },
  },
  {
    name: '2-combo',
    save: {
      board: B(['........', '.....3..', '..3333..', '1111.111', '2222.226', '4444.444', '..55....', '..55..7.']),
      tray: [P(['#', '#', '#'], 5), P(['##', '##'], 7), null],
      score: 1420, streak: 3, moves: 52, lines: 24,
    },
    drop: { slot: 0, row: 3, col: 4 },
  },
  {
    name: '4-home',
    home: true,
    save: { board: new Array(64).fill(0), tray: [P(['#'], 1), P(['#'], 1), P(['#'], 1)], score: 0, streak: 0, moves: 0, lines: 0 },
  },
  {
    name: '3-calm',
    save: {
      board: B(['7.......', '77......', '........', '...44...', '...44...', '........', '......22', '1.....22']),
      tray: [P(['###', '#..', '#..'], 3), P(['#####'], 5), P(['.#.', '###'], 1)],
      score: 2310, streak: 0, moves: 88, lines: 41,
    },
  },
];

const captions = {
  en: ['Drag. Drop. Clear.', 'Chain combos for huge scores', 'Daily missions and rewards', 'Relaxing, no timer, no rush'],
  tr: ['Sürükle. Bırak. Temizle.', 'Komboları zincirle, puanı katla', 'Günlük görevler ve ödüller', 'Rahatlatıcı, süre yok, acele yok'],
};

const browser = await chromium.launch();
const raw = {};
for (const lang of ['en', 'tr']) {
  for (const sc of scenes) {
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
    await ctx.addInitScript((save) => {
      localStorage.setItem('snapgrid.save', JSON.stringify(save));
      localStorage.setItem('snapgrid.best', JSON.stringify(3120));
      localStorage.setItem('snapgrid.tutorialDone', 'true');
      const d = new Date(); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem('snapgrid.profile', JSON.stringify({ coins: 1240, best: 3120, dailyLast: k, dailyStreak: 3, firstRun: false }));
    }, sc.save);
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForTimeout(600);
    if (sc.home) {
      await page.waitForTimeout(1200);
    } else {
      await page.click('[data-act="play-endless"]');
      await page.waitForTimeout(500);
    }
    const box = await page.locator('#stage').boundingBox();
    const L = JSON.parse(await page.locator('#stage').getAttribute('data-layout'));
    const bs = L.bs, cell = L.cell, bx = L.bx + box.x, by = L.by + box.y, ty = L.ty + box.y + L.th / 2;
    const act = sc.drag ?? sc.drop;
    if (act) {
      const piece = sc.save.tray[act.slot];
      await page.mouse.move(bx + bs / 6 + (act.slot * bs) / 3, ty);
      await page.mouse.down();
      await page.mouse.move(bx + (act.col + piece.w / 2) * cell, by + (act.row + piece.h / 2) * cell, { steps: 6 });
      if (sc.drop) {
        await page.mouse.up();
        await page.waitForTimeout(260);
      } else {
        await page.waitForTimeout(120);
      }
    }
    const file = `${outDir}/raw-${lang}-${sc.name}.png`;
    await page.screenshot({ path: file });
    raw[`${lang}-${sc.name}`] = file;
    await ctx.close();
  }
}

// Compose marketing frames: caption on top, device screenshot below.
const sizes = { 'ios-6.9': [1290, 2796], 'ios-6.5': [1242, 2688], android: [1080, 1920] };
for (const [lang, caps] of Object.entries(captions)) {
  for (const [i, sc] of scenes.entries()) {
    const img = readFileSync(raw[`${lang}-${sc.name}`]).toString('base64');
    for (const [label, [w, h]] of Object.entries(sizes)) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const shotH = h * 0.78;
      const shotW = (shotH * 430) / 932;
      await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;
        background:radial-gradient(120% 70% at 50% 0%,#33408a,#10142a);font-family:system-ui,sans-serif;">
        <div style="height:${h * 0.17}px;display:flex;align-items:center;justify-content:center;padding:0 ${w * 0.08}px;text-align:center;
          color:#fff;font-weight:800;font-size:${w * 0.072}px;line-height:1.1;letter-spacing:-0.02em">${caps[i]}</div>
        <img src="data:image/png;base64,${img}" style="display:block;margin:0 auto;width:${shotW}px;height:${shotH}px;
          border-radius:${w * 0.06}px;box-shadow:0 ${w * 0.02}px ${w * 0.08}px rgba(0,0,0,.5);border:${w * 0.012}px solid #0b0e1f"/>
      </body></html>`);
      await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` }).catch(async () => {
        mkdirSync(`${outDir}/${lang}/${label}`, { recursive: true });
        await page.screenshot({ path: `${outDir}/${lang}/${label}/${sc.name}.png` });
      });
      await page.close();
    }
  }
}
await browser.close();
console.log('done');
