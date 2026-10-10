# Buz (EN: Ice Slide) — Oyun Kartı

| | |
|---|---|
| **Tür** | Kaydırmalı buz bulmacası, seviye tabanlı |
| **Referanslar** | Pokémon buz mağarası bulmacaları, Ice Slide / Penguin Slide türü mobil oyunlar |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, nötr penguen-benzeri karakter |
| **Oturum** | 30 sn–2 dk/seviye, süre baskısı yok |
| **Durum** | v1.0.0 |

## Pazar ve farklılaşma
- "Slide puzzle" kuralı evrensel; tek kaydırmada öğrenilir. Rakiplerde sık şikâyet: çözülemeyen
  seviyeler ve yardım için reklam zorunluluğu.
- Buz: her seviye BFS ile çözülür, yıldız hedefi (par) gerçek en kısa çözümdür; geri alma sınırsız
  ve ücretsiz, ilk ipucu ücretsiz.

## Çekirdek döngü
Kaydır → karakter kayaya/kenara kadar kayar (kar üstünde durur) → yoldaki balıklar toplanır →
tüm balıklar alınınca iglo parlar → iglo'ya ulaş → yıldız + jeton → sonraki seviye.

## Mekanikler ve zorluk
| Seviye | Yeni öğe | Izgara |
|---|---|---|
| 1–8 | kaya, balık (1 seviyede ok-ipucu öğretici) | 5×7 |
| 5+ | kar (üstünde durdurur) | |
| 9–40 | | 6×8 |
| 25+ | çatlak buz (üzerinden geçince su olur) | |
| 35+ | su deliği (düşersen kaybedersin) | |
| 41+ | | 7×9 |
| 60+ | yön okları | |
| 100+ / 150+ | 1 / 2 portal çifti | |

Üretici: tohumlu (mulberry32), rastgele kaya/engel + gerçek kurallarla rastgele yürüyüş; balıklar
yürüyüşün geçtiği hücrelere, iglo bitiş noktasına konur. BFS (konum × toplanan balık × kırık buz)
ile par hesaplanır; çözümsüz veya par < 3 olan reddedilir. 200 seviyenin hepsi ~0,3 sn'de üretilir.
Yıldız: par'da 3, par + max(2, par/3) içinde 2, aksi 1.

## Meta
Ana menü, seviye haritası, günlük görevler (`levels`, `stars`, `perfect`, `fish`), 7 günlük ödül,
mağaza (7 kıyafet, video ile jeton, IAP), duraklat/kazan/kaybet. Suya düşünce kaybet ekranı:
devam = son hamleyi geri al (video veya artan fiyatlı jeton).

## KPI hedefleri
D1 ≥ %40, D7 ≥ %15, oturum ≥ 6 dk, seviye 10'a ulaşma ≥ %60.

## Analytics
`level_start`, `level_complete` (swipes, par, stars, hints, süre), `fall`, `undo`, `hint`,
`level_restart` + meta olayları.

## Bilinen eksikler
- Ses efektleri basit sentez; müzik yok.
