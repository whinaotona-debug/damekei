/**
 * 設置技・サイド効果（Phase 2）
 */
import { typeEffectiveness } from "../types.js?v=20260922f";
import { pushLog, emit, activeOf } from "./state.js?v=20260922f";

export function emptySideHazards() {
  return {
    stealthRock: false,
    spikes: 0,
    toxicSpikes: 0,
  };
}

export function clearHazards(sideHaz) {
  sideHaz.stealthRock = false;
  sideHaz.spikes = 0;
  sideHaz.toxicSpikes = 0;
}

export function isGrounded(b) {
  if (!b) return true;
  if (b.item === "くろいてっきゅう") return true;
  if (b.item === "ふうせん") return false;
  if (b.ability === "ふゆう") return false;
  if (b.poke?.types?.includes("ひこう")) return false;
  return true;
}

export function shouldBounce(def, move) {
  if (!def || !move) return false;
  if (move.category !== "変化") return false;
  const bounceable = [
    "ステルスロック",
    "まきびし",
    "どくびし",
    "でんじは",
    "おにび",
    "どくどく",
    "やどりぎのタネ",
    "キノコのほうし",
    "ねむりごな",
    "どくガス",
  ];
  if (!bounceable.includes(move.name)) return false;
  return def.ability === "マジックミラー" || def._magicCoat;
}

export function setHazard(battle, targetSideKey, kind) {
  const haz = battle.hazards[targetSideKey];
  if (kind === "stealthRock") {
    if (haz.stealthRock) {
      pushLog(battle, "すでに ステルスロック が撒かれている");
      return false;
    }
    haz.stealthRock = true;
    pushLog(battle, `${targetSideKey === "player" ? "自分" : "相手"}の場に ステルスロック が撒かれた！`);
    return true;
  }
  if (kind === "spikes") {
    if (haz.spikes >= 3) {
      pushLog(battle, "まきびし はこれ以上増やせない");
      return false;
    }
    haz.spikes += 1;
    pushLog(battle, `${targetSideKey === "player" ? "自分" : "相手"}の場に まきびし が ${haz.spikes} 段！`);
    return true;
  }
  if (kind === "toxicSpikes") {
    if (haz.toxicSpikes >= 2) {
      pushLog(battle, "どくびし はこれ以上増やせない");
      return false;
    }
    haz.toxicSpikes += 1;
    pushLog(battle, `${targetSideKey === "player" ? "自分" : "相手"}の場に どくびし が ${haz.toxicSpikes} 段！`);
    return true;
  }
  return false;
}

export function applySwitchInHazards(battle, sideKey) {
  const b = activeOf(battle[sideKey]);
  if (!b || b.fainted) return;
  const haz = battle.hazards[sideKey];
  const magicGuard = b.ability === "マジックガード";

  if (haz.stealthRock && !magicGuard) {
    const mult = typeEffectiveness("いわ", b.poke?.types || []);
    const d = Math.max(1, Math.floor((b.maxHp * mult) / 8));
    b.hp = Math.max(0, b.hp - d);
    pushLog(battle, `${b.species} は ステルスロック でダメージ！（${d}）`);
    emit(battle, "damage", { side: sideKey, amount: d });
  }

  if (haz.spikes > 0 && isGrounded(b) && !magicGuard) {
    const den = haz.spikes === 1 ? 8 : haz.spikes === 2 ? 6 : 4;
    const d = Math.max(1, Math.floor(b.maxHp / den));
    b.hp = Math.max(0, b.hp - d);
    pushLog(battle, `${b.species} は まきびし でダメージ！（${d}）`);
    emit(battle, "damage", { side: sideKey, amount: d });
  }

  if (haz.toxicSpikes > 0 && isGrounded(b) && b.status === "なし") {
    if (b.poke?.types?.includes("どく")) {
      haz.toxicSpikes = 0;
      pushLog(battle, `${b.species} が どくびし を消した！`);
    } else if (!b.poke?.types?.includes("はがね") && b.ability !== "めんえき") {
      if (haz.toxicSpikes >= 2) {
        b.status = "もうどく";
        b._toxic = 0;
        pushLog(battle, `${b.species} は もうどく になった！`);
      } else {
        b.status = "どく";
        pushLog(battle, `${b.species} は どく になった！`);
      }
    }
  }

  if (b.hp <= 0) {
    b.hp = 0;
    b.fainted = true;
    pushLog(battle, `${b.species} はたおれた！`);
    emit(battle, "faint", { side: sideKey, species: b.species });
  }
}
