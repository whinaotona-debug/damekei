/**
 * 交代技・強制交代（Phase 3）
 */
import { activeOf, livingIndices, pushLog, emit } from "./state.js?v=20260922f";

export const PIVOT_MOVES = new Set([
  "とんぼがえり",
  "ボルトチェンジ",
  "クイックターン",
  "しっぽきり",
  "すてゼリフ",
  "バトンタッチ",
  "とびでる",
  "ウターン",
]);

export const FORCE_SWITCH_MOVES = new Set([
  "ほえる",
  "ふきとばし",
  "ドラゴンテール",
  "サークルスロー",
]);

export function hasBench(battle, sideKey) {
  return livingIndices(battle[sideKey]).filter((i) => i !== battle[sideKey].active).length > 0;
}

/** ダメージ／効果成功後の自己交代リクエスト */
export function requestPivot(battle, sideKey, opts = {}) {
  if (!hasBench(battle, sideKey)) {
    pushLog(battle, "控えがいないので交代できない");
    return false;
  }
  battle.pendingPivot = {
    side: sideKey,
    keepRanks: !!opts.keepRanks, // バトンタッチ
    from: opts.from || "pivot",
  };
  pushLog(
    battle,
    sideKey === "player"
      ? "交代するポケモンを選んでください（交代技）"
      : "相手は交代技で控えに戻ろうとしている…"
  );
  emit(battle, "needPivot", { side: sideKey });
  return true;
}

/** ほえる等で相手を強制交代 */
export function requestForceSwitch(battle, targetSideKey, opts = {}) {
  const target = activeOf(battle[targetSideKey]);
  if (!target || target.fainted) return false;
  if (target.ability === "きゅうばん") {
    pushLog(battle, `${target.species} は きゅうばん で吹飛ばされない！`);
    return false;
  }
  if ((target.substituteHP || 0) > 0 && opts.blockedBySub) {
    pushLog(battle, "みがわり があるので吹飛ばせない！");
    return false;
  }
  if (!hasBench(battle, targetSideKey)) {
    pushLog(battle, "相手に控えがいない");
    return false;
  }
  battle.pendingForce = {
    side: targetSideKey,
    random: opts.random !== false,
  };
  pushLog(
    battle,
    targetSideKey === "player"
      ? "強制交代！ 出すポケモンを選んでください"
      : `${target.species} は吹き飛びそうだ…`
  );
  emit(battle, "needForceSwitch", { side: targetSideKey });
  return true;
}

export function pickRandomBench(battle, sideKey) {
  const alive = livingIndices(battle[sideKey]).filter((i) => i !== battle[sideKey].active);
  if (!alive.length) return -1;
  return alive[Math.floor(Math.random() * alive.length)];
}

/** バトン用にランクを退避 */
export function snapshotRanks(b) {
  return { ...(b.ranks || {}) };
}
