import { createI18n } from '@studio/kit';

const en = {
  round: 'Round {n}',
  wave: 'Wave!',
  tideWon: 'The tide won',
  tagline: 'Build walls, hold back the tide',
  beach: 'Endless beach',
  mission_games: 'Play {n} games',
  mission_castles: 'Save {n} castles from waves',
  mission_rounds: 'Survive {n} rounds',
  mission_walls: 'Build {n} sand walls',
  skin_classic: 'Golden beach',
  skin_tropical: 'Tropical',
  skin_sunset: 'Sunset',
  skin_coral: 'Coral',
  skin_arctic: 'Arctic',
  skin_night: 'Moonlight',
  perfect: 'Perfect!',
  reachUp: 'Waves reach {n}',
  noBuckets: 'No buckets left',
};

const tr: typeof en = {
  round: 'Tur {n}',
  wave: 'Dalga!',
  tideWon: 'Deniz kazandı',
  tagline: 'Duvar ör, denizi geri tut',
  beach: 'Sonsuz sahil',
  mission_games: '{n} oyun oyna',
  mission_castles: 'Dalgalardan {n} kale kurtar',
  mission_rounds: '{n} tur hayatta kal',
  mission_walls: '{n} kum duvarı ör',
  skin_classic: 'Altın sahil',
  skin_tropical: 'Tropik',
  skin_sunset: 'Gün batımı',
  skin_coral: 'Mercan',
  skin_arctic: 'Kutup',
  skin_night: 'Ay ışığı',
  perfect: 'Kusursuz!',
  reachUp: 'Dalga menzili {n}',
  noBuckets: 'Kova kalmadı',
};

export const t = createI18n({ en, tr });
