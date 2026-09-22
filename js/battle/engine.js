/**
 * 対戦シミュ — TurnResolver / AI（Phase 2）
 */
import { calculateDamage } from "../damage.js?v=20260922c";
import { emptyRanks } from "../stats.js?v=20260922c";
import {
  activeOf,
  livingIndices,
  effectiveSpe,
  pushLog,
  emit,
} from "./state.js?v=20260922f";
import { applySwitchInHazards, clearHazards } from "./hazards.js?v=20260922f";
import { screensForDefender, tickFieldEndOfTurn } from "./field.js?v=20260922f";
import { applyStatusMove, tryStatus } from "./status-moves.js?v=20260922f";
import { onSwitchIn, tryBerry, endTurnVolatiles } from "./hooks.js?v=20260922f";
import {
  PIVOT_MOVES,
  FORCE_SWITCH_MOVES,
  requestPivot,
  requestForceSwitch,
  pickRandomBench,
  hasBench,
} from "./switch-moves.js?v=20260922f";
import {
  applyFixedDamage,
  applyRecoil,
  applyDrain,
  applySelfDestruct,
  checkAbsorbAbility,
  onFaintDestinyBond,
} from "./special-moves.js?v=20260922f";
import { canMegaEvolve, performMegaEvolve } from "./mega.js?v=20260922f";

function moveObj(moveName, movesDb) {
  return movesDb.find((m) => m.name === moveName) || null;
}

function findMoveSlot(battler, moveName) {
  return (battler.moves || []).find((m) => m.name === moveName) || null;
}

function rollDamage(pack) {
  const rolls = pack?.rolls;
  if (!rolls?.length) return pack?.max || pack?.min || 0;
  return rolls[Math.floor(Math.random() * rolls.length)];
}

function movePriority(move) {
  if (!move) return 0;
  if (typeof move.priority === "number") return move.priority;
  const t = `${move.effect || ""} ${move.target || ""}`;
  const m = t.match(/優先度\s*\+?\s*(-?\d+)/);
  return m ? Number(m[1]) : 0;
}

function checkAccuracy(move, atk, def) {
  const acc = move.accuracy;
  if (acc == null || acc === true || acc === "-" || Number(acc) <= 0) return true;
  let rate = Number(acc);
  const accRank = (atk.ranks.accuracy || 0) - (def.ranks.evasion || 0);
  const mult = [1 / 3, 0.375, 0.5, 2 / 3, 0.75, 0.833, 1, 1.2, 1.333, 1.5, 1.666, 1.8, 2][
    Math.max(0, Math.min(12, accRank + 6))
  ];
  rate *= mult;
  return Math.random() * 100 < rate;
}

function canAct(battle, b) {
  if (!b || b.fainted || b.hp <= 0) return false;
  if (b.status === "ねむり") {
    pushLog(battle, `${b.species} はぐうぐう眠っている`);
    return false;
  }
  if (b.status === "こおり") {
    if (Math.random() < 0.2) {
      b.status = "なし";
      pushLog(battle, `${b.species} の こおり が溶けた！`);
      return true;
    }
    pushLog(battle, `${b.species} は凍って動けない！`);
    return false;
  }
  if (b.status === "まひ" && Math.random() < 0.25) {
    pushLog(battle, `${b.species} は体がしびれて動けない！`);
    return false;
  }
  return true;
}

function applyEndTurnStatus(battle, b) {
  if (!b || b.fainted || b.hp <= 0) return;
  const magicGuard = b.ability === "マジックガード";

  if (!magicGuard && b.status === "やけど") {
    const d = Math.max(1, Math.floor(b.maxHp / 16));
    b.hp = Math.max(0, b.hp - d);
    pushLog(battle, `${b.species} は やけど のダメージ！（${d}）`);
    emit(battle, "damage", { side: b.side, amount: d });
  } else if (!magicGuard && b.status === "どく") {
    const d = Math.max(1, Math.floor(b.maxHp / 8));
    b.hp = Math.max(0, b.hp - d);
    pushLog(battle, `${b.species} は どく のダメージ！（${d}）`);
    emit(battle, "damage", { side: b.side, amount: d });
  } else if (!magicGuard && b.status === "もうどく") {
    b._toxic = (b._toxic || 0) + 1;
    const d = Math.max(1, Math.floor((b.maxHp * b._toxic) / 16));
    b.hp = Math.max(0, b.hp - d);
    pushLog(battle, `${b.species} は もうどく のダメージ！（${d}）`);
    emit(battle, "damage", { side: b.side, amount: d });
  }

  if (b.item === "たべのこし" && b.hp > 0 && b.hp < b.maxHp) {
    const h = Math.max(1, Math.floor(b.maxHp / 16));
    b.hp = Math.min(b.maxHp, b.hp + h);
    pushLog(battle, `${b.species} は たべのこし で回復（+${h}）`);
  }
  if (b.item === "くろいヘドロ" && b.hp > 0) {
    if (b.poke?.types?.includes("どく")) {
      const h = Math.max(1, Math.floor(b.maxHp / 16));
      b.hp = Math.min(b.maxHp, b.hp + h);
    } else if (!magicGuard) {
      const d = Math.max(1, Math.floor(b.maxHp / 8));
      b.hp = Math.max(0, b.hp - d);
    }
  }

  tryBerry(battle, b);

  if (b.hp <= 0) {
    b.fainted = true;
    b.hp = 0;
    pushLog(battle, `${b.species} はたおれた！`);
    emit(battle, "faint", { side: b.side, species: b.species });
  }
}

function tryFaintSwitch(battle, sideKey) {
  const side = battle[sideKey];
  const cur = activeOf(side);
  if (cur && !cur.fainted && cur.hp > 0) return true;
  const alive = livingIndices(side);
  if (!alive.length) {
    battle.winner = sideKey === "player" ? "foe" : "player";
    pushLog(battle, battle.winner === "player" ? "勝ち！ 相手の選出を全滅させた" : "負け… 選出が全滅した");
    emit(battle, "win", { winner: battle.winner });
    return false;
  }
  if (sideKey === "foe") {
    side.active = alive[0];
    const b = activeOf(side);
    pushLog(battle, `相手は ${b.species} を出した`);
    emit(battle, "switch", { side: "foe", species: b.species });
    applySwitchInHazards(battle, "foe");
    onSwitchIn(battle, "foe");
    if (b.fainted) return tryFaintSwitch(battle, "foe");
    return true;
  }
  battle.pendingSwitch = "player";
  pushLog(battle, "ひんし — 交代するポケモンを選んでください");
  emit(battle, "needSwitch", { side: "player" });
  return false;
}

function doSwitch(battle, sideKey, index, opts = {}) {
  const sideState = battle[sideKey];
  const target = sideState.party[index];
  if (!target || target.fainted || index === sideState.active) return false;
  const leaving = activeOf(sideState);
  const baton = opts.keepRanks ? battle._batonRanks : null;
  if (leaving) {
    if (leaving.ability === "さいせいりょく" && !leaving.fainted) {
      const h = Math.floor(leaving.maxHp / 3);
      leaving.hp = Math.min(leaving.maxHp, leaving.hp + h);
      pushLog(battle, `${leaving.species} は さいせいりょく で回復！`);
    }
    if (leaving.ability === "しぜんかいふく") {
      leaving.status = "なし";
      leaving._toxic = 0;
    }
    leaving._protect = false;
    leaving._magicCoat = false;
    leaving.substituteHP = 0;
    leaving._leechSeed = false;
    leaving._yawn = 0;
    leaving._destinyBond = false;
  }
  sideState.active = index;
  const b = activeOf(sideState);
  if (baton) {
    b.ranks = { ...baton };
    battle._batonRanks = null;
    pushLog(battle, `${b.species} に能力変化が引き継がれた！`);
  }
  pushLog(battle, `${sideKey === "player" ? "自分" : "相手"}は ${b.species} を出した！`);
  emit(battle, "switch", { side: sideKey, species: b.species });
  applySwitchInHazards(battle, sideKey);
  onSwitchIn(battle, sideKey);
  return true;
}

function executeMove(battle, atkSideKey, defSideKey, moveName, movesDb) {
  const atk = activeOf(battle[atkSideKey]);
  const def = activeOf(battle[defSideKey]);
  if (!atk || !def) return;
  if (!canAct(battle, atk)) return;

  const slot = findMoveSlot(atk, moveName);
  if (slot && slot.pp <= 0) {
    pushLog(battle, `${atk.species} の ${moveName} は PPが残っていない！`);
    return;
  }

  const move = moveObj(moveName, movesDb);
  if (!move) {
    pushLog(battle, `${atk.species} の技が無効`);
    return;
  }

  // ねこだまし: 出したターンのみ
  if (move.name === "ねこだまし" && atk._switchedInTurn !== battle.turn && battle.turn !== 1) {
    pushLog(battle, `${atk.species} の ねこだまし は失敗した！`);
    if (slot) slot.pp = Math.max(0, slot.pp - 1);
    return;
  }

  if (slot) slot.pp = Math.max(0, slot.pp - 1);
  pushLog(battle, `${atk.species} の ${move.name}！`);
  emit(battle, "move", { side: atkSideKey, move: move.name, species: atk.species });

  if (def._protect && move.name !== "シャドーダイブ" && move.name !== "ゴーストダイブ") {
    pushLog(battle, `${def.species} は攻撃を防いだ！`);
    return;
  }

  if (move.category === "変化") {
    applyStatusMove(battle, atk, def, move);
    return;
  }

  if (!checkAccuracy(move, atk, def)) {
    pushLog(battle, `${atk.species} の攻撃は外れた！`);
    return;
  }

  const moveType = move.type;
  if (checkAbsorbAbility(battle, atk, def, move, moveType)) {
    return;
  }

  // 固定ダメージ
  const fixed = applyFixedDamage(battle, atk, def, move);
  if (fixed != null) {
    let dmg = Math.min(def.hp, Math.max(1, fixed));
    if ((def.substituteHP || 0) > 0 && !move.sound) {
      def.substituteHP = Math.max(0, def.substituteHP - dmg);
      pushLog(battle, `みがわり がダメージを受けた！`);
      if (def.substituteHP <= 0) pushLog(battle, "みがわり が消えた！");
      return;
    }
    def.hp -= dmg;
    pushLog(battle, `${def.species} に ${dmg} ダメージ！`);
    if (def.hp <= 0) {
      def.hp = 0;
      def.fainted = true;
      pushLog(battle, `${def.species} はたおれた！`);
      onFaintDestinyBond(battle, def, atk);
    }
    applySelfDestruct(battle, atk, move);
    if (PIVOT_MOVES.has(move.name) && atk.hp > 0) requestPivot(battle, atkSideKey, { from: move.name });
    return;
  }

  const isCrit = Math.random() < (atk.ability === "きょううん" || atk.item === "ピントレンズ" ? 1 / 8 : 1 / 24);
  const result = calculateDamage({
    attackerPoke: atk.poke,
    defenderPoke: def.poke,
    move,
    attackerEvs: atk.evs,
    defenderEvs: def.evs,
    attackerNature: atk.nature,
    defenderNature: def.nature,
    attackerAbility: atk.ability,
    defenderAbility: def.ability,
    attackerItem: atk.item,
    defenderItem: def.item,
    attackerRanks: atk.ranks,
    defenderRanks: def.ranks,
    attackerStatus: atk.status,
    defenderStatus: def.status,
    weather: battle.weather,
    field: battle.field,
    screens: screensForDefender(battle, defSideKey),
    critical: isCrit,
    hpNotFull: def.hp < def.maxHp,
  });

  if (result.error) {
    pushLog(battle, result.error);
    return;
  }
  if (result.typeMult === 0) {
    pushLog(battle, "効果がないようだ…");
    return;
  }

  const pack = isCrit && result.critical ? result.critical : result.normal || result;
  if (isCrit) pushLog(battle, "急所に当たった！");

  let dmg = Math.max(1, rollDamage(pack));
  const soundPierce = !!move.sound;

  // みがわり吸収（音技は貫通）
  if ((def.substituteHP || 0) > 0 && !soundPierce) {
    const subDmg = Math.min(def.substituteHP, dmg);
    def.substituteHP -= subDmg;
    pushLog(battle, `みがわり が ${subDmg} ダメージを受けた！`);
    emit(battle, "subHit", { side: defSideKey, amount: subDmg });
    if (def.substituteHP <= 0) {
      def.substituteHP = 0;
      pushLog(battle, `${def.species} の みがわり が消えた！`);
    }
    // いのちのたまは発動、追加効果は基本なし
    if (atk.item === "いのちのたま" && atk.hp > 0 && !atk.fainted) {
      const recoil = Math.max(1, Math.floor(atk.maxHp / 10));
      atk.hp = Math.max(0, atk.hp - recoil);
      pushLog(battle, `${atk.species} は いのちのたま で削れた（-${recoil}）`);
      if (atk.hp <= 0) {
        atk.fainted = true;
        pushLog(battle, `${atk.species} はたおれた！`);
        emit(battle, "faint", { side: atkSideKey, species: atk.species });
      }
    }
    if (PIVOT_MOVES.has(move.name) && atk.hp > 0 && !atk.fainted) {
      requestPivot(battle, atkSideKey, { from: move.name });
    }
    return;
  }

  // きあいのタスキ
  if (
    def.item === "きあいのタスキ" &&
    !def._sashUsed &&
    def.hp === def.maxHp &&
    dmg >= def.hp
  ) {
    dmg = def.hp - 1;
    def._sashUsed = true;
    def.item = "なし";
    pushLog(battle, `${def.species} は きあいのタスキ で堪えた！`);
  }

  dmg = Math.min(def.hp, dmg);
  def.hp -= dmg;
  pushLog(
    battle,
    `${def.species} に ${dmg} ダメージ！（目安 ${pack.percentMin}〜${pack.percentMax}% / ${result.effectiveness}）`
  );
  emit(battle, "damage", { side: defSideKey, amount: dmg, crit: isCrit });

  applyDrain(battle, atk, def, dmg, move);
  applyRecoil(battle, atk, dmg, move);
  applySelfDestruct(battle, atk, move);

  tryBerry(battle, def);

  // 追加効果（簡易・みがわり無し時）
  if (def.hp > 0 && def.status === "なし") {
    const eff = `${move.effect || ""}`;
    let chance = 0.1;
    if (atk.ability === "てんのめぐみ") chance *= 2;
    if (/やけど/.test(eff) && Math.random() < chance) tryStatus(battle, def, "やけど");
    else if (/まひ/.test(eff) && Math.random() < chance) tryStatus(battle, def, "まひ");
    else if (/どく/.test(eff) && Math.random() < chance) tryStatus(battle, def, "どく");
    else if (/こおり/.test(eff) && Math.random() < chance) tryStatus(battle, def, "こおり");
    // ランク下げ追加効果
    if (/防御を1段階下げる/.test(eff) && Math.random() < chance) {
      def.ranks.def = Math.max(-6, (def.ranks.def || 0) - 1);
      pushLog(battle, `${def.species} の防御が下がった！`);
    }
    if (/特防を1段階下げる/.test(eff) && Math.random() < chance) {
      def.ranks.spd = Math.max(-6, (def.ranks.spd || 0) - 1);
      pushLog(battle, `${def.species} の特防が下がった！`);
    }
  }

  if (atk.item === "いのちのたま" && atk.hp > 0 && !atk.fainted) {
    const recoil = Math.max(1, Math.floor(atk.maxHp / 10));
    atk.hp = Math.max(0, atk.hp - recoil);
    pushLog(battle, `${atk.species} は いのちのたま で削れた（-${recoil}）`);
    if (atk.hp <= 0) {
      atk.fainted = true;
      pushLog(battle, `${atk.species} はたおれた！`);
      emit(battle, "faint", { side: atkSideKey, species: atk.species });
    }
  }

  // ゴツゴツメット（接触）
  if (move.contact && def.item === "ゴツゴツメット" && atk.hp > 0 && !atk.fainted) {
    const chip = Math.max(1, Math.floor(atk.maxHp / 6));
    atk.hp = Math.max(0, atk.hp - chip);
    pushLog(battle, `${atk.species} は ゴツゴツメット でダメージ！（${chip}）`);
    if (atk.hp <= 0) {
      atk.fainted = true;
      pushLog(battle, `${atk.species} はたおれた！`);
      emit(battle, "faint", { side: atkSideKey, species: atk.species });
    }
  }

  if (move.name === "こうそくスピン" && atk.hp > 0) {
    clearHazards(battle.hazards[atkSideKey]);
    pushLog(battle, "場の設置技が消えた！");
  }

  if (def.hp <= 0) {
    def.hp = 0;
    def.fainted = true;
    def.substituteHP = 0;
    pushLog(battle, `${def.species} はたおれた！`);
    emit(battle, "faint", { side: defSideKey, species: def.species });
    onFaintDestinyBond(battle, def, atk);
  }

  // 強制交代技（ドラゴンテール等）— 相手が生きていて控えがあるとき
  if (
    FORCE_SWITCH_MOVES.has(move.name) &&
    def.hp > 0 &&
    !def.fainted &&
    hasBench(battle, defSideKey)
  ) {
    requestForceSwitch(battle, defSideKey, { blockedBySub: false, random: true });
  }

  // 交代技
  if (PIVOT_MOVES.has(move.name) && atk.hp > 0 && !atk.fainted) {
    requestPivot(battle, atkSideKey, { from: move.name });
  }
}

/**
 * actions: { player: { type:'move'|'switch', move?, index? }, foe: same }
 */
export function resolveTurn(battle, actions, movesDb) {
  if (battle.winner) return battle;
  battle.pendingSwitch = null;
  battle.events = [];
  battle.turn += 1;
  pushLog(battle, `── ターン ${battle.turn} ──`);

  const order = [];
  for (const side of ["player", "foe"]) {
    const act = actions[side];
    if (!act) continue;
    if (act.type === "switch") {
      order.push({ side, act, pri: 6, spe: 9999 });
    } else {
      const move = moveObj(act.move, movesDb);
      const b = activeOf(battle[side]);
      order.push({
        side,
        act,
        pri: movePriority(move),
        spe: effectiveSpe(b, battle),
      });
    }
  }
  order.sort((a, b) => {
    if (b.pri !== a.pri) return b.pri - a.pri;
    if (battle.trickRoom > 0) return a.spe - b.spe || (Math.random() < 0.5 ? -1 : 1);
    return b.spe - a.spe || (Math.random() < 0.5 ? -1 : 1);
  });

  battle._movesDb = movesDb;
  battle._pokemonList = battle._pokemonList || null;
  return runActionOrder(battle, order, movesDb);
}

function runActionOrder(battle, order, movesDb) {
  for (let i = 0; i < order.length; i++) {
    if (battle.winner) break;
    const step = order[i];
    const { side, act } = step;
    const self = activeOf(battle[side]);
    if (!self || self.fainted) continue;

    if (act.type === "switch") {
      doSwitch(battle, side, act.index);
      const b = activeOf(battle[side]);
      if (b) b._switchedInTurn = battle.turn;
      if (activeOf(battle[side])?.fainted) {
        if (!tryFaintSwitch(battle, side)) return battle;
      }
      continue;
    }

    const defSide = side === "player" ? "foe" : "player";
    executeMove(battle, side, defSide, act.move, movesDb);

    if (activeOf(battle[defSide])?.fainted) {
      if (!tryFaintSwitch(battle, defSide)) return battle;
    }
    if (activeOf(battle[side])?.fainted) {
      if (!tryFaintSwitch(battle, side)) return battle;
    }

    // AIの交代技・強制交代は即時処理
    if (battle.pendingPivot?.side === "foe") {
      const idx = pickRandomBench(battle, "foe");
      if (idx >= 0) {
        doSwitch(battle, "foe", idx, { keepRanks: battle.pendingPivot.keepRanks });
        const b = activeOf(battle.foe);
        if (b) b._switchedInTurn = battle.turn;
      }
      battle.pendingPivot = null;
      if (activeOf(battle.foe)?.fainted && !tryFaintSwitch(battle, "foe")) return battle;
    }
    if (battle.pendingForce?.side === "foe") {
      const idx = pickRandomBench(battle, "foe");
      if (idx >= 0) {
        doSwitch(battle, "foe", idx);
        const b = activeOf(battle.foe);
        if (b) b._switchedInTurn = battle.turn;
      }
      battle.pendingForce = null;
      if (activeOf(battle.foe)?.fainted && !tryFaintSwitch(battle, "foe")) return battle;
    }

    // プレイヤー入力待ち → 残り行動を保存して中断
    if (battle.pendingPivot?.side === "player" || battle.pendingForce?.side === "player") {
      battle._resumeOrder = order.slice(i + 1);
      return battle;
    }
    if (battle.pendingSwitch === "player") {
      battle._resumeOrder = order.slice(i + 1);
      return battle;
    }
  }

  return finishTurn(battle);
}

function finishTurn(battle) {
  battle._resumeOrder = null;
  for (const side of ["player", "foe"]) {
    const b = activeOf(battle[side]);
    if (b) {
      b._protect = false;
      b._magicCoat = false;
    }
    if (b?.status === "ねむり") {
      b._sleep = (b._sleep || 1) - 1;
      if (b._sleep <= 0) {
        b.status = "なし";
        pushLog(battle, `${b.species} は目を覚ました！`);
      }
    }
  }

  if (!battle.pendingSwitch && !battle.pendingPivot && !battle.pendingForce) {
    const p = activeOf(battle.player);
    const f = activeOf(battle.foe);
    endTurnVolatiles(battle, p, f);
    endTurnVolatiles(battle, f, p);
    applyEndTurnStatus(battle, p);
    applyEndTurnStatus(battle, f);
    tickFieldEndOfTurn(battle);

    if (activeOf(battle.player)?.fainted && !tryFaintSwitch(battle, "player")) return battle;
    if (activeOf(battle.foe)?.fainted && !tryFaintSwitch(battle, "foe")) return battle;
  }

  return battle;
}

function resumeAfterPlayerInput(battle) {
  const rest = battle._resumeOrder || [];
  battle._resumeOrder = null;
  if (rest.length) return runActionOrder(battle, rest, battle._movesDb || []);
  return finishTurn(battle);
}

export function forcePlayerSwitch(battle, index) {
  if (battle.pendingSwitch !== "player") return false;
  const ok = doSwitch(battle, "player", index);
  if (!ok) return false;
  const b = activeOf(battle.player);
  if (b) b._switchedInTurn = battle.turn;
  battle.pendingSwitch = null;
  if (activeOf(battle.player)?.fainted) {
    return tryFaintSwitch(battle, "player");
  }
  return resumeAfterPlayerInput(battle);
}

/** 交代技での自主交代 */
export function completePivotSwitch(battle, index) {
  if (battle.pendingPivot?.side !== "player") return false;
  const keepRanks = !!battle.pendingPivot.keepRanks;
  const ok = doSwitch(battle, "player", index, { keepRanks });
  if (!ok) return false;
  const b = activeOf(battle.player);
  if (b) b._switchedInTurn = battle.turn;
  battle.pendingPivot = null;
  if (activeOf(battle.player)?.fainted) {
    if (!tryFaintSwitch(battle, "player")) return false;
  }
  return resumeAfterPlayerInput(battle);
}

/** 強制交代での選択 */
export function completeForceSwitch(battle, index) {
  if (battle.pendingForce?.side !== "player") return false;
  const ok = doSwitch(battle, "player", index);
  if (!ok) return false;
  const b = activeOf(battle.player);
  if (b) b._switchedInTurn = battle.turn;
  battle.pendingForce = null;
  if (activeOf(battle.player)?.fainted) {
    if (!tryFaintSwitch(battle, "player")) return false;
  }
  return resumeAfterPlayerInput(battle);
}

export function botChooseAction(battle, movesDb) {
  const atk = activeOf(battle.foe);
  const def = activeOf(battle.player);
  if (!atk || !def) return { type: "move", move: atk?.moves?.[0]?.name };

  // prefer setting hazards if none and have the move
  const haz = battle.hazards.player;
  if (!haz.stealthRock) {
    const sr = (atk.moves || []).find((s) => s.name === "ステルスロック" && s.pp > 0);
    if (sr && Math.random() < 0.45) return { type: "move", move: sr.name };
  }

  let best = null;
  for (const slot of atk.moves || []) {
    if (!slot || slot.pp <= 0) continue;
    const move = moveObj(slot.name, movesDb);
    if (!move || move.category === "変化") continue;
    const result = calculateDamage({
      attackerPoke: atk.poke,
      defenderPoke: def.poke,
      move,
      attackerEvs: atk.evs,
      defenderEvs: def.evs,
      attackerNature: atk.nature,
      defenderNature: def.nature,
      attackerAbility: atk.ability,
      defenderAbility: def.ability,
      attackerItem: atk.item,
      defenderItem: def.item,
      attackerRanks: atk.ranks || emptyRanks(),
      defenderRanks: def.ranks || emptyRanks(),
      attackerStatus: atk.status,
      defenderStatus: def.status,
      weather: battle.weather,
      field: battle.field,
      screens: screensForDefender(battle, "player"),
      hpNotFull: def.hp < def.maxHp,
    });
    if (result.error) continue;
    let score = result.percentMax || 0;
    if ((move.priority || 0) > 0 && def.hp / def.maxHp < 0.35) score += 30;
    if (!best || score > best.score) best = { name: slot.name, score };
  }

  if (!best) {
    const setup = (atk.moves || []).find(
      (s) =>
        ["りゅうのまい", "つるぎのまい", "めいそう", "てっぺき", "わるだくみ", "ステルスロック"].includes(s.name) &&
        s.pp > 0
    );
    const any = (atk.moves || []).find((s) => s.pp > 0);
    return { type: "move", move: setup?.name || any?.name || atk.moves?.[0]?.name };
  }

  if (best.score < 12) {
    const alive = livingIndices(battle.foe).filter((i) => i !== battle.foe.active);
    if (alive.length && Math.random() < 0.4) {
      return { type: "switch", index: alive[Math.floor(Math.random() * alive.length)] };
    }
    const status = (atk.moves || []).find((s) =>
      ["でんじは", "おにび", "どくどく", "やどりぎのタネ", "みがわり", "すてゼリフ"].includes(s.name) && s.pp > 0
    );
    if (status) return { type: "move", move: status.name };
  }
  // 低HPなら交代技で逃げる
  if (atk.hp / atk.maxHp < 0.35 && hasBench(battle, "foe")) {
    const pivot = (atk.moves || []).find((s) => PIVOT_MOVES.has(s.name) && s.pp > 0);
    if (pivot && Math.random() < 0.5) return { type: "move", move: pivot.name };
  }
  return { type: "move", move: best.name };
}

export { activeOf, livingIndices, effectiveSpe };
