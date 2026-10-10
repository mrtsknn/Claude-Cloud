# Snapgrid — Oyun Kartı

| | |
|---|---|
| **Tür** | Blok yerleştirme puzzle (8×8), hybrid-casual |
| **Referanslar** | Block Blast! (Hungry Studio), Woodoku (Tripledot), 1010! (Gram Games) |
| **Hedef kitle** | Herkes — 4+ yaş derecesi, cinsiyet/yaş nötr tema, metinsiz oynanış |
| **Oturum** | 3–8 dk, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

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

## KPI hedefleri

| Metrik | Hedef | Kategori ortalaması |
|---|---|---|
| D1 retention | ≥ %40 | %35–45 |
| D7 retention | ≥ %15 | %12–18 |
| Ortalama oturum | ≥ 6 dk | 5–8 dk |
| Oyun / oturum | ≥ 2.5 | — |
| "Devam et" kabul oranı | ≥ %25 | — |

## Sonraki sürüm fikirleri (v1.1+)

- Günlük meydan okuma (sabit tohumlu `seededRng` ile herkese aynı parçalar) + seri sayacı
- Tema/blok kaplamaları (reklam izleyerek veya IAP ile)
- "Reklamları kaldır" IAP (`setAdsRemoved` hazır)
- Game Center / Google Play Games lider tablosu

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam ve doğrulandı (11 birim test, typecheck, build, headless
tarayıcıda tam akış: öğretici → oyun sonu → devam et → oyun sonu → tekrar oyna, konsol hatasız).

Yalnızca hesap sahibinin yapabileceği adımlar kaldı:

- [ ] AdMob: gerçek uygulama/reklam kimlikleri (AndroidManifest, Info.plist, `initAds({ units, testing: false })`)
- [ ] Play Console / App Store Connect'te ürünler: `remove_ads`, `starter_pack`, `coins_small`, `coins_large`
- [ ] `capacitor.config.ts` → `appId` kendi alan adınla (ör. `com.<adın>.snapgrid`), sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık bir URL'de yayınla (GitHub Pages / public repo) ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; release keystore oluştur ve AAB'yi imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Play Console / App Store Connect: `store/listing.md` metinleri, `store/screenshots`, yaş anketi, veri güvenliği formu
