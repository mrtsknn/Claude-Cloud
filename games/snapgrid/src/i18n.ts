import { createI18n } from '@studio/kit';

const en = {
  settings: 'Settings',
  sound: 'Sound',
  vibration: 'Vibration',
  restart: 'New game',
  resume: 'Continue',
  lines: 'lines',
  moves: 'moves',
  playAgain: 'Play again',
  noMoves: 'No more space',
  newBest: 'New best!',
  best: 'Best {n}',
  combo: 'Combo x{n}',
  perfect: 'Perfect!',
  praise1: 'Good',
  praise2: 'Great!',
  praise3: 'Excellent!',
  praise4: 'Amazing!',
  praise5: 'Unreal!',
  revive: 'Continue',
  privacy: 'Privacy policy',
};

const tr: typeof en = {
  settings: 'Ayarlar',
  sound: 'Ses',
  vibration: 'Titreşim',
  restart: 'Yeni oyun',
  resume: 'Devam et',
  lines: 'satır',
  moves: 'hamle',
  playAgain: 'Tekrar oyna',
  noMoves: 'Yer kalmadı',
  newBest: 'Yeni rekor!',
  best: 'Rekor {n}',
  combo: 'Kombo x{n}',
  perfect: 'Kusursuz!',
  praise1: 'İyi',
  praise2: 'Harika!',
  praise3: 'Mükemmel!',
  praise4: 'İnanılmaz!',
  praise5: 'Efsane!',
  revive: 'Devam et',
  privacy: 'Gizlilik politikası',
};

export const t = createI18n({ en, tr });
