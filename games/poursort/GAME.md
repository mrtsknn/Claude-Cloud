# Pour Sort — Oyun Kartı

| | |
|---|---|
| **Tür** | Sıvı/renk sıralama puzzle, seviye tabanlı |
| **Referanslar** | Water Sort Puzzle (IEC Global), SortPuz, Ball Sort Puzzle |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, renk körlüğü için sembol modu |
| **Oturum** | 1–3 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.1.0 — meta katmanı (menü, harita, görevler, günlük ödül, mağaza, AdMob + IAP) |

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
3. **Adil yardım:** her seviyede 5 ücretsiz geri alma, 1 ücretsiz ipucu ve 1 ücretsiz ekstra tüp;
   sonrası jeton ya da isteğe bağlı video. İpucu gerçek çözücüden gelir; çıkmaz durumda ücret
   alınmaz, dürüstçe "buradan çıkış yok" der.
4. **Saygılı reklam:** geçiş reklamı ancak 5. seviyeden sonra ve en az 120 sn aralıkla.

## Çekirdek döngü

Tüpe dokun (kalkar) → hedef tüpe dokun → üstteki aynı renkli sıvı akar → dolan tüp
mantarla kapanır → tüm tüpler tek renk → konfeti → yıldız + jeton → sonraki seviye.

## Meta döngü (`@studio/kit` meta)

- **Ana menü:** logo, mevcut görünümde tüp rafı (hero), jeton, ayarlar, görev şeridi, "Seviye N" kartı;
  alt menü Seviyeler · Görevler · Günlük · Mağaza.
- **Seviye haritası:** 500 seviye, kilitli/açık, yıldızlı. 500'den sonrası "Seviye 500" kartından
  açık uçlu devam eder (seviye üretimi sonsuz).
- **Yıldız:** 3 = hiç yardım yok (geri alma, ipucu, ekstra tüp), 2 = en fazla 2 yardım, 1 = diğer.
  Kazanınca `meta.showWin` → jeton 10 + yıldız×5, videoyla x2.
- **Görevler (günde 3):** `levels`, `stars`, `perfect` (meta) + `pours` (N kez dök), `tubes` (N tüp kapat).
- **Ekonomi:** 2. ve sonraki ipucu = 30 jeton / video; ekstra tüp (seviye başına en fazla 2) ikincisi
  50 jeton / video; 5 geri alma bitince +5 = 20 jeton / video.
- **Mağaza:** 6 görünüm (Klasik, Pastel 300, Lagün 500, Mücevher 500, Retro 800, Neon 1200) —
  her biri 12 sıvı rengi + cam/kenar/mantar stili + arka plan; videoyla jeton, IAP paketleri.
- **Duraklat:** HUD butonu → `meta.showPause` (devam, baştan, ayarlar, menü); ayarlar meta içinde
  (ses, titreşim, renk sembolleri, satın alımları geri yükle, gizlilik).
- **Kayıt göçü:** v1.0 oyuncusunun ulaştığı seviye profile `unlocked` olarak, geçtiği seviyeler
  1 yıldız olarak taşınır; yarım kalan seviye yardımlarıyla birlikte devam eder.

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

## Özellik listesi (v1.1)

- [x] Seviye üretimi + çözücü doğrulaması, 12 renk, deterministik tohumlar
- [x] Seçilen tüp kalkar; döküş animasyonu: tüp hedefe gider, 100° eğilir, akış çizgisi, seviye yükselir
- [x] Dolan tüpe mantar + parçacık + akor sesi; seviye sonunda konfeti
- [x] Geçersiz hamlede tüp sallanır; başka bir tüpe dokunmak seçimi değiştirir
- [x] Geri al (seviye başına 5, bitince +5: jeton ya da video)
- [x] İpucu (ilki ücretsiz, sonrası jeton ya da video), çözücüden gelen gerçek hamle
- [x] Ekstra boş tüp (ilki ücretsiz, ikincisi jeton ya da video; seviye başına en fazla 2)
- [x] Meta katmanı: ana menü + hero, 500 seviyelik yıldızlı harita, günlük görevler, 7 günlük ödül,
      mağaza (6 görünüm, jeton, IAP), duraklat, kazan ekranı; AdMob + IAP (test kimlikleri)
- [x] Seviyeyi yeniden başlat; hamle kalmayınca bildirim
- [x] 1. seviyede el animasyonlu öğretici (her adımı çözücü gösterir)
- [x] Her hamlede kayıt; kazanma ekranında kapatılsa bile ilerleme korunur
- [x] Ses, titreşim, renk sembolleri ayarları (meta ayarlar sayfasında); gizlilik bağlantısı; sürüm
- [x] TR / EN; Android geri tuşu (sayfa → seçim → duraklat); açık zemin için status bar
- [x] Mağaza değerlendirme isteği (5. seviyeden sonra, 30 günde bir)

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, colors, resumed` | seviye hunisi |
| `level_complete` | `level, stars, moves, undos_used, hints_used, extra_tubes, duration_s` | zorluk ayarı |
| `level_restart`, `stuck` | `level, moves` | sinir bozucu seviyeleri bulma |
| `undo` | `level` | yardım kullanımı |
| `hint`, `extra_tube` | `level, paid` | ücretli yardım oranı |
| `coins_spend` | `placement, price` | jeton ekonomisi |
| `home`, `daily_claim`, `mission_claim`, `skin_buy`, `iap` | (kit meta) | meta katılımı |
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
## Kontrol listesi durumu

Kodla yapılabilen her madde tamam ve doğrulandı: 18 birim test (8 seviyede çözücü doğrulaması
ve yıldız kuralı dahil), typecheck, build ve `scripts/e2e.mjs` ile headless tarayıcıda 37 kontrol
(ana menü + hero, günlük ödül, mağazada görünüm satın alma/kullanma, görevler, 500 seviyelik
harita, 1. seviyeyi dokunuşlarla çözme, kazanma sayfası + yıldız/jeton, sonraki, duraklat/ayarlar,
geri al, ücretsiz/ücretli ipucu ve ekstra tüp, çıkmaz bildirimi, yeniden yüklemede ilerleme ve
görünüm, 120. seviye + semboller, v1.0 kaydının göçü), konsol hatasız. AdMob test uygulama
kimlikleri AndroidManifest / Info.plist'te; `cap sync` admob + native-purchases eklentilerini görüyor.

Yalnızca hesap sahibinin yapabileceği adımlar kaldı:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla (ör. `com.<adın>.poursort`), sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla (GitHub Pages / public repo) ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore oluştur ve AAB'yi imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md` metinleri, `store/screenshots`, yaş anketi, veri güvenliği formu
