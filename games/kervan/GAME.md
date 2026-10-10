# Kervan (Caravan Tycoon) — Oyun Kartı

| | |
|---|---|
| **Tür** | Idle / tycoon, tıklama destekli |
| **Referanslar** | AdVenture Capitalist, Idle Miner Tycoon, Egg Inc. |
| **Hedef kitle** | Herkes — 4+, şiddet/siyaset/din yok, kurgusal şehirler |
| **Oturum** | 1–5 dk aktif, gün içinde birkaç kez dönüş (çevrimdışı kazanç) |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

## Pazar ve özgünlük

- Idle/tycoon, uzun ömürlü (D30) ve ödüllü reklamla iyi para kazanan bir tür; en büyük başlıklar
  100M+ indirmeye ulaştı. Şikâyetler: zorla geçiş reklamı, sonradan duran ilerleme, karmaşık menüler.
- Kervan'ın farkı: **tek ekranda canlı harita** (develerin yürüdüğü kıvrımlı yol, vaha, kum tepeleri),
  sıcak çöl paleti, hurma/çay/baharat/seramik/halı/ipek gibi nötr mallar, kurgusal şehir adları.
  "İpek Yolu" havası, gerçek yer/siyaset/din referansı yok.
- **Geçiş reklamı yok:** idle akışta reklam kesintisi oyuncunun döndüğü anı (en değerli anı) bozar.
  Yalnızca isteğe bağlı ödüllü reklam: çevrimdışı kazancı x2, mağazada günde 5 video jeton.

## Meta katmanı (`@studio/kit` meta, bkz. `docs/META.md`)

- **Ana menü açılışta:** logo, slogan, jeton, ayarlar, görev şeridi, tek mod kartı **Kervanım / My caravan**
  (sonsuz mod = idle harita; kupa = ulaşılan en uzak şehir, `profile.best`, çağlar arası korunur),
  alt menü Görevler · Günlük · Mağaza. Kahraman görseli: kum tepesinin sırtında yürüyen iki develik kervan
  (canvas, seçili temanın renkleriyle, yalnızca menü görünürken çizilir).
- **Çevrimdışı "Tekrar hoş geldin" sayfası** menünün üstüne açılmaz: süre açılışta hesaplanır, oyuncu
  haritaya girince gösterilir.
- **İki para birimi:** altın (oyun ekonomisi, sıfırlanır) ve **jeton** (meta, kalıcı, premium). Jeton
  gümüş-yeşil token olarak çizilir (kit'in altın simgesi CSS ile yeniden renklendirilir), altınla karışmaz.
- **Pazar / Bazaar** (HUD'daki jeton düğmesi): jetonu `profile.spend` ile güçlendirmeye çevirir —
  *1 saatlik ticaret* (50 jeton: tüm şehirlerin 1 saatlik güçlendirmesiz geliri anında) ve
  *x2 gelir 30 dk* (80 jeton; 4 saate kadar birikir, çevrimdışı da işler, Yeni Çağ'da korunur).
  "Daha çok jeton" mağazanın jeton sekmesini açar. Altın asla jetona çevrilmez.
- **Görevler** (günde 3): `upgrades` (N yükseltme), `taps` (N dokunuş), `cityUnlock` (yeni şehir),
  `deliveries` (N kervan seferi). Olaylar toplanıp 1,5 sn'de bir `profile.progress` ile işlenir.
- **Mağaza görünümleri** (`src/skins.ts`, 6 harita teması): Altın kumlar (ücretsiz), Çölde akşam 150,
  Yeşil vaha 250, Karlı geçit 400 (çam ağaçları, karlı tepeler), Gece pazarı 600 (fener ışıltısı),
  Kızıl kanyon 900. Tema; kum gradyanı, tepeler, çakıllar, vaha, ağaçlar, yol, toz, şehir zemini ve
  develeri yeniden boyar.
- **Duraklat** (HUD ‖) → `meta.showPause`: Devam · Ayarlar (ses, titreşim, gizlilik, geri yükleme) · Menü.
  Idle haritada "baştan başla" anlamsız olduğu için o satır gizli. Android geri: sayfa kapat → sekme →
  duraklat; menüdeyken uygulamadan çık.
- **Reklam/IAP:** `initAds()` + `initStore()` açılışta (test kimlikleri); AdMob test uygulama kimliği
  AndroidManifest ve Info.plist'te.

## Çekirdek döngü

Şehre dokun (stoktaki altını topla + anlık bonus) → üretim/deve/hız yükselt → tüccar tut (şehir
kendi işler) → sonraki şehri aç → 6 şehir açılınca **Yeni Çağ**: şehirler sıfırlanır, kalıcı
İtibar yıldızı (+%10 gelir/yıldız) kazanılır.

## Ekonomi (`src/game.ts`, saf ve deterministik)

- Gelir/sn = `taban × seviye × kilometre taşı (25/50/100/200… her biri x2) × (1+0,5·(deve−1)) × (1+0,25·hız) × (1+0,1·yıldız)`
- Maliyet: üretim `taban × 1,15^(sv−1)`, deve `×2,4^n` (en çok 8), hız `×2,6^n` (en çok 8), tüccar tek seferlik.
- Tüccarsız şehirde gelir şehrin stoğunda birikir (60 sn tavanı), dokununca toplanır.
- Çevrimdışı: yalnızca tüccarlı şehirler, en çok 8 saat. Yıldız = `⌊√(bu çağdaki kazanç / 1e10)⌋`.

### Simülasyon eğrisi (`simulate()` — testte doğrulanıyor)

Simüle oyuncu: ilk 10 dk saniyede 1 dokunur, sonra boşta; önce tüccar, sonra açılabilecek şehir,
yoksa açılıştan önce kendini amorti eden en iyi ROI yükseltmesi.

| Kilometre taşı | Süre |
|---|---|
| Şehir 2 (Çaypınar) | 1,6 dk |
| Şehir 3 (Baharkapı) | 2,8 dk |
| Şehir 4 (Çinidere) | 6,2 dk |
| Şehir 5 (Halıova) | 24 dk |
| Şehir 6 (İpekkale) | 2,2 sa |
| İlk Yeni Çağ (10 yıldız = x2 gelir) | 3,2 sa |

## Özellikler (v1.0)

- [x] Canvas harita: kum tepeleri, vahalar, palmiyeler, kesik çizgili yol; kaydırılabilir
- [x] Develer yol boyunca sallanarak yürür, toz bulutu çıkar; varışta altın yazısı belirir
- [x] Dokunuşta şehir esner, altınlar kavisle sayaca uçar, tıngırtı sesi (rastgele perde), haptik
- [x] Şehir kartları: üretim / deve / hız / tüccar; alınabilir düğmeler nabız gibi atar
- [x] Kilometre taşlarında x2 + konfeti; şehir açılışında afiş + konfeti + fanfar
- [x] İtibar sekmesi: önce/sonra çarpanı, onay penceresi
- [x] Çevrimdışı kazanç sayfası, "x2 reklam izle"
- [x] Haritanın alt kenarına denk gelen şehrin etiketi artık kesilmez (kenara yapışır); etiketler
  develerin üstünde çizilir
- [x] 3 adımlı öğretici (şehre dokun → üretim al → deve al), el animasyonu
- [x] Sayaç yumuşak artar; 20 sn dokunulmazsa 30 FPS'e düşer
- [x] 5 sn'de bir ve arka plana geçişte kayıt; bozuk/eski kayıtlar `migrate()` ile onarılır
- [x] TR/EN, `<html lang>`; ayarlar kit duraklat sayfasında; Android geri tuşu
- [x] Değerlendirme isteği 3. şehir açılınca (kit, 30 günde bir)

## Analytics olayları

| Olay | Parametreler |
|---|---|
| `session_start`, `first_open` | kit (oturum, gün) |
| `tutorial_step` | `step` |
| `upgrade_buy` | `city, kind, level` |
| `city_unlock` | `city, run_time_s, prestiges` |
| `prestige` | `stars_gained, stars_total, run_time_s, prestiges` |
| `offline_claim` | `seconds, doubled, coins_log10` |
| `bazaar_open`, `bazaar_boost` | `kind (instant/boost), cost` |
| `home`, `daily_claim`, `mission_claim`, `skin_buy`, `iap` | kit meta |
| `ad_rewarded_*`, `review_prompt` | `placement` |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Öğretici tamamlama | ≥ %90 |
| 2. şehri açma | ≥ %85 |
| D1 / D7 / D30 retention | ≥ %40 / %18 / %6 |
| Çevrimdışı x2 kabul oranı | ≥ %35 |
| İlk Yeni Çağ'a ulaşma | ≥ %20 |
| Günlük görev tamamlama (en az 1) | ≥ %50 |
| Pazar kullanımı (D7 oyuncuları) | ≥ %30 |

## v1.1 fikirleri

x1/x10/max satın alma, "kalıcı x2" IAP, ikinci harita (deniz yolu).

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam: 22 birim test (format, maliyet, tick, çevrimdışı tavanı,
Pazar güçlendirmeleri, prestij, kayıt göçü, denge simülasyonu), typecheck, build, `scripts/e2e.mjs`
ile 49 kontrol (ana menü → günlük → mağaza tema al/kullan → görevler → oyna → dokun/yükselt → Pazar
jeton harcar → şehir aç → çevrimdışı sayfası → duraklat → menü → Yeni Çağ → yeniden yükleme; 390×844
ve 360×640), konsol hatasız. Mağaza görselleri ana menü dahil 4 sahne. Hesap sahibine kalan adımlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla, `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build**; release keystore ile AAB imzala
- [ ] iOS: Xcode'da Team seç, Archive → App Store Connect
- [ ] Mağaza: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
- [ ] Gerçek AdMob kimlikleri (`initAds({ units, testing: false })`, AndroidManifest, Info.plist) ve
      Play Console / App Store Connect'te kit ürünleri (başlangıç paketi, reklamsız, jeton paketleri)
