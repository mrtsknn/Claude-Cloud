# Mağaza Hazırlık Kontrol Listesi

Bir oyun bu listenin tamamı işaretlenmeden "bitti" sayılmaz. Oyunun `GAME.md`'sinde durum tutulur.

## Oynanış ve cila
- [ ] Çekirdek mekanik ilk 3 saniyede anlaşılıyor; metinsiz öğretici var
- [ ] Her etkileşimde görsel + ses + haptik geri bildirim
- [ ] Oyun sonu ekranı: skor, rekor, istatistik, "Tekrar oyna", (varsa) "Devam et"
- [ ] Durum her hamlede kaydediliyor; uygulama öldürülüp açılınca devam ediyor
- [ ] Ayarlar: ses, titreşim, yeni oyun, gizlilik politikası, sürüm
- [ ] En az TR + EN; Türkçe büyük harf (İ/ı) doğru (`<html lang>` ayarlı)
- [ ] 360×640'tan 430×932'ye ve tablete kadar düzen bozulmuyor; safe-area doğru

## Kalite
- [ ] `npm test`, `npm run typecheck`, `npm run build` temiz
- [ ] Headless tarayıcıda tam oyun akışı (başla → bitir → devam et → tekrar) konsol hatasız
- [ ] Analytics olayları tanımlı ve `GAME.md`'de belgelenmiş

## Native
- [ ] `appId` kalıcı ters alan adı; `appName` doğru
- [ ] İkon (1024), adaptive ikon, splash `assets/` içinden üretilmiş (`npx capacitor-assets generate`)
- [ ] Dikey yön kilidi (Android manifest + iOS Info.plist), iPad `UIRequiresFullScreen`
- [ ] Android geri tuşu, status bar
- [ ] `versionName`/`versionCode` ve iOS `MARKETING_VERSION` güncel

## Mağaza
- [ ] `store/listing.md`: ad, alt başlık, kısa/uzun açıklama, anahtar kelimeler (TR + EN)
- [ ] Ekran görüntüleri: iOS 6.9" + 6.5", Android telefon (TR + EN)
- [ ] `PRIVACY.md` herkese açık bir URL'de; uygulama içi bağlantı bu URL'ye gidiyor
- [ ] Yaş derecelendirme anketi, veri güvenliği formu / gizlilik etiketi
- [ ] Release imzası: Android keystore (repoya **asla** konmaz), iOS dağıtım sertifikası
