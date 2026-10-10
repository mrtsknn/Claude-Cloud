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
  complete: 'The town is lit',
  levelN: 'Level {n}',
  moves: '{n} moves',
  next: 'Next level',
  noUndo: 'Nothing to undo',
  allPlaced: 'Every window must glow exactly once',
  tooBright: 'Too bright!',
  hintDone: 'Every lamp is already in place',
  locked: 'This lamp was placed by a hint',
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
  complete: 'Kasaba aydınlandı',
  levelN: 'Seviye {n}',
  moves: '{n} hamle',
  next: 'Sonraki seviye',
  noUndo: 'Geri alınacak hamle yok',
  allPlaced: 'Her pencere tam bir kez yanmalı',
  tooBright: 'Fazla parlak!',
  hintDone: 'Tüm fenerler zaten yerinde',
  locked: 'Bu feneri ipucu yerleştirdi',
};

export const t = createI18n({ en, tr });
