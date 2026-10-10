# Paraşüt (EN: Skydrop) — Oyun Kartı

| | |
|---|---|
| **Tür** | Tek dokunuşlu sonsuz arcade (hyper-casual) + 100 meydan okuma seviyesi |
| **Referanslar** | Stack/Tower tarzı zamanlama oyunları, "Parachute Landing" türü hyper-casual'lar, Flappy tek-dokunuş sadeliği |
| **Hedef kitle** | Herkes — metinsiz oynanış, nötr gökyüzü/deniz teması |
| **Oturum** | 30 sn – 3 dk |
| **Platform** | iOS + Android (Capacitor), web |
| **Durum** | v1.0.0 |

## Pazar analizi
- Tek dokunuş + fizik zamanlaması türü (Voodoo/Rollic) düşük öğrenme maliyeti, yüksek
  "bir daha" isteği verir; reklam gelirine uygun kısa oturumlar.
- Rakiplerin ortak şikâyeti: **imkânsız/şansa bağlı turlar**. Paraşüt her atlayışı bir
  simülasyonla (dokunma zamanlamalarını tarayarak) doğrular; inilebilir olmayan atlayış üretilmez.

## Çekirdek döngü
Uçaktan düş → dokun: paraşüt açılır (yavaşlar, rüzgâr daha çok sürükler) → tekrar dokun:
paraşütü kes, hızla düş (atlayış başına bir kez) → hareketli teknenin güvertesine kon.
Merkez (kırmızı-beyaz) = tam isabet ×2 puan, art arda tam isabet = kombo. Denize düşmek
veya paraşütü hiç açmamak = oyun biter (devam: jeton ya da video).

## Zorluk eğrisi (`generateJump(n)`)
| Atlayış | Rüzgâr | Güverte | Tekne hızı | Engel |
|---|---|---|---|---|
| 1–3 | ±1.5–2.5 | geniş (≈16–26) | yavaş | yok |
| 6+ | artar | daralır | hızlanır | bulutlar (dokunursa itilir) |
| 11+ | ±5+ (+ esinti) | 7–14 | hızlı | + kuşlar |

## Meta
- Sonsuz mod (rekor), 100 sabit tohumlu meydan okuma seviyesi: 3–6 atlayışı art arda başar;
  yıldız = tam isabet sayısı. Görevler: `landings`, `bullseye` + standart görevler.
- 8 paraşüt deseni (Klasik, Okyanus, Gün batımı, Nane, Dama, Gökkuşağı, Gece, Altın).
- Günlük ödül, mağaza (video jeton, başlangıç paketi, reklamsız, jeton paketleri), AdMob test kimlikleri.

## KPI hedefleri
D1 ≥ %40, D7 ≥ %12, oturum ≥ 4 dk/gün, oyun başına ≥ 4 atlayış, devam teklifi kabulü ≥ %15.

## Analytics
`game_start`, `game_over`, `new_best`, `level_complete` + kit meta olayları (`home`, `mission_claim`, `daily_claim`, `skin_buy`, `iap`).

## ASO
Bkz. `store/listing.md`.
