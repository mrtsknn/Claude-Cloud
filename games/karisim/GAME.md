# Karışım (Tint) — Oyun Kartı

| | |
|---|---|
| **Tür** | Renk karıştırma/eşleştirme puzzle, seviye tabanlı |
| **Referanslar** | Blendoku, I Love Hue, Color Mix / Paint Mixing (hyper-casual) |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, süre baskısı yok |
| **Oturum** | 30 sn – 2 dk/seviye |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.1 — meta katmanı + AdMob/IAP; mağazaya hazır (hesap sahibi adımları hariç) |

## Pazar analizi

- "Color mixing" oyunları (Paint Mixing, Color Match) hyper-casual listelerinde sık; ASMR/rahatlatıcı
  konumlanmayla geniş, cinsiyet/yaş dengeli kitleye ulaşıyor.
- Yorumlardaki başlıca şikâyetler: **hedefin göz kararı tutturulamaması**, belirsiz eşleşme
  ölçütü, her denemeden sonra reklam. Karışım net bir yüzde göstergesi ve adil eşleşme sunar.

## Farklılaşma

1. **Algısal karışım:** damlalar OKLab uzayında ortalanır; sonuç gözün beklediği renge yakındır.
2. **Her seviye çözülebilir ve par kesin:** hedef gizli bir tariften üretilir; daha az damlalı
   bir tarif hedefe yaklaşıyorsa seviye reddedilir. Eşleşme toleransı, en yakın daha ucuz karışıma
   uzaklığın yarısıdır — yani daha az damlayla çözmek imkânsız.
3. **Canlı uyum göstergesi** (0–100%) kasenin hemen altında büyük puntoyla; %95'in üstünde
   "Az kaldı!" işareti. Geç seviyelerde tolerans gözün ayırt edebileceğinden küçük olduğu için
   rehber gösterge: doğrusal + toleransa göre logaritmik karışım ölçek, yani %95+ gerçekten
   hedefin ~1,5 tolerans yakınında demek.
4. **Okunur hedefler:** hedef rengin OKLab kroması ≥ 0,05 — gri-benzeri, ayırt edilemeyen
   hedefler üretilmez (birim testle 150 seviyede doğrulanır).
5. **Saygılı reklam:** ilk ipucu her seviyede ücretsiz, sonrası 40 jeton ya da ödüllü video;
   geçiş reklamı 5. seviyeden sonra, kit sınırıyla.

## Çekirdek döngü

Hedef rengi gör → tüpe dokun (damla düşer, kasede girdap) → gösterge yükselir → hedef tutunca
yıldızlar (par'da 3, par+2'de 2, sonra 1) → sonraki seviye.

## Meta katmanı (`@studio/kit` meta)

- **Ana menü:** logo, jeton, ayarlar, görev şeridi, "Seviye N" kartı; kahraman görseli: kaseye
  düşen turkuaz/macenta/sarı damlalar (donanılan kase malzemesiyle çizilir).
- **Seviye haritası:** 150 seviye, yıldızlı, kilitli. Kazanınca `meta.showWin` (10 + yıldız×5
  jeton, videoyla x2), eşleşen renk ve damla/par satırı kit kartına eklenir.
- **Görevler:** standart `levels`, `stars`, `perfect` + oyuna özgü `drops` (N damla ekle) ve
  `matches` (ipucusuz N renk tuttur). **Günlük ödül**, **mağaza** (kit standardı).
- **Görünümler (`src/skins.ts`, 7):** Seramik (ücretsiz), Terakota 300, Ahşap 500, Mermer 500,
  Cam 800, Porselen 1000, Bakır 1200 — kase gövdesi, kenar, desen (bant/damar/ahşap lifi/parıltı)
  ve stüdyo arka planı değişir.
- **Oyun içi:** HUD'daki duraklat → `meta.showPause` (devam, baştan, ayarlar, menü). Eski ayarlar
  ve kazanma katmanları kaldırıldı. Android geri: sayfa → duraklat.
- **Kayıt göçü:** v1.0 `karisim.completed` → profilde tamamlanan seviyeler 3 yıldız, kilit
  açık; yarım kalan kase korunur.
- **Native:** `@capacitor-community/admob`, `@capgo/native-purchases`; AndroidManifest ve
  Info.plist'te AdMob TEST kimlikleri (yayın öncesi gerçekleriyle değiştir).

## Zorluk eğrisi

| Seviye | Tüp | Damla (par) | Yeni renkler |
|---|---|---|---|
| 1–10 | 2 | 2–3 | beyaz, siyah, turkuaz, macenta, sarı |
| 11–30 | 3 | 2–4 | + kırmızı, mavi |
| 31–60 | 4 | 3–5 | (21+ tuzak tüp olabilir) |
| 61–100 | 5 | 5–7 | + yeşil, turuncu |
| 101–150 | 6 | 6–10 | + mor, kahve |

150 seviyenin üretimi toplam ~0,3 sn; tolerans 0,0055–0,02 ΔE (geç seviyeler daha hassas);
hedef kroması ≥ 0,05.

## Özellik listesi (v1.0)

- [x] OKLab dönüşümü + karışım, deterministik tohumlu 150 seviye, belirsiz tarif reddi
- [x] Parlak damla düşme animasyonu, sıçrama, kasede girdap ve yumuşak renk geçişi
- [x] Uyum göstergesi, damla sayacı, par; yıldızlı kazanma ekranı
- [x] Geri al (son damla), kaseyi boşalt, ipucu (ilki ücretsiz, sonrası ödüllü reklam)
- [x] 1. seviyede el animasyonlu öğretici
- [x] Her eylemde kayıt; kazanma ekranında kapatılsa bile ilerleme korunur
- [x] Ses ("plip"), titreşim ayarları; gizlilik bağlantısı; sürüm
- [x] TR / EN, `<html lang>`; açık zemin için status bar; dikey kilit
- [x] 3 yıldız serisi sonrası mağaza değerlendirme isteği
- [x] v1.1: meta katmanı (menü, harita, görevler, günlük, mağaza, 7 kase), ipucu jeton/video,
      kase altında büyük uyum yüzdesi + "Az kaldı!", kroma tabanı, AdMob + IAP

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, par, tubes, resumed` | seviye hunisi |
| `level_complete` | `level, drops, par, stars, hints, duration_s` | zorluk ayarı |
| `hint` | `level, n` | yardım kullanımı |
| `restart`, `undo` | `level` (+`drops`) | sinir bozucu seviyeler |
| `hint_coins` | `level` | jetonla ipucu |
| `ad_*`, `iap`, `skin_buy`, `mission_claim`, `daily_claim` | kit meta | monetizasyon/meta |
| `progress_migrated` | `completed` | v1.0 → v1.1 göçü |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 retention | ≥ %40 |
| D7 retention | ≥ %15 |
| Oturum başına seviye | ≥ 5 |

## Sonraki sürüm fikirleri (v1.1+)

- Günlük renk + seri sayacı; renk körlüğü için tüp desenleri

## Kontrol listesi durumu

Doğrulandı: 11 birim test (150 seviyenin tamamında tarif/tolerans/ipucu/kroma kontrolü,
gösterge monotonluğu ve "az kaldı" eşiği), typecheck, build, `scripts/e2e.mjs` ile 42 kontrol
(ana menü + görsel, günlük ödül, mağazada kase satın al/kullan, görevler, harita, 1. seviyeyi
dokunarak çözme, kit kazanma ekranı ve jeton, sonraki seviye, duraklat, ücretsiz + 40 jetonluk
ipucu, 140. seviyede "Az kaldı!", yeniden yüklemede ilerleme/jeton/görünüm, v1.0 kayıt göçü),
konsol hatasız. Mağaza görselleri ana menü dahil 4 sahne × 2 dil × 3 boyut.

Hesap sahibine kalan adımlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build**; release keystore ile AAB imzala
- [ ] iOS: Xcode'da `ios/App` → Team → Archive
- [ ] AdMob: gerçek uygulama/birim kimlikleri (`initAds({ units, testing: false })`, Manifest, Info.plist)
- [ ] IAP ürünleri (starter_pack, remove_ads, coins_small, coins_large) Play Console / App Store Connect'te
- [ ] Mağaza formları: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği
