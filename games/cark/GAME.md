# Çark (EN: Cogwork) — Oyun Kartı

| | |
|---|---|
| **Tür** | Dişli zinciri puzzle, seviye tabanlı |
| **Referanslar** | Gears Logic, Cogs, Pipe/Flow Free türü bağlama bulmacaları |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, sakin tempo |
| **Oturum** | 30 sn–3 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (bkz. kontrol listesi) |

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
   sınırsız geri al, tek dokunuşla çarkı geri alma.
4. **Saygılı reklam:** geçiş reklamı ancak 6. seviyeden sonra, kit'in frekans sınırıyla.

## Çekirdek döngü

Tepsiden çarkı sürükle → boş çiviye bırak (tık sesi) → motora bağlanan zincir döner →
saat doğru yönde dönünce yeşillenir ve çalar → tüm saatler doğru → yıldızlar → sonraki seviye.

## Zorluk eğrisi

| Seviye | Izgara | Saat | Kayış | Tepsi fazlası |
|---|---|---|---|---|
| 1–7 | 5×6 | 1 | 0 | par+3 |
| 8–39 | 5×6 → 6×7 | 1–2 | 0–1 | par+3 → +2 |
| 40–89 | 6×7 → 6×8 | 2 | 1 | par+2 |
| 90–150 | 6×8 → 7×9 | 2–3 | 1–2 | par+1 |

Kayalar %5'ten %18'e çıkar. 150 seviyenin üretimi + doğrulaması toplam ~0,4 sn.

## Özellik listesi (v1.0)

- [x] İşaretli BFS ile yön yayılımı, döngü çakışmasında sıkışma tespiti, kazanma kontrolü
- [x] Tohumlu seviye üretimi + çözücü (tüm saat sıraları denenir), par ve ipucu çözümü
- [x] Tepsiden sürükle-bırak (dokunmatikte parmak üstü kaldırma + hedef gölgesi), dokununca geri al
- [x] Canvas'ta dişli çizimi, parite fazıyla kenetlenen sabit hızlı dönüş, saat kolları, hareketli kayış
- [x] Sıkışmada sallanma + kırmızı + ses/titreşim; saat tamamlanınca çan, kazanınca akor
- [x] Geri al, ipucu (ilki ücretsiz, sonra ödüllü reklam), yeniden başlat
- [x] 1. seviyede el animasyonlu öğretici (tepsiden sıradaki çiviye)
- [x] Her hamlede kayıt, kaldığı yerden devam; seviye başına en iyi yıldız
- [x] Ses, titreşim, gizlilik bağlantısı, sürüm; TR / EN, `<html lang>`
- [x] Değerlendirme isteği 8. seviyeden sonra

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, par, resumed` | seviye hunisi |
| `level_complete` | `level, gears, par, stars, hints, duration_s` | zorluk ayarı |
| `restart`, `jam` | `level, gears` | sinir bozucu seviyeleri bulma |
| `hint` | `level, n` | yardım kullanımı |
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
- Günlük bulmaca, "reklamları kaldır" IAP

## Kontrol listesi durumu

Kodla yapılabilen her madde tamam: 13 birim test (150 seviyenin par ile çözülebilirliği dahil),
typecheck, build, `scripts/e2e.mjs` ile 17 kontrol (öğretici, 1–3. seviyeleri gerçek
sürüklemeyle çözme, dokunarak geri alma, ipucu, geri al, sıkışma, kazanma, yeniden yüklemede
ilerleme), konsol hatasız.

Yalnızca hesap sahibinin yapabileceği adımlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla, `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build** ile APK'yı cihazda dene; AAB'yi imzala
- [ ] iOS: macOS + Xcode'da `ios/App` aç, Team seç, Archive → App Store Connect
- [ ] Mağaza: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği formu
