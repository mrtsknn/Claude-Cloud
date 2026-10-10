# Çömlek (Clay) — Oyun Kartı

| | |
|---|---|
| **Tür** | Rahatlatıcı çömlek / şekil eşleştirme, seviye tabanlı (hybrid-casual) |
| **Referanslar** | Pottery Master, Let's Create! Pottery, ASMR çömlek videoları |
| **Hedef kitle** | Herkes — metinsiz oynanış, süre baskısı yok |
| **Oturum** | 30–60 sn/seviye |
| **Durum** | v1.1.0 — ASMR his, boyama, koleksiyon rafı, serbest atölye, siparişler, paylaşım |

## Pazar analizi
- Çömlek/ASMR temalı oyunlar "relaxing" aramalarında sürekli üst sıralarda; dokunsal his ve
  "kendi eserini yapma" duygusu geniş kitleye hitap ediyor.
- Rakiplerde şikâyetler: her dokunuşta reklam, belirsiz puanlama. Çömlek'te puan açık:
  canlı **Uyum %** göstergesi ve 70/82/92 yıldız eşikleri.

## Çekirdek döngü
**Sipariş** (ör. "Ayşe Hanım: geniş bir meyve kâsesi") → dönen çamurun iki yanına bastır (çamur
içeri girer, incelen çamur yükselir) ya da **içten dışa sürükle** (çamur dışarı çekilir, genişleyen
çamur alçalır — kâseler geniş ve alçak çıkar) → kesikli hedef siluete benzet → **Fırınla** → %70
altı: tekrar dene; üstü: **Boyama** (sır seç; renk seçip dönen çömleğe dokunarak halka/bant çek;
noktalar, dalgalar, zikzak, yapraklar damgaları; geri al) → **Rafa koy** → yıldız + uyum %'siyle
ölçeklenen jeton (+süsleme bahşişi) → çömlek **Koleksiyon rafı**na kaydedilir.
**Serbest atölye** (meta `endless` kartı): hedef yok; şekil ver, fırınla, boya, rafa koy, paylaş.

## His (ASMR) ve yayılma
- Islak çamur parlaması (dar speküler bant + dönen parıltılar), parmak izi tornalama halkaları,
  parmaktan sıçrayan çamur damlaları, hafif çark yalpası, fırında kor kıvılcımları.
- Sürekli sentezlenmiş "çamur uğultusu" (`src/hum.ts`): motor tonu çark hızını, filtreli kahverengi
  gürültü parmak temasını izler; ses ayarına uyar, menü/arka planda susar.
- Haptik: çamur ne kadar hızlı akıyorsa o kadar sık/güçlü tık; 70/82/92 eşiği geçince çın + pop.
- Paylaş: çömlek 1080×1350 JPEG karta çizilir; web'de Web Share (dosya), diğer durumda
  `shareResult` (metin + mağaza bağlantısı). İlk rafa konan çömlekten sonra `scheduleReminders`
  ile günlük 19:00 hatırlatma.

## Teknik
- `src/game.ts` saf: 60 satırlık yarıçap profili, `push` (içeri bastırma), `pull` (dışarı çekme,
  `MAX_R`=1.3), `heightOf` (hacim kuralı: incelen çamur yavaşça yükselir, genişleyen çamur
  üstel olarak alçalır), `matchScore` (siluet IoU), `targetFor` (tohumlu parametrik eğriler;
  kâseler geniş ve alçak), `orderFor`/`orderReward` (müşteri siparişi, uyum %'siyle ödül),
  `paintRing`/`addStamp`/`undoBand` (boyama bantları), `encodeProfile` + `parseShelf` (raf
  kaydı: çömlek başına ~300 bayt, en fazla 240 çömlek, bozuk kayıtlar atlanır), `classify`.
- `src/render.ts`: torna profilinin çizimi (gölgeli tarama çizgileri, halkalar, damga desenleri
  çarkla birlikte döner), raf tahtası, küçük resimler. `src/hum.ts`: sürekli ses.
- Testler (Vitest): bastırma/çekme deformasyonu, kâselerin alçak olması, her seviyenin 3 yıldızla
  çözülebilmesi, dokunulmamış çamurun hiçbir seviyeyi geçmemesi, sipariş ödülleri, boyama
  verisi, raf kayıt/yükleme. E2E (`scripts/e2e.mjs`): 51 kontrol, gerçek sürüklemelerle.

## Meta
Ana menü (ortada **Rafım** önizlemesi → koleksiyon ekranı), Seviyeler (120 sipariş) + Serbest atölye kartları,
seviye haritası, günlük görevler (`levels`, `stars`, `perfect`, `pots`),
7 günlük ödül, mağaza: 8 sır görünümü (pişmiş toprak, seladon, bal, kobalt çizgili, benekli
krem, gül, İznik benekli, obsidyen ve altın), jeton/reklamsız IAP, AdMob (test kimlikleri).

## KPI hedefleri
D1 %40, D7 %15, oturum 6 dk, seviye 1→5 tamamlama %70.

## ASO
Bkz. `store/listing.md`.

## v1.1 düzeltmeleri
- Kâseler artık geniş ve alçak (hacim kuralı genişlemeyi alçalmaya çevirir; dışarı çekme eklendi).
- 8 sırın hepsi alındığında sır düğmeleri alt satıra kaymıyor (tek satır, gerekirse kaydırılır).
- Açılışta fazladan `game_start` atılmıyor: seviye arka planda sessizce hazırlanıyor, olay yalnızca
  Oyna / Serbest atölye / harita ile başlatılınca gidiyor.
- Bilinen kit sınırı: `shareResult` `imageDataUrl` alanını native'de kullanmıyor (yalnızca metin + bağlantı
  paylaşılır). Native görsel paylaşımı için kit tarafında Filesystem + `Share.files` gerekir.
