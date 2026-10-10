# Mobile Game Studio

Bir günde mağazaya çıkabilecek kadar basit ve cilalı, herkese hitap eden mobil oyunlar.
Kurallar ve iş akışı: [`CLAUDE.md`](CLAUDE.md).

| Oyun | Tür | Durum |
|---|---|---|
| [Snapgrid](games/snapgrid/GAME.md) | Blok yerleştirme puzzle | v1.0.0 — mağazaya hazır |
| [Pour Sort](games/poursort/GAME.md) | Sıvı renk sıralama | v1.0.0 — mağazaya hazır |
| [Wordlink](games/wordlink/GAME.md) | Kelime bulmaca (TR/EN) | v1.0.0 — mağazaya hazır |

```bash
npm install
npm run dev -w games/snapgrid   # http://localhost:5173
npm test && npm run build
```

Yapı: `packages/kit` ortak modüller (ses, haptik, kayıt, analytics, reklam, native),
`games/<oyun>` her oyun (Vite + Capacitor, `android/` ve `ios/` projeleri dahil),
`docs/` fikir havuzu ve mağaza kontrol listesi.
