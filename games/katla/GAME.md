# Katla (EN: Fold) — Oyun Kartı

| | |
|---|---|
| **Tür** | Kâğıt katlama puzzle, 150 seviye |
| **Referanslar** | Fold (Inkle), Paperama (FDG), Folding Blocks |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, sakin kırtasiye estetiği |
| **Oturum** | 30 sn – 3 dk/seviye, süre baskısı yok |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır |

## Pazar analizi

- Kâğıt katlama puzzle'ları (Paperama, Folding Blocks) 10M+ indirmeye ulaştı; mekanik fiziksel
  dünyadan tanıdık olduğu için öğrenme maliyeti sıfır.
- Şikâyetler: tahmine dayalı/belirsiz seviyeler, her seviyede reklam, kısa içerik.
- Katla: her seviye çözücüyle doğrulanır (par = en kısa çözüm), belirsiz/önemsiz hedefler
  elenir; reklam yalnızca 5. seviyeden sonra ve aralıklı.

## Çekirdek döngü

Hedef siluet + renk deseni üstte → kâğıdın üzerindeki bir çizginin üstünden kaydır → bir taraf
3B dönüşle öbür tarafın üstüne katlanır, arka yüz görünür → görünen şekil ve renkler hedefle
eşleşince konfeti → yıldızlar (kat sayısı / par) → sonraki seviye.

## Kurallar

- Kâğıt kare ızgaradır; her hücrenin ön ve arka rengi vardır. Katlanan hücreler çizgiye göre
  aynalanır, yığın ters çevrilir ve üste konur; üstte artık hücrenin arka yüzü görünür.
- Eşleşme konumdan bağımsızdır (şekil + renkler). Açıklıklar sadece küçülür; hedeften küçük
  kalırsa "geri al" önerilir.
- Yıldız: kat ≤ par → 3, ≤ par+2 → 2, aksi 1. Geri alınan katlar da sayılır.

## Seviye üretimi

`generateLevel(n)`: tohumlu RNG ile kâğıt (2×3'ten 6×6'ya, köşe çentikleri, iki tonlu ön/arka
desenler) → 2–6 rastgele "doğal" kat (kanat ≤ kalan kısım) → hedef. Çözücü (katman BFS, durum
= hücre başına üst yüz + alt yüz, açıklık sınırı ile budama) par'ı bulur; par < 2 (önemsiz) veya
optimum çözümü başlatan ilk hamle sayısı çok fazla (belirsiz) ise reddedilir. 150 seviye
`scripts/gen-levels.mts` ile `src/levels.json`'a yazılır ve par'a göre sıralanır (par 2 → 6).
Testler dosyanın üreticiyle tutarlı ve her seviyenin tam par katta çözüldüğünü doğrular.

## Meta

Ana menü, seviye haritası (yıldızlı), 3 günlük görev (`levels`, `stars`, `perfect`, `folds`),
7 günlük ödül, mağaza (6 kâğıt deseni: Düz, Kareli, Kraft, Puantiyeli, Defter, Washi; video ile
jeton; başlangıç paketi, reklamsız, jeton paketleri), duraklat / kazan ekranları — `@studio/kit`
meta katmanı. AdMob + IAP test kimlikleriyle.

## Özellikler (v1.0)

- [x] Kaydırarak katlama, sürüklerken kat çizgisi + kanat önizlemesi
- [x] 3B dönüş animasyonu (ölçek + gölgelendirme + düşen gölge), yığın kalınlığı
- [x] Geri al (sınırsız), baştan başla, ipucu (ilki ücretsiz, sonrası ödüllü video)
- [x] 1. seviyede canlı ok ile öğretici; çıkmaz durum uyarısı
- [x] Her katta kayıt; yeniden açınca kaldığın kattan devam
- [x] TR + EN, haptik, sentezlenmiş sesler, safe-area

## KPI hedefleri

D1 ≥ %40, D7 ≥ %15, seviye 10'a ulaşma ≥ %60, ortalama oturum ≥ 6 dk.

## Analitik olayları

`level_start`, `fold`, `undo`, `hint`, `stuck`, `level_restart`, `level_complete` (+ meta olayları).
