# Kovan (EN: Hive Merge)

## Pazar / referans
Merge-idle türü (Merge Dragons'ın sade hâli; "Merge Bees", "Idle Bee Factory", "Merge Cats" benzeri).
Kısa oturum + çevrimdışı kazanç = yüksek D1/D7 tutunma. Rakiplerden farkı: petek (hex) ızgara,
temiz arayüz, reklam baskısı yok (yalnız isteğe bağlı videolar, nadir geçiş reklamı).

## Çekirdek döngü
1. **Yumurta** butonu: bal harcar, aktif kovanda rastgele boş hücreye arı (maliyet yavaşça artar: 8·(1+n/20)²).
2. Arıyı aynı seviyedeki arıya **sürükle** → bir üst seviye (**30 seviye**, her biri isimli ve kodla çizilmiş;
   üretim ×2.2/seviye). 11+ anten ve benekler, 15+ hale, 20 Kraliçe tacı, 21–30 "göksel" kademe: çift kanat,
   parlak gövde ve her seviyeye özgü aksesuar (kristal kanat, şimşek, hilal, yörünge yıldızları, aurora halkası,
   kuyruklu yıldız, bulutsu, kalkan, çiçek taç, 30 İmparatoriçe tacı).
3. Yeni en yüksek seviye → kutlama (+**Paylaş** butonu, `shareResult`), jeton, **hediye kutusu**.
4. **Gelişim**: kovan büyütme (4x5 → … → 6x7, her biri +%25 bal, dünyaya özel fiyat) ve daha iyi yumurtalar
   (en iyi arının 3 altına kadar; ilk 3 adım ×30, sonra ×6). Gelişim butonunda en ucuz gelişime ilerleme çubuğu.
5. **Dünyalar** (Çayır ×1 → Bahçe ×4, arı 12 → Orman ×16, arı 18 → Dağ ×64, arı 24): arı seviyesi + bal ile kurulur,
   her birinin kendi kovanı (ızgara + büyütme), arka planı (kodla çizilmiş manzara) ve çarpanı var. HUD'daki küçük
   dünya seçiciyle geçilir; **bütün dünyalar her zaman üretir** (çevrimdışı dahil).
6. **Görev zinciri**: 41 elle yazılmış kısa hedef (birleştir, arı seviyesi, yumurta, büyüt, dünya kur, toplam bal,
   hediye aç …) + sonsuz devam; HUD'da tek ilerleme kartı, her adımda ödül (jeton / hediye kutusu / N saniyelik üretim).
   İlk adımların ödülleri hafif tutuldu ki ilk 30 dakika v1 ile aynı kalsın.
7. **Haftalık çiçek festivali** (ISO hafta numarasından, sunucusuz): 6 çiçek dönüşümlü (Lale, Lavanta, Ayçiçeği,
   Papatya, Kiraz, Gelincik). Haftanın öne çıkan arı seviyesi her dünyada 2× bal yapar; hafta içinde 400 birleştirme →
   sınırlı **festival arısı** (koleksiyon, kalıcı +%10 bal) ya da zaten varsa 100 jeton.
8. **Çevrimdışı**: en fazla 4 saat, canlı hızın %50'si; "Videoyla x2".
9. **Altın yumurta**: 40 meta jetonu → yumurta seviyesi +3 arı.

## Geri getirme
- İlk yeni arı kutlaması kapanınca yumuşak izin sorusu (açılışta asla); "Evet" → `scheduleReminders`.
- Uygulamadan çıkışta: depo dolunca ("Kovanın doldu, balını topla!", `lastSeen + 4 sa`) + günlük 19:00 dürtmesi;
  dönüşte dolum hatırlatması iptal edilir.

## Denge
`game.test.ts` simülasyonları (≈1.5 dokunuş/sn açgözlü oyuncu, görevleri toplar):
- İlk oturum değişmedi: 10. seviye arı ~22 dk (18–40 dk aralığı korunur), ilk 30 dk'da yeni dünya yok.
- Günde 4×8 dk oynayan oyuncu (arada çevrimdışı kazanç): Bahçe ~0.5. gün, 15. arı ~1. gün, Orman ~2. gün,
  20. arı ~3. gün, Dağ ~7. gün, 25. arı ~10. gün, **30. arı (Kovan İmparatoriçesi) ~26. gün** (testte 18–40 gün).

## KPI hedefleri
D1 ≥ %40, D7 ≥ %15, oturum ≥ 6 dk, günlük oturum ≥ 4, ödüllü video/DAU ≥ 1.5.

## Analytics
`game_start`, `new_best` (level), `golden_egg`, `expand` (world), `spawn_upgrade`, `world_unlock`, `quest_claim`, `festival_claim`, `reminder_opt`, `share`, `reminders_scheduled`, meta olayları (`mission_claim`, `daily_claim`, `skin_buy`, `iap`).

## ASO
Bkz. `store/listing.md`.

## Cila notları (v1.1)
- 360×640'ta 6×7 kovan: hücre yarıçapı ≈29.5 px (kenar boşluğu 10 px, altıgenler neredeyse bitişik), kısa ekranlar
  için daha alçak alt çubuk; e2e bunu ölçer (R ≥ 27, HUD satırları çakışmaz).
- Sayfalardaki emoji ikonlar kaldırıldı → `src/icons.ts` SVG ikonları; seviye rozeti büyütüldü, arılar hücreyi daha iyi dolduruyor.
- Uçan "+bal" yazıları kontür ile okunur.
