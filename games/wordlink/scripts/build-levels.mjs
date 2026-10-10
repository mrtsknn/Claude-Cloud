// Builds src/levels/{en,tr}.json: deterministic crossword levels from frequency-ranked
// dictionaries. Run with `npm run levels -w games/wordlink` (only needed when tuning).
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

const LEVELS = 400;
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

  for (let level = 1; levels.length < LEVELS; level++) {
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
      const pool = counts(seed);
      const subs = answers.filter((w) => w.length <= n && formable(w, pool) && (answerRank.get(w) ?? 1e9) < Math.max(poolSize * 2, 2000));
      if (subs.length < minW - 1) continue;
      // Prefer the seed itself, then longer and more common words, skipping near-duplicates
      // such as "age" next to "ages" (those stay valid as bonus words).
      const sorted = subs.filter((w) => w !== seed).sort((a, b) => b.length - a.length || answerRank.get(a) - answerRank.get(b));
      const ordered = [seed];
      for (const w of sorted) if (!ordered.some((o) => o.startsWith(w) && o.length - w.length <= 2)) ordered.push(w);
      const grid = layout(ordered.slice(0, maxW));
      if (grid.words.length < minW) continue;
      const answerSet = new Set(grid.words.map((x) => x.w));
      const bonus = valid.filter((w) => w.length <= n && !answerSet.has(w) && formable(w, pool));
      usedSeeds.add(key);
      made = { letters: shuffle(seed, rng), rows: grid.rows, cols: grid.cols, words: grid.words, bonus };
    }
    if (!made) throw new Error(`${lang}: could not build level ${level} (${n} letters)`);
    levels.push(made);
  }
  return levels;
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
for (const [lang, dict] of [['en', loadEnglish()], ['tr', loadTurkish()]]) {
  const levels = build(lang, dict);
  writeFileSync(join(outDir, `${lang}.json`), JSON.stringify(levels));
  const words = levels.reduce((s, l) => s + l.words.length, 0);
  console.log(`${lang}: ${levels.length} levels, ${words} answers, sample:`, levels.slice(0, 3).map((l) => l.words.map((w) => w.w).join('/')).join('  '));
}
