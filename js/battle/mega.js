/**
 * メガ進化（Phase 4）— 片側につき試合中1回
 */
import { calcAllStats } from "../stats.js?v=20260922f";
import { isMegaName } from "../team-store.js?v=20260922c";
import { pushLog, emit, activeOf } from "./state.js?v=20260922f";

export function baseNameFromMega(megaName) {
  if (!isMegaName(megaName)) return megaName;
  return megaName.replace(/^メガ/, "").replace(/[XYZ]$/u, "");
}

export function megaFormsFor(baseName, pokemonList) {
  if (!baseName) return [];
  return pokemonList.filter((p) => isMegaName(p.name) && baseNameFromMega(p.name) === baseName);
}

export function canMegaEvolve(battle, sideKey, pokemonList) {
  if (battle.megaUsed?.[sideKey]) return false;
  const b = activeOf(battle[sideKey]);
  if (!b || b.fainted || b.megaDone) return false;
  if (isMegaName(b.species)) return false;
  if (b.item !== "メガストーン") return false;
  return megaFormsFor(b.species, pokemonList).length > 0;
}

export function listMegaOptions(battle, sideKey, pokemonList) {
  const b = activeOf(battle[sideKey]);
  if (!b) return [];
  return megaFormsFor(b.species, pokemonList);
}

/**
 * @param {string} [formName] メガ形態名（省略時は先頭）
 */
export function performMegaEvolve(battle, sideKey, pokemonList, formName) {
  if (!canMegaEvolve(battle, sideKey, pokemonList)) return false;
  const b = activeOf(battle[sideKey]);
  const forms = megaFormsFor(b.species, pokemonList);
  const form =
    forms.find((p) => p.name === formName) ||
    forms.find((p) => p.name === b.megaTarget) ||
    forms[0];
  if (!form) return false;

  const ratio = b.maxHp > 0 ? b.hp / b.maxHp : 1;
  const oldName = b.species;
  b.species = form.name;
  b.poke = form;
  b.ability = form.abilities?.[0] || b.ability;
  b.stats = calcAllStats(form.baseStats, b.evs, b.nature);
  b.maxHp = b.stats.hp;
  b.hp = Math.max(1, Math.min(b.maxHp, Math.round(b.maxHp * ratio)));
  b.megaDone = true;
  b.item = "メガストーン";
  battle.megaUsed = battle.megaUsed || { player: false, foe: false };
  battle.megaUsed[sideKey] = true;

  pushLog(battle, `${oldName} は メガシンカ して ${form.name} になった！`);
  emit(battle, "mega", { side: sideKey, species: form.name });

  // メガ後の登場特性（ひでり等）
  return true;
}

/** 先発がすでにメガ形態なら used 扱いにする */
export function initMegaFlags(battle) {
  battle.megaUsed = { player: false, foe: false };
  for (const side of ["player", "foe"]) {
    const b = activeOf(battle[side]);
    if (b && isMegaName(b.species)) {
      b.megaDone = true;
      battle.megaUsed[side] = true;
    }
  }
}
