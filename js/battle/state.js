/**
 * 対戦シミュ — BattleState / PokemonState（Phase 4）
 */
import { calcAllStats, emptyEvs, emptyRanks, applyRank } from "../stats.js?v=20260922f";
import { emptySideHazards } from "./hazards.js?v=20260922f";
import { isMegaName } from "../team-store.js?v=20260922c";

export function createBattler(member, pokeData, side, movesDb = []) {
  const evs = member.evs || emptyEvs();
  const nature = member.nature || "がんばりや";
  const stats = calcAllStats(pokeData.baseStats, evs, nature);
  const moveNames = (member.moves || []).filter(Boolean).slice(0, 4);
  const moves = moveNames.map((name) => {
    const mv = movesDb.find((m) => m.name === name);
    const maxPp = Number(mv?.pp) > 0 ? Number(mv.pp) : 8;
    return { name, pp: maxPp, maxPp };
  });

  const alreadyMega = isMegaName(member.species);

  return {
    side,
    species: member.species,
    poke: pokeData,
    ability: member.ability || pokeData.abilities?.[0] || "",
    item: member.item || "なし",
    nature,
    evs,
    moves,
    ranks: emptyRanks(),
    maxHp: stats.hp,
    hp: stats.hp,
    stats,
    status: "なし",
    fainted: false,
    megaDone: alreadyMega,
    megaTarget: member.megaTarget || "",
    _protect: false,
    _magicCoat: false,
    _toxic: 0,
    _sleep: 0,
    _leechSeed: false,
    _yawn: 0,
    _sashUsed: false,
    substituteHP: 0,
    _switchedInTurn: 0,
    _destinyBond: false,
  };
}

export function createBattleState({ playerSelect, foeSelect, pokeByName, movesDb }) {
  const mk = (members, side) =>
    members
      .map((m) => {
        const poke = pokeByName(m.species);
        if (!poke) return null;
        return createBattler(m, poke, side, movesDb || []);
      })
      .filter(Boolean);

  return {
    weather: "なし",
    weatherTurns: 0,
    field: "なし",
    fieldTurns: 0,
    trickRoom: 0,
    tailwind: { player: 0, foe: 0 },
    mist: { player: 0, foe: 0 },
    safeguard: { player: 0, foe: 0 },
    megaUsed: { player: false, foe: false },
    turn: 0,
    log: [],
    events: [],
    winner: null,
    pendingSwitch: null,
    pendingPivot: null,
    pendingForce: null,
    _batonRanks: null,
    hazards: {
      player: emptySideHazards(),
      foe: emptySideHazards(),
    },
    sideEffects: {
      player: { reflect: 0, lightScreen: 0, auroraVeil: 0 },
      foe: { reflect: 0, lightScreen: 0, auroraVeil: 0 },
    },
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
  if (!b || !(b.maxHp > 0)) return 0;
  return b.hp / b.maxHp;
}

export function effectiveSpe(b, battle) {
  if (!b) return 0;
  let spe = applyRank(b.stats.spe, b.ranks.spe || 0);
  if (b.item === "こだわりスカーフ") spe = Math.floor(spe * 1.5);
  if (b.item === "くろいてっきゅう") spe = Math.floor(spe * 0.5);
  if (b.status === "まひ" && b.ability !== "じゅうなん") spe = Math.floor(spe * 0.5);
  if (battle?.weather === "すなあらし" && b.ability === "すなかき") spe = Math.floor(spe * 2);
  if (battle?.weather === "あめ" && b.ability === "すいすい") spe = Math.floor(spe * 2);
  if (battle?.weather === "はれ" && b.ability === "ようりょくそ") spe = Math.floor(spe * 2);
  if (battle?.tailwind?.[b.side] > 0) spe = Math.floor(spe * 2);
  return spe;
}

export function pushLog(battle, msg) {
  battle.log.push(msg);
  if (battle.log.length > 140) battle.log.shift();
}

export function emit(battle, type, data = {}) {
  if (!battle.events) battle.events = [];
  battle.events.push({ type, ...data });
}

export function takeEvents(battle) {
  const ev = battle.events || [];
  battle.events = [];
  return ev;
}
