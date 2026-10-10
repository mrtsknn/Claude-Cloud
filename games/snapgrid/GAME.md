# Snapgrid — Oyun Kartı

| | |
|---|---|
| **Tür** | Blok yerleştirme puzzle (8×8), hybrid-casual |
| **Referanslar** | Block Blast! (Hungry Studio), Woodoku (Tripledot), 1010! (Gram Games) |
| **Hedef kitle** | Herkes — 4+ yaş derecesi, cinsiyet/yaş nötr tema, metinsiz oynanış |
| **Oturum** | 3–8 dk, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.1.0 — Macera (200 seviye), güçlendiriciler, günün bulmacası |

## Pazar analizi

- Blok puzzle kategorisi 2024–2026 boyunca mobilde indirme sıralamasında sürekli ilk 10'da;
  Block Blast tek başına 2024'te ~40M+ DAU'ya ulaştı. Talep kanıtlı, oyuncu kuralı zaten biliyor
  → **sıfır öğrenme maliyeti**.
- Oyuncu profili ~%50/50 kadın/erkek, 18–65 geniş yaş bandı; yani "herkese hitap" kuralına
  birebir uyan nadir türlerden biri.
- Rakiplerin ortak şikâyetleri (mağaza yorumları): **aşırı reklam**, ağır/eski görünüm,
  "imkânsız" parça dağıtımı. Snapgrid'in farkı bu üçüne karşı konumlanır.

## Farklılaşma

1. **Adil dağıtım:** `dealTray` her turda en az bir parçanın sığmasını hedefler; tahta doluyken
   büyük parçalar seyrekleşir. Kayıp her zaman oyuncunun kararından gelir.
2. **Premium his:** cam efektli bloklar, satır temizlemede dönerek küçülme + parçacık,
   pentatonik (her zaman kulağa hoş gelen) sentez sesler, kademeli haptik.
3. **Saygılı monetizasyon:** ilk 2 oturumda geçiş reklamı yok, en az 120 sn aralık,
   ödüllü reklam sadece isteğe bağlı "Devam et".

## v1.1 — tür liderleriyle rekabet (Block Blast Adventure, Woodoku)

Block Blast'in büyümesini "Adventure" modu ve güçlendiriciler taşıdı: sonsuz mod tek başına D7'de
düşer, hedefli seviyeler + harita "bir seviye daha" döngüsü kurar. v1.1 bu açığı kapatır.

**Macera (200 seviye)** — `src/adventure.ts` (saf mantık + bot + üretici), `src/levels.json` (paket),
`scripts/gen-levels.mts` (`npm run levels -w games/snapgrid`).
- Her seviye: önceden dolu, ayna-simetrik (tasarlanmış görünen) tahta; hedefler: **elmas topla**
  (elmas, satırı/sütunu temizlenince toplanır), **N satır temizle**, **X puana ulaş**, **buz kır**
  (buz ilk temizlemede çatlar, ikincisinde kırılır). 10. seviyeden sonra çift hedefli seviyeler; her
  10'luğun sonu "boss" (daha az parça).
- Sınırlı parça: parça dizisi yalnızca seviye tohumuna bağlı (tahtadan bağımsız) — oyuncu, botun
  çözdüğü parçaların aynısını görür. Üretici her aday düzeni açgözlü botla oynatır, istenen uzunluğa
  en yakın olanı seçer; limit = bot parçası × gevşeklik (1.9 → 1.25), sonra tam limitte yeniden
  doğrulanır. Test: 200 seviyenin hepsi bot tarafından limit içinde çözülüyor.
- Yıldız: kalan parça ≥ %25 → 3, ≥ %10 → 2, yoksa 1 (devam alınırsa 1). Kazanınca `meta.showWin`
  (10 + 5×yıldız jeton), parça bitince/sıkışınca `meta.showFail` + devam (+3 parça; jeton 100/200/400 ya da video).
- Seviye başında hedef kartı; yeni mekanik ilk seviyelerde tek satırla anlatılır. Yarıda bırakılan
  seviye kaydedilir ve kaldığı yerden sürer.

**Güçlendiriciler** — `src/boosters.ts`: Bomba (3×3 patlatır, buzu çatlatır, elmas toplar),
Karıştır (yeni parçalar; macerada eldeki parça sayısı korunur), Tek blok (boş hücreye 1×1).
Yeni oyuncuya 2'şer adet; fiyat 150/100/120 jeton; her biri günde 1 ücretsiz. Sıkışınca oyun hemen
bitmez: "Yer kalmadı — güçlendirici kullan?" şeridi + zıplayan butonlar (en değerli an).

**Günün bulmacası** — tarihten tohumlanan, herkese aynı, iki hedefli bulmaca; seri sayacı, ödül
40 + 10×seri (7'de tavan). Ana menüde ayrı kart (seri alevi).

**His (juice)** — çoklu temizlemede ekran parlaması, satır sayısıyla büyüyen parçacık/sarsıntı ve
övgü yazısı, komboyla büyüyen kombo yazısı; elmas/buz hedef çipine uçar; < 3 yerleşim kalınca tahta
çerçevesinde hafif kırmızı nabız; rekor kırılınca konfeti (oyun içinde ve sonuç ekranında).

**Geri getirme ve yayılma** — ilk biten oyundan sonra bildirim izni + her gün 19:00 hatırlatma
(`scheduleReminders`); kazanma/oyun sonu ekranlarında "Paylaş" (`shareResult`, mağaza bağlantısıyla).

## Çekirdek döngü

Parçayı sürükle → tahtaya bırak → satır/sütun doldur → temizle → puan/kombo → yeni 3 parça.
Hiç yer kalmayınca oyun biter → bir kez "Devam et" (ödüllü) → "Tekrar oyna".

**Puanlama:** yerleştirilen hücre başına 1; aynı anda *n* satır = 10·n(n+1)/2 × kombo serisi;
tahtayı tamamen boşaltma +300.

## Özellik listesi (v1.0)

- [x] 8×8 tahta, 37 parça şekli, ağırlıklı ve adil dağıtım
- [x] Sürükleme önizlemesi: hayalet parça + temizlenecek satırların parlaması
- [x] Parmağın altında kalmaması için parça yukarı kaldırılır (dokunmatik)
- [x] Kombo serisi, övgü yazıları, "Kusursuz!" tahta temizleme bonusu
- [x] Sığmayan parçalar soluk gösterilir
- [x] Rekor, oyun içi "Yeni rekor!" bildirimi
- [x] Oyun durumu her hamlede kaydedilir; uygulama kapanıp açılınca kaldığı yerden devam
- [x] İlk açılışta metinsiz el animasyonu öğretici
- [x] Oyun sonu: tahta sırayla kararır, istatistikler (satır, hamle), bir kez "Devam et"
- [x] Ses ve titreşim ayarları, yeni oyun, gizlilik politikası bağlantısı, sürüm numarası
- [x] TR / EN yerelleştirme (cihaz diline göre)
- [x] Android geri tuşu, status bar, splash, dikey yön kilidi, safe-area
- [x] Mağaza değerlendirme isteği (≥4 oyun + rekor anı, 30 günde bir)
- [x] **Meta katmanı:** ana menü (oyuna özgü animasyonlu görsel), 3 günlük görev (oyun, satır, kombo, puan),
      7 günlük ödül takvimi, mağaza (6 blok paleti: Klasik, Pastel, Okyanus, Gün batımı, Orman, Neon),
      video ile ücretsiz jeton, uygulama içi satın alma (başlangıç paketi, reklamsız, jeton paketleri)
- [x] Duraklat menüsü; oyun sonunda jetonla (100/200/400) ya da videoyla devam
- [x] AdMob (geçiş + ödüllü) ve uygulama içi satın alma, test kimlikleriyle kurulu

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `first_open`, `session_start` | `session`, `day` | D1/D7 retention |
| `game_start` | `resumed` | huni başı |
| `tutorial_complete` | — | ilk hamle oranı (hedef >%95) |
| `game_over` | `score, lines, moves, duration_s, best, revived` | zorluk ayarı |
| `revive`, `ad_rewarded_*` | `placement`, `granted` | ödüllü reklam kabul oranı |
| `new_best`, `game_abandon`, `review_prompt`, `ad_interstitial` | — | — |
| `level_start`, `level_complete`, `level_fail`, `level_continue`, `level_restart` | `level, stars, used, limit, continues` | seviye hunisi, zorluk ayarı |
| `daily_challenge_start`, `daily_challenge_complete` | `stars` | günlük alışkanlık |
| `booster_use`, `booster_buy` | `id, mode, free, price` | güçlendirici ekonomisi |
| `share`, `reminders_scheduled` | — | viral katsayı, bildirim izni oranı |

## KPI hedefleri

| Metrik | Hedef | Kategori ortalaması |
|---|---|---|
| D1 retention | ≥ %40 | %35–45 |
| D7 retention | ≥ %15 | %12–18 |
| Ortalama oturum | ≥ 6 dk | 5–8 dk |
| Oyun / oturum | ≥ 2.5 | — |
| "Devam et" kabul oranı | ≥ %25 | — |

## Sonraki sürüm fikirleri (v1.1+)

- Seviye paketi 2 (201–400) — üretici hazır, `LEVEL_COUNT` + `npm run levels`
- Güçlendirici paketleri IAP olarak (kit ürün listesine eklenmeli)
- Game Center / Google Play Games lider tablosu

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam ve doğrulandı (v1.1: 32 birim test — 200 seviyenin bot ile
çözülebilirliği dahil; typecheck, build; `scripts/e2e.mjs` gerçek sürüklemelerle meta → Macera 1–10 →
başarısız/devam → güçlendiriciler → sonsuz sıkışma/oyun sonu → günün bulmacası, konsol hatasız;
360×640 ve 430×932 düzenleri incelendi).

Yalnızca hesap sahibinin yapabileceği adımlar kaldı:

- [ ] AdMob: gerçek uygulama/reklam kimlikleri (AndroidManifest, Info.plist, `initAds({ units, testing: false })`)
- [ ] Play Console / App Store Connect'te ürünler: `remove_ads`, `starter_pack`, `coins_small`, `coins_large`
- [ ] `capacitor.config.ts` → `appId` kendi alan adınla (ör. `com.<adın>.snapgrid`), sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla (GitHub Pages / public repo) ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore oluştur ve AAB'yi imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md` metinleri, `store/screenshots`, yaş anketi, veri güvenliği formu
