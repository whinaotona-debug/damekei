import { calcAllStats, emptyEvs, emptyRanks, applyRank } from "../stats.js?v=20260919e";

export function createBattler(member, pokeData, side) {
  const evs = member.evs || emptyEvs();
  const nature = member.nature || "がんばりや";
  const stats = calcAllStats(pokeData.baseStats, evs, nature);
  return {
    side,
    species: member.species,
    poke: pokeData,
    ability: member.ability || pokeData.abilities?.[0] || "",
    item: member.item || "なし",
    nature,
    evs,
    moves: (member.moves || []).filter(Boolean),
    ranks: emptyRanks(),
    maxHp: stats.hp,
    hp: stats.hp,
    stats,
    status: "なし",
    fainted: false,
    megaDone: false,
  };
}

export function createBattleState({ playerTeam, foeTeam, playerSelect, foeSelect, pokeByName }) {
  const mk = (members, side) =>
    members.map((m) => createBattler(m, pokeByName(m.species), side)).filter((b) => b.poke);

  return {
    weather: "なし",
    field: "なし",
    screens: { reflect: false, lightScreen: false, auroraVeil: false },
    turn: 0,
    log: [],
    winner: null,
    player: {
      party: mk(playerSelect, "player"),
      active: 0,
    },
    foe: {
      party: mk(foeSelect, "foe"),
      active: 0,
    },
  };
}

export function activeOf(sideState) {
  return sideState.party[sideState.active];
}

export function livingIndices(sideState) {
  return sideState.party.map((b, i) => (!b.fainted && b.hp > 0 ? i : -1)).filter((i) => i >= 0);
}

export function hpRatio(b) {
  return b.maxHp > 0 ? b.hp / b.maxHp : 0;
}

export function effectiveSpe(b) {
  let spe = applyRank(b.stats.spe, b.ranks.spe || 0);
  if (b.item === "こだわりスカーフ") spe = Math.floor(spe * 1.5);
  if (b.status === "まひ") spe = Math.floor(spe * 0.5);
  return spe;
}
