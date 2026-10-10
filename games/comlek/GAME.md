# Çömlek (Clay) — Oyun Kartı

| | |
|---|---|
| **Tür** | Rahatlatıcı çömlek / şekil eşleştirme, seviye tabanlı (hybrid-casual) |
| **Referanslar** | Pottery Master, Let's Create! Pottery, ASMR çömlek videoları |
| **Hedef kitle** | Herkes — metinsiz oynanış, süre baskısı yok |
| **Oturum** | 30–60 sn/seviye |
| **Durum** | v1.0.0 |

## Pazar analizi
- Çömlek/ASMR temalı oyunlar "relaxing" aramalarında sürekli üst sıralarda; dokunsal his ve
  "kendi eserini yapma" duygusu geniş kitleye hitap ediyor.
- Rakiplerde şikâyetler: her dokunuşta reklam, belirsiz puanlama. Çömlek'te puan açık:
  canlı **Uyum %** göstergesi ve 70/82/92 yıldız eşikleri.

## Çekirdek döngü
Dönen çamurun iki yanına parmakla bastır → çamur parmağa doğru içeri girer (yuvarlak parmak
ucu, yumuşak düşüş), incelen çamur hacmi korumak için yükselir → kesikli hedef siluete benzet
→ **Fırınla** → %70 altı: tekrar dene; üstü: sır rengi seç → rafa koy → yıldız + jeton.

## Teknik
- `src/game.ts` saf: 60 satırlık yarıçap profili, `push` (parmak deformasyonu), `heightOf`
  (hacim kuralı), `matchScore` (siluet IoU), `targetFor` (tohumlu parametrik eğriler:
  fincan, kâse, vazo, testi; boyun/karın/ağız karmaşıklığı seviyeyle artar). 120 seviye.
- Testler: her seviye için "dikkatli oyuncu" simülasyonu 3 yıldıza ulaşıyor; dokunulmamış
  çamur hiçbir seviyeyi geçmiyor.

## Meta
Ana menü, seviye haritası (120), günlük görevler (`levels`, `stars`, `perfect`, `pots`),
7 günlük ödül, mağaza: 8 sır görünümü (pişmiş toprak, seladon, bal, kobalt çizgili, benekli
krem, gül, İznik benekli, obsidyen ve altın), jeton/reklamsız IAP, AdMob (test kimlikleri).

## KPI hedefleri
D1 %40, D7 %15, oturum 6 dk, seviye 1→5 tamamlama %70.

## ASO
Bkz. `store/listing.md`.
