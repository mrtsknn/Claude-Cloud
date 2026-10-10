# Eğim (EN: Tilt) — Oyun Kartı

| | |
|---|---|
| **Tür** | Yerçekimi/eğim bulmacası, seviye tabanlı (150 seviye) |
| **Referanslar** | Tilt Maze, Labyrinth, Ball Sort, 2048 kaydırma mantığı |
| **Hedef kitle** | Herkes — metinsiz oynanış, süre baskısı yok |
| **Oturum** | 30 sn – 2 dk/seviye |
| **Platform** | iOS + Android (Capacitor), web |
| **Durum** | v1.0.0 |

## Pazar analizi
- Kaydırmalı "tilt/labirent" bulmacaları kısa oturumlu, öğrenme maliyeti sıfır; tek parmakla oynanır.
- Rakiplerin şikâyetleri: çözülemeyen seviyeler, her seviyede reklam, sıkıcı tekrar.
  Eğim: her seviye BFS ile çözülebilir ve hedef (par) kanıtlı; geçiş reklamı 5. seviyeden sonra ve aralıklı.

## Çekirdek döngü
Kaydır → tahta eğilir → tüm bilyeler duvara/bilyeye kadar yuvarlanır (öndeki önce) →
kendi rengindeki deliğe giren bilye düşer, başka rengin deliğinin üstünden geçer, siyah çukura
düşerse hamle otomatik geri alınır → tüm bilyeler düşünce yıldız (eğim sayısı / hedef) + jeton.

## Zorluk eğrisi (`paramsFor`)
| Seviye | Renk | Bilye | Çukur | Izgara | Min. hedef |
|---|---|---|---|---|---|
| 1–8 | 1 | 1–2 | 0 | 5–6 | 3 |
| 9–30 | 2 | 2–6 | 0–1 | 6–7 | 3–5 |
| 31–75 | 3 | 3–9 | 1–2 | 7–8 | 5–8 |
| 76–150 | 4 | 8 | 2–3 | 8×9 | 8–10 |
Üretici tohumlu (deterministik); BFS ile par hesaplanır (durum sınırı 8000), par < 3 reddedilir.

## Meta
Ana menü, seviye haritası, 3 günlük görev (`levels`, `stars`, `perfect`, `marbles`), 7 günlük ödül,
mağaza (7 görünüm: Cam, Meşe, Neon, Mermer, Şeker, Altın, Gece göğü), duraklat/kazan ekranı,
AdMob (test kimlikleri) + IAP. Yardım: geri al (sınırsız), ipucu (ilki ücretsiz, sonra ödüllü video), baştan başla.

## KPI hedefleri
D1 ≥ %40, D7 ≥ %15, seviye 10'a ulaşma ≥ %60, ortalama oturum ≥ 6 dk.

## Analytics
`session_start`, `level_start`, `level_complete` (tilts, par, stars), meta olayları (`home`, reklam/IAP).

## ASO
Bkz. `store/listing.md`.
