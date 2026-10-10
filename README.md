# Mobile Game Studio

Bir günde mağazaya çıkabilecek kadar basit ve cilalı, herkese hitap eden mobil oyunlar.
Kurallar ve iş akışı: [`CLAUDE.md`](CLAUDE.md).

| Oyun | Tür | Durum |
|---|---|---|
| [Snapgrid](games/snapgrid/GAME.md) | Blok yerleştirme (sonsuz) | v1 — meta + AdMob/IAP hazır |
| [Pour Sort](games/poursort/GAME.md) | Sıvı renk sıralama | v1 — meta + AdMob/IAP hazır |
| [Wordlink](games/wordlink/GAME.md) | Kelime bulmaca (TR/EN) | v1 — meta + AdMob/IAP hazır |
| [Devril](games/devril/GAME.md) | Domino zinciri | v1 — meta + AdMob/IAP hazır |
| [Fener](games/fener/GAME.md) | Işıkla tam örtme | v1 — meta + AdMob/IAP hazır |
| [Gelgit](games/gelgit/GAME.md) | Dalgaya karşı kale (sonsuz) | v1 — meta + AdMob/IAP hazır |
| [Kervan](games/kervan/GAME.md) | İpek Yolu idle tycoon | v1 — meta + AdMob/IAP hazır |
| [Yörünge](games/yorunge/GAME.md) | Tek dokunuş yörünge atlama | v1 — meta + AdMob/IAP hazır |
| [Karışım](games/karisim/GAME.md) | Renk karıştırma | v1 — meta + AdMob/IAP hazır |
| [Terazi](games/terazi/GAME.md) | Tork dengeleme | v1 — meta + AdMob/IAP hazır |
| [Çark](games/cark/GAME.md) | Dişli zinciri | v1 — meta + AdMob/IAP hazır |
| [Liman](games/liman/GAME.md) | Gemi yükleme | v1 — meta + AdMob/IAP hazır |
| [Kristal](games/kristal/GAME.md) | Simetri kar tanesi | v1 — meta + AdMob/IAP hazır |
| [Makas](games/makas/GAME.md) | Tren makasları (gerçek zamanlı) | v1 — meta + AdMob/IAP hazır |
| [Fırın](games/firin/GAME.md) | Fırın yönetimi (zaman) | v1 — meta + AdMob/IAP hazır |
| [İkiz](games/ikiz/GAME.md) | Ayna ikizler | v1 — meta + AdMob/IAP hazır |
| [Eğim](games/egim/GAME.md) | Tahtayı eğip bilye düşürme | v1 — meta + AdMob/IAP hazır |
| [Çoban](games/coban/GAME.md) | Koyun gütme | v1 — meta + AdMob/IAP hazır |
| [Paraşüt](games/parasut/GAME.md) | Zamanlama arcade | v1 — meta + AdMob/IAP hazır |
| [Kovan](games/kovan/GAME.md) | Birleştirmeli idle arı kovanı | v1 — meta + AdMob/IAP hazır |
| [Katla](games/katla/GAME.md) | Kâğıt katlama | v1 — meta + AdMob/IAP hazır |
| [Buz](games/buz/GAME.md) | Buzda kayma bulmacası | v1 — meta + AdMob/IAP hazır |
| [Çömlek](games/comlek/GAME.md) | Çömlek şekillendirme | v1 — meta + AdMob/IAP hazır |

```bash
npm install
npm run dev -w games/snapgrid   # http://localhost:5173
npm test && npm run build
```

Yapı: `packages/kit` ortak modüller (ses, haptik, kayıt, analytics, reklam, native),
`games/<oyun>` her oyun (Vite + Capacitor, `android/` ve `ios/` projeleri dahil),
`docs/` fikir havuzu ve mağaza kontrol listesi.

> Her oyunda ortak meta katmanı var: ana menü, seviye haritası/sonsuz mod, günlük görevler, 7 günlük ödül,
> mağaza (görünümler, jeton, reklamsız), AdMob + uygulama içi satın alma. Rehber: [`docs/META.md`](docs/META.md).
> Yayın öncesi hesap sahibinin adımları her oyunun `GAME.md` dosyasının sonunda.
