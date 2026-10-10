# İkiz (Twins)

## Özet
İki tahta, iki ikiz, ortada bir çizgi. Tek kaydırma ikisini birden yürütür: soldaki ikiz kaydırdığın
yöne, sağdaki ise yatayda ayna yönüne (sol↔sağ, yukarı/aşağı aynı) gider. Duvara takılan ikiz yerinde
kalır — bu "senkron bozma" çekirdek bulmacadır. İkisi aynı anda hedefte olunca seviye biter.

## Pazar / referans
- Referanslar: ayna/ikili kontrol bulmacaları, Sokoban-lite ızgara oyunları.
- Fark: tek parmakla tek hareket, 3 saniyede anlaşılır; her seviye BFS ile çözülebilir ve en kısa çözüm (par) bilinir.

## Çekirdek döngü
Kaydır → ikizleri hizala → hedef → yıldız/jeton → sonraki seviye. Takılınca geri al, ipucu (ilk ücretsiz, sonra video), yeniden.

## İçerik
- 150 seviye, tohumlu üreteç; ortak durum uzayında BFS ile par. par < 4 veya çözümsüz seviye reddedilir.
- 1–20: yalnız duvar; 21+: dikenler (basınca seviye baştan); 61+: anahtar/kapı.
- Yıldız: par → 3, par×1.5'e kadar → 2, üstü → 1.

## Meta
Ana menü, seviye haritası, 3 günlük görev (`levels`, `stars`, `perfect`, `moves`, `noUndo`), 7 günlük ödül,
mağaza (8 ikiz görünümü: renk çiftleri + küp/hayalet şekilleri; video jeton; IAP), duraklat/kazan ekranları, AdMob + IAP (test kimlikleri).

## Analitik
`session_start`, `level_start`, `level_complete`, `spiked`, `hint` + meta olayları (`home`, `daily_claim`, `mission_claim`, `skin_buy`, `iap`).

## KPI hedefleri
D1 ≥ %40, D7 ≥ %15, oturum ≥ 6 dk, seviye 10'a ulaşma ≥ %60.

## ASO
Bkz. `store/listing.md`.
