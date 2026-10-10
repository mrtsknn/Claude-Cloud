# Pour Sort — Oyun Kartı

| | |
|---|---|
| **Tür** | Sıvı/renk sıralama puzzle, seviye tabanlı |
| **Referanslar** | Water Sort Puzzle (IEC Global), SortPuz, Ball Sort Puzzle |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, renk körlüğü için sembol modu |
| **Oturum** | 1–3 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

## Pazar analizi

- "Water sort" alt türü 2020'den beri puzzle kategorisinin en çok indirilenleri arasında;
  tek bir başlık 100M+ indirmeye ulaştı. Kural evrensel, öğrenme maliyeti sıfır.
- Oyuncular yaş ve cinsiyet açısından dengeli dağılır; "rahatlatıcı", "zihin açan" konumlanma
  geniş kitleye hitap eder.
- Mağaza yorumlarındaki başlıca şikâyetler: **her seviyeden sonra reklam**, **çözülemeyen
  seviyeler**, renklerin birbirine çok benzemesi. Pour Sort bu üçünü hedef alıyor.

## Farklılaşma

1. **Her seviye kanıtlanmış çözülebilir:** `generateLevel` her karıştırmayı DFS çözücüyle
   doğrular. Sonsuz ve deterministik seviye: herkesin 57. seviyesi aynıdır.
2. **Erişilebilirlik:** ayarlarda 12 farklı şekilli renk sembolleri; palet erken seviyelerde
   en ayırt edilebilir renkleri kullanacak şekilde sıralı.
3. **Adil yardım:** her seviyede 5 ücretsiz geri alma ve 1 ücretsiz ipucu; ipucu gerçek
   çözücüden gelir. Çıkmaz durumda dürüstçe "buradan çıkış yok" der.
4. **Saygılı reklam:** geçiş reklamı ancak 5. seviyeden sonra ve en az 120 sn aralıkla.

## Çekirdek döngü

Tüpe dokun (kalkar) → hedef tüpe dokun → üstteki aynı renkli sıvı akar → dolan tüp
mantarla kapanır → tüm tüpler tek renk → konfeti → sonraki seviye.

## Zorluk eğrisi

| Seviye | Renk | Tüp |
|---|---|---|
| 1 | 2 | 4 (öğretici) |
| 2–3 | 3–4 | 5–6 |
| 4–14 | 5–7 | 7–9 |
| 15–24 | 8 | 10 |
| 25–89 | 9–11 | 11–13 |
| 90+ | 12 | 14 |

300 seviyenin üretimi toplam 1,7 sn sürüyor (masaüstünde en kötü seviye 220 ms).

## Özellik listesi (v1.0)

- [x] Seviye üretimi + çözücü doğrulaması, 12 renk, deterministik tohumlar
- [x] Seçilen tüp kalkar; döküş animasyonu: tüp hedefe gider, 100° eğilir, akış çizgisi, seviye yükselir
- [x] Dolan tüpe mantar + parçacık + akor sesi; seviye sonunda konfeti
- [x] Geçersiz hamlede tüp sallanır; başka bir tüpe dokunmak seçimi değiştirir
- [x] Geri al (seviye başına 5, bitince ödüllü reklamla +5)
- [x] İpucu (ilki ücretsiz, sonrası ödüllü), çözücüden gelen gerçek hamle
- [x] Ekstra boş tüp (seviye başına 1, ödüllü)
- [x] Seviyeyi yeniden başlat; hamle kalmayınca bildirim
- [x] 1. seviyede el animasyonlu öğretici (her adımı çözücü gösterir)
- [x] Her hamlede kayıt; kazanma ekranında kapatılsa bile ilerleme korunur
- [x] Ses, titreşim, renk sembolleri ayarları; gizlilik bağlantısı; sürüm
- [x] TR / EN; Android geri tuşu (önce seçimi/ayarları kapatır); açık zemin için status bar
- [x] Mağaza değerlendirme isteği (5. seviyeden sonra, 30 günde bir)

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, colors, resumed` | seviye hunisi |
| `level_complete` | `level, moves, undos_used, hints_used, extra_tube, duration_s` | zorluk ayarı |
| `level_restart`, `stuck` | `level, moves` | sinir bozucu seviyeleri bulma |
| `undo`, `hint`, `extra_tube` | `level` | yardım kullanımı |
| `ad_rewarded_*`, `ad_interstitial`, `review_prompt` | `placement` | monetizasyon |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 retention | ≥ %40 |
| D7 retention | ≥ %15 |
| Oturum başına seviye | ≥ 4 |
| Seviye 20'ye ulaşma | ≥ %35 |

## Sonraki sürüm fikirleri (v1.1+)

- Gizli renkler (üstteki hariç katmanlar "?") — zor seviye modu
- Günlük bulmaca + seri sayacı
- Tüp/arka plan temaları (kozmetik IAP), "reklamları kaldır" IAP
## Kontrol listesi durumu

Kodla yapılabilen her madde tamam ve doğrulandı: 17 birim test (8 seviyede çözücü doğrulaması
dahil), typecheck, build ve `scripts/e2e.mjs` ile headless tarayıcıda 11 kontrol (öğretici,
1–3. seviyeleri gerçek dokunuşlarla çözme, kazanma ekranı, geri al, ipucu, ekstra tüp, çıkmaz
bildirimi, 120. seviye + semboller, yeniden yüklemede ilerleme korunması), konsol hatasız.

Yalnızca hesap sahibinin yapabileceği adımlar kaldı:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla (ör. `com.<adın>.poursort`), sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla (GitHub Pages / public repo) ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore oluştur ve AAB'yi imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md` metinleri, `store/screenshots`, yaş anketi, veri güvenliği formu
