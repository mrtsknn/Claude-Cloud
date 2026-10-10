# Karışım (Tint) — Oyun Kartı

| | |
|---|---|
| **Tür** | Renk karıştırma/eşleştirme puzzle, seviye tabanlı |
| **Referanslar** | Blendoku, I Love Hue, Color Mix / Paint Mixing (hyper-casual) |
| **Hedef kitle** | Herkes — 4+, metinsiz oynanış, süre baskısı yok |
| **Oturum** | 30 sn – 2 dk/seviye |
| **Platform** | iOS + Android (Capacitor), web (PWA) |
| **Durum** | v1.0.0 — mağazaya hazır (hesap sahibi adımları hariç) |

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
3. **Canlı uyum göstergesi** (0–100%) her damlada ne kadar yaklaştığını söyler.
4. **Saygılı reklam:** ilk ipucu her seviyede ücretsiz; geçiş reklamı 5. seviyeden sonra, kit sınırıyla.

## Çekirdek döngü

Hedef rengi gör → tüpe dokun (damla düşer, kasede girdap) → gösterge yükselir → hedef tutunca
yıldızlar (par'da 3, par+2'de 2, sonra 1) → sonraki seviye.

## Zorluk eğrisi

| Seviye | Tüp | Damla (par) | Yeni renkler |
|---|---|---|---|
| 1–10 | 2 | 2–3 | beyaz, siyah, turkuaz, macenta, sarı |
| 11–30 | 3 | 2–4 | + kırmızı, mavi |
| 31–60 | 4 | 3–5 | (21+ tuzak tüp olabilir) |
| 61–100 | 5 | 5–7 | + yeşil, turuncu |
| 101–150 | 6 | 6–10 | + mor, kahve |

150 seviyenin üretimi toplam ~0,3 sn; tolerans 0,0055–0,02 ΔE (geç seviyeler daha hassas).

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

## Analytics olayları

| Olay | Parametreler | Ne için |
|---|---|---|
| `level_start` | `level, par, tubes, resumed` | seviye hunisi |
| `level_complete` | `level, drops, par, stars, hints, duration_s` | zorluk ayarı |
| `hint` | `level, n` | yardım kullanımı |
| `restart`, `undo` | `level` (+`drops`) | sinir bozucu seviyeler |
| `ad_*`, `review_prompt` | `placement` | monetizasyon |

## KPI hedefleri

| Metrik | Hedef |
|---|---|
| Seviye 1 tamamlama | ≥ %95 |
| D1 retention | ≥ %40 |
| D7 retention | ≥ %15 |
| Oturum başına seviye | ≥ 5 |

## Sonraki sürüm fikirleri (v1.1+)

- Günlük renk + seri sayacı; renk körlüğü için tüp desenleri
- "Reklamları kaldır" IAP

## Kontrol listesi durumu

Doğrulandı: 10 birim test (150 seviyenin tamamında tarif/tolerans/ipucu kontrolü), typecheck,
build, `scripts/e2e.mjs` ile 20 kontrol (öğretici, 1–3. seviyeleri dokunarak çözme, kazanma
ekranı, geri al, boşalt, ipucu, yeniden yüklemede ilerleme, 140. seviye), konsol hatasız.

Hesap sahibine kalan adımlar:

- [ ] `capacitor.config.ts` → `appId` kendi alan adınla, sonra `npx cap sync`
- [ ] `PRIVACY.md`'yi herkese açık URL'de yayınla ve `src/main.ts` → `PRIVACY_URL`
- [ ] Android: Actions → **Android build**; release keystore ile AAB imzala
- [ ] iOS: Xcode'da `ios/App` → Team → Archive
- [ ] Mağaza formları: `store/listing.md`, `store/screenshots`, yaş anketi, veri güvenliği
