# Mobile Game Studio

Bir günde mağazaya çıkabilecek kadar basit ve cilalı, herkese hitap eden mobil oyunlar.
Kurallar ve iş akışı: [`CLAUDE.md`](CLAUDE.md).

| Oyun | Tür | Durum |
|---|---|---|
| [Snapgrid](games/snapgrid/GAME.md) | Blok yerleştirme puzzle | v1.0.0 — mağazaya hazır |
| [Pour Sort](games/poursort/GAME.md) | Sıvı renk sıralama | v1.0.0 — mağazaya hazır |
| [Wordlink](games/wordlink/GAME.md) | Kelime bulmaca (TR/EN) | v1.0.0 — mağazaya hazır |
| [Devril](games/devril/GAME.md) | Domino zinciri bulmaca | v1.0.0 |
| [Fener](games/fener/GAME.md) | Işıkla tam örtme bulmacası | v1.0.0 |
| [Gelgit](games/gelgit/GAME.md) | Dalgaya karşı kum duvarı (sonsuz) | v1.0.0 |
| [Kervan](games/kervan/GAME.md) | İpek Yolu idle tycoon | v1.0.0 |
| [Yörünge](games/yorunge/GAME.md) | Tek dokunuş yörünge atlama | v1.0.0 |
| [Karışım](games/karisim/GAME.md) | Renk karıştırma | v1.0.0 |
| [Terazi](games/terazi/GAME.md) | Tork dengeleme | v1.0.0 |
| [Çark](games/cark/GAME.md) | Dişli zinciri | v1.0.0 |
| [Liman](games/liman/GAME.md) | Gemi yükleme sıralaması | v1.0.0 |
| [Kristal](games/kristal/GAME.md) | Simetri kar tanesi | v1.0.0 |

```bash
npm install
npm run dev -w games/snapgrid   # http://localhost:5173
npm test && npm run build
```

Yapı: `packages/kit` ortak modüller (ses, haptik, kayıt, analytics, reklam, native),
`games/<oyun>` her oyun (Vite + Capacitor, `android/` ve `ios/` projeleri dahil),
`docs/` fikir havuzu ve mağaza kontrol listesi.

> Meta katmanı (menü, harita, görevler, günlük ödül, mağaza, AdMob/IAP) `@studio/kit` içinde hazır; ilk 13 oyuna
> entegrasyonu sıradaki iş. Rehber: [`docs/META.md`](docs/META.md).
