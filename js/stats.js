/** 性格・実数値計算（Lv50 / 個体値31固定） */

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

const LEVEL = 50;
const IV = 31;

export function natureFactor(natureName, stat) {
  const n = NATURES.find((x) => x.name === natureName) || NATURES[0];
  if (stat === "hp") return 1;
  if (n.up === stat) return 1.1;
  if (n.down === stat) return 0.9;
  return 1;
}

export function calcStat(base, ev, natureName, stat) {
  if (stat === "hp") {
    return Math.floor(((base * 2 + IV + Math.floor(ev / 4)) * LEVEL) / 100) + LEVEL + 10;
  }
  const raw = Math.floor(((base * 2 + IV + Math.floor(ev / 4)) * LEVEL) / 100) + 5;
  return Math.floor(raw * natureFactor(natureName, stat));
}

export function calcAllStats(baseStats, evs, natureName) {
  const out = {};
  for (const k of STAT_KEYS) {
    out[k] = calcStat(baseStats[k], evs[k] || 0, natureName, k);
  }
  return out;
}

/** 能力ランク補正 -6〜+6 */
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

export function totalEv(evs) {
  return STAT_KEYS.reduce((s, k) => s + (evs[k] || 0), 0);
}
