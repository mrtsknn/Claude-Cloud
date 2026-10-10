# Çark (EN: Cogwork) — Oyun Kartı

| | |
|---|---|
| **Tür** | Dişli zinciri puzzle, seviye tabanlı |
| **Referanslar** | Gears Logic, Cogs, Pipe/Flow Free türü bağlama bulmacaları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, sakin tempo |
| **Oturum** | 30 sn–3 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.1 — meta katmanı entegre, mağazaya hazır (bkz. kontrol listesi) |

## Pazar analizi

- "Connect/flow" bulmacaları (Flow Free, Pipe Connect) puzzle kategorisinde yıllardır üst
  sıralarda; dişli temalı rakipler ise az ve çoğu eski görünümlü, reklam yoğun.
- Dişli dönüşü herkesin sezgisel bildiği bir fizik: "yanındaki ters döner". Öğrenme maliyeti sıfır.
- Yorumlarda öne çıkan şikâyetler: çözülemeyen seviyeler, sürükle-bırak hassasiyeti, agresif reklam.

## Farklılaşma

1. **Yön kuralı gerçek bir bulmaca:** her saat ↻ veya ↺ ister. Kare ızgarada parite sabit olduğu
   için yönü **kayışlar** (aynı yönde dönen makara çifti) çevirir; kayış iki ucundan bağlanırsa
   döngü çarkı iki yöne zorlar ve grup **sıkışır** (sallanır, kırmızı).
2. **Her seviye kanıtlanmış çözülebilir:** üretici her tohumu çözücüyle doğrular; hedef (par) =
   çözücünün bulduğu en az çark sayısı. Yıldızlar par'a göre (par → 3★, +1 → 2★).
3. **Adil yardım:** seviye başına 1 ücretsiz ipucu (çözümden bir çarkı kilitli yerleştirir),
   sonrakiler 40 jeton ya da ödüllü video; sınırsız geri al, tek dokunuşla çarkı geri alma.
4. **Saygılı reklam:** geçiş reklamı yalnızca kazan ekranındaki "Sonraki"de, 5. seviyeden sonra,
   kit'in frekans sınırıyla; "reklamları kaldır" IAP.

## Çekirdek döngü

Tepsiden çarkı sürükle → boş çiviye bırak (tık sesi) → motora bağlanan zincir döner →
saat doğru yönde dönünce yeşillenir ve çalar → tüm saatler doğru → yıldızlar + jeton (10 + 5×★)
→ sonraki seviye.

## Meta katmanı (`@studio/kit` meta)

- **Ana menü:** logo (TR "Çark", EN "Cogwork"), kenetlenip dönen iki çark (motor + çark, seçili
  görünümün renkleriyle), jeton, ayarlar, görev şeridi, "Seviye N" kartı; alt menü Seviyeler ·
  Görevler · Günlük · Mağaza.
- **Seviye haritası:** 150 seviye, yıldızlı, kilitli. 150. seviye son: kazanınca menüde "Atölye
  tamam!" mesajı; 151+ yok (v1.0'da seviyeler 150'den sonra tekrar ediyordu).
- **Görevler (günde 3):** standart `levels`, `stars`, `perfect` + oyuna özgü `gears`
  (N çark yerleştir, ipucu çarkları sayılmaz) ve `clocks` (N saat çalıştır, kazanınca seviyedeki saat sayısı).
- **Mağaza – görünümler (6):** Pirinç (ücretsiz), Çelik 300, Bakır 500, Ahşap 500, Şeker 800,
  Neon 1200. Her biri çark/motor/makara-saat metali + tahta arka planı + kayış + vurgu rengi
  (`src/skins.ts`), örnek görsel: tahtada bir çark ve motor.
- **Oyun içi:** sol üst duraklat → `meta.showPause` (devam, baştan, ayarlar, menü); kazanınca
  `meta.showWin` (yıldız, jeton, videoyla x2). Oyunun eski ayarlar ve kazanma pencereleri kaldırıldı.
- **İpucu:** seviyede ilki BEDAVA rozeti; sonraki ipuçları için küçük pencere: 40 jeton ya da video.
- **Reklam/IAP:** `initAds()` + `initStore()` açılışta (test kimlikleri); AdMob test uygulama
  kimliği AndroidManifest ve Info.plist'te.
- **Kayıt taşıma:** v1.0'ın `cark.stars` haritası ve `cark.save` seviyesi ilk açılışta profile
  aktarılır (yıldızlar, açık seviye); yarım kalmış tahta korunur.

## Zorluk eğrisi

| Seviye | Izgara | Saat | Kayış | Tepsi fazlası |
|---|---|---|---|---|
| 1–7 | 5×6 | 1 | 0 | par+3 |
| 8–39 | 5×6 → 6×7 | 1–2 | 0–1 | par+3 → +2 |
| 40–89 | 6×7 → 6×8 | 2 | 1 | par+2 |
| 90–150 | 6×8 → 7×9 | 2–3 | 1–2 | par+1 |

Kayalar %5'ten %18'e çıkar; hiçbir kaya bir kayışın altında kalmaz (üretici `beltCrosses` ile
eler, kayışlar kayaların altına çizilir). 150 seviyenin üretimi + doğrulaması birkaç saniye.

## Özellik listesi (v1.0 + v1.1)

- [x] İşaretli BFS ile yön yayılımı, döngü çakışmasında sıkışma tespiti, kazanma kontrolü
- [x] Tohumlu seviye üretimi + çözücü (tüm saat sıraları denenir), par ve ipucu çözümü
- [x] Tepsiden sürükle-bırak (dokunmatikte parmak üstü kaldırma + hedef gölgesi), dokununca geri al
- [x] Canvas'ta dişli çizimi, saat kolları, hareketli kayış
- [x] Her çarkın kendi faz ofseti: yeni güç alan çark bulunduğu açıdan devam eder, kenetlendiği
  komşuya yarım diş hizalanır (fark 250 ms'de yumuşakça kapanır) — eskiden çark güç alınca zıplıyordu
- [x] Sıkışmada sallanma + kırmızı + ses/titreşim; saat tamamlanınca çan, kazanınca akor
- [x] Geri al, ipucu (ilki ücretsiz, sonra 40 jeton ya da ödüllü video), yeniden başlat
- [x] 1. seviyede el animasyonlu öğretici (tepsiden sıradaki çiviye)
- [x] Her hamlede kayıt, kaldığı yerden devam; yıldızlar/açık seviye/jeton meta profilinde
- [x] Meta: ana menü, harita, görevler, günlük ödül, mağaza (6 görünüm, jeton, IAP), duraklat, kazan
- [x] Ses, titreşim, gizlilik bağlantısı, sürüm (meta ayarlarında); TR / EN, `<html lang>`
- [x] Değerlendirme isteği 8. seviyeden sonra

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, par, resumed` | seviye hunisi |
| `level_complete` | `level, gears, par, stars, hints, duration_s` | zorluk ayarı |
| `restart`, `jam` | `level, gears` | sinir bozucu seviyeleri bulma |
| `hint` | `level, n, via` (free/coins/video) | yardım kullanımı |
| `all_levels_complete`, `migrated` | `stars` / `level, stars` | son seviye, v1.0 taşıma |
| meta: `home`, `daily_claim`, `mission_claim`, `skin_buy`, `iap` | — | meta hunisi |
| `ad_rewarded_*`, `ad_interstitial`, `review_prompt` | `placement` | monetizasyon |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 retention | ≥ %40 |
| D7 retention | ≥ %15 |
| Seviye 40'a ulaşma (kayışlar oturmuş) | ≥ %30 |

## Sonraki sürüm fikirleri (v1.1+)

- Farklı boy dişliler (çapraz kenetlenme), çapraz kayış (yönü ters çevirir)
- Günlük bulmaca

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam: 16 birim test (150 seviyenin par ile çözülebilirliği,
kayışların kayaların üstünden geçmemesi dahil), typecheck, build, `scripts/e2e.mjs` ile 38 kontrol
(menü → günlük → mağaza (al + kullan) → görevler → harita → 1. seviyeyi gerçek sürüklemeyle
çözme, güç alan saatin açısının zıplamaması ve kenetlenme hizası → meta kazan ekranı → sonraki →
duraklat → yeniden yüklemede ilerleme → ipuçları (bedava, 40 jeton) → sıkışma → 150. seviye sonu
mesajı → v1.0 kayıt taşıma), konsol hatasız. Mağaza görselleri ana menü dahil 4 sahne × 2 dil × 3 boyut.

Yalnızca hesap sahibinin yapabileceği adımlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla, `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; AAB'yi imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Mağaza: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu (reklam kimliği: AdMob)
- [ ] Gerçek AdMob kimlikleri (`initAds({ units, testing: false })`, manifest/plist) ve IAP ürünleri
  (`starter_pack`, `remove_ads`, `coins_small`, `coins_large`) Play Console / App Store Connect'te
