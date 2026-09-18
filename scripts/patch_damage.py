# -*- coding: utf-8 -*-
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "js" / "damage.js"
text = path.read_text(encoding="utf-8")
start = text.index('  const isCrit = critical || textHas(move, "必ず急所")')
end = text.index("function finalizeFixed")

new = r'''  let isCrit = critical || textHas(move, "必ず急所") || ["こおりのいぶき", "やまあらし", "トリックフラワー"].includes(move.name);
  if (criticalBlocked(defenderAbility, ignoresAbility(attackerAbility), attackerAbility)) {
    isCrit = false;
  }
  if (isCrit) details.push("急所: あり");

  const stamina = defenderAbility === "じきゅうりょく" && !ignoresAbility(attackerAbility);
  if (stamina) details.push("防御側 じきゅうりょく: 被弾ごとに防御+1（2発目以降に反映）");

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
    const { firstHitOfBattle = true } = opts;
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
      hpFull: !hpNotFull,
      disguiseIntact: !disguiseBroken && firstHitOfBattle,
      moldBreak: ignoresAbility(attackerAbility),
    });
    if (defMod.blockHit || defMod.immune) {
      return { damage: 0, a: 0, d: 0, atkName: "-", defName: "-", stab: 1, notes: defMod.notes, blocked: true };
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
    let dmg = baseDamage(hitPower, a, d);
    if (atkWeather === "はれ") {
      if (moveType === "ほのお") dmg = chainMod(dmg, 1.5);
      if (moveType === "みず") dmg = chainMod(dmg, 0.5);
    } else if (atkWeather === "あめ") {
      if (moveType === "みず") dmg = chainMod(dmg, 1.5);
      if (moveType === "ほのお") dmg = chainMod(dmg, 0.5);
    }
    if (isCrit) dmg = chainMod(dmg, criticalMultiplier(attackerAbility));
    const stab = stabMultiplier(attacker.types, moveType, attackerAbility);
    let x = pokeRound((dmg * (85 + rollIndex)) / 100);
    x = chainMod(x, stab);
    x = chainMod(x, typeMult);
    const seMod = seDamageMod(typeMult, defenderAbility, ignoresAbility(attackerAbility), attackerAbility);
    if (seMod !== 1) x = chainMod(x, seMod);
    x = chainMod(x, defMod.mult);
    if (attackerStatus === "やけど" && move.category === "物理" && move.name !== "からげんき" && attackerAbility !== "こんじょう") {
      x = chainMod(x, 0.5);
    }
    if (wallActive && !isCrit && defenderAbility !== "すりぬけ") x = pokeRound((x * 2) / 3);
    const berry = RESIST_BERRIES[defenderItem];
    if (berry && berry === moveType && typeMult > 1) x = chainMod(x, 0.5);
    if (defenderItem === "ホズのみ" && moveType === "ノーマル") x = chainMod(x, 0.5);
    return { damage: Math.max(1, x), a, d, atkName, defName, stab, notes: [...defMod.notes, ...atkMod.notes], blocked: false };
  }

  function rollsForMoveUse(startingStaminaStacks, disguiseAlreadyBroken = disguiseBroken) {
    const out = [];
    for (let rollIndex = 0; rollIndex <= 15; rollIndex++) {
      let sum = 0;
      let stacks = startingStaminaStacks;
      let broken = disguiseAlreadyBroken;
      for (let i = 0; i < hits.max; i++) {
        const hpwr = hits.powers ? hits.powers[i] : power;
        const r = damageAt(stamina ? stacks : 0, hpwr, rollIndex, { firstHitOfBattle: !broken });
        if (r.blocked && defenderAbility === "ばけのかわ" && !broken) {
          broken = true;
          sum += 0;
        } else {
          sum += r.damage;
          if (stamina && !r.blocked) stacks = Math.min(6, stacks + 1);
        }
      }
      out.push(sum);
    }
    return out;
  }

  const rolls = rollsForMoveUse(0);
  const minDmg = Math.min(...rolls);
  const maxDmg = Math.max(...rolls);
  const sample = damageAt(0, hits.powers ? hits.powers[0] : power, 15, { firstHitOfBattle: !disguiseBroken });
  details.push(`攻撃側能力(${sample.atkName}): ${sample.a} / 防御側能力(${sample.defName}): ${sample.d}`);
  details.push(`STAB: ×${sample.stab}${proteanLike ? `（${attackerAbility}後）` : ""}`);
  (sample.notes || []).forEach((n) => { if (!details.includes(n)) details.push(n); });
  details.push(`天候: ${weather}${attackerAbility === "メガソーラー" ? "（攻撃側は晴れ扱い）" : ""} / フィールド: ${field}`);
  if (wallActive) details.push("壁: あり（×2/3）");
  if (attackerItem === "こだわりハチマキ") details.push("こだわりハチマキ: 攻撃×1.5");
  if (attackerItem === "こだわりメガネ") details.push("こだわりメガネ: 特攻×1.5");
  details.push("乱数: 0.85〜1.00");
  details.push(`最低ダメージ: ${minDmg} / 最高ダメージ: ${maxDmg}`);
  if (hits.max > 1) details.push(`連続攻撃: ${hits.min}〜${hits.max}回（表示は${hits.max}回命中想定）`);

  const hp = defStats.hp;
  const percentMin = Math.floor((minDmg / hp) * 1000) / 10;
  const percentMax = Math.floor((maxDmg / hp) * 1000) / 10;
  const koInfo = analyzeKoChance({
    hp,
    stamina,
    rollsForMoveUse: (stacks) => rollsForMoveUse(stacks, disguiseBroken || stacks > 0),
    maxTurns: 8,
  });
  details.push(`KO判定: ${koInfo.text}${koInfo.chance != null ? `（倒せる乱数 ${koInfo.chance}%）` : ""}`);
  if (stamina && koInfo.note) details.push(koInfo.note);
  const chip = chipDamage(defender, defStats.hp, weather, field, screens, input);
  return {
    min: minDmg,
    max: maxDmg,
    rolls,
    percentMin,
    percentMax,
    koText: koInfo.text,
    koChance: koInfo.chance,
    koHits: koInfo.hits,
    koGuaranteed: koInfo.guaranteed,
    effectiveness: sample.blocked ? "化けの皮等で無効" : effectivenessLabel(typeMult),
    typeMult: sample.blocked ? 0 : typeMult,
    details,
    defenderHp: hp,
    moveType,
    stab: sample.stab,
    power,
    hits,
    chip,
    attackerStats: atkStats,
    defenderStats: defStats,
  };
}

'''

path.write_text(text[:start] + new + text[end:], encoding="utf-8")
print("OK", start, end)
