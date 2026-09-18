import { calculateDamage } from "../js/damage.js";
import { emptyEvs, emptyRanks } from "../js/stats.js";
import { readFileSync } from "fs";

const pokemon = JSON.parse(readFileSync(new URL("../data/pokemon.json", import.meta.url), "utf8"));
const moves = JSON.parse(readFileSync(new URL("../data/moves.json", import.meta.url), "utf8"));

const atk = pokemon.find((p) => p.name === "マスカーニャ");
const def = pokemon.find((p) => p.name === "ブリジュラス");
const move = moves.find((m) => m.name === "アイススピナー");

const base = {
  attackerPoke: atk,
  defenderPoke: def,
  move,
  attackerEvs: { ...emptyEvs(), atk: 252, spe: 252, hp: 4 },
  defenderEvs: { ...emptyEvs(), hp: 252, def: 252, spd: 4 },
  attackerNature: "いじっぱり",
  defenderNature: "わんぱく",
  attackerItem: "こだわりハチマキ",
  defenderItem: "なし",
  attackerRanks: emptyRanks(),
  defenderRanks: emptyRanks(),
};

const withProtean = calculateDamage({
  ...base,
  attackerAbility: "へんげんじざい",
  defenderAbility: "じきゅうりょく",
});

const withoutProtean = calculateDamage({
  ...base,
  attackerAbility: "しんりょく",
  defenderAbility: "がんじょう",
});

console.log("=== マスカーニャ アイススピナー → ブリジュラス ===");
console.log("へんげんじざい + じきゅうりょく:");
console.log("  types after:", "こおり expected for STAB");
console.log("  STAB", withProtean.stab, "typeMult", withProtean.typeMult);
console.log("  ", `${withProtean.percentMin}%～${withProtean.percentMax}%　${withProtean.koText}`);
console.log("  chance", withProtean.koChance, "hits", withProtean.koHits);
console.log("  details:", withProtean.details.filter((d) => /へんげん|じきゅうりょく|STAB|こだわり|KO/.test(d)));

console.log("\nしんりょく + がんじょう (対照):");
console.log("  STAB", withoutProtean.stab, "typeMult", withoutProtean.typeMult);
console.log("  ", `${withoutProtean.percentMin}%～${withoutProtean.percentMax}%　${withoutProtean.koText}`);
