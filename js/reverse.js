/**
 * ダメージから努力値・性格補正を逆算（Champions: 1項32 / 合計66）
 */
import {
  EV_MAX_PER,
  emptyEvs,
  emptyRanks,
  NATURES,
  STAT_LABELS,
} from "./stats.js?v=20260922i";
import { calculateDamage } from "./damage.js?v=20260922j";

export const SHORT = { hp: "H", atk: "A", def: "B", spa: "C", spd: "D", spe: "S" };

/** 指定ステに factor(0.9/1/1.1) を持つ性格を1つ返す */
export function natureWithFactor(stat, factor) {
  if (stat === "hp" || factor === 1) {
    return NATURES.find((n) => !n.up && !n.down)?.name || "がんばりや";
  }
  if (factor === 1.1) {
    const hit = NATURES.find((n) => n.up === stat);
    return hit?.name || "がんばりや";
  }
  if (factor === 0.9) {
    const hit = NATURES.find((n) => n.down === stat);
    return hit?.name || "がんばりや";
  }
  return "がんばりや";
}

export function formatNatureMod(stat, factor) {
  const s = SHORT[stat] || stat;
  if (factor === 1.1) return `${s}×1.1↑`;
  if (factor === 0.9) return `${s}×0.9↓`;
  return "補正なし";
}

function keyStat(category, side) {
  const phys = category === "物理";
  if (side === "offense") return phys ? "atk" : "spa";
  return phys ? "def" : "spd";
}

function moveCategory(move, category) {
  if (category === "物理" || category === "特殊") return category;
  return move?.category === "物理" ? "物理" : "特殊";
}

function rangeMatches(observed, lo, hi, exactList) {
  const { minDmg, maxDmg } = observed;
  if (minDmg === maxDmg) {
    if (exactList?.length) return exactList.includes(minDmg);
    return minDmg >= lo && minDmg <= hi;
  }
  return !(hi < minDmg || lo > maxDmg);
}

function rollsContain(result, observed) {
  if (!result || result.error) return false;
  // 生ダメージ（実戦の削り）と、ダメ計の回復差し引き表示のどちらでも照合する
  const rolls = result.rolls || [];
  const heal = Number(result.healPerTurn || 0);
  const rawLo = rolls.length
    ? Math.min(...rolls)
    : Number(result.rawMin ?? result.min ?? 0);
  const rawHi = rolls.length
    ? Math.max(...rolls)
    : Number(result.rawMax ?? result.max ?? 0);
  if (rangeMatches(observed, rawLo, rawHi, rolls)) return true;
  if (heal > 0) {
    const adj = rolls.map((r) => Math.max(0, r - heal));
    const adjLo = adj.length ? Math.min(...adj) : Number(result.min ?? 0);
    const adjHi = adj.length ? Math.max(...adj) : Number(result.max ?? 0);
    if (rangeMatches(observed, adjLo, adjHi, adj)) return true;
  }
  return false;
}

function baseInput(opts) {
  return {
    attackerRanks: opts.attackerRanks || emptyRanks(),
    defenderRanks: opts.defenderRanks || emptyRanks(),
    attackerStatus: opts.attackerStatus || "なし",
    defenderStatus: opts.defenderStatus || "なし",
    weather: opts.weather || "なし",
    field: opts.field || "なし",
    screens: opts.screens || {},
    critical: !!opts.critical,
    gravity: !!opts.gravity,
    helpBoost: !!opts.helpBoost,
    stealthRock: !!opts.stealthRock,
    spikes: opts.spikes || 0,
    leechSeed: !!opts.leechSeed,
    burn: !!opts.burn,
    poison: opts.poison || null,
    disguiseBroken: !!opts.disguiseBroken,
    hpNotFull: !!opts.hpNotFull,
    movingLast: !!opts.movingLast,
  };
}

/**
 * 相手に殴られた → 相手の A/C 努力値と性格補正を逆算
 */
export function reverseOffense(opts) {
  const {
    myPoke,
    myMember,
    foePoke,
    move,
    observed,
    foeItem = "なし",
    foeAbility = "",
  } = opts;
  const category = moveCategory(move, opts.category);
  const calcMove = { ...move, category };
  const atkKey = keyStat(category, "offense");
  const factors = [1.1, 1.0, 0.9];
  const hits = [];

  for (const factor of factors) {
    const nature = natureWithFactor(atkKey, factor);
    for (let ev = 0; ev <= EV_MAX_PER; ev++) {
      const atkEvs = emptyEvs();
      atkEvs[atkKey] = ev;
      const result = calculateDamage({
        ...baseInput(opts),
        attackerPoke: foePoke,
        defenderPoke: myPoke,
        move: calcMove,
        attackerEvs: atkEvs,
        defenderEvs: myMember.evs || emptyEvs(),
        attackerNature: nature,
        defenderNature: myMember.nature || "がんばりや",
        attackerAbility: foeAbility || foePoke.abilities?.[0] || "",
        defenderAbility: myMember.ability || myPoke.abilities?.[0] || "",
        attackerItem: foeItem,
        defenderItem: myMember.item || "なし",
      });
      if (rollsContain(result, observed)) {
        hits.push({
          stat: atkKey,
          ev,
          factor,
          nature,
          min: result.rawMin ?? result.min,
          max: result.rawMax ?? result.max,
          rolls: result.rolls,
        });
      }
    }
  }
  return aggregateOffense(hits, atkKey);
}

/**
 * 自分が殴った → 相手の H + B/D と性格補正を逆算
 */
export function reverseDefense(opts) {
  const {
    myPoke,
    myMember,
    foePoke,
    move,
    observed,
    foeItem = "なし",
    foeAbility = "",
  } = opts;
  const category = moveCategory(move, opts.category);
  const calcMove = { ...move, category };
  const defKey = keyStat(category, "defense");
  const factors = [1.1, 1.0, 0.9];
  const hits = [];

  for (const factor of factors) {
    const nature = natureWithFactor(defKey, factor);
    for (let hpEv = 0; hpEv <= EV_MAX_PER; hpEv++) {
      for (let defEv = 0; defEv <= EV_MAX_PER; defEv++) {
        if (hpEv + defEv > 66) continue;
        const defEvs = emptyEvs();
        defEvs.hp = hpEv;
        defEvs[defKey] = defEv;
        const result = calculateDamage({
          ...baseInput(opts),
        attackerPoke: myPoke,
        defenderPoke: foePoke,
        move: calcMove,
          attackerEvs: myMember.evs || emptyEvs(),
          defenderEvs: defEvs,
          attackerNature: myMember.nature || "がんばりや",
          defenderNature: nature,
          attackerAbility: myMember.ability || myPoke.abilities?.[0] || "",
          defenderAbility: foeAbility || foePoke.abilities?.[0] || "",
          attackerItem: myMember.item || "なし",
          defenderItem: foeItem,
        });
        if (rollsContain(result, observed)) {
          hits.push({
            hpEv,
            defEv,
            defKey,
            factor,
            nature,
            min: result.rawMin ?? result.min,
            max: result.rawMax ?? result.max,
            rolls: result.rolls,
          });
        }
      }
    }
  }
  return aggregateDefense(hits, defKey);
}

function aggregateOffense(hits, stat) {
  if (!hits.length) return [];
  const byFactor = new Map();
  for (const h of hits) {
    if (!byFactor.has(h.factor)) byFactor.set(h.factor, []);
    byFactor.get(h.factor).push(h);
  }
  const out = [];
  for (const factor of [1.1, 1.0, 0.9]) {
    const list = byFactor.get(factor);
    if (!list?.length) continue;
    const evs = list.map((x) => x.ev);
    const mins = list.map((x) => x.min);
    const maxs = list.map((x) => x.max);
    out.push({
      kind: "offense",
      stat,
      evMin: Math.min(...evs),
      evMax: Math.max(...evs),
      factor,
      rollMin: Math.min(...mins),
      rollMax: Math.max(...maxs),
      count: list.length,
      labelEv: formatEvRange(stat, Math.min(...evs), Math.max(...evs)),
      labelNature: formatNatureMod(stat, factor),
    });
  }
  return out;
}

function aggregateDefense(hits, defKey) {
  if (!hits.length) return [];
  const byFactor = new Map();
  for (const h of hits) {
    if (!byFactor.has(h.factor)) byFactor.set(h.factor, []);
    byFactor.get(h.factor).push(h);
  }
  const out = [];
  for (const factor of [1.1, 1.0, 0.9]) {
    const list = byFactor.get(factor);
    if (!list?.length) continue;
    const hpEvs = list.map((x) => x.hpEv);
    const defEvs = list.map((x) => x.defEv);
    const mins = list.map((x) => x.min);
    const maxs = list.map((x) => x.max);
    out.push({
      kind: "defense",
      defKey,
      hpMin: Math.min(...hpEvs),
      hpMax: Math.max(...hpEvs),
      defMin: Math.min(...defEvs),
      defMax: Math.max(...defEvs),
      factor,
      rollMin: Math.min(...mins),
      rollMax: Math.max(...maxs),
      count: list.length,
      labelEv: `${formatEvRange("hp", Math.min(...hpEvs), Math.max(...hpEvs))} / ${formatEvRange(defKey, Math.min(...defEvs), Math.max(...defEvs))}`,
      labelNature: formatNatureMod(defKey, factor),
    });
  }
  return out;
}

function formatEvRange(stat, min, max) {
  const s = SHORT[stat] || STAT_LABELS[stat] || stat;
  if (min === max) return `${s}${min}`;
  return `${s}${min}~${max}`;
}

/** "72" or "72-84" or "72〜84" */
export function parseObservedDamage(text) {
  const t = String(text || "")
    .trim()
    .replace(/〜/g, "-")
    .replace(/～/g, "-")
    .replace(/－/g, "-");
  if (!t) return null;
  const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return { minDmg: Math.min(a, b), maxDmg: Math.max(a, b) };
  }
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return { minDmg: n, maxDmg: n };
  }
  return null;
}
