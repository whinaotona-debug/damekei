import { calculateDamage } from "../js/damage.js";
import { emptyEvs, emptyRanks } from "../js/stats.js";
import { readFileSync } from "fs";

const pokemon = JSON.parse(readFileSync(new URL("../data/pokemon.json", import.meta.url), "utf8"));
const moves = JSON.parse(readFileSync(new URL("../data/moves.json", import.meta.url), "utf8"));

const atk = pokemon.find((p) => p.name === "バンギラス");
const def = pokemon.find((p) => p.name === "カビゴン") || pokemon.find((p) => p.name === "ブリジュラス");
const move = moves.find((m) => m.name === "ストーンエッジ");

const atkEvs = { ...emptyEvs(), atk: 252, spe: 252, hp: 4 };
const defEvs = { ...emptyEvs(), hp: 252, def: 252, spd: 4 };

const r = calculateDamage({
  attackerPoke: atk,
  defenderPoke: def,
  move,
  attackerEvs: atkEvs,
  defenderEvs: defEvs,
  attackerNature: "いじっぱり",
  defenderNature: "ずぶとい",
  attackerAbility: atk.abilities[0],
  defenderAbility: def.abilities[0],
  attackerItem: "なし",
  defenderItem: "なし",
  attackerRanks: emptyRanks(),
  defenderRanks: emptyRanks(),
});

console.log(atk.name, "→", def.name, move.name);
console.log(`${r.percentMin}%～${r.percentMax}%　${r.koText}`);
console.log(r.min, "~", r.max, "HP", r.defenderHp);
console.log(r.effectiveness);
