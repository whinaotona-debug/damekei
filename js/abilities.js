/**
 * データ内の全特性のうち、ダメージ計算に効くものを集約。
 * 戦闘操作・場作りのみの特性は UI 注記に回し、倍率は 1。
 */

export const ABILITY_NOTES = {
  メガソーラー: "技使用時のみ晴れ扱い（ウェザーボール炎化・炎1.5/水0.5・ソーラー半減なし）",
  ばけのかわ: "1発目で破れ・最大HPの1/8削り → 以降は通常（自動でKO計算に反映）",
  マルチスケイル: "HP満タン時のみ半減（1発目だけ・満タン復帰しない限り再発動しない想定でKO計算）",
  ファントムガード: "HP満タン時のみ半減（マルチスケイルと同系統）",
  がんじょう: "HP満タン時の一撃必殺をHP1で耐える（1回）",
  へんげんじざい: "技タイプに変化してSTAB",
  リベロ: "技タイプに変化してSTAB",
  じきゅうりょく: "被弾ごとに防御+1",
  かたやぶり: "相手の特性を無視",
};

/** 攻撃側が相手特性を無視できるか */
export function ignoresAbility(attackerAbility) {
  return attackerAbility === "かたやぶり" || attackerAbility === "ターボブレイズ" || attackerAbility === "テラボルテージ";
}

export function isProteanLike(ability) {
  return ability === "へんげんじざい" || ability === "リベロ";
}

/**
 * 攻撃側視点の「実質天候」（メガソーラー等）
 */
export function effectiveWeatherForAttacker(weather, attackerAbility) {
  if (attackerAbility === "メガソーラー") return "はれ";
  if (attackerAbility === "ノーてんき") return "なし";
  return weather;
}

/**
 * 攻撃力・威力・STAB前の補正（数値は威力 or 攻撃実数値に掛けるもの）
 */
export function modifyAttackPower({
  power,
  attackStat,
  move,
  moveType,
  attackerAbility,
  weather,
  hpRatio = 1,
}) {
  let a = attackStat;
  let p = power;
  const notes = [];

  // ちからもち / ヨガパワー相当なし → ちからもち
  if (attackerAbility === "ちからもち" && move.category === "物理") {
    a = Math.floor(a * 2);
    notes.push("ちからもち: 攻撃×2");
  }
  if (attackerAbility === "はりきり" && move.category === "物理") {
    a = Math.floor(a * 1.5);
    notes.push("はりきり: 攻撃×1.5");
  }
  if (attackerAbility === "サンパワー" && (weather === "はれ" || attackerAbility === "メガソーラー") && move.category === "特殊") {
    // サンパワーは特攻1.5。メガソーラー時も晴れ扱い
    a = Math.floor(a * 1.5);
    notes.push("サンパワー: 特攻×1.5");
  }
  // メガソーラー単独でもサンパワーは別特性。上はサンパワーのみ。

  // テクニシャン
  if (attackerAbility === "テクニシャン" && p != null && p <= 60) {
    p = Math.floor(p * 1.5);
    notes.push("テクニシャン: 威力×1.5");
  }
  if (attackerAbility === "かたいツメ" && move.contact) {
    p = Math.floor(p * 1.3);
    notes.push("かたいツメ: 威力×1.3");
  }
  if (attackerAbility === "てつのこぶし" && move.punch) {
    p = Math.floor(p * 1.2);
    notes.push("てつのこぶし: 威力×1.2");
  }
  if (attackerAbility === "メガランチャー" && (move.pulse || (move.effect || "").includes("波動") || move.name?.includes("はどう"))) {
    p = Math.floor(p * 1.5);
    notes.push("メガランチャー: 威力×1.5");
  }
  if (attackerAbility === "がんじょうあご" && move.bite) {
    p = Math.floor(p * 1.5);
    notes.push("がんじょうあご: 威力×1.5");
  }
  if (attackerAbility === "きれあじ" && move.slicing) {
    p = Math.floor(p * 1.5);
    notes.push("きれあじ: 威力×1.5");
  }
  if (attackerAbility === "すなのちから" && weather === "すなあらし" && ["いわ", "じめん", "はがね"].includes(moveType)) {
    p = Math.floor(p * 1.3);
    notes.push("すなのちから: 威力×1.3");
  }

  // タイプ強化スキン
  const skins = {
    スカイスキン: { from: "ノーマル", to: "ひこう", mult: 1.2 },
    フェアリースキン: { from: "ノーマル", to: "フェアリー", mult: 1.2 },
    フリーズスキン: { from: "ノーマル", to: "こおり", mult: 1.2 },
    ドラゴンスキン: { from: "ノーマル", to: "ドラゴン", mult: 1.2 },
  };
  let typeOverride = null;
  if (skins[attackerAbility] && moveType === skins[attackerAbility].from) {
    typeOverride = skins[attackerAbility].to;
    p = Math.floor(p * skins[attackerAbility].mult);
    notes.push(`${attackerAbility}: ${typeOverride}化・威力×${skins[attackerAbility].mult}`);
  }

  // HP1/3以下ブースト
  const pinch = {
    もうか: "ほのお",
    げきりゅう: "みず",
    しんりょく: "くさ",
    むしのしらせ: "むし",
  };
  if (pinch[attackerAbility] && moveType === pinch[attackerAbility] && hpRatio <= 1 / 3) {
    p = Math.floor(p * 1.5);
    notes.push(`${attackerAbility}: 威力×1.5（HP1/3以下）`);
  }

  if (attackerAbility === "てきおうりょく") {
    notes.push("てきおうりょく: STAB×2");
  }
  if (attackerAbility === "アナライズ") {
    // 後攻想定トグルは flags で。ここでは後攻時
    // applied in damage.js if movingLast
  }
  if (attackerAbility === "すいほう" && moveType === "みず") {
    p = Math.floor(p * 2);
    notes.push("すいほう: みず威力×2");
  }
  if (attackerAbility === "ちからずく") {
    notes.push("ちからずく: 追加効果なし・威力1.3（適用時）");
  }

  return { attackStat: a, power: p, typeOverride, notes };
}

export function stabMultiplier(attackerTypes, moveType, attackerAbility) {
  if (!attackerTypes.includes(moveType)) return 1;
  if (attackerAbility === "てきおうりょく") return 2;
  return 1.5;
}

/**
 * 防御側のダメージ倍率（タイプ相性後に掛けるもの含む）
 * @returns {{ mult: number, notes: string[], immune: boolean, blockHit: boolean }}
 */
export function modifyDefensiveDamage({
  mult,
  move,
  moveType,
  defenderAbility,
  attackerAbility,
  defenderTypes,
  weather,
  hpFull = true,
  disguiseIntact = true,
  moldBreak = false,
}) {
  const notes = [];
  let m = mult;
  let immune = false;
  let blockHit = false;

  const defAb = moldBreak || ignoresAbility(attackerAbility) ? null : defenderAbility;

  if (!defAb) {
    if (moldBreak || ignoresAbility(attackerAbility)) notes.push("かたやぶり等: 相手特性無視");
    return { mult: m, notes, immune, blockHit };
  }

  // ばけのかわ
  if (defAb === "ばけのかわ" && disguiseIntact) {
    blockHit = true;
    notes.push("ばけのかわ: 最初の攻撃を無効");
    return { mult: 0, notes, immune: false, blockHit };
  }

  // タイプ無効系
  if (defAb === "ふゆう" && moveType === "じめん") {
    immune = true;
    notes.push("ふゆう: じめん無効");
  }
  if (defAb === "もらいび" && moveType === "ほのお") {
    immune = true;
    notes.push("もらいび: ほのお無効");
  }
  if ((defAb === "ちょすい" || defAb === "かんそうはだ") && moveType === "みず") {
    immune = true;
    notes.push(`${defAb}: みず無効`);
  }
  if ((defAb === "ひらいしん" || defAb === "でんきエンジン" || defAb === "でんきにかえる") && moveType === "でんき") {
    immune = true;
    notes.push(`${defAb}: でんき無効`);
  }
  if (defAb === "そうしょく" && moveType === "くさ") {
    immune = true;
    notes.push("そうしょく: くさ無効");
  }
  if (defAb === "ぼうおん" && move.sound) {
    immune = true;
    notes.push("ぼうおん: 音技無効");
  }
  if (defAb === "ぼうだん" && move.bullet) {
    immune = true;
    notes.push("ぼうだん: 弾技無効");
  }
  if (defAb === "りんぷん" && move.powder) {
    // powder moves fail on grass too - ability
  }

  if (immune) return { mult: 0, notes, immune, blockHit };

  // 半減・軽減
  if (defAb === "あついしぼう" && (moveType === "ほのお" || moveType === "こおり")) {
    m *= 0.5;
    notes.push("あついしぼう: ×0.5");
  }
  if (defAb === "たいねつ" && moveType === "ほのお") {
    m *= 0.5;
    notes.push("たいねつ: ×0.5");
  }
  if (defAb === "かんそうはだ" && moveType === "ほのお") {
    m *= 1.25;
    notes.push("かんそうはだ: ほのお×1.25");
  }
  if ((defAb === "マルチスケイル" || defAb === "ファントムガード") && hpFull) {
    m *= 0.5;
    notes.push(`${defAb}: HP満タン×0.5（この発のみ）`);
  }
  if ((defAb === "フィルター" || defAb === "ハードロック" || defAb === "プリズムアーマー") && mult > 1) {
    // mult here is type mult already applied outside - this function receives post-type damage factor separately
  }
  if (defAb === "もふもふ") {
    if (moveType === "ほのお") {
      m *= 2;
      notes.push("もふもふ: ほのお×2");
    } else if (move.contact) {
      m *= 0.5;
      notes.push("もふもふ: 接触×0.5");
    }
  }
  if (defAb === "すいほう" && moveType === "ほのお") {
    m *= 2;
    notes.push("すいほう: ほのお×2");
  }
  if (defAb === "ファーコート" && move.category === "物理") {
    // doubles Defense in getAttackDefense instead ideally; as damage approx ×0.5
    m *= 0.5;
    notes.push("ファーコート: 物理×0.5");
  }
  if (defAb === "くさのけがわ" && weather === "グラスフィールド" && move.category === "物理") {
    m *= 0.5;
    notes.push("くさのけがわ: 物理×0.5");
  }
  if (defAb === "すりぬけ") {
    // ignores screens/sub - handled elsewhere
  }
  if (defAb === "シェルアーマー" || defAb === "カブトアーマー") {
    notes.push(`${defAb}: 急所にならない`);
  }
  if (defAb === "てんねん") {
    notes.push("てんねん: 能力変化無視");
  }

  return { mult: m, notes, immune, blockHit };
}

/** タイプ相性後の軽減（フィルター等）— typeMult と最終ダメージに */
export function seDamageMod(typeMult, defenderAbility, moldBreak, attackerAbility) {
  if (moldBreak || ignoresAbility(attackerAbility)) return 1;
  if (typeMult > 1 && ["フィルター", "ハードロック", "プリズムアーマー"].includes(defenderAbility)) {
    return 0.75;
  }
  return 1;
}

export function criticalBlocked(defenderAbility, moldBreak, attackerAbility) {
  if (moldBreak || ignoresAbility(attackerAbility)) return false;
  return defenderAbility === "シェルアーマー" || defenderAbility === "カブトアーマー";
}

export function criticalMultiplier(attackerAbility) {
  if (attackerAbility === "スナイパー") return 2.25; // gen6+: 1.5 * 1.5
  return 1.5;
}
