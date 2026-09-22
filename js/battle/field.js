/**
 * 天候・フィールド・壁（Phase 2）
 */
import { pushLog, emit, activeOf } from "./state.js?v=20260922f";

const WEATHER_TURNS = 5;
const FIELD_TURNS = 5;
const SCREEN_TURNS = 5;

function clayBonus(b) {
  return b?.item === "ひかりのねんど" ? 3 : 0;
}

function rockBonus(b, weather) {
  if (weather === "はれ" && b?.item === "あついいわ") return 3;
  if (weather === "あめ" && b?.item === "しめったいわ") return 3;
  if (weather === "すなあらし" && b?.item === "さらさらいわ") return 3;
  if (weather === "ゆき" && b?.item === "つめたいいわ") return 3;
  return 0;
}

export function setWeather(battle, weather, setter) {
  if (battle.weather === weather && battle.weatherTurns > 0) {
    pushLog(battle, `すでに ${weather} だ`);
    return;
  }
  battle.weather = weather;
  battle.weatherTurns = WEATHER_TURNS + rockBonus(setter, weather);
  const label = { はれ: "にほんばれ", あめ: "あまごい", すなあらし: "すなあらし", ゆき: "ゆき" }[weather] || weather;
  pushLog(battle, `${label} の影響で天候が変わった！（${battle.weatherTurns}ターン）`);
  emit(battle, "field", { weather });
}

export function setTerrain(battle, field, setter) {
  battle.field = field;
  battle.fieldTurns = FIELD_TURNS + (setter?.item === "グランドコート" ? 3 : 0);
  pushLog(battle, `${field} が広がった！（${battle.fieldTurns}ターン）`);
  emit(battle, "field", { field });
}

export function setScreen(battle, sideKey, kind, setter) {
  const side = battle.sideEffects[sideKey];
  const turns = SCREEN_TURNS + clayBonus(setter);
  if (kind === "reflect") {
    side.reflect = turns;
    pushLog(battle, `${sideKey === "player" ? "自分" : "相手"}側に リフレクター！（${turns}）`);
  } else if (kind === "lightScreen") {
    side.lightScreen = turns;
    pushLog(battle, `${sideKey === "player" ? "自分" : "相手"}側に ひかりのかべ！（${turns}）`);
  } else if (kind === "auroraVeil") {
    side.auroraVeil = turns;
    pushLog(battle, `${sideKey === "player" ? "自分" : "相手"}側に オーロラベール！（${turns}）`);
  }
  emit(battle, "field", { screen: kind, side: sideKey });
}

/** damage.js 用 screens オブジェクト（防御側視点） */
export function screensForDefender(battle, defSideKey) {
  const s = battle.sideEffects[defSideKey];
  return {
    reflect: (s?.reflect || 0) > 0,
    lightScreen: (s?.lightScreen || 0) > 0,
    auroraVeil: (s?.auroraVeil || 0) > 0,
  };
}

export function tickFieldEndOfTurn(battle) {
  if (battle.weather !== "なし" && battle.weatherTurns > 0) {
    // 砂ダメ
    if (battle.weather === "すなあらし") {
      for (const sideKey of ["player", "foe"]) {
        const b = activeOf(battle[sideKey]);
        if (!b || b.fainted) continue;
        const t = b.poke?.types || [];
        if (t.includes("いわ") || t.includes("じめん") || t.includes("はがね")) continue;
        if (b.ability === "マジックガード" || b.ability === "すながくれ" || b.ability === "すなのちから") continue;
        const d = Math.max(1, Math.floor(b.maxHp / 16));
        b.hp = Math.max(0, b.hp - d);
        pushLog(battle, `${b.species} は砂嵐のダメージを受けた！（${d}）`);
        if (b.hp <= 0) {
          b.fainted = true;
          pushLog(battle, `${b.species} はたおれた！`);
          emit(battle, "faint", { side: sideKey, species: b.species });
        }
      }
    }
    battle.weatherTurns -= 1;
    if (battle.weatherTurns <= 0) {
      pushLog(battle, `${battle.weather} が止んだ`);
      battle.weather = "なし";
      battle.weatherTurns = 0;
    }
  }

  if (battle.field !== "なし" && battle.fieldTurns > 0) {
    if (battle.field === "グラスフィールド") {
      for (const sideKey of ["player", "foe"]) {
        const b = activeOf(battle[sideKey]);
        if (!b || b.fainted || b.hp >= b.maxHp) continue;
        // grounded heal — simplified: non-flying
        if (b.poke?.types?.includes("ひこう") || b.ability === "ふゆう") continue;
        const h = Math.max(1, Math.floor(b.maxHp / 16));
        b.hp = Math.min(b.maxHp, b.hp + h);
        pushLog(battle, `${b.species} はグラスフィールドで回復（+${h}）`);
      }
    }
    battle.fieldTurns -= 1;
    if (battle.fieldTurns <= 0) {
      pushLog(battle, `${battle.field} がなくなった`);
      battle.field = "なし";
      battle.fieldTurns = 0;
    }
  }

  for (const sideKey of ["player", "foe"]) {
    const s = battle.sideEffects[sideKey];
    for (const k of ["reflect", "lightScreen", "auroraVeil"]) {
      if (s[k] > 0) {
        s[k] -= 1;
        if (s[k] <= 0) {
          const names = { reflect: "リフレクター", lightScreen: "ひかりのかべ", auroraVeil: "オーロラベール" };
          pushLog(battle, `${sideKey === "player" ? "自分" : "相手"}側の ${names[k]} の効果が切れた`);
        }
      }
    }
    if (battle.tailwind?.[sideKey] > 0) {
      battle.tailwind[sideKey] -= 1;
      if (battle.tailwind[sideKey] <= 0) {
        pushLog(battle, `${sideKey === "player" ? "自分" : "相手"}側の おいかぜ が止んだ`);
      }
    }
    if (battle.mist?.[sideKey] > 0) battle.mist[sideKey] -= 1;
    if (battle.safeguard?.[sideKey] > 0) battle.safeguard[sideKey] -= 1;
  }

  if (battle.trickRoom > 0) {
    battle.trickRoom -= 1;
    if (battle.trickRoom <= 0) pushLog(battle, "トリックルーム が解除された");
  }
}

export function fieldSummary(battle) {
  const parts = [];
  if (battle.weather !== "なし") parts.push(`${battle.weather}${battle.weatherTurns ? `(${battle.weatherTurns})` : ""}`);
  if (battle.field !== "なし") parts.push(`${battle.field}${battle.fieldTurns ? `(${battle.fieldTurns})` : ""}`);
  if (battle.trickRoom > 0) parts.push(`トリル(${battle.trickRoom})`);
  if (battle.tailwind?.player > 0) parts.push(`追風味方(${battle.tailwind.player})`);
  if (battle.tailwind?.foe > 0) parts.push(`追風相手(${battle.tailwind.foe})`);
  return parts.join(" / ") || "場効果なし";
}

export function hazardsSummary(battle, sideKey) {
  const h = battle.hazards[sideKey];
  const parts = [];
  if (h.stealthRock) parts.push("ステロ");
  if (h.spikes) parts.push(`まきびし×${h.spikes}`);
  if (h.toxicSpikes) parts.push(`どくびし×${h.toxicSpikes}`);
  const s = battle.sideEffects[sideKey];
  if (s.reflect > 0) parts.push(`リフ${s.reflect}`);
  if (s.lightScreen > 0) parts.push(`壁${s.lightScreen}`);
  if (s.auroraVeil > 0) parts.push(`ベール${s.auroraVeil}`);
  return parts.join(" ") || "—";
}
