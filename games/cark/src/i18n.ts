import { createI18n } from '@studio/kit';

const en = {
  level: 'Level',
  undo: 'Undo',
  hint: 'Hint',
  settings: 'Settings',
  sound: 'Sound',
  vibration: 'Vibration',
  resume: 'Continue',
  privacy: 'Privacy policy',
  complete: 'Ticking!',
  levelN: 'Level {n}',
  gears: '{n} gears · par {p}',
  next: 'Next level',
  noUndo: 'Nothing to undo',
  noGears: 'No gears left — tap a gear to take it back',
  jam: 'Jammed! A loop forces a gear both ways',
  locked: 'Hint gears stay put',
  hintFree: 'Hint placed',
  noHint: 'Take back a gear to make room for the hint',
};

const tr: typeof en = {
  level: 'Seviye',
  undo: 'Geri al',
  hint: 'İpucu',
  settings: 'Ayarlar',
  sound: 'Ses',
  vibration: 'Titreşim',
  resume: 'Devam et',
  privacy: 'Gizlilik politikası',
  complete: 'Tık tık!',
  levelN: 'Seviye {n}',
  gears: '{n} çark · hedef {p}',
  next: 'Sonraki seviye',
  noUndo: 'Geri alınacak hamle yok',
  noGears: 'Çark kalmadı — geri almak için bir çarka dokun',
  jam: 'Sıkıştı! Bir döngü çarkı iki yöne zorluyor',
  locked: 'İpucu çarkları sabittir',
  hintFree: 'İpucu yerleştirildi',
  noHint: 'İpucu için yer aç: bir çarkı geri al',
};

export const t = createI18n({ en, tr });
