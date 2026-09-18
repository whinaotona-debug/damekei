import { calculateDamage } from "../js/damage.js";
import { emptyEvs, emptyRanks } from "../js/stats.js";
import { readFileSync } from "fs";

const pokemon = JSON.parse(readFileSync(new URL("../data/pokemon.json", import.meta.url), "utf8"));
const moves = JSON.parse(readFileSync(new URL("../data/moves.json", import.meta.url), "utf8"));

function run(label, input) {
  const r = calculateDamage(input);
  console.log(label);
  console.log(" ", r.percentMin + "%～" + r.percentMax + "%", r.koText, "STAB", r.stab, "type", r.moveType);
  console.log(" ", r.details.filter((d) => /メガソーラー|化け|マルチ|STAB|晴れ|無効/.test(d)).slice(0, 8));
}

const meganium = pokemon.find((p) => p.name === "メガメガニウム");
const mimikyu = pokemon.find((p) => p.name === "ミミッキュ");
const dragon = pokemon.find((p) => p.name === "カイリュー") || pokemon.find((p) => p.types?.includes("ドラゴン"));
const wb = moves.find((m) => m.name === "ウェザーボール");
const sb = moves.find((m) => m.name === "ソーラービーム");
const eq = moves.find((m) => m.name === "じしん") || moves.find((m) => m.name === "かえんほうしゃ");

run("メガソーラー ウェザーボール (天候なし)", {
  attackerPoke: meganium,
  defenderPoke: dragon,
  move: wb,
  attackerEvs: { ...emptyEvs(), spa: 252, spe: 252, hp: 4 },
  defenderEvs: { ...emptyEvs(), hp: 252, spd: 252 },
  attackerNature: "ひかえめ",
  defenderNature: "おだやか",
  attackerAbility: "メガソーラー",
  defenderAbility: dragon.abilities[0],
  attackerItem: "なし",
  defenderItem: "なし",
  attackerRanks: emptyRanks(),
  defenderRanks: emptyRanks(),
  weather: "なし",
});

run("メガソーラー ソーラービーム (雨でも半減なし想定)", {
  attackerPoke: meganium,
  defenderPoke: dragon,
  move: sb,
  attackerEvs: { ...emptyEvs(), spa: 252, spe: 252, hp: 4 },
  defenderEvs: { ...emptyEvs(), hp: 252, spd: 252 },
  attackerNature: "ひかえめ",
  defenderNature: "おだやか",
  attackerAbility: "メガソーラー",
  defenderAbility: dragon.abilities[0],
  attackerItem: "なし",
  defenderItem: "なし",
  attackerRanks: emptyRanks(),
  defenderRanks: emptyRanks(),
  weather: "あめ",
});

run("ミミッキュ ばけのかわ", {
  attackerPoke: dragon,
  defenderPoke: mimikyu,
  move: eq,
  attackerEvs: { ...emptyEvs(), atk: 252, spe: 252, hp: 4 },
  defenderEvs: { ...emptyEvs(), hp: 252, def: 252 },
  attackerNature: "いじっぱり",
  defenderNature: "ずぶとい",
  attackerAbility: dragon.abilities[0],
  defenderAbility: "ばけのかわ",
  attackerItem: "なし",
  defenderItem: "なし",
  attackerRanks: emptyRanks(),
  defenderRanks: emptyRanks(),
  disguiseBroken: false,
});
