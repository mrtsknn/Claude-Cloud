import { createI18n } from '@studio/kit';

const en = {
  round: 'Round {n}',
  wave: 'Wave!',
  settings: 'Settings',
  sound: 'Sound',
  vibration: 'Vibration',
  restart: 'New game',
  resume: 'Continue',
  rounds: 'rounds',
  playAgain: 'Play again',
  tideWon: 'The tide won',
  newBest: 'New best!',
  best: 'Best {n}',
  revive: 'Rebuild castles',
  perfect: 'Perfect!',
  reachUp: 'Waves reach {n}',
  noBuckets: 'No buckets left',
  privacy: 'Privacy policy',
  buckets: 'buckets',
  castles: 'castles',
};

const tr: typeof en = {
  round: 'Tur {n}',
  wave: 'Dalga!',
  settings: 'Ayarlar',
  sound: 'Ses',
  vibration: 'Titreşim',
  restart: 'Yeni oyun',
  resume: 'Devam et',
  rounds: 'tur',
  playAgain: 'Tekrar oyna',
  tideWon: 'Deniz kazandı',
  newBest: 'Yeni rekor!',
  best: 'Rekor {n}',
  revive: 'Kaleleri yeniden kur',
  perfect: 'Kusursuz!',
  reachUp: 'Dalga menzili {n}',
  noBuckets: 'Kova kalmadı',
  privacy: 'Gizlilik politikası',
  buckets: 'kova',
  castles: 'kale',
};

export const t = createI18n({ en, tr });
