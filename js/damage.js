import { typeEffectiveness, effectivenessLabel } from "./types.js";
import { applyRank, calcAllStats } from "./stats.js";

const LEVEL = 50;

function pokeRound(n) {
  // Pokemon games: round down at .5? Actually gen5+ uses floor toward -inf for most.
  return Math.floor(n);
}

function chainMod(value, modifier) {
  // modifier as number like 1.5, 0.5, 1.2
  return pokeRound(value * modifier);
}

/** タイプ強化系持ち物 */
const TYPE_BOOST_ITEMS = {
  ぎんのこな: "むし",
  メタルコート: "はがね",
  やわらかいすな: "じめん",
  かたいいし: "いわ",
  きせきのタネ: "くさ",
  くろいメガネ: "あく",
  くろおび: "かくとう",
  じしゃく: "でんき",
  しんぴのしずく: "みず",
  するどいくちばし: "ひこう",
  どくバリ: "どく",
  とけないこおり: "こおり",
  のろいのおふだ: "ゴースト",
  まがったスプーン: "エスパー",
  もくたん: "ほのお",
  りゅうのキバ: "ドラゴン",
  シルクのスカーフ: "ノーマル",
  ようせいのハネ: "フェアリー",
};

const RESIST_BERRIES = {
  オッカのみ: "ほのお",
  イトケのみ: "みず",
  ソクノのみ: "でんき",
  リンドのみ: "くさ",
  ヤチェのみ: "こおり",
  ヨプのみ: "かくとう",
  ビアーのみ: "どく",
  シュカのみ: "じめん",
  バコウのみ: "ひこう",
  ウタンのみ: "エスパー",
  タンガのみ: "むし",
  ヨロギのみ: "いわ",
  カシブのみ: "ゴースト",
  ハバンのみ: "ドラゴン",
  ナモのみ: "あく",
  リリバのみ: "はがね",
  ロゼルのみ: "フェアリー",
};

function textHas(move, ...needles) {
  const t = `${move.target || ""} ${move.effect || ""} ${move.name || ""}`;
  return needles.some((n) => t.includes(n));
}

function getHitCount(move) {
  const name = move.name;
  if (name === "トリプルアクセル") return { min: 3, max: 3, powers: [20, 40, 60] };
  if (name === "ネズミざん") return { min: 1, max: 10, powers: null };
  if (["ダブルアタック", "ダブルウイング", "ツインビーム", "ドラゴンアロー"].includes(name)) {
    return { min: 2, max: 2, powers: null };
  }
  if (textHas(move, "2ー5回", "2～5回", "2-5回", "2〜5回")) {
    return { min: 2, max: 5, powers: null };
  }
  if (textHas(move, "連続で攻撃", "連続3回", "2回連続")) {
    if (textHas(move, "2回")) return { min: 2, max: 2, powers: null };
    return { min: 2, max: 5, powers: null };
  }
  return { min: 1, max: 1, powers: null };
}

function resolveMoveType(move, weather, field, attacker) {
  let type = move.type;
  if (move.name === "ウェザーボール") {
    if (weather === "はれ") type = "ほのお";
    else if (weather === "あめ") type = "みず";
    else if (weather === "ゆき") type = "こおり";
    else if (weather === "すなあらし") type = "いわ";
  }
  if (move.name === "だいちのはどう" && field && field !== "なし") {
    const map = {
      エレキフィールド: "でんき",
      グラスフィールド: "くさ",
      サイコフィールド: "エスパー",
      ミストフィールド: "フェアリー",
    };
    type = map[field] || type;
  }
  return type;
}

function resolvePower(move, ctx) {
  let power = move.power;
  const { attacker, defender, weather, field, moveHitsAssumed } = ctx;

  if (move.name === "トリプルアクセル") {
    // handled per-hit
    return power || 20;
  }

  // アクロバット
  if (move.name === "アクロバット" && (!attacker.item || attacker.item === "なし")) {
    power = (power || 55) * 2;
  }
  // からげんき
  if (move.name === "からげんき" && ["どく", "もうどく", "まひ", "やけど"].includes(attacker.status)) {
    power = (power || 70) * 2;
  }
  // ヘビーボンバー / ヒートスタンプ — weight unknown: default 80 mid
  if (["ヘビーボンバー", "ヒートスタンプ"].includes(move.name) && power == null) {
    power = 80;
  }
  // けたぐり / くさむすび — weight unknown: default 80
  if (["けたぐり", "くさむすび"].includes(move.name) && power == null) {
    power = 80;
  }
  // エレキボール — speed based
  if (move.name === "エレキボール") {
    const ratio = attacker.stats.spe / Math.max(1, defender.stats.spe);
    if (ratio >= 4) power = 150;
    else if (ratio >= 3) power = 120;
    else if (ratio >= 2) power = 80;
    else if (ratio >= 1) power = 60;
    else power = 40;
  }
  // ジャイロボール
  if (move.name === "ジャイロボール") {
    power = Math.min(150, Math.floor((25 * defender.stats.spe) / Math.max(1, attacker.stats.spe)) + 1);
  }
  // しおふき / ふんか — assume full HP => 150
  if (["しおふき", "ふんか"].includes(move.name)) {
    power = Math.max(1, Math.floor((150 * (attacker.hpRatio ?? 1))));
  }
  // きしかいせい / じたばた — assume half HP mid
  if (["きしかいせい", "じたばた"].includes(move.name) && power == null) {
    const hp = attacker.hpRatio ?? 0.5;
    const table = [200, 150, 100, 80, 40, 20];
    // simplified
    power = hp > 0.6875 ? 20 : hp > 0.3542 ? 40 : hp > 0.2083 ? 80 : hp > 0.1042 ? 100 : hp > 0.0417 ? 150 : 200;
  }
  // たたりめ / ベノムショック / どくばりセンボン / ひゃっきやこう
  if (move.name === "たたりめ" && defender.status && defender.status !== "なし") power = (power || 65) * 2;
  if (move.name === "ひゃっきやこう" && defender.status && defender.status !== "なし") power = (power || 65) * 2;
  if (["ベノムショック", "どくばりセンボン"].includes(move.name) && ["どく", "もうどく"].includes(defender.status)) {
    power = (power || 65) * 2;
  }
  // はたきおとす
  if (move.name === "はたきおとす" && defender.item && defender.item !== "なし") {
    power = pokeRound((power || 65) * 1.5);
  }
  // アシストパワー / つけあがる
  if (["アシストパワー", "つけあがる"].includes(move.name)) {
    const stages = Object.values(attacker.ranks || {}).reduce((s, v) => s + Math.max(0, v), 0);
    power = 20 + 20 * stages;
  }
  // ウェザーボール
  if (move.name === "ウェザーボール" && weather && weather !== "なし") {
    power = (power || 50) * 2;
  }
  // だいちのはどう
  if (move.name === "だいちのはどう" && field && field !== "なし") {
    power = (power || 50) * 2;
  }
  // フィールド技
  if (move.name === "ライジングボルト" && field === "エレキフィールド") power = (power || 70) * 2;
  if (move.name === "ミストバースト" && field === "ミストフィールド") power = pokeRound((power || 100) * 1.5);
  if (move.name === "ワイドフォース" && field === "サイコフィールド") power = pokeRound((power || 80) * 1.5);
  if (move.name === "Gのちから" && ctx.gravity) power = pokeRound((power || 90) * 1.5);

  // ソーラービーム等 天気半減
  if (["ソーラービーム", "ソーラーブレード"].includes(move.name) && weather && weather !== "なし" && weather !== "はれ") {
    power = pokeRound((power || 120) * 0.5);
  }
  // じしん グラスフィールド
  if (["じしん", "じならし"].includes(move.name) && field === "グラスフィールド") {
    power = pokeRound((power || 100) * 0.5);
  }

  // フィールド威力 1.3
  if (field === "エレキフィールド" && resolveMoveType(move, weather, field, attacker) === "でんき") {
    power = pokeRound((power || 0) * 1.3);
  }
  if (field === "グラスフィールド" && resolveMoveType(move, weather, field, attacker) === "くさ") {
    power = pokeRound((power || 0) * 1.3);
  }
  if (field === "サイコフィールド" && resolveMoveType(move, weather, field, attacker) === "エスパー") {
    power = pokeRound((power || 0) * 1.3);
  }
  if (field === "ミストフィールド" && resolveMoveType(move, weather, field, attacker) === "ドラゴン") {
    // mist reduces dragon power received — applied on damage side too; power reduction on defender field
  }

  return power;
}

function getAttackDefense(move, attacker, defender, critical) {
  const cat = move.category;
  let atkStat;
  let defStat;
  let atkRank;
  let defRank;
  let atkName;
  let defName;

  // ボディプレス: 防御で攻撃
  if (move.name === "ボディプレス") {
    atkStat = attacker.stats.def;
    atkRank = attacker.ranks.def;
    atkName = "防御(ボディプレス)";
    defStat = defender.stats.def;
    defRank = defender.ranks.def;
    defName = "防御";
  } else if (move.name === "イカサマ") {
    atkStat = defender.stats.atk;
    atkRank = defender.ranks.atk;
    atkName = "相手の攻撃(イカサマ)";
    defStat = defender.stats.def;
    defRank = defender.ranks.def;
    defName = "防御";
  } else if (move.name === "サイコショック" || move.name === "サイコブレイク") {
    atkStat = attacker.stats.spa;
    atkRank = attacker.ranks.spa;
    atkName = "特攻";
    defStat = defender.stats.def;
    defRank = defender.ranks.def;
    defName = "防御(サイコショック)";
  } else if (cat === "物理") {
    atkStat = attacker.stats.atk;
    atkRank = attacker.ranks.atk;
    atkName = "攻撃";
    defStat = defender.stats.def;
    defRank = defender.ranks.def;
    defName = "防御";
  } else {
    atkStat = attacker.stats.spa;
    atkRank = attacker.ranks.spa;
    atkName = "特攻";
    defStat = defender.stats.spd;
    defRank = defender.ranks.spd;
    defName = "特防";
  }

  // 急所時: 攻撃側の下降無視・防御側の上昇無視
  if (critical) {
    if (atkRank < 0) atkRank = 0;
    if (defRank > 0) defRank = 0;
  }

  // 無視技
  if (textHas(move, "能力変化を無視") || ["DDラリアット", "せいなるつるぎ"].includes(move.name)) {
    atkRank = 0;
    defRank = 0;
  }

  let a = applyRank(atkStat, atkRank);
  let d = applyRank(defStat, defRank);

  // ゆき: こおりタイプの防御1.5
  if (defender.weather === "ゆき" && defender.types.includes("こおり") && defName.startsWith("防御") && move.name !== "サイコショック") {
    // only physical def
    if (cat === "物理" || move.name === "ボディプレス" || move.name === "イカサマ") {
      d = pokeRound(d * 1.5);
    }
  }
  // すなあらし: いわ特防1.5
  if (defender.weather === "すなあらし" && defender.types.includes("いわ") && defName.includes("特防")) {
    d = pokeRound(d * 1.5);
  }

  // でんきだま
  if (attacker.item === "でんきだま" && attacker.name === "ピカチュウ") {
    if (atkName.includes("攻撃") || atkName.includes("特攻")) a = pokeRound(a * 2);
  }
  // こだわりハチマキ相当なし — スカーフは素早さのみ

  return { a, d, atkName, defName, atkStat, defStat, atkRank, defRank };
}

function baseDamage(power, a, d) {
  // floor(floor(floor((2*Lv/5+2)*威力*A/D)/50)+2)
  const step1 = pokeRound(((2 * LEVEL) / 5 + 2) * power * a / d);
  const step2 = pokeRound(step1 / 50);
  return step2 + 2;
}

function isGrounded(poke, field) {
  if (poke.item === "くろいてっきゅう") return true;
  if (poke.item === "ふうせん") return false;
  if (poke.types.includes("ひこう")) return false;
  if (poke.ability === "ふゆう") return false;
  return true;
}

/**
 * @returns damage result
 */
export function calculateDamage(input) {
  const {
    attackerPoke,
    defenderPoke,
    move,
    attackerEvs,
    defenderEvs,
    attackerNature,
    defenderNature,
    attackerAbility,
    defenderAbility,
    attackerItem,
    defenderItem,
    attackerRanks,
    defenderRanks,
    attackerStatus = "なし",
    defenderStatus = "なし",
    weather = "なし",
    field = "なし",
    screens = {},
    critical = false,
    gravity = false,
    helpBoost = false,
    metronome = 1,
  } = input;

  const details = [];
  if (!attackerPoke || !defenderPoke || !move) {
    return { error: "ポケモンと技を選択してください", details };
  }
  if (move.category === "変化") {
    return { error: "変化技のためダメージはありません", details, move };
  }

  const atkStats = calcAllStats(attackerPoke.baseStats, attackerEvs, attackerNature);
  const defStats = calcAllStats(defenderPoke.baseStats, defenderEvs, defenderNature);

  const attacker = {
    name: attackerPoke.name,
    types: attackerPoke.types,
    stats: atkStats,
    ranks: attackerRanks,
    item: attackerItem,
    ability: attackerAbility,
    status: attackerStatus,
    weather,
    hpRatio: 1,
  };
  const defender = {
    name: defenderPoke.name,
    types: defenderPoke.types,
    stats: defStats,
    ranks: defenderRanks,
    item: defenderItem,
    ability: defenderAbility,
    status: defenderStatus,
    weather,
  };

  const moveType = resolveMoveType(move, weather, field, attacker);
  const hits = getHitCount(move);

  details.push(`攻撃側: ${attacker.name} / 防御側: ${defender.name}`);
  details.push(`レベル: ${LEVEL}`);
  details.push(`技: ${move.name}（${moveType} / ${move.category}）`);
  details.push(`攻撃側実数値: HP${atkStats.hp} 攻撃${atkStats.atk} 防御${atkStats.def} 特攻${atkStats.spa} 特防${atkStats.spd} 素早${atkStats.spe}`);
  details.push(`防御側実数値: HP${defStats.hp} 攻撃${defStats.atk} 防御${defStats.def} 特攻${defStats.spa} 特防${defStats.spd} 素早${defStats.spe}`);

  // 固定ダメージ
  if (["ちきゅうなげ", "ナイトヘッド"].includes(move.name)) {
    const dmg = LEVEL;
    return finalizeFixed(dmg, defStats.hp, moveType, defender.types, details, move, "固定ダメージ（レベル分）");
  }
  if (move.name === "いかりのまえば") {
    const dmg = Math.max(1, Math.floor(defStats.hp / 2));
    return finalizeFixed(dmg, defStats.hp, moveType, defender.types, details, move, "残りHPの1/2");
  }
  if (["じわれ", "ぜったいれいど", "つのドリル", "ハサミギロチン"].includes(move.name)) {
    return finalizeFixed(defStats.hp, defStats.hp, moveType, defender.types, details, move, "一撃必殺（命中時）");
  }
  if (move.name === "いのちがけ") {
    const dmg = atkStats.hp; // 満タン想定
    return finalizeFixed(dmg, defStats.hp, moveType, defender.types, details, move, "自分の残りHP分");
  }
  if (move.name === "がむしゃら") {
    const dmg = Math.max(0, defStats.hp - atkStats.hp);
    return finalizeFixed(dmg || 1, defStats.hp, moveType, defender.types, details, move, "HP差");
  }

  const ctx = { attacker, defender, weather, field, gravity };
  let power = resolvePower(move, ctx);
  if (power == null || power <= 0) {
    return { error: "この技は威力が状況依存、または非対応です", details, move };
  }

  // 持ち物・技威力補正
  const boostType = TYPE_BOOST_ITEMS[attackerItem];
  if (boostType && boostType === moveType) {
    power = pokeRound(power * 1.2);
    details.push(`持ち物補正(${attackerItem}): 威力×1.2 → ${power}`);
  }
  if (attackerItem === "ちからのハチマキ" && move.category === "物理") {
    power = pokeRound(power * 1.1);
    details.push("ちからのハチマキ: 威力×1.1");
  }
  if (attackerItem === "ものしりメガネ" && move.category === "特殊") {
    power = pokeRound(power * 1.1);
    details.push("ものしりメガネ: 威力×1.1");
  }
  if (attackerItem === "ノーマルジュエル" && moveType === "ノーマル") {
    power = pokeRound(power * 1.3);
    details.push("ノーマルジュエル: 威力×1.3");
  }
  if (attackerItem === "いのちのたま") {
    power = pokeRound(power * 1.3);
    details.push("いのちのたま: 威力×1.3");
  }
  if (metronome > 1) {
    const m = Math.min(2, 1 + (metronome - 1) * 0.2);
    power = pokeRound(power * m);
    details.push(`メトロノーム: 威力×${m}`);
  }
  if (helpBoost) {
    power = pokeRound(power * 1.5);
    details.push("てだすけ: 威力×1.5");
  }

  // 特性（攻撃側）ざっくり
  if (attackerAbility === "てきおうりょく" && attacker.types.includes(moveType)) {
    // STAB later 2.0
  }
  if (["てつのこぶし"].includes(attackerAbility) && move.punch) {
    power = pokeRound(power * 1.2);
    details.push("てつのこぶし: 威力×1.2");
  }
  if (attackerAbility === "かたいツメ" && move.contact) {
    power = pokeRound(power * 1.3);
    details.push("かたいツメ: 威力×1.3");
  }
  if (attackerAbility === "すてみ" && textHas(move, "自分も受ける", "反動")) {
    power = pokeRound(power * 1.2);
  }

  details.push(`技威力: ${power}`);

  // タイプ相性
  let typeMult = typeEffectiveness(moveType, defender.types, {
    freezeDry: move.name === "フリーズドライ",
  });
  if (move.name === "フライングプレス") {
    typeMult =
      typeEffectiveness("かくとう", defender.types) *
      typeEffectiveness("ひこう", defender.types);
  }
  // ミストフィールド ドラゴン半減
  if (field === "ミストフィールド" && moveType === "ドラゴン" && isGrounded(defender, field)) {
    typeMult *= 0.5;
  }

  details.push(`タイプ相性: ×${typeMult}（${effectivenessLabel(typeMult)}）`);
  if (typeMult === 0) {
    return {
      min: 0,
      max: 0,
      rolls: [0],
      percentMin: 0,
      percentMax: 0,
      koText: "効果がない",
      effectiveness: effectivenessLabel(0),
      typeMult: 0,
      details,
      defenderHp: defStats.hp,
      moveType,
    };
  }

  // たつじんのおび
  if (attackerItem === "たつじんのおび" && typeMult > 1) {
    power = pokeRound(power * 1.2);
    details.push("たつじんのおび: 威力×1.2");
  }

  const isCrit = critical || textHas(move, "必ず急所") || ["こおりのいぶき", "やまあらし", "トリックフラワー"].includes(move.name);
  if (isCrit) details.push("急所: あり（能力ランク不利無視 / ×1.5）");

  const { a, d, atkName, defName } = getAttackDefense(
    { ...move, type: moveType },
    { ...attacker, weather },
    { ...defender, weather },
    isCrit
  );
  details.push(`攻撃側能力(${atkName}): ${a} / 防御側能力(${defName}): ${d}`);

  // 1ヒット分の基本ダメージ
  function oneHitDamage(hitPower) {
    let dmg = baseDamage(hitPower, a, d);

    // 天候
    if (weather === "はれ") {
      if (moveType === "ほのお") dmg = chainMod(dmg, 1.5);
      if (moveType === "みず") dmg = chainMod(dmg, 0.5);
    }
    if (weather === "あめ") {
      if (moveType === "みず") dmg = chainMod(dmg, 1.5);
      if (moveType === "ほのお") dmg = chainMod(dmg, 0.5);
    }

    // 急所
    if (isCrit) dmg = chainMod(dmg, 1.5);

    // 乱数は後で

    // STAB
    let stab = 1;
    if (attacker.types.includes(moveType)) {
      stab = attackerAbility === "てきおうりょく" ? 2 : 1.5;
    }
    // STAB applied after random in official — we apply after generating rolls base

    return { base: dmg, stab };
  }

  // 壁
  const wallActive =
    (move.category === "物理" && (screens.reflect || screens.auroraVeil)) ||
    (move.category === "特殊" && (screens.lightScreen || screens.auroraVeil));

  function applyAfterRandom(dmg, stab) {
    let x = dmg;
    x = chainMod(x, stab);
    x = chainMod(x, typeMult);

    // やけど（物理）— からげんきは無視
    if (
      attackerStatus === "やけど" &&
      move.category === "物理" &&
      move.name !== "からげんき" &&
      attackerAbility !== "こんじょう"
    ) {
      x = chainMod(x, 0.5);
    }

    // 壁（急所で無効）
    if (wallActive && !isCrit) {
      x = pokeRound((x * 2) / 3);
    }

    // 半減きのみ
    const berry = RESIST_BERRIES[defenderItem];
    if (berry && berry === moveType && typeMult > 1) {
      x = chainMod(x, 0.5);
    }
    if (defenderItem === "ホズのみ" && moveType === "ノーマル") {
      x = chainMod(x, 0.5);
    }

    // 特性防御側
    if (defenderAbility === "あついしぼう" && (moveType === "ほのお" || moveType === "こおり")) {
      x = chainMod(x, 0.5);
    }
    if (defenderAbility === "マルチスケイル" || defenderAbility === "マルチスケイル") {
      // skip unless HP full — assume full
      // x = chainMod(x, 0.5);
    }

    return Math.max(1, x);
  }

  // 連続ヒット集計
  const hitPowers = [];
  if (hits.powers) {
    hitPowers.push(...hits.powers);
  } else {
    for (let i = 0; i < hits.max; i++) hitPowers.push(power);
  }

  // 最低ヒット・最高ヒットでの合計
  function totalForHits(hitCount, rollIndex) {
    // rollIndex 0..15 => 0.85+
    let sum = 0;
    for (let i = 0; i < hitCount; i++) {
      const hpwr = hits.powers ? hits.powers[i] : power;
      const { base, stab } = oneHitDamage(hpwr);
      const rolled = pokeRound((base * (85 + rollIndex)) / 100);
      sum += applyAfterRandom(rolled, stab);
    }
    return sum;
  }

  // 通常表示: 最大ヒット数想定の min-max（各ヒット同一乱数帯の合算）
  // より正確: 全ヒットが最低乱数 / 最高乱数
  const useHits = hits.max;
  const minDmg = totalForHits(useHits, 0);
  const maxDmg = totalForHits(useHits, 15);
  const rolls = [];
  for (let i = 0; i <= 15; i++) rolls.push(totalForHits(useHits, i));

  // STAB表示用
  let stab = attacker.types.includes(moveType) ? (attackerAbility === "てきおうりょく" ? 2 : 1.5) : 1;
  details.push(`STAB: ×${stab}`);
  details.push(`天候: ${weather} / フィールド: ${field}`);
  if (wallActive) details.push("壁: あり（×2/3）");
  details.push(`乱数: 0.85〜1.00`);
  details.push(`最低ダメージ: ${minDmg} / 最高ダメージ: ${maxDmg}`);
  if (hits.max > 1) details.push(`連続攻撃: ${hits.min}〜${hits.max}回（表示は${useHits}回命中想定）`);

  const hp = defStats.hp;
  const percentMin = Math.floor((minDmg / hp) * 1000) / 10;
  const percentMax = Math.floor((maxDmg / hp) * 1000) / 10;
  const ko = koText(minDmg, maxDmg, hp);

  // 追加ダメージ情報
  const chip = chipDamage(defender, defStats.hp, weather, field, screens, input);

  return {
    min: minDmg,
    max: maxDmg,
    rolls,
    percentMin,
    percentMax,
    koText: ko,
    effectiveness: effectivenessLabel(typeMult),
    typeMult,
    details,
    defenderHp: hp,
    moveType,
    stab,
    power,
    hits,
    chip,
    attackerStats: atkStats,
    defenderStats: defStats,
  };
}

function finalizeFixed(dmg, hp, moveType, defTypes, details, move, note) {
  details.push(note);
  const typeMult = typeEffectiveness(moveType, defTypes);
  // fixed damage usually ignores type — keep as is
  const percent = Math.floor((dmg / hp) * 1000) / 10;
  return {
    min: dmg,
    max: dmg,
    rolls: [dmg],
    percentMin: percent,
    percentMax: percent,
    koText: koText(dmg, dmg, hp),
    effectiveness: "固定ダメージ",
    typeMult: 1,
    details,
    defenderHp: hp,
    moveType,
    fixed: true,
  };
}

export function koText(minDmg, maxDmg, hp) {
  // 確定n発 / 乱数n発
  function hitsToKO(dmg) {
    if (dmg <= 0) return Infinity;
    return Math.ceil(hp / dmg);
  }
  const minHits = hitsToKO(minDmg);
  const maxHits = hitsToKO(maxDmg);

  if (!isFinite(minHits)) return "ダメージなし";

  // 最低でも n 発で倒せる → 確定n発
  // 最高でも倒せず最低より多く必要 → 
  // 例: minHits=2, maxHits=1 → 乱数1発（最高なら1、最低なら2）
  if (minHits === maxHits) {
    return `確定${minHits}発`;
  }
  // 最高ダメージでの必要発数（少ない方）が「乱数X発」
  return `乱数${maxHits}発`;
}

function chipDamage(defender, maxHp, weather, field, screens, input) {
  const out = [];
  const types = defender.types;
  // ステルスロック
  if (input.stealthRock) {
    const eff = typeEffectiveness("いわ", types);
    const dmg = Math.floor(maxHp * (1 / 8) * eff);
    out.push({ name: "ステルスロック", damage: dmg, note: `岩相性×${eff}` });
  }
  if (input.spikes > 0) {
    const grounded = isGrounded(defender, field);
    if (grounded) {
      const frac = input.spikes === 1 ? 8 : input.spikes === 2 ? 6 : 4;
      out.push({ name: `まきびし(${input.spikes})`, damage: Math.floor(maxHp / frac) });
    }
  }
  if (input.poison === "どく") {
    out.push({ name: "どく", damage: Math.floor(maxHp / 8), note: "ターンごと" });
  }
  if (input.poison === "もうどく") {
    out.push({ name: "もうどく", damage: Math.floor(maxHp / 16), note: "1ターン目（以降増加）" });
  }
  if (input.burn) {
    out.push({ name: "やけど", damage: Math.floor(maxHp / 16), note: "ターンごと" });
  }
  if (input.leechSeed) {
    out.push({ name: "やどりぎのタネ", damage: Math.floor(maxHp / 8), note: "ターンごと吸収" });
  }
  if (weather === "すなあらし" && !types.some((t) => ["いわ", "じめん", "はがね"].includes(t))) {
    out.push({ name: "すなあらし", damage: Math.floor(maxHp / 16), note: "ターンごと" });
  }
  if (field === "グラスフィールド" && isGrounded(defender, field)) {
    out.push({ name: "グラスフィールド", damage: -Math.floor(maxHp / 16), note: "ターンごと回復" });
  }
  if (defender.item === "たべのこし") {
    out.push({ name: "たべのこし", damage: -Math.floor(maxHp / 16), note: "ターンごと回復" });
  }
  return out;
}
