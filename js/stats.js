/** 実数値計算（Lv50・個体値31固定の簡略式）
 * HP   = 種族値 + 75 + 努力値
 * 他   = floor( (種族値 + 20 + 努力値) × 性格補正 )
 * 努力値: 1項最大32 / 合計最大66
 */

export const EV_MAX_PER = 32;
export const EV_MAX_TOTAL = 66;

/** 上昇列→下降行 の性格表（添付表どおり） */
export const NATURE_TABLE = {
  // down -> up -> name
  atk: { spa: "ひかえめ", def: "ずぶとい", spd: "おだやか", spe: "おくびょう" },
  spa: { atk: "いじっぱり", def: "わんぱく", spd: "しんちょう", spe: "ようき" },
  def: { atk: "さみしがり", spa: "おっとり", spd: "おとなしい", spe: "せっかち" },
  spd: { atk: "やんちゃ", spa: "うっかりや", def: "のうてんき", spe: "むじゃき" },
  spe: { atk: "ゆうかん", spa: "れいせい", def: "のんき", spd: "なまいき" },
};

export const NEUTRAL_NATURES = ["がんばりや", "すなお", "てれや", "きまぐれ", "まじめ"];

export const NATURE_STAT_ORDER = ["atk", "spa", "def", "spd", "spe"];

export const NATURES = [
  { name: "がんばりや", up: null, down: null },
  { name: "さみしがり", up: "atk", down: "def" },
  { name: "いじっぱり", up: "atk", down: "spa" },
  { name: "やんちゃ", up: "atk", down: "spd" },
  { name: "ゆうかん", up: "atk", down: "spe" },
  { name: "ずぶとい", up: "def", down: "atk" },
  { name: "すなお", up: null, down: null },
  { name: "わんぱく", up: "def", down: "spa" },
  { name: "のうてんき", up: "def", down: "spd" },
  { name: "のんき", up: "def", down: "spe" },
  { name: "ひかえめ", up: "spa", down: "atk" },
  { name: "おっとり", up: "spa", down: "def" },
  { name: "てれや", up: null, down: null },
  { name: "うっかりや", up: "spa", down: "spd" },
  { name: "れいせい", up: "spa", down: "spe" },
  { name: "おだやか", up: "spd", down: "atk" },
  { name: "おとなしい", up: "spd", down: "def" },
  { name: "しんちょう", up: "spd", down: "spa" },
  { name: "きまぐれ", up: null, down: null },
  { name: "なまいき", up: "spd", down: "spe" },
  { name: "おくびょう", up: "spe", down: "atk" },
  { name: "せっかち", up: "spe", down: "def" },
  { name: "ようき", up: "spe", down: "spa" },
  { name: "むじゃき", up: "spe", down: "spd" },
  { name: "まじめ", up: null, down: null },
];

export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
export const STAT_LABELS = {
  hp: "HP",
  atk: "攻撃",
  def: "防御",
  spa: "特攻",
  spd: "特防",
  spe: "素早さ",
};

/** 攻撃側に表示する項目 */
export const ATK_VISIBLE_STATS = ["atk", "spa"];
/** 防御側に表示する項目 */
export const DEF_VISIBLE_STATS = ["hp", "def", "spd"];

export function getNature(natureName) {
  return NATURES.find((x) => x.name === natureName) || NATURES[0];
}

export function natureFactor(natureName, stat) {
  const n = getNature(natureName);
  if (stat === "hp") return 1;
  if (n.up === stat) return 1.1;
  if (n.down === stat) return 0.9;
  return 1;
}

export function calcStat(base, ev, natureName, stat) {
  const e = Math.max(0, Math.min(EV_MAX_PER, ev || 0));
  if (stat === "hp") {
    // HP = 種族値 + 75 + 努力値
    return base + 75 + e;
  }
  // 他 = floor((種族値 + 20 + 努力値) × 性格)
  return Math.floor((base + 20 + e) * natureFactor(natureName, stat));
}

export function calcAllStats(baseStats, evs, natureName) {
  const out = {};
  for (const k of STAT_KEYS) {
    out[k] = calcStat(baseStats[k], evs[k] || 0, natureName, k);
  }
  return out;
}

export function rankMultiplier(rank) {
  if (rank >= 0) return (2 + rank) / 2;
  return 2 / (2 - rank);
}

export function applyRank(statValue, rank) {
  return Math.floor(statValue * rankMultiplier(rank));
}

export function emptyEvs() {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

export function emptyRanks() {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
}

/** 性格補正を倍率で持つ（0.9 / 1 / 1.1） */
export function emptyNatureMults() {
  return { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
}

export function natureMultsFromName(natureName) {
  const m = emptyNatureMults();
  for (const k of Object.keys(m)) {
    m[k] = natureFactor(natureName, k);
  }
  return m;
}

export function clampNatureMult(v) {
  const n = Number(v);
  if (n <= 0.95) return 0.9;
  if (n >= 1.05) return 1.1;
  return 1;
}

export function calcAllStatsFromMults(baseStats, evs, natureMults) {
  const mults = natureMults || emptyNatureMults();
  const out = {};
  for (const k of STAT_KEYS) {
    const e = Math.max(0, Math.min(EV_MAX_PER, (evs && evs[k]) || 0));
    const base = baseStats[k] || 0;
    if (k === "hp") {
      out[k] = base + 75 + e;
    } else {
      const f = clampNatureMult(mults[k] ?? 1);
      out[k] = Math.floor((base + 20 + e) * f);
    }
  }
  return out;
}

export function totalEv(evs) {
  return STAT_KEYS.reduce((s, k) => s + (evs[k] || 0), 0);
}

/** 合計66を超えないよう、指定ステに値を入れる */
export function clampEvAssign(evs, key, value) {
  const next = { ...evs };
  const others = totalEv(evs) - (evs[key] || 0);
  const maxForKey = Math.min(EV_MAX_PER, EV_MAX_TOTAL - others);
  next[key] = Math.max(0, Math.min(maxForKey, value));
  return next;
}
