import { createI18n } from '@studio/kit';

const en = {
  level: 'Level',
  undo: 'Undo',
  hint: 'Hint',
  addTube: 'Tube',
  settings: 'Settings',
  sound: 'Sound',
  vibration: 'Vibration',
  symbols: 'Color symbols',
  resume: 'Continue',
  privacy: 'Privacy policy',
  complete: 'Sorted!',
  levelN: 'Level {n}',
  moves: '{n} moves',
  next: 'Next level',
  noMoves: 'No moves left — undo or restart',
  noHint: 'No way out from here — try undo',
  noUndo: 'Nothing to undo',
  tubeAdded: 'Extra tube added',
  tubeUsed: 'Extra tube already used',
  undoRefill: '+5 undos',
};

const tr: typeof en = {
  level: 'Seviye',
  undo: 'Geri al',
  hint: 'İpucu',
  addTube: 'Tüp',
  settings: 'Ayarlar',
  sound: 'Ses',
  vibration: 'Titreşim',
  symbols: 'Renk sembolleri',
  resume: 'Devam et',
  privacy: 'Gizlilik politikası',
  complete: 'Sıralandı!',
  levelN: 'Seviye {n}',
  moves: '{n} hamle',
  next: 'Sonraki seviye',
  noMoves: 'Hamle kalmadı — geri al ya da baştan başla',
  noHint: 'Buradan çıkış yok — geri almayı dene',
  noUndo: 'Geri alınacak hamle yok',
  tubeAdded: 'Ekstra tüp eklendi',
  tubeUsed: 'Ekstra tüp zaten kullanıldı',
  undoRefill: '+5 geri alma',
};

export const t = createI18n({ en, tr });
