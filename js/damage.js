import { typeEffectiveness, effectivenessLabel } from "./types.js?v=20260919e";
import { applyRank, calcAllStats, calcAllStatsFromMults } from "./stats.js?v=20260922h";
import {
  isProteanLike,
  effectiveWeatherForAttacker,
  modifyAttackPower,
  stabMultiplier,
  modifyDefensiveDamage,
  seDamageMod,
  criticalBlocked,
  ignoresAbility,
} from "./abilities.js?v=20260922j";

const LEVEL = 50;

/** 基礎ダメージ・乱数・タイプ相性・急所は切り捨て */
function trunc(n) {
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}

/** 倍率チェーンは五捨五超入（.5ちょうどは切り捨て、.5超は切り上げ） */
function pokeRound(num) {
  return num % 1 > 0.5 ? Math.ceil(num) : Math.floor(num);
}

function chainMods(mods) {
  let m = 4096;
  for (const mod of mods) {
    if (mod !== 4096) m = (m * mod + 2048) >> 12;
  }
  return m;
}

function applyChain(value, mods) {
  if (!mods?.length) return value;
  return pokeRound((value * chainMods(mods)) / 4096);
}

/** チャンピオンズ実機: 最低乱数85%が出ない。86〜100の15段階 */
const ROLL_COUNT = 15;
function rollFactor(index) {
  return 86 + index;
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
  const w = effectiveWeatherForAttacker(weather, attacker.ability);
  if (move.name === "ウェザーボール") {
    if (w === "はれ") type = "ほのお";
    else if (w === "あめ") type = "みず";
    else if (w === "ゆき") type = "こおり";
    else if (w === "すなあらし") type = "いわ";
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
  // ウェザーボール（メガソーラーなら常に晴れ扱い → 威力2倍）
  {
    const w = effectiveWeatherForAttacker(weather, attacker.ability);
    if (move.name === "ウェザーボール" && w && w !== "なし") {
      power = (power || 50) * 2;
    }
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

  // ソーラービーム等: メガソーラーなら半減しない。晴れ以外の実天候では半減
  if (["ソーラービーム", "ソーラーブレード"].includes(move.name)) {
    const w = effectiveWeatherForAttacker(weather, attacker.ability);
    if (w !== "はれ") {
      power = pokeRound((power || 120) * 0.5);
    }
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
  // こだわりハチマキ（物理の攻撃ステで計算する技のみ）
  if (
    attacker.item === "こだわりハチマキ" &&
    cat === "物理" &&
    move.name !== "ボディプレス" &&
    move.name !== "イカサマ"
  ) {
    a = pokeRound(a * 1.5);
  }
  // こだわりメガネ
  if (attacker.item === "こだわりメガネ" && cat === "特殊") {
    a = pokeRound(a * 1.5);
  }

  return { a, d, atkName, defName, atkStat, defStat, atkRank, defRank };
}

function baseDamage(power, a, d) {
  // floor(floor(floor(2*Lv/5+2) * 威力 * A) / D) / 50) + 2
  const levelTerm = trunc((2 * LEVEL) / 5 + 2);
  const step1 = trunc(trunc(levelTerm * power * a) / d);
  const step2 = trunc(step1 / 50);
  return step2 + 2;
}

function applyType(damage, typeMult) {
  let x = damage;
  if (typeMult >= 1) {
    let t = typeMult;
    while (t >= 2 - 1e-9) {
      x *= 2;
      t /= 2;
    }
    return trunc(x);
  }
  let t = typeMult;
  while (t <= 0.5 + 1e-9) {
    x = trunc(x / 2);
    t *= 2;
  }
  return x;
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
    disguiseBroken = false,
    hpNotFull = false,
    movingLast = false,
    attackerHpRatio = 1,
    attackerNatureMults = null,
    defenderNatureMults = null,
    defenderCurrentHp = null,
  } = input;

  const details = [];
  if (!attackerPoke || !defenderPoke || !move) {
    return { error: "ポケモンと技を選択してください", details };
  }
  if (move.category === "変化") {
    return { error: "変化技のためダメージはありません", details, move };
  }

  const atkStats = attackerNatureMults
    ? calcAllStatsFromMults(attackerPoke.baseStats, attackerEvs, attackerNatureMults)
    : calcAllStats(attackerPoke.baseStats, attackerEvs, attackerNature);
  const defStats = defenderNatureMults
    ? calcAllStatsFromMults(defenderPoke.baseStats, defenderEvs, defenderNatureMults)
    : calcAllStats(defenderPoke.baseStats, defenderEvs, defenderNature);

  const hpMax = defStats.hp;
  const hp =
    defenderCurrentHp != null
      ? Math.max(1, Math.min(hpMax, Math.floor(Number(defenderCurrentHp) || hpMax)))
      : hpMax;
  const effectiveHpNotFull = hpNotFull || hp < hpMax;

  const attacker = {
    name: attackerPoke.name,
    types: [...attackerPoke.types],
    stats: atkStats,
    ranks: { ...attackerRanks },
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
    ranks: { ...defenderRanks },
    item: defenderItem,
    ability: defenderAbility,
    status: defenderStatus,
    weather,
  };

  let moveType = resolveMoveType(move, weather, field, attacker);
  const hits = getHitCount(move);

  // スキン系
  {
    const skinMod = modifyAttackPower({
      power: move.power || 0,
      attackStat: 1,
      move,
      moveType,
      attackerAbility,
      weather: effectiveWeatherForAttacker(weather, attackerAbility),
      hpRatio: attackerHpRatio,
    });
    if (skinMod.typeOverride) {
      moveType = skinMod.typeOverride;
      details.push(`特性でタイプ変化: ${moveType}`);
    }
  }

  // へんげんじざい / リベロ
  const proteanLike = isProteanLike(attackerAbility);
  if (proteanLike && moveType) {
    attacker.types = [moveType];
    details.push(`特性 ${attackerAbility}: タイプが「${moveType}」に変化`);
  }
  if (attackerAbility === "メガソーラー") {
    details.push("特性 メガソーラー: 技使用時のみ晴れ扱い");
  }

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

  // 威力側の4096補正は最後に1回だけ掛ける（いのちのたま・たつじんのおびはダメージ側）
  const bpMods = [];
  const boostType = TYPE_BOOST_ITEMS[attackerItem];
  if (boostType && boostType === moveType) {
    bpMods.push(4915);
    details.push(`持ち物補正(${attackerItem}): 威力×4915/4096`);
  } else if (attackerItem === "ちからのハチマキ" && move.category === "物理") {
    bpMods.push(4505);
    details.push("ちからのハチマキ: 威力×4505/4096");
  } else if (attackerItem === "ものしりメガネ" && move.category === "特殊") {
    bpMods.push(4505);
    details.push("ものしりメガネ: 威力×4505/4096");
  } else if (attackerItem === "ノーマルジュエル" && moveType === "ノーマル") {
    bpMods.push(5325);
    details.push("ノーマルジュエル: 威力×5325/4096");
  }
  if (metronome > 1) {
    const times = Math.max(1, Math.min(5, Math.floor(metronome) - 1));
    bpMods.push(times >= 5 ? 8192 : 4096 + times * 819);
    details.push(`メトロノーム: ${times}回目`);
  }
  if (helpBoost) {
    bpMods.push(6144);
    details.push("てだすけ: 威力×1.5");
  }
  if (isGrounded(attacker, field)) {
    if (
      (field === "エレキフィールド" && moveType === "でんき") ||
      (field === "グラスフィールド" && moveType === "くさ") ||
      (field === "サイコフィールド" && moveType === "エスパー")
    ) {
      bpMods.push(5325);
      details.push("フィールド: 威力×5325/4096");
    }
  }
  if (isGrounded(defender, field)) {
    if (
      (field === "ミストフィールド" && moveType === "ドラゴン") ||
      (field === "グラスフィールド" && ["じしん", "じならし"].includes(move.name))
    ) {
      bpMods.push(2048);
      details.push("フィールド: 威力×0.5");
    }
  }

  // 特性による威力・攻撃補正
  {
    const atkCat = move.category === "物理" ? "atk" : "spa";
    // 仮に攻撃実数値を後で再取得するため、ここでは威力のみ先に
    const mod = modifyAttackPower({
      power,
      attackStat: 100, // placeholder, applied later on A
      move,
      moveType,
      attackerAbility,
      weather: effectiveWeatherForAttacker(weather, attackerAbility),
      hpRatio: attackerHpRatio,
    });
    power = mod.power;
    if (mod.typeOverride) {
      moveType = mod.typeOverride;
      details.push(`特性スキン: タイプが${moveType}に変化`);
    }
    mod.notes.forEach((n) => details.push(n));
    if (attackerAbility === "アナライズ" && movingLast) {
      bpMods.push(5325);
      details.push("アナライズ: 威力×5325/4096（後攻）");
    }
    if (attackerAbility === "ちからずく") {
      bpMods.push(5325);
      details.push("ちからずく: 威力×5325/4096");
    }
  }
  if (bpMods.length) power = Math.max(1, applyChain(power, bpMods));

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
      defenderHp: hp,
      defenderHpMax: hpMax,
      moveType,
    };
  }

  // たつじんのおび・いのちのたまはダメージ側の finalMods
  if (attackerItem === "たつじんのおび" && typeMult > 1) {
    details.push("たつじんのおび: ダメージ×4915/4096");
  }
  if (attackerItem === "いのちのたま") {
    details.push("いのちのたま: ダメージ×5324/4096");
  }

  const forceCrit =
    textHas(move, "必ず急所") || ["こおりのいぶき", "やまあらし", "トリックフラワー"].includes(move.name);
  const critAllowed = !criticalBlocked(
    defenderAbility,
    ignoresAbility(attackerAbility),
    attackerAbility
  );
  // 「急所」チェック時は急所結果をメインに。未チェックでも通常＋急所の両方を出す
  const wantCritOnly = critical && critAllowed;

  const stamina = defenderAbility === "じきゅうりょく" && !ignoresAbility(attackerAbility);
  if (stamina) details.push("防御側 じきゅうりょく: 被弾ごとに防御+1（2発目以降に反映）");

  const hasDisguise =
    defenderAbility === "ばけのかわ" && !ignoresAbility(attackerAbility);
  if (hasDisguise) {
    details.push("防御側 ばけのかわ: 1発目で破れ・最大HPの1/8ダメージ → 2発目以降に技ダメージ");
  }

  const hasMultiscale =
    (defenderAbility === "マルチスケイル" || defenderAbility === "ファントムガード") &&
    !ignoresAbility(attackerAbility) &&
    !effectiveHpNotFull;
  if (hasMultiscale) {
    details.push(
      `防御側 ${defenderAbility}: HP満タンの1発目のみ×0.5（2発目以降は通常・食べ残しで満タンに戻っても計算上は再発動しない）`
    );
  }

  const hasSturdyAbility =
    defenderAbility === "がんじょう" && !ignoresAbility(attackerAbility) && !effectiveHpNotFull;
  const hasFocusSash = defenderItem === "きあいのタスキ" && !effectiveHpNotFull;
  const hasSturdy = hasSturdyAbility || hasFocusSash;
  if (hasSturdyAbility) {
    details.push("防御側 がんじょう: HP満タンからのひんし技をHP1で耐える（1回）");
  }
  if (hasFocusSash) {
    details.push("防御側 きあいのタスキ: HP満タンからのひんし技をHP1で耐える（1回）");
  }

  const atkWeather = effectiveWeatherForAttacker(weather, attackerAbility);
  const wallActive =
    (move.category === "物理" && (screens.reflect || screens.auroraVeil)) ||
    (move.category === "特殊" && (screens.lightScreen || screens.auroraVeil));
  const ignoreRanks =
    (!ignoresAbility(attackerAbility) && defenderAbility === "てんねん") ||
    textHas(move, "能力変化を無視") ||
    ["DDラリアット", "せいなるつるぎ"].includes(move.name);

  function emptyRankObj() {
    return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
  }

  function damageAt(defRankBonus, hitPower, rollIndex, opts = {}) {
    const {
      firstHitOfBattle = true,
      isCrit = false,
      hpFull = !effectiveHpNotFull,
      berryActive = true,
      sturdyActive = false,
    } = opts;
    const defRanksAdj = {
      ...defender.ranks,
      def: Math.min(6, (defender.ranks.def || 0) + defRankBonus),
      spd: defender.ranks.spd || 0,
    };
    const defMod = modifyDefensiveDamage({
      mult: 1,
      move,
      moveType,
      defenderAbility,
      attackerAbility,
      defenderTypes: defender.types,
      weather: atkWeather,
      hpFull,
      disguiseIntact: hasDisguise && firstHitOfBattle,
      moldBreak: ignoresAbility(attackerAbility),
    });
    if (defMod.blockHit || defMod.immune) {
      return { damage: 0, a: 0, d: 0, atkName: "-", defName: "-", stab: 1, notes: defMod.notes, blocked: true, berryUsed: false };
    }

    const { a: a0, d, atkName, defName } = getAttackDefense(
      { ...move, type: moveType },
      { ...attacker, weather: atkWeather },
      { ...defender, ranks: ignoreRanks ? emptyRankObj() : defRanksAdj, weather: atkWeather },
      isCrit
    );
    const atkMod = modifyAttackPower({
      power: hitPower,
      attackStat: a0,
      move,
      moveType,
      attackerAbility,
      weather: atkWeather,
      hpRatio: attackerHpRatio,
    });
    const a = atkMod.attackStat;
    let dAdj = d;
    if (
      defender.ability === "ファーコート" &&
      !ignoresAbility(attackerAbility) &&
      (move.category === "物理" || move.name === "ボディプレス" || move.name === "イカサマ")
    ) {
      dAdj = pokeRound(dAdj * 2);
    }
    if (
      defender.ability === "くさのけがわ" &&
      !ignoresAbility(attackerAbility) &&
      field === "グラスフィールド" &&
      (move.category === "物理" || move.name === "ボディプレス" || move.name === "イカサマ")
    ) {
      dAdj = pokeRound((dAdj * 3) / 2);
    }
    let dmg = baseDamage(hitPower, a, dAdj);
    if (atkWeather === "はれ") {
      if (moveType === "ほのお") dmg = pokeRound((dmg * 6144) / 4096);
      if (moveType === "みず") dmg = pokeRound((dmg * 2048) / 4096);
    } else if (atkWeather === "あめ") {
      if (moveType === "みず") dmg = pokeRound((dmg * 6144) / 4096);
      if (moveType === "ほのお") dmg = pokeRound((dmg * 2048) / 4096);
    }
    if (isCrit) dmg = trunc(dmg * 1.5);
    const stab = stabMultiplier(attacker.types, moveType, attackerAbility);
    let x = trunc((dmg * rollFactor(rollIndex)) / 100);
    if (stab !== 1) x = pokeRound((x * (stab === 2 ? 8192 : 6144)) / 4096);
    x = applyType(x, typeMult);
    if (attackerStatus === "やけど" && move.category === "物理" && move.name !== "からげんき" && attackerAbility !== "こんじょう") {
      x = trunc(x / 2);
    }
    const finalMods = [];
    if (seDamageMod(typeMult, defenderAbility, ignoresAbility(attackerAbility), attackerAbility) !== 1) {
      finalMods.push(3072);
    }
    if (defMod.mult !== 1) {
      finalMods.push(Math.round(defMod.mult * 4096));
    }
    if (wallActive && !isCrit && defenderAbility !== "すりぬけ") {
      finalMods.push(2048);
    }
    if (isCrit && attackerAbility === "スナイパー") finalMods.push(6144);
    if (attackerItem === "たつじんのおび" && typeMult > 1) finalMods.push(4915);
    if (attackerItem === "いのちのたま") finalMods.push(5324);
    let berryUsed = false;
    if (berryActive) {
      const berry = RESIST_BERRIES[defenderItem];
      if ((berry && berry === moveType && typeMult > 1) || (defenderItem === "ホズのみ" && moveType === "ノーマル")) {
        finalMods.push(2048);
        berryUsed = true;
      }
    }
    x = applyChain(x, finalMods);
    let damage = Math.max(1, x);
    const notes = [...defMod.notes, ...atkMod.notes];
    if (dAdj !== d && defender.ability === "くさのけがわ") notes.push("くさのけがわ: 防御×1.5");
    if (sturdyActive && damage >= defStats.hp) {
      damage = defStats.hp - 1;
      notes.push(hasFocusSash && !hasSturdyAbility ? "きあいのタスキ: HP1で耐えた" : "がんじょう: HP1で耐えた");
    }
    return { damage, a, d: dAdj, atkName, defName, stab, notes, blocked: false, berryUsed };
  }

  /**
   * @param {number} startingStaminaStacks
   * @param {{
   *   isCrit?: boolean,
   *   disguiseBroken?: boolean,
   *   multiscaleBroken?: boolean,
   *   berryGone?: boolean,
   *   sturdyGone?: boolean,
   * }} opts
   */
  function rollsForMoveUse(startingStaminaStacks, opts = {}) {
    const {
      isCrit = false,
      disguiseBroken: startDisguiseBroken = false,
      multiscaleBroken: startMsBroken = false,
      berryGone: startBerryGone = false,
      sturdyGone: startSturdyGone = false,
    } = opts;
    const out = [];
    const disguiseChip = Math.floor(defStats.hp / 8);
    for (let rollIndex = 0; rollIndex < ROLL_COUNT; rollIndex++) {
      let sum = 0;
      let stacks = startingStaminaStacks;
      let disguiseBroken = startDisguiseBroken || !hasDisguise;
      let multiscaleBroken = startMsBroken || !hasMultiscale;
      let berryGone = startBerryGone;
      let sturdyGone = startSturdyGone || !hasSturdy;
      for (let i = 0; i < hits.max; i++) {
        const hpwr = hits.powers ? hits.powers[i] : power;
        const r = damageAt(stamina ? stacks : 0, hpwr, rollIndex, {
          firstHitOfBattle: hasDisguise && !disguiseBroken,
          isCrit: forceCrit || isCrit,
          hpFull: hasMultiscale && !multiscaleBroken,
          berryActive: !berryGone,
          sturdyActive: hasSturdy && !sturdyGone,
        });
        if (r.blocked && hasDisguise && !disguiseBroken) {
          disguiseBroken = true;
          multiscaleBroken = true;
          sturdyGone = true;
          sum += disguiseChip;
        } else {
          sum += r.damage;
          if (hasMultiscale && !multiscaleBroken) multiscaleBroken = true;
          if (r.berryUsed) berryGone = true;
          if (hasSturdy && !sturdyGone) sturdyGone = true;
          if (stamina && !r.blocked) stacks = Math.min(6, stacks + 1);
        }
      }
      out.push(sum);
    }
    return out;
  }

  if (hp < hpMax) {
    details.push(`防御側 HP ${hp}/${hpMax}（削れた状態）`);
  }
  const healPerTurn = endOfTurnHealAmount(defender, hpMax);
  if (healPerTurn > 0) {
    details.push(`回復込み表示: たべのこし等 −${healPerTurn}/ターン（参考ダメ計と同じ）`);
  }

  function packResult(isCrit, label) {
    // 表示: 化けの皮は破れた後の技ダメ。マルチスケイルは満タン1発目込み。
    const displayRolls = rollsForMoveUse(0, {
      isCrit,
      disguiseBroken: true,
      multiscaleBroken: !hasMultiscale,
      berryGone: false,
      sturdyGone: !hasSturdy,
    });
    const laterRolls = rollsForMoveUse(0, {
      isCrit,
      disguiseBroken: true,
      multiscaleBroken: true,
      berryGone: true,
      sturdyGone: true,
    });
    const rawMin = Math.min(...displayRolls);
    const rawMax = Math.max(...displayRolls);
    const min = Math.max(0, rawMin - healPerTurn);
    const max = Math.max(0, rawMax - healPerTurn);
    const percentMin = Math.floor((min / hp) * 1000) / 10;
    const percentMax = Math.floor((max / hp) * 1000) / 10;
    const splitLater =
      hasDisguise ||
      hasMultiscale ||
      hasSturdy ||
      !!RESIST_BERRIES[defenderItem] ||
      defenderItem === "ホズのみ";
    const ko = analyzeKoWithHeal(displayRolls, hp, healPerTurn, {
      disguise: hasDisguise,
      laterRolls: splitLater ? laterRolls : null,
    });
    return {
      label,
      rawMin,
      rawMax,
      min,
      max,
      rolls: displayRolls,
      percentMin,
      percentMax,
      koText: ko.text,
      koChance: ko.chance,
      koHits: ko.hits,
      koGuaranteed: ko.guaranteed,
      healPerTurn,
    };
  }

  const sample = damageAt(0, hits.powers ? hits.powers[0] : power, 15, {
    firstHitOfBattle: false,
    isCrit: forceCrit || wantCritOnly,
    hpFull: hasMultiscale,
    berryActive: true,
    sturdyActive: hasSturdy,
  });
  details.push(`攻撃側能力(${sample.atkName}): ${sample.a} / 防御側能力(${sample.defName}): ${sample.d}`);
  details.push(`STAB: ×${sample.stab}${proteanLike ? `（${attackerAbility}後）` : ""}`);
  (sample.notes || []).forEach((n) => {
    if (!details.includes(n)) details.push(n);
  });
  details.push(
    `天候: ${weather}${attackerAbility === "メガソーラー" ? "（攻撃側は晴れ扱い）" : ""} / フィールド: ${field}`
  );
  if (wallActive) details.push("壁: あり（シングル ×1/2）");
  if (attackerItem === "こだわりハチマキ") details.push("こだわりハチマキ: 攻撃×1.5");
  if (attackerItem === "こだわりメガネ") details.push("こだわりメガネ: 特攻×1.5");
  details.push("乱数: 0.86〜1.00（15段階）");
  if (hits.max > 1) details.push(`連続攻撃: ${hits.min}〜${hits.max}回（表示は${hits.max}回命中想定）`);

  let normalPack = null;
  let critPack = null;
  if (forceCrit) {
    normalPack = packResult(true, "急所（必中）");
    details.push(`急所（必中） 生ダメージ: ${normalPack.rawMin}〜${normalPack.rawMax}`);
  } else {
    normalPack = packResult(false, "通常");
    details.push(`通常 生ダメージ: ${normalPack.rawMin}〜${normalPack.rawMax}`);
    if (healPerTurn > 0) {
      details.push(`通常 表示（回復−${healPerTurn}）: ${normalPack.min}〜${normalPack.max}`);
    }
    if (critAllowed) {
      critPack = packResult(true, "急所");
      details.push(`急所 生ダメージ: ${critPack.rawMin}〜${critPack.rawMax}`);
      if (healPerTurn > 0) {
        details.push(`急所 表示（回復−${healPerTurn}）: ${critPack.min}〜${critPack.max}`);
      }
    }
  }

  // じきゅうりょく込みの詳細KO（注記用）
  let staminaKoNote = null;
  if (stamina && normalPack) {
    const koInfo = analyzeKoChance({
      hp,
      stamina: true,
      rollsForMoveUse: (stacks, turnIndex = 0) =>
        rollsForMoveUse(stacks, {
          isCrit: false,
          disguiseBroken: turnIndex > 0 || !hasDisguise,
          multiscaleBroken: turnIndex > 0 || !hasMultiscale,
          berryGone: turnIndex > 0,
          sturdyGone: turnIndex > 0 || !hasSturdy,
        }),
      maxTurns: 8,
    });
    staminaKoNote = `じきゅうりょく込みKO: ${koInfo.text}`;
    details.push(staminaKoNote);
  }

  const primary = wantCritOnly && critPack ? critPack : normalPack || critPack;
  details.push(`KO判定: ${primary.koText}`);

  const chip = chipDamage(defender, defStats.hp, weather, field, screens, input);
  return {
    min: primary.min,
    max: primary.max,
    rawMin: primary.rawMin,
    rawMax: primary.rawMax,
    rolls: primary.rolls,
    percentMin: primary.percentMin,
    percentMax: primary.percentMax,
    koText: primary.koText,
    koChance: primary.koChance,
    koHits: primary.koHits,
    koGuaranteed: primary.koGuaranteed,
    healPerTurn,
    normal: normalPack,
    critical: critPack,
    staminaKoNote,
    effectiveness: effectivenessLabel(typeMult),
    typeMult,
    details,
    defenderHp: hp,
    defenderHpMax: hpMax,
    moveType,
    stab: sample.stab,
    power,
    hits,
    chip,
    attackerStats: atkStats,
    defenderStats: defStats,
  };
}

/** ターン終了回復（表示用に1発ダメージから差し引く） */
function endOfTurnHealAmount(defender, maxHp) {
  let heal = 0;
  if (defender.item === "たべのこし") heal += Math.floor(maxHp / 16);
  if (
    defender.item === "くろいヘドロ" &&
    defender.types.includes("どく")
  ) {
    heal += Math.floor(maxHp / 16);
  }
  return heal;
}

/**
 * 生ダメージ乱数とターン間回復から、倒せる最速発数の確定/乱数を求める。
 * disguise: 1発目は最大HPの1/8（化けの皮破れ）、2発目以降が connectingRolls
 * laterRolls: 2発目以降の乱数（マルチスケイル剥がし後など）。未指定なら connectingRolls を継続使用
 * 食べ残し等で削り切れない場合は「倒せない」
 */
function analyzeKoWithHeal(connectingRolls, hp, healPerTurn, opts = {}) {
  const disguise = !!opts.disguise;
  const laterRolls = opts.laterRolls || null;
  const maxTurns = opts.maxTurns ?? 64;
  const chip = Math.floor(hp / 8);

  if (!canEventuallyKo(connectingRolls, hp, healPerTurn, disguise, chip, laterRolls)) {
    return { text: "倒せない", chance: null, hits: null, guaranteed: false };
  }

  for (let n = 1; n <= maxTurns; n++) {
    const { chance, guaranteed, possible } = koChanceWithHeal(
      connectingRolls,
      hp,
      healPerTurn,
      n,
      { disguise, chip, laterRolls }
    );
    if (!possible) continue;
    if (guaranteed) {
      return { text: `確定${n}発`, chance: 100, hits: n, guaranteed: true };
    }
    return {
      text: `乱数${n}発 ${formatKoChance(chance)}%`,
      chance: formatKoChance(chance),
      hits: n,
      guaranteed: false,
    };
  }
  return { text: "倒せない", chance: null, hits: null, guaranteed: false };
}

function formatKoChance(chance01) {
  const pct = chance01 * 100;
  if (pct < 1) return Math.round(pct * 100) / 100;
  return Math.round(pct * 10) / 10;
}

/** 最大乱数でも回復に負ける／削れない場合 false */
function canEventuallyKo(connectingRolls, hp, healPerTurn, disguise, chip, laterRolls = null) {
  const later = laterRolls || connectingRolls;
  const laterMax = Math.max(...later);
  let h = hp;
  for (let t = 0; t < 200; t++) {
    const dmg = disguise && t === 0 ? chip : t === 0 ? Math.max(...connectingRolls) : laterMax;
    h -= dmg;
    if (h <= 0) return true;
    if (healPerTurn > 0) h = Math.min(hp, h + healPerTurn);
    if (t >= 1 && laterMax <= healPerTurn) return false;
  }
  return false;
}

function damageForTurn(firstRolls, laterRolls, rollIndex, turn, disguise, chip) {
  if (disguise && turn === 0) return chip;
  if (turn === 0) return firstRolls[rollIndex];
  return (laterRolls || firstRolls)[rollIndex];
}

/** n発で倒せる割合（1発目化けの皮 / マルチスケイル剥がし対応） */
function koChanceWithHeal(connectingRolls, hp, healPerTurn, n, opts = {}) {
  const disguise = !!opts.disguise;
  const laterRolls = opts.laterRolls || null;
  const chip = opts.chip ?? Math.floor(hp / 8);
  const len = connectingRolls.length;
  const laterLen = (laterRolls || connectingRolls).length;

  if (n <= 5) {
    let ko = 0;
    let total = 0;
    function rec(turn, hpLeft) {
      if (turn === n) {
        total += 1;
        if (hpLeft <= 0) ko += 1;
        return;
      }
      const pool = turn === 0 ? connectingRolls : laterRolls || connectingRolls;
      const poolLen = turn === 0 ? len : laterLen;
      for (let i = 0; i < poolLen; i++) {
        const dmg = damageForTurn(connectingRolls, laterRolls, i, turn, disguise, chip);
        let h = hpLeft - dmg;
        if (h <= 0) {
          const rest = poolLen ** (n - turn - 1); // approx; use len for remaining
          const restFactor = len ** (n - turn - 1);
          ko += restFactor;
          total += restFactor;
        } else {
          if (healPerTurn > 0 && turn < n - 1) {
            h = Math.min(hp, h + healPerTurn);
          }
          rec(turn + 1, h);
        }
      }
    }
    rec(0, hp);
    const chance = total === 0 ? 0 : ko / total;
    return {
      chance,
      guaranteed: ko === total && total > 0,
      possible: ko > 0,
    };
  }

  // nが大きい: 最小/最大ダメージ経路で判定
  let hMin = hp;
  let hMax = hp;
  for (let t = 0; t < n; t++) {
    const pool = t === 0 ? connectingRolls : laterRolls || connectingRolls;
    const minD = disguise && t === 0 ? chip : pool[0];
    const maxD = disguise && t === 0 ? chip : pool[pool.length - 1];
    hMin -= minD;
    hMax -= maxD;
    if (t < n - 1 && healPerTurn > 0) {
      if (hMin > 0) hMin = Math.min(hp, hMin + healPerTurn);
      if (hMax > 0) hMax = Math.min(hp, hMax + healPerTurn);
    }
  }
  if (hMax <= 0 && hMin <= 0) return { chance: 1, guaranteed: true, possible: true };
  if (hMax <= 0) return { chance: 0.5, guaranteed: false, possible: true };
  return { chance: 0, guaranteed: false, possible: false };
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

/**
 * n発で倒せる確率を計算。
 * じきゅうりょく時は 1発目 stacks=0, 2発目=1, ... と防御が上がる前提。
 */
function analyzeKoChance({ hp, stamina, rollsForMoveUse, maxTurns = 8 }) {
  // 各ターン開始時の stamina stacks での 16 乱数
  const turnRolls = [];
  for (let t = 0; t < maxTurns; t++) {
    const stacks = stamina ? Math.min(6, t) : 0;
    // 連続ヒット技は1回の技使用内でも stacks が増えるが、
    // ターンまたぎは「前ターンで受けた回数」≈1技使用分として t を使う
    // 第2引数にターン番号（ばけのかわ破れ判定用）
    turnRolls.push(rollsForMoveUse(stacks, t));
  }

  // 1発目の min/max でラベル用
  const firstMin = turnRolls[0][0];
  const firstMax = turnRolls[0][turnRolls[0].length - 1];

  for (let n = 1; n <= maxTurns; n++) {
    const { chance, guaranteed, possible } = koChanceInNTurns(turnRolls, hp, n);
    if (!possible) continue;
    if (guaranteed) {
      return {
        text: `確定${n}発`,
        chance: 100,
        hits: n,
        guaranteed: true,
        note: stamina && n > 1 ? `じきゅうりょく込み（${n}発目は防御+${n - 1}）` : null,
      };
    }
    // この n で倒せる可能性がある最初の発数
    const pct = Math.round(chance * 1000) / 10;
    return {
      text: `乱数${n}発（${pct}%）`,
      chance: pct,
      hits: n,
      guaranteed: false,
      note: stamina && n > 1 ? `じきゅうりょく込み（${n}発目は防御+${n - 1}）` : null,
    };
  }

  // fallback
  const label = koText(firstMin, firstMax, hp);
  return { text: label, chance: null, hits: null, guaranteed: false, note: null };
}

/** n ターン分の乱数組み合わせで倒せる割合（各ターンの乱数は独立） */
function koChanceInNTurns(turnRolls, hp, n) {
  if (n <= 4) {
    let ko = 0;
    let total = 0;
    function rec(turn, sum) {
      if (turn === n) {
        total += 1;
        if (sum >= hp) ko += 1;
        return;
      }
      const len = turnRolls[turn].length;
      for (let i = 0; i < len; i++) {
        rec(turn + 1, sum + turnRolls[turn][i]);
      }
    }
    rec(0, 0);
    const chance = ko / total;
    return {
      chance,
      guaranteed: ko === total,
      possible: ko > 0,
    };
  }

  let minSum = 0;
  let maxSum = 0;
  for (let t = 0; t < n; t++) {
    const rolls = turnRolls[t];
    minSum += rolls[0];
    maxSum += rolls[rolls.length - 1];
  }
  if (minSum >= hp) return { chance: 1, guaranteed: true, possible: true };
  if (maxSum < hp) return { chance: 0, guaranteed: false, possible: false };
  // 粗い近似: 一様とみなして線形
  const approx = (maxSum - hp) / (maxSum - minSum);
  return { chance: Math.max(0, Math.min(1, approx)), guaranteed: false, possible: true };
}

export function koText(minDmg, maxDmg, hp) {
  function hitsToKO(dmg) {
    if (dmg <= 0) return Infinity;
    return Math.ceil(hp / dmg);
  }
  const minHits = hitsToKO(minDmg);
  const maxHits = hitsToKO(maxDmg);

  if (!isFinite(minHits)) return "ダメージなし";
  if (minHits === maxHits) return `確定${minHits}発`;
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
