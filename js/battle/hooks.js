/**
 * 特性・持ち物のスイッチイン／ターン末フック（Phase 2）
 */
import { pushLog, emit, activeOf } from "./state.js?v=20260922f";
import { setWeather, setTerrain } from "./field.js?v=20260922f";
import { bump } from "./status-moves.js?v=20260922f";

export function onSwitchIn(battle, sideKey) {
  const b = activeOf(battle[sideKey]);
  if (!b || b.fainted) return;

  // 特性
  if (b.ability === "いかく") {
    const opp = activeOf(battle[sideKey === "player" ? "foe" : "player"]);
    if (opp && !opp.fainted && opp.ability !== "クリアボディ" && opp.ability !== "かいりきバサミ") {
      bump(opp, "atk", -1, battle);
      pushLog(battle, `${b.species} の いかく！`);
    }
  }
  if (b.ability === "ひでり" || b.ability === "メガソーラー") {
    setWeather(battle, "はれ", b);
  }
  if (b.ability === "あめふらし") {
    setWeather(battle, "あめ", b);
  }
  if (b.ability === "すなおこし") {
    setWeather(battle, "すなあらし", b);
  }
  if (b.ability === "ゆきふらし") {
    setWeather(battle, "ゆき", b);
  }
  if (b.ability === "エレキメイカー") {
    setTerrain(battle, "エレキフィールド", b);
  }
  if (b.ability === "グラスメイカー") {
    setTerrain(battle, "グラスフィールド", b);
  }
  if (b.ability === "サイコメイカー") {
    setTerrain(battle, "サイコフィールド", b);
  }
  if (b.ability === "ミストメイカー") {
    setTerrain(battle, "ミストフィールド", b);
  }
  if (b.ability === "ダウンロード") {
    const opp = activeOf(battle[sideKey === "player" ? "foe" : "player"]);
    if (opp) {
      if ((opp.stats.def || 0) < (opp.stats.spd || 0)) bump(b, "atk", 1, battle);
      else bump(b, "spa", 1, battle);
      pushLog(battle, `${b.species} の ダウンロード！`);
    }
  }

  // シード系
  if (b.item === "エレキシード" && battle.field === "エレキフィールド") {
    bump(b, "def", 1, battle);
    b.item = "なし";
    pushLog(battle, `${b.species} は エレキシード を使った！`);
  }
  if (b.item === "グラスシード" && battle.field === "グラスフィールド") {
    bump(b, "def", 1, battle);
    b.item = "なし";
  }
  if (b.item === "サイコシード" && battle.field === "サイコフィールド") {
    bump(b, "spd", 1, battle);
    b.item = "なし";
  }
  if (b.item === "ミストシード" && battle.field === "ミストフィールド") {
    bump(b, "spd", 1, battle);
    b.item = "なし";
  }
}

export function tryBerry(battle, b) {
  if (!b || b.fainted || b.item === "なし") return;
  const ratio = b.hp / b.maxHp;
  if (b.item === "オボンのみ" && ratio <= 0.5) {
    const h = Math.max(1, Math.floor(b.maxHp / 4));
    b.hp = Math.min(b.maxHp, b.hp + h);
    pushLog(battle, `${b.species} は オボンのみ で回復！（+${h}）`);
    b.item = "なし";
    emit(battle, "item", { side: b.side });
  }
  if (b.item === "オレンのみ" && ratio <= 0.5) {
    b.hp = Math.min(b.maxHp, b.hp + 10);
    pushLog(battle, `${b.species} は オレンのみ で回復！`);
    b.item = "なし";
  }
  if (b.item === "ラムのみ" && b.status !== "なし") {
    pushLog(battle, `${b.species} は ラムのみ で状態異常が治った！`);
    b.status = "なし";
    b._toxic = 0;
    b.item = "なし";
  }
  if (b.item === "クラボのみ" && b.status === "まひ") {
    b.status = "なし";
    b.item = "なし";
    pushLog(battle, `${b.species} は クラボのみ でまひが治った！`);
  }
}

export function endTurnVolatiles(battle, b, foe) {
  if (!b || b.fainted) return;
  // やどりぎ
  if (b._leechSeed && foe && !foe.fainted) {
    const d = Math.max(1, Math.floor(b.maxHp / 8));
    b.hp = Math.max(0, b.hp - d);
    foe.hp = Math.min(foe.maxHp, foe.hp + d);
    pushLog(battle, `やどりぎのタネ が ${b.species} の体力を吸収！`);
    if (b.hp <= 0) {
      b.fainted = true;
      pushLog(battle, `${b.species} はたおれた！`);
      emit(battle, "faint", { side: b.side, species: b.species });
    }
  }
  // あくび
  if (b._yawn) {
    b._yawn -= 1;
    if (b._yawn <= 0 && b.status === "なし") {
      b.status = "ねむり";
      b._sleep = 2;
      pushLog(battle, `${b.species} は眠ってしまった！`);
      b._yawn = 0;
    }
  }
}
