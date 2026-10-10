// Builds src/levels/{en,tr}.json (main levels), daily-{en,tr}.json (daily puzzles) and counts.json:
// deterministic crossword levels from frequency-ranked dictionaries. Run with
// `npm run levels -w games/wordlink` (only needed when tuning).
//
// Sources (dev dependencies, not shipped):
//   English: SCOWL frequency tiers via `wordlist-english` (10/20 = answers, up to 50 = bonus)
//   Turkish: OpenSubtitles frequency list (`@zxcvbn-ts/language-tr`) ∩ Wiktionary lemmas
//            (`turkish-wordlist`), minus person names
//   Both:    profanity removed with `naughty-words` + a hand-written blocklist; grid answers
//            are further limited to the hand-reviewed allowlists in scripts/reviewed-<lang>.txt
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** v1.0 shipped 400 levels per language; they never change (saved progress points into them). */
const BASE_LEVELS = 400;
/** Upper bound for the v1.1 extension; the allowlist decides how many there really are. */
const MAX_LEVELS = 1000;
/** Levels per chapter (src/chapters.ts); the extension always ends on a full chapter. */
const CHAPTER = 10;
/** [min, max] grid answers per wheel size for levels 401+. */
const EXTENSION_WORDS = { 5: [4, 6], 6: [5, 8], 7: [6, 9] };
/** A year of daily puzzles before the cycle repeats. */
const DAILY_PUZZLES = 366;
const DAILY_WORDS = { 6: [5, 7], 7: [6, 8] };
const MAX_GRID = 10;

// ───────────────────────── dictionaries ─────────────────────────
// Exact-match removals found by reviewing every answer word by hand: slurs, insults, body,
// alcohol, violence, religion, proper nouns, abbreviations and words unfit for all ages.
const EXTRA_BLOCK = {
  en: `nazi rape raped rapes slut whore porn nude nudes sexy sex sexes kill kills killed killer drug drugs dead die dies died
    gun guns bomb bombs hell damn god gods jesus satan devil drunk beer beers wine wines vodka gay lesbian negro jew jews arab arabs
    fat ugly stupid idiot moron dumb suicide murder corpse bitch piss pee poop butt boob boobs bra nipple penis anus anal cum ass
    arse tit tits homo fag dyke pimp hooker kinky orgy erotic abuse adult bashing bust coke corrupt cruel depress disease drown
    dole grave grim hanged hang hangs hate hates harmful illegal mad naughty nun riot rot sins spit steal stole swore vile war
    wee drivel inane routs sic hes cant amp mod char chars inter thous leach rends ranted vice censor saint sacred creed sober
    pint pints liver nonce sin sinned sinner hump humps screw screws crap dope weed death corpses priest holy cult
    cums scum nasty gin poisons poison hated sermon thou buss`.split(/\s+/),
  tr: `vajina yavşak lanet popo seks sevişmek öldür ölmek ölme ölü ceset intihar cinayet katil katliam silah bomba tabanca
    içki bira şarap rakı votka kokteyl martini sarhoş uyuşturucu esrar eroin kokain şeytan cehennem allah tanrı dinsiz gavur
    zenci pezevenk kaltak fahişe orospu ibne gey lezbiyen aptal salak gerizekalı ahmak mal şişko şişman çirkin meme göğüs
    kalça çıplak porno penis sik göt kıç işemek bok boktan osur tecavüz kafir nazi domuz eşek köpek piç puşt kahpe dangalak
    hıyar öküz abd amin arap cinsel dimi halt karı karıma lan ulan leş manyak moruk sürtük ırkçı işkence ezik köle mason
    martin oral mars mail data star lake sam sara erin kont haç dayak sakat deli delilik kumar nişancı soyunma enjekte
    saldırı kilise ilahi vallahi sapık idam rahibe kutsal şeytani lanetli salakça silahlı ispanya darbe isyan kanser`.split(/\s+/),
};

const ALPHABET = {
  en: 'abcdefghijklmnopqrstuvwxyz',
  tr: 'abcçdefgğhıijklmnoöprsştuüvyz',
};

function blocklist(lang) {
  const naughty = json(join(pkgDir('naughty-words'), `${lang}.json`)).map((w) => w.toLocaleLowerCase(lang));
  const words = new Set([...naughty, ...EXTRA_BLOCK[lang].filter(Boolean)]);
  // Profanity roots (4+ letters) also block derived forms ("orospu" → "orospular"). The hand
  // list stays exact-match so innocent words survive ("deli" must not block "delik").
  const roots = naughty.filter((w) => w.length >= 4 && !w.includes(' '));
  return (w) => words.has(w) || roots.some((r) => w.startsWith(r));
}

function loadEnglish() {
  const dir = pkgDir('wordlist-english');
  const tier = (n) => [...json(join(dir, `english-words-${n}.json`)), ...json(join(dir, `american-words-${n}.json`))];
  const clean = (list) => list.filter((w) => /^[a-z]+$/.test(w));
  // SCOWL tiers are alphabetical inside, so order by tier and shuffle within each tier;
  // "earlier in the list" then means "more common", as it does for Turkish.
  const rng = seededRng(99);
  const mix = (list) => list.map((w) => [rng(), w]).sort((x, y) => x[0] - y[0]).map(([, w]) => w);
  const t10 = [...new Set(clean(tier(10)))];
  const t20 = [...new Set(clean(tier(20)))].filter((w) => !t10.includes(w));
  return {
    answers: [...mix(t10), ...mix(t20)],
    valid: new Set(clean([...tier(10), ...tier(20), ...tier(35), ...tier(40), ...tier(50)])),
  };
}

function loadTurkish() {
  const src = join(pkgDir('@zxcvbn-ts/language-tr'), 'src');
  const common = json(join(src, 'commonWords.json'));
  const names = new Set([...json(join(src, 'firstnames.json')), ...json(join(src, 'lastnames.json'))].map((w) => w.toLocaleLowerCase('tr')));
  const lemmas = new Set(readFileSync(join(pkgDir('turkish-wordlist'), 'wordlist.txt'), 'utf8').split('\n').map((l) => l.trim()));
  const words = common.filter((w) => lemmas.has(w) && !names.has(w));
  return { answers: words.slice(0, 3200), valid: new Set(words) };
}

// ───────────────────────── helpers ─────────────────────────
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const counts = (w) => {
  const m = new Map();
  for (const ch of w) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
};
function formable(word, pool) {
  const need = counts(word);
  for (const [ch, n] of need) if ((pool.get(ch) ?? 0) < n) return false;
  return true;
}

/** Wheel size by level: 4 letters at first, up to 7. */
function lettersFor(level) {
  if (level <= 10) return 4;
  if (level <= 35) return 5;
  if (level <= 110) return 6;
  return 7;
}
/** [min, max] answers in the grid; the very first levels stay tiny. */
function targetWords(n, level) {
  if (level <= 3) return [2, 3];
  return { 4: [3, 4], 5: [4, 6], 6: [5, 8], 7: [6, 9] }[n];
}

// ───────────────────────── crossword layout ─────────────────────────
/**
 * Greedy crossword: longest word across, then each next word crosses an existing one at a
 * shared letter. Rejects placements that touch other words side-by-side (classic rules).
 */
function layout(words) {
  const grid = new Map(); // "r,c" -> letter
  const placed = [];
  const get = (r, c) => grid.get(`${r},${c}`);

  const fits = (w, r, c, dir) => {
    const dr = dir === 'v' ? 1 : 0;
    const dc = dir === 'h' ? 1 : 0;
    if (get(r - dr, c - dc) || get(r + dr * w.length, c + dc * w.length)) return -1;
    let crossings = 0;
    for (let i = 0; i < w.length; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const cur = get(rr, cc);
      if (cur) {
        if (cur !== w[i]) return -1;
        crossings++;
        continue;
      }
      // no side neighbours on empty cells
      if (get(rr + dc, cc + dr) || get(rr - dc, cc - dr)) return -1;
    }
    return crossings;
  };
  const bounds = (extra) => {
    let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    const cells = [...grid.keys()].map((k) => k.split(',').map(Number)).concat(extra);
    for (const [r, c] of cells) {
      r0 = Math.min(r0, r); r1 = Math.max(r1, r);
      c0 = Math.min(c0, c); c1 = Math.max(c1, c);
    }
    return { r0, r1, c0, c1, h: r1 - r0 + 1, w: c1 - c0 + 1 };
  };
  const put = (w, r, c, dir) => {
    for (let i = 0; i < w.length; i++) grid.set(`${dir === 'v' ? r + i : r},${dir === 'h' ? c + i : c}`, w[i]);
    placed.push({ w, r, c, d: dir });
  };

  put(words[0], 0, 0, 'h');
  for (const w of words.slice(1)) {
    let best = null;
    for (const p of placed) {
      for (let i = 0; i < p.w.length; i++) {
        for (let j = 0; j < w.length; j++) {
          if (p.w[i] !== w[j]) continue;
          const dir = p.d === 'h' ? 'v' : 'h';
          const r = p.d === 'h' ? p.r - j : p.r + i;
          const c = p.d === 'h' ? p.c + i : p.c - j;
          const x = fits(w, r, c, dir);
          if (x < 1) continue;
          const cells = Array.from({ length: w.length }, (_, k) => [dir === 'v' ? r + k : r, dir === 'h' ? c + k : c]);
          const b = bounds(cells);
          if (b.h > MAX_GRID || b.w > MAX_GRID) continue;
          const score = b.h * b.w + Math.abs(b.h - b.w) * 2 - x * 3;
          if (!best || score < best.score) best = { r, c, dir, score };
        }
      }
    }
    if (best) put(w, best.r, best.c, best.dir);
  }
  const b = bounds([]);
  return { rows: b.h, cols: b.w, words: placed.map((p) => ({ w: p.w, r: p.r - b.r0, c: p.c - b.c0, d: p.d })) };
}

// ───────────────────────── level building ─────────────────────────
function build(lang, dict) {
  const blocked = blocklist(lang);
  const alpha = new Set(ALPHABET[lang]);
  const okWord = (w) => w.length >= 3 && [...w].every((ch) => alpha.has(ch)) && !blocked(w);
  // Answers (shown in the grid) come only from words a person has read and approved:
  // scripts/reviewed-<lang>.txt. Anything else can at most be accepted as a bonus word.
  const reviewed = new Set(readFileSync(join(here, `reviewed-${lang}.txt`), 'utf8').split('\n').filter(Boolean));
  const answers = dict.answers.filter((w) => okWord(w) && reviewed.has(w));
  const answerRank = new Map(answers.map((w, i) => [w, i]));
  const valid = [...dict.valid].filter(okWord);
  const rng = seededRng(lang === 'en' ? 1234 : 5678);
  const usedSeeds = new Set();
  const levels = [];

  /**
   * One crossword level from a seed word: the seed plus up to maxW - 1 of its sub-words
   * (only reviewed answers), laid out greedily. `avoid` pushes words to the end of the queue
   * (the daily pack uses it to differ from the main level with the same letters).
   */
  function makeLevel(seed, n, minW, maxW, rankLimit, avoid = new Set()) {
    const pool = counts(seed);
    const subs = answers.filter((w) => w.length <= n && formable(w, pool) && (answerRank.get(w) ?? 1e9) < rankLimit);
    if (subs.length < minW - 1) return null;
    // Prefer the seed itself, then longer and more common words, skipping near-duplicates
    // such as "age" next to "ages" (those stay valid as bonus words).
    const sorted = subs
      .filter((w) => w !== seed)
      .sort((a, b) => Number(avoid.has(a)) - Number(avoid.has(b)) || b.length - a.length || answerRank.get(a) - answerRank.get(b));
    const ordered = [seed];
    for (const w of sorted) if (!ordered.some((o) => o.startsWith(w) && o.length - w.length <= 2)) ordered.push(w);
    const grid = layout(ordered.slice(0, maxW));
    if (grid.words.length < minW) return null;
    const answerSet = new Set(grid.words.map((x) => x.w));
    const bonus = valid.filter((w) => w.length <= n && !answerSet.has(w) && formable(w, pool));
    return { rows: grid.rows, cols: grid.cols, words: grid.words, bonus };
  }

  // v1.0 levels 1–400. This loop must stay exactly as it is: saved player progress points into
  // these levels, and the shared rng sequence makes every later level depend on it too.
  for (let level = 1; levels.length < BASE_LEVELS; level++) {
    const n = lettersFor(level);
    const [minW, maxW] = targetWords(n, level);
    // Early levels pick seeds from the most common words; later ones from the wider pool.
    const poolSize = Math.min(answers.length, 600 + level * 12);
    const seeds = answers.slice(0, Math.max(poolSize, 1500)).filter((w) => w.length === n);
    let made = null;
    for (let attempt = 0; attempt < 2000 && !made; attempt++) {
      const seed = seeds[Math.floor(rng() * seeds.length)];
      const key = [...seed].sort().join('');
      if (usedSeeds.has(key)) continue;
      const lvl = makeLevel(seed, n, minW, maxW, Math.max(poolSize * 2, 2000));
      if (!lvl) continue;
      usedSeeds.add(key);
      made = { letters: shuffle(seed, rng), ...lvl };
    }
    if (!made) throw new Error(`${lang}: could not build level ${level} (${n} letters)`);
    levels.push(made);
  }

  // v1.1 extension (401+): every letter set the allowlist still has — no wheel ever repeats.
  // 7-letter sets are nearly used up by then, so chapters mix 5-, 6- and 7-letter wheels in even
  // proportions and climb inside each chapter of 10 (5 → 6 → 7 letters) for a steady ramp.
  const unusedSeeds = (n) => {
    const byKey = new Map();
    for (const w of answers) {
      if (w.length !== n) continue;
      const key = [...w].sort().join('');
      if (!usedSeeds.has(key) && !byKey.has(key)) byKey.set(key, w); // most common anagram
    }
    return mix([...byKey.values()], rng);
  };
  const pools = {};
  for (const n of [7, 6, 5]) {
    const [minW, maxW] = EXTENSION_WORDS[n];
    pools[n] = [];
    for (const seed of unusedSeeds(n)) {
      const lvl = makeLevel(seed, n, minW, maxW, Infinity);
      if (!lvl) continue;
      usedSeeds.add([...seed].sort().join(''));
      pools[n].push({ letters: shuffle(seed, rng), ...lvl });
    }
  }
  const total = Math.min(MAX_LEVELS - BASE_LEVELS, pools[7].length + pools[6].length + pools[5].length);
  // Usable chapter count only: a trailing partial chapter would end without a celebration.
  const ext = [];
  const size = { 7: pools[7].length, 6: pools[6].length, 5: pools[5].length };
  const left = { ...size };
  for (let i = 0; i < total - (total % CHAPTER); i++) {
    // Take from the pool that is furthest behind its share, so the mix stays even.
    const n = [7, 6, 5].filter((k) => left[k] > 0).sort((a, b) => left[b] / size[b] - left[a] / size[a])[0];
    ext.push(pools[n][size[n] - left[n]]);
    left[n]--;
  }
  for (let c = 0; c < ext.length; c += CHAPTER) {
    const chapter = ext.slice(c, c + CHAPTER).sort((a, b) => a.letters.length - b.letters.length || a.words.length - b.words.length);
    levels.push(...chapter);
  }

  // Daily puzzles: 6- and 7-letter wheels, same for every player on the same calendar day
  // (src/daily.ts picks one by day number). They may share letters with a main level, but the
  // grid prefers the words that level does not use.
  const mainAnswers = new Map(levels.map((l) => [[...l.letters].sort().join(''), new Set(l.words.map((p) => p.w))]));
  const dailyRng = seededRng(lang === 'en' ? 4321 : 8765);
  const dailySeeds = new Map();
  for (const w of answers) {
    if (w.length < 6) continue;
    const key = [...w].sort().join('');
    if (!dailySeeds.has(key)) dailySeeds.set(key, w);
  }
  const daily = [];
  for (const seed of mix([...dailySeeds.values()], dailyRng)) {
    if (daily.length >= DAILY_PUZZLES) break;
    const [minW, maxW] = DAILY_WORDS[seed.length];
    const lvl = makeLevel(seed, seed.length, minW, maxW, Infinity, mainAnswers.get([...seed].sort().join('')));
    if (lvl) daily.push({ letters: shuffle(seed, dailyRng), ...lvl });
  }
  return { levels, daily };
}

/** Deterministic shuffle of a whole list. */
function mix(list, rng) {
  return list.map((w) => [rng(), w]).sort((x, y) => x[0] - y[0]).map(([, w]) => w);
}

function shuffle(word, rng) {
  const a = [...word];
  for (let tries = 0; tries < 10; tries++) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.join('') !== word) break;
  }
  return a.join('');
}

const outDir = join(here, '..', 'src', 'levels');
mkdirSync(outDir, { recursive: true });
const counts_ = {};
for (const [lang, dict] of [['en', loadEnglish()], ['tr', loadTurkish()]]) {
  const { levels, daily } = build(lang, dict);
  writeFileSync(join(outDir, `${lang}.json`), JSON.stringify(levels));
  writeFileSync(join(outDir, `daily-${lang}.json`), JSON.stringify(daily));
  counts_[lang] = { levels: levels.length, daily: daily.length };
  const words = levels.reduce((s, l) => s + l.words.length, 0);
  const mixOf = (from, to) => [5, 6, 7].map((n) => `${n}:${levels.slice(from, to).filter((l) => l.letters.length === n).length}`).join(' ');
  console.log(`${lang}: ${levels.length} levels (401+ mix ${mixOf(BASE_LEVELS)}), ${words} answers, ${daily.length} daily puzzles`);
}
// Level counts for the app (profile size, map length) without loading the packs.
writeFileSync(join(outDir, 'counts.json'), JSON.stringify(counts_));
