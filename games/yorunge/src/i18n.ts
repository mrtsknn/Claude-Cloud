import { createI18n } from '@studio/kit';

const en = {
  tagline: 'One tap. Hop between planets.',
  tapToStart: 'Tap to start',
  perfect: 'Perfect',
  lost: 'Lost in space',
  levelShort: 'Level {n}',
  goal: 'Reach planet {n}',
  tryAgain: 'Missed! Try again',
  mission_games: 'Play {n} endless runs',
  mission_levels: 'Clear {n} levels',
  mission_stars: 'Earn {n} level stars',
  mission_perfect: 'Get 3 stars on {n} levels',
  mission_hops: 'Capture {n} planets',
  mission_perfects: 'Make {n} perfect captures',
  mission_starsCollected: 'Collect {n} stars in space',
  skin_moon: 'Moon',
  skin_comet: 'Comet',
  skin_aurora: 'Aurora',
  skin_nebula: 'Nebula',
  skin_ember: 'Ember',
  skin_ice: 'Ice',
  skin_prism: 'Prism',
};

const tr: typeof en = {
  tagline: 'Tek dokunuş. Gezegenden gezegene.',
  tapToStart: 'Başlamak için dokun',
  perfect: 'Kusursuz',
  lost: 'Uzayda kayboldun',
  levelShort: 'Seviye {n}',
  goal: '{n}. gezegene ulaş',
  tryAgain: 'Iskaladın! Tekrar dene',
  mission_games: '{n} sonsuz tur oyna',
  mission_levels: '{n} seviye geç',
  mission_stars: '{n} seviye yıldızı kazan',
  mission_perfect: '{n} seviyede 3 yıldız al',
  mission_hops: '{n} gezegen yakala',
  mission_perfects: '{n} kusursuz yakalama yap',
  mission_starsCollected: 'Uzayda {n} yıldız topla',
  skin_moon: 'Ay',
  skin_comet: 'Kuyruklu yıldız',
  skin_aurora: 'Kutup ışığı',
  skin_nebula: 'Bulutsu',
  skin_ember: 'Kor',
  skin_ice: 'Buz',
  skin_prism: 'Prizma',
};

export const lang = navigator.language.slice(0, 2).toLowerCase() === 'tr' ? 'tr' : 'en';
export const t = createI18n({ en, tr });
