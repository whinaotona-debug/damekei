/**
 * 特殊技・固定ダメ・回復・反動など（Phase 4）
 */
import { pushLog, emit, activeOf } from "./state.js?v=20260922f";
import { tryStatus, bump } from "./status-moves.js?v=20260922f";

const HEAL_MOVES = {
  じこさいせい: 0.5,
  なまける: 0.5,
  タマゴうみ: 0.5,
  ミルクのみ: 0.5,
  はねやすめ: 0.5,
  あさのひざし: 0.5, // weather adjust in apply
  つきのひかり: 0.5,
  こうごうせい: 0.5,
  すなあつめ: 0.5,
};

const FIXED_MOVES = {
  ナイトヘッド: "level",
  ちきゅうなげ: "level",
  ソニックブーム: 20,
  りゅうのいかり: 40,
};

const RECOIL_MOVES = {
  じごくぐるま: 1 / 4,
  ウッドハンマー: 1 / 3,
  フレアドライブ: 1 / 3,
  ブレイブバード: 1 / 3,
  ワイルドボルト: 1 / 4,
  とっしん: 1 / 4,
  アフロブレイク: 1 / 4,
};

const DRAIN_MOVES = new Set([
  "ギガドレイン",
  "メガドレイン",
  "吸収",
  "ドレインキッス",
  "ドレインパンチ",
  "ホーンリーチ",
  "やどりぎのタネ", // status
  "パラボラチャージ",
  "むしのさざめき",
]);

export function trySpecialStatusMove(battle, atk, def, move) {
  const n = move.name;

  if (n === "トリックルーム") {
    battle.trickRoom = battle.trickRoom > 0 ? 0 : 5;
    pushLog(battle, battle.trickRoom ? "トリックルーム が展開された！" : "トリックルーム が解除された！");
    return "handled";
  }
  if (n === "おいかぜ") {
    const side = atk.side;
    battle.tailwind = battle.tailwind || { player: 0, foe: 0 };
    battle.tailwind[side] = 4;
    pushLog(battle, `${side === "player" ? "自分" : "相手"}側に おいかぜ！`);
    return "handled";
  }
  if (n === "しろいきり") {
    battle.mist = battle.mist || { player: 0, foe: 0 };
    battle.mist[atk.side] = 5;
    pushLog(battle, "しろいきり で能力低下を防げる！");
    return "handled";
  }
  if (n === "しんぴのまもり") {
    battle.safeguard = battle.safeguard || { player: 0, foe: 0 };
    battle.safeguard[atk.side] = 5;
    pushLog(battle, "しんぴのまもり で状態異常を防げる！");
    return "handled";
  }
  if (n === "いばる") {
    bump(def, "atk", 2, battle);
    pushLog(battle, `${def.species} を いばる で挑発した！`);
    return "handled";
  }
  if (n === "くろいきり") {
    for (const side of ["player", "foe"]) {
      const mon = activeOf(battle[side]);
      if (mon) {
        mon.ranks = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      }
    }
    pushLog(battle, "すべての能力変化が消えた！");
    return "handled";
  }

  if (HEAL_MOVES[n] != null) {
    let ratio = HEAL_MOVES[n];
    if (["あさのひざし", "つきのひかり", "こうごうせい"].includes(n)) {
      if (battle.weather === "はれ") ratio = 2 / 3;
      else if (battle.weather !== "なし") ratio = 0.25;
    }
    if (n === "すなあつめ" && battle.weather !== "すなあらし") {
      pushLog(battle, "すなあらし のときしか使えない！");
      return "fail";
    }
    if (n === "すなあつめ") ratio = 0.5;
    const heal = Math.max(1, Math.floor(atk.maxHp * ratio));
    atk.hp = Math.min(atk.maxHp, atk.hp + heal);
    pushLog(battle, `${atk.species} の体力が回復した！（+${heal}）`);
    emit(battle, "heal", { side: atk.side, amount: heal });
    return "handled";
  }

  if (n === "いたみわけ") {
    const total = atk.hp + def.hp;
    const half = Math.floor(total / 2);
    atk.hp = Math.min(atk.maxHp, half);
    def.hp = Math.min(def.maxHp, total - half);
    pushLog(battle, "お互いの体力を分け合った！");
    return "handled";
  }

  if (n === "みちずれ") {
    atk._destinyBond = true;
    pushLog(battle, `${atk.species} は みちずれ を狙っている！`);
    return "handled";
  }

  return null;
}

/** 攻撃技の特殊処理。通常ダメ計算の前後で呼ぶ */
export function applyFixedDamage(battle, atk, def, move) {
  const n = move.name;
  if (FIXED_MOVES[n] === "level") {
    return 50; // Champions Lv50
  }
  if (typeof FIXED_MOVES[n] === "number") return FIXED_MOVES[n];
  if (n === "ぜったいれいど" || n === "つのドリル" || n === "ハサミギロチン" || n === "じわれ") {
    // OHKO — simplified 30% accuracy already handled; on hit = KO
    return def.hp;
  }
  return null;
}

export function applyRecoil(battle, atk, dmg, move) {
  const rate = RECOIL_MOVES[move.name];
  if (!rate || atk.ability === "ロックヘッд" || atk.ability === "マジックガード") return;
  const recoil = Math.max(1, Math.floor(dmg * rate));
  atk.hp = Math.max(0, atk.hp - recoil);
  pushLog(battle, `${atk.species} は反動を受けた！（${recoil}）`);
  if (atk.hp <= 0) {
    atk.fainted = true;
    pushLog(battle, `${atk.species} はたおれた！`);
    emit(battle, "faint", { side: atk.side, species: atk.species });
  }
}

export function applyDrain(battle, atk, def, dmg, move) {
  if (!DRAIN_MOVES.has(move.name) && !/HPを.*吸収|吸収する/.test(move.effect || "")) return;
  if (def.ability === "ヘドロえき") {
    const chip = Math.max(1, Math.floor(dmg / 2));
    atk.hp = Math.max(0, atk.hp - chip);
    pushLog(battle, `${atk.species} は ヘドロえき でダメージ！`);
    return;
  }
  const heal = Math.max(1, Math.floor(dmg / 2));
  const before = atk.hp;
  atk.hp = Math.min(atk.maxHp, atk.hp + heal);
  if (atk.hp > before) {
    pushLog(battle, `${atk.species} は体力を吸収した！（+${atk.hp - before}）`);
    emit(battle, "heal", { side: atk.side, amount: atk.hp - before });
  }
}

export function applySelfDestruct(battle, atk, move) {
  if (move.name === "だいばくはつ" || move.name === "じばく" || move.explosion) {
    atk.hp = 0;
    atk.fainted = true;
    pushLog(battle, `${atk.species} は自爆した！`);
    emit(battle, "faint", { side: atk.side, species: atk.species });
    return true;
  }
  return false;
}

export function checkAbsorbAbility(battle, atk, def, move, moveType) {
  if (!def || def.fainted) return false;
  if (def.ability === "ちくでん" && moveType === "でんき") {
    const h = Math.max(1, Math.floor(def.maxHp / 4));
    def.hp = Math.min(def.maxHp, def.hp + h);
    pushLog(battle, `${def.species} は ちくでん で回復！`);
    return true;
  }
  if (def.ability === "ちょすい" && moveType === "みず") {
    const h = Math.max(1, Math.floor(def.maxHp / 4));
    def.hp = Math.min(def.maxHp, def.hp + h);
    pushLog(battle, `${def.species} は ちょすい で回復！`);
    return true;
  }
  if (def.ability === "もらいび" && moveType === "ほのお") {
    bump(def, "spa", 1, battle);
    pushLog(battle, `${def.species} は もらいび で特攻が上がった！`);
    return true;
  }
  if (def.ability === "ひらいしん" && moveType === "でんき") {
    bump(def, "spa", 1, battle);
    pushLog(battle, `${def.species} は ひらいしん で特攻が上がった！`);
    return true;
  }
  if (def.ability === "よびみず" && moveType === "みず") {
    bump(def, "spa", 1, battle);
    pushLog(battle, `${def.species} は よびみず で特攻が上がった！`);
    return true;
  }
  if (def.ability === "ふゆう" && moveType === "じめん") {
    pushLog(battle, `${def.species} は ふゆう でじめん技を受けない！`);
    return true;
  }
  void atk;
  return false;
}

export function onFaintDestinyBond(battle, fainted, attacker) {
  if (!fainted?._destinyBond || !attacker || attacker.fainted) return;
  attacker.hp = 0;
  attacker.fainted = true;
  pushLog(battle, `${fainted.species} の みちずれ で ${attacker.species} もたおれた！`);
  emit(battle, "faint", { side: attacker.side, species: attacker.species });
  fainted._destinyBond = false;
}
