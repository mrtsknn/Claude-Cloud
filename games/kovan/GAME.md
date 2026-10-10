# Kovan (EN: Hive Merge)

## Pazar / referans
Merge-idle türü (Merge Dragons'ın sade hâli; "Merge Bees", "Idle Bee Factory", "Merge Cats" benzeri).
Kısa oturum + çevrimdışı kazanç = yüksek D1/D7 tutunma. Rakiplerden farkı: petek (hex) ızgara,
temiz arayüz, reklam baskısı yok (yalnız isteğe bağlı videolar, nadir geçiş reklamı).

## Çekirdek döngü
1. **Yumurta** butonu: bal harcar, rastgele boş hücreye 1. seviye arı (maliyet yavaşça artar: 8·(1+n/20)²).
2. Arıyı aynı seviyedeki arıya **sürükle** → bir üst seviye (20 seviye, her biri isimli; üretim ×2.2/seviye).
3. Arılar saniyede bal üretir; yeni en yüksek seviye → kutlama, jeton, **hediye kutusu** (dokununca arı).
4. **Gelişim**: kovan büyütme (4x5 → 5x5 → 5x6 → 6x6 → 6x7, her biri +%25 bal) ve daha iyi yumurtalar
   (en iyi arının 3 seviye altına kadar).
5. **Çevrimdışı**: en fazla 4 saat, canlı hızın %50'si; "Videoyla x2".
6. **Altın yumurta**: 40 meta jetonu → yumurta seviyesi +3 arı.

Denge: `game.test.ts` içindeki simülasyon (≈1.5 dokunuş/sn açgözlü oyuncu) 10. seviye arıya ~24 dk'da ulaşır
(testte 18–40 dk aralığı korunur).

## Meta
Ana menü (Kovanım kartı, rekor = en yüksek arı), görevler (`merges`, `spawns`, `newBee`), 7 günlük ödül,
mağaza: 7 kovan teması (Kehribar, Nane, Lavanta, Gece, Böğürtlen, Orman, Okyanus), video ile jeton, IAP.
Duraklat: HUD menü butonu → `meta.showPause` (idle oyunda "Baştan başla" CSS ile gizlenir).

## KPI hedefleri
D1 ≥ %40, D7 ≥ %15, oturum ≥ 6 dk, günlük oturum ≥ 4, ödüllü video/DAU ≥ 1.5.

## Analytics
`game_start`, `new_best` (level), `golden_egg`, `expand`, `spawn_upgrade`, meta olayları (`mission_claim`, `daily_claim`, `skin_buy`, `iap`).

## ASO
Bkz. `store/listing.md`.
