/**
 * 変化技・状態異常・ランク変化（Phase 2）
 */
import { pushLog, emit } from "./state.js?v=20260922f";
import { setHazard, shouldBounce, clearHazards } from "./hazards.js?v=20260922f";
import { setWeather, setTerrain, setScreen } from "./field.js?v=20260922f";
import { requestPivot, requestForceSwitch, snapshotRanks } from "./switch-moves.js?v=20260922f";
import { trySpecialStatusMove } from "./special-moves.js?v=20260922f";

export function bump(b, stat, stages, battle) {
  const cur = b.ranks[stat] || 0;
  const next = Math.max(-6, Math.min(6, cur + stages));
  const delta = next - cur;
  if (delta === 0) {
    pushLog(battle, `${b.species} の能力は変化しなかった`);
    return false;
  }
  if (battle.mist?.[b.side] > 0 && stages < 0) {
    pushLog(battle, "しろいきり で能力は下がらない！");
    return false;
  }
  b.ranks[stat] = next;
  const label =
    { atk: "攻撃", def: "防御", spa: "特攻", spd: "特防", spe: "素早さ", accuracy: "命中", evasion: "回避" }[stat] ||
    stat;
  const how =
    delta >= 2 ? "ぐーんと上がった" : delta === 1 ? "上がった" : delta <= -2 ? "がくっと下がった" : "下がった";
  pushLog(battle, `${b.species} の ${label} が${how}！`);
  emit(battle, "stat", { side: b.side, stat, stages: delta });
  return true;
}

export function tryStatus(battle, target, status) {
  if (!target || target.fainted) return false;
  if (target.status !== "なし") {
    pushLog(battle, `${target.species} にはすでに状態異常がある`);
    return false;
  }
  if (status === "やけど" && target.poke?.types?.includes("ほのお")) return false;
  if (status === "まひ" && target.poke?.types?.includes("でんき")) return false;
  if (
    (status === "どく" || status === "もうどく") &&
    (target.poke?.types?.includes("どく") || target.poke?.types?.includes("はがね"))
  )
    return false;
  if (status === "こおり" && target.poke?.types?.includes("こおり")) return false;
  if (target.ability === "めんえき" && (status === "どく" || status === "もうどく")) return false;
  if (target.ability === "みずのベール" && status === "やけど") return false;
  if (target.ability === "じゅうなん" && status === "まひ") return false;
  if (battle.safeguard?.[target.side] > 0 && status !== "なし") {
    pushLog(battle, "しんぴのまもり で防がれた！");
    return false;
  }
  if (battle.field === "ミストフィールド" && status !== "なし") {
    // grounded mist blocks status — simplified: block all for now if mist
    if (!target.poke?.types?.includes("ひこう") && target.ability !== "ふゆう") {
      pushLog(battle, "ミストフィールド で状態異常を防いだ！");
      return false;
    }
  }

  target.status = status;
  if (status === "もうどく") target._toxic = 0;
  if (status === "ねむり") target._sleep = 2 + Math.floor(Math.random() * 2);
  pushLog(battle, `${target.species} は ${status} になった！`);
  emit(battle, "status", { side: target.side, status });
  return true;
}

export function applyStatusMove(battle, atk, def, move) {
  if (shouldBounce(def, move)) {
    pushLog(battle, `${def.species} が変化技を跳ね返した！`);
    def._magicCoat = false;
    return applyStatusMoveCore(battle, def, atk, move);
  }
  return applyStatusMoveCore(battle, atk, def, move);
}

function applyStatusMoveCore(battle, atk, def, move) {
  const special = trySpecialStatusMove(battle, atk, def, move);
  if (special) return special;

  const n = move.name;
  const oppSide = atk.side === "player" ? "foe" : "player";
  const selfSide = atk.side;

  if (n === "マジックコート") {
    atk._magicCoat = true;
    pushLog(battle, `${atk.species} は マジックコート を使った！`);
    return "handled";
  }

  if (n === "ステルスロック") {
    setHazard(battle, oppSide, "stealthRock");
    return "handled";
  }
  if (n === "まきびし") {
    setHazard(battle, oppSide, "spikes");
    return "handled";
  }
  if (n === "どくびし") {
    setHazard(battle, oppSide, "toxicSpikes");
    return "handled";
  }
  if (n === "こうそくスピン") {
    clearHazards(battle.hazards[selfSide]);
    bump(atk, "spe", 1, battle);
    pushLog(battle, "場の設置技が消えた！");
    return "handled";
  }
  if (n === "デトックス") {
    clearHazards(battle.hazards[oppSide]);
    clearHazards(battle.hazards[selfSide]);
    for (const k of ["reflect", "lightScreen", "auroraVeil"]) {
      battle.sideEffects[oppSide][k] = 0;
      battle.sideEffects[selfSide][k] = 0;
    }
    bump(def, "evasion", -1, battle);
    pushLog(battle, "場の設置・壁を吹き飛ばした！");
    return "handled";
  }

  if (n === "にほんばれ") {
    setWeather(battle, "はれ", atk);
    return "handled";
  }
  if (n === "あまごい") {
    setWeather(battle, "あめ", atk);
    return "handled";
  }
  if (n === "すなあらし") {
    setWeather(battle, "すなあらし", atk);
    return "handled";
  }
  if (n === "ゆき" || n === "あられ") {
    setWeather(battle, "ゆき", atk);
    return "handled";
  }

  if (n === "エレキフィールド") {
    setTerrain(battle, "エレキフィールド", atk);
    return "handled";
  }
  if (n === "グラスフィールド") {
    setTerrain(battle, "グラスフィールド", atk);
    return "handled";
  }
  if (n === "サイコフィールド") {
    setTerrain(battle, "サイコフィールド", atk);
    return "handled";
  }
  if (n === "ミストフィールド") {
    setTerrain(battle, "ミストフィールド", atk);
    return "handled";
  }

  if (n === "リフレクター") {
    setScreen(battle, selfSide, "reflect", atk);
    return "handled";
  }
  if (n === "ひかりのかべ") {
    setScreen(battle, selfSide, "lightScreen", atk);
    return "handled";
  }
  if (n === "オーロラベール") {
    if (battle.weather !== "ゆき") {
      pushLog(battle, "オーロラベール はゆきのときしか使えない！");
      return "fail";
    }
    setScreen(battle, selfSide, "auroraVeil", atk);
    return "handled";
  }

  const boostMap = {
    りゅうのまい: [["atk", 1], ["spe", 1]],
    つるぎのまい: [["atk", 2]],
    めいそう: [["spa", 1], ["spd", 1]],
    てっぺき: [["def", 2]],
    かたくなる: [["def", 1]],
    わるだくみ: [["spa", 2]],
    コスモパワー: [["def", 1], ["spd", 1]],
    ちょうのまい: [["spa", 1], ["spd", 1], ["spe", 1]],
    からをやぶる: [["def", -1], ["spd", -1], ["atk", 2], ["spa", 2], ["spe", 2]],
    かげぶんしん: [["evasion", 1]],
    ロックブレイン: [["spa", 2]],
  };
  if (boostMap[n]) {
    for (const [stat, st] of boostMap[n]) bump(atk, stat, st, battle);
    return "handled";
  }

  if (n === "まもる" || n === "みきり" || n === "トーチカ") {
    atk._protect = true;
    pushLog(battle, `${atk.species} は守りの体勢に入った！`);
    return "handled";
  }

  if (n === "みがわり") {
    if ((atk.substituteHP || 0) > 0) {
      pushLog(battle, "すでに みがわり がある！");
      return "fail";
    }
    const cost = Math.max(1, Math.floor(atk.maxHp / 4));
    if (atk.hp <= cost) {
      pushLog(battle, "体力が足りず みがわり を出せない！");
      return "fail";
    }
    atk.hp -= cost;
    atk.substituteHP = cost;
    pushLog(battle, `${atk.species} の みがわり が現れた！`);
    emit(battle, "sub", { side: atk.side, hp: cost });
    return "handled";
  }

  if (n === "すてゼリフ") {
    if ((def.substituteHP || 0) > 0) {
      pushLog(battle, "みがわり には効かない！");
    } else {
      bump(def, "atk", -1, battle);
      bump(def, "spa", -1, battle);
    }
    requestPivot(battle, atk.side, { from: "すてゼリフ" });
    return "handled";
  }

  if (n === "バトンタッチ") {
    battle._batonRanks = snapshotRanks(atk);
    requestPivot(battle, atk.side, { keepRanks: true, from: "バトンタッチ" });
    return "handled";
  }

  if (n === "しっぽきり") {
    if ((atk.substituteHP || 0) > 0) {
      pushLog(battle, "すでに みがわり がある！");
      return "fail";
    }
    const cost = Math.max(1, Math.floor(atk.maxHp / 4));
    if (atk.hp <= cost) {
      pushLog(battle, "体力が足りない！");
      return "fail";
    }
    atk.hp -= cost;
    atk.substituteHP = cost;
    pushLog(battle, `${atk.species} の みがわり が現れた！`);
    requestPivot(battle, atk.side, { from: "しっぽきり" });
    return "handled";
  }

  if (n === "ほえる" || n === "ふきとばし") {
    requestForceSwitch(battle, oppSide, { blockedBySub: true, random: true });
    return "handled";
  }

  // 相手状態（みがわりがあると多くの変化は失敗）
  if ((def.substituteHP || 0) > 0 && ["でんじは", "おにび", "どくどく", "どくガス", "キノコのほうし", "ねむりごな", "あくび", "やどりぎのタネ", "なきごえ", "しっぽをふる", "フラッシュ"].includes(n)) {
    pushLog(battle, "みがわり がこうげきを受けた！（変化は失敗）");
    return "fail";
  }

  if (n === "でんじは") {
    tryStatus(battle, def, "まひ");
    return "handled";
  }
  if (n === "おにび") {
    tryStatus(battle, def, "やけど");
    return "handled";
  }
  if (n === "どくどく") {
    tryStatus(battle, def, "もうどく");
    return "handled";
  }
  if (n === "どくガス") {
    tryStatus(battle, def, "どく");
    return "handled";
  }
  if (n === "キノコのほうし" || n === "ねむりごな") {
    tryStatus(battle, def, "ねむり");
    return "handled";
  }
  if (n === "あくび") {
    def._yawn = 2;
    pushLog(battle, `${def.species} は眠気に襲われた…`);
    return "handled";
  }

  if (n === "やどりぎのタネ") {
    if (def.poke?.types?.includes("くさ")) {
      pushLog(battle, "くさタイプには効かない");
      return "fail";
    }
    def._leechSeed = true;
    pushLog(battle, `${def.species} に やどりぎのタネ を植え付けた！`);
    return "handled";
  }

  if (n === "ねむる") {
    atk.hp = atk.maxHp;
    atk.status = "ねむり";
    atk._sleep = 2;
    pushLog(battle, `${atk.species} は眠って体力を回復した！`);
    return "handled";
  }

  if (n === "リフレッシュ") {
    atk.status = "なし";
    pushLog(battle, `${atk.species} の状態異常が治った！`);
    return "handled";
  }
  if (n === "なまける" || n === "ねむりごな" /* already */) {
    if (n === "なまける") {
      const h = Math.floor(atk.maxHp / 2);
      atk.hp = Math.min(atk.maxHp, atk.hp + h);
      pushLog(battle, `${atk.species} の体力が回復した！（+${h}）`);
      return "handled";
    }
  }

  const foeDrops = {
    しっぽをふる: [["def", -1]],
    なきごえ: [["atk", -1]],
    フラッシュ: [["accuracy", -1]],
    すてゼリフ: [["atk", -1], ["spa", -1]],
  };
  if (n === "クリアスモッグ") {
    def.ranks = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
    pushLog(battle, `${def.species} の能力変化が元に戻った！`);
    return "handled";
  }
  if (foeDrops[n]) {
    for (const [stat, st] of foeDrops[n]) bump(def, stat, st, battle);
    return "handled";
  }

  pushLog(battle, `（${n} — 効果は未実装。PPのみ消費）`);
  return "handled";
}
