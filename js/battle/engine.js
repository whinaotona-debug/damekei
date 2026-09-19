import { calculateDamage } from "../damage.js?v=20260919e";
import { emptyRanks } from "../stats.js?v=20260919e";
import { activeOf, livingIndices, effectiveSpe, hpRatio } from "./state.js?v=20260919e";

function pushLog(battle, msg) {
  battle.log.push(msg);
  if (battle.log.length > 80) battle.log.shift();
}

function moveObj(moveName, movesDb) {
  return movesDb.find((m) => m.name === moveName) || null;
}

function rollDamage(result) {
  const rolls = result.rolls || result.normal?.rolls;
  if (!rolls?.length) return result.max || 0;
  return rolls[Math.floor(Math.random() * rolls.length)];
}

function canAct(b) {
  if (b.fainted || b.hp <= 0) return false;
  if (b.status === "ねむり" || b.status === "こおり") return false;
  if (b.status === "まひ" && Math.random() < 0.25) return false;
  return true;
}

function applyEndTurn(battle, b) {
  if (b.fainted || b.hp <= 0) return;
  if (b.status === "やけど" || b.status === "どく") {
    const d = Math.max(1, Math.floor(b.maxHp / 8));
    b.hp = Math.max(0, b.hp - d);
    pushLog(battle, `${b.species} は ${b.status} で ${d} ダメージ`);
  } else if (b.status === "もうどく") {
    b._toxic = (b._toxic || 0) + 1;
    const d = Math.max(1, Math.floor((b.maxHp * b._toxic) / 16));
    b.hp = Math.max(0, b.hp - d);
    pushLog(battle, `${b.species} は もうどく で ${d} ダメージ`);
  }
  if (b.item === "たべのこし" && b.hp > 0 && b.hp < b.maxHp) {
    const h = Math.max(1, Math.floor(b.maxHp / 16));
    b.hp = Math.min(b.maxHp, b.hp + h);
  }
  if (b.hp <= 0) {
    b.fainted = true;
    b.hp = 0;
    pushLog(battle, `${b.species} はたおれた！`);
  }
}

function tryFaintSwitch(battle, sideKey) {
  const side = battle[sideKey];
  const cur = activeOf(side);
  if (cur && !cur.fainted && cur.hp > 0) return true;
  const alive = livingIndices(side);
  if (!alive.length) {
    battle.winner = sideKey === "player" ? "foe" : "player";
    pushLog(battle, battle.winner === "player" ? "勝ち！" : "負け…");
    return false;
  }
  // auto first living for foe; player must choose (return false to wait)
  if (sideKey === "foe") {
    side.active = alive[0];
    pushLog(battle, `相手は ${activeOf(side).species} を出した`);
    return true;
  }
  battle.pendingSwitch = "player";
  pushLog(battle, "ひんし — 交代するポケモンを選んでください");
  return false;
}

function executeMove(battle, atkSideKey, defSideKey, moveName, movesDb) {
  const atk = activeOf(battle[atkSideKey]);
  const def = activeOf(battle[defSideKey]);
  if (!atk || !def) return;
  if (!canAct(atk)) {
    pushLog(battle, `${atk.species} は動けない！`);
    return;
  }
  const move = moveObj(moveName, movesDb);
  if (!move) {
    pushLog(battle, `${atk.species} の技が無効`);
    return;
  }
  pushLog(battle, `${atk.species} の ${move.name}！`);

  if (move.category === "変化") {
    // minimal: few common statuses / boosts by name heuristics
    applyStatusMove(battle, atk, def, move);
    return;
  }

  const result = calculateDamage({
    attackerPoke: atk.poke,
    defenderPoke: def.poke,
    move,
    attackerEvs: atk.evs,
    defenderEvs: def.evs,
    attackerNature: atk.nature,
    defenderNature: def.nature,
    attackerAbility: atk.ability,
    defenderAbility: def.ability,
    attackerItem: atk.item,
    defenderItem: def.item,
    attackerRanks: atk.ranks,
    defenderRanks: def.ranks,
    attackerStatus: atk.status,
    defenderStatus: def.status,
    weather: battle.weather,
    field: battle.field,
    screens: battle.screens,
    hpNotFull: def.hp < def.maxHp,
  });
  if (result.error) {
    pushLog(battle, result.error);
    return;
  }
  if (result.typeMult === 0) {
    pushLog(battle, "効果がないようだ…");
    return;
  }
  const dmg = Math.min(def.hp, Math.max(1, rollDamage(result)));
  def.hp -= dmg;
  pushLog(
    battle,
    `${def.species} に ${dmg} ダメージ（${result.percentMin}〜${result.percentMax}%帯 / ${result.effectiveness}）`
  );
  if (def.hp <= 0) {
    def.hp = 0;
    def.fainted = true;
    pushLog(battle, `${def.species} はたおれた！`);
  }

  // crude secondary: burn/para from move effect text
  const eff = `${move.effect || ""} ${move.target || ""}`;
  if (def.hp > 0 && def.status === "なし") {
    if (/やけど/.test(eff) && Math.random() < 0.1) {
      def.status = "やけど";
      pushLog(battle, `${def.species} は やけど になった`);
    } else if (/まひ/.test(eff) && Math.random() < 0.1) {
      def.status = "まひ";
      pushLog(battle, `${def.species} は まひ になった`);
    }
  }
}

function applyStatusMove(battle, atk, def, move) {
  const n = move.name;
  if (n === "かえんほうしゃ" /* never */) return;
  if (["かげぶんしん", "かたくなる", "てっぺき", "りゅうのまい", "つるぎのまい", "めいそう", "ロックブレイン"].includes(n) || /まい$|ダンス|チャージ/.test(n)) {
    // generic boost by known names
  }
  if (n === "りゅうのまい") {
    atk.ranks.atk = Math.min(6, (atk.ranks.atk || 0) + 1);
    atk.ranks.spe = Math.min(6, (atk.ranks.spe || 0) + 1);
    pushLog(battle, `${atk.species} の攻撃・素早さが上がった`);
    return;
  }
  if (n === "つるぎのまい") {
    atk.ranks.atk = Math.min(6, (atk.ranks.atk || 0) + 2);
    pushLog(battle, `${atk.species} の攻撃がぐーんと上がった`);
    return;
  }
  if (n === "めいそう") {
    atk.ranks.spa = Math.min(6, (atk.ranks.spa || 0) + 1);
    atk.ranks.spd = Math.min(6, (atk.ranks.spd || 0) + 1);
    pushLog(battle, `${atk.species} の特攻・特防が上がった`);
    return;
  }
  if (n === "まもる" || n === "みきり") {
    atk._protect = true;
    pushLog(battle, `${atk.species} は まもる を使った`);
    return;
  }
  if (n === "ステルスロック") {
    battle._sr = battle._sr || {};
    const opp = atk.side === "player" ? "foe" : "player";
    battle._sr[opp] = true;
    pushLog(battle, "相手の場に ステルスロック が撒かれた");
    return;
  }
  if (n === "でんじは" && def.status === "なし") {
    def.status = "まひ";
    pushLog(battle, `${def.species} は まひ になった`);
    return;
  }
  if (n === "おにび" && def.status === "なし") {
    def.status = "やけど";
    pushLog(battle, `${def.species} は やけど になった`);
    return;
  }
  if (n === "どくどく" && def.status === "なし") {
    def.status = "もうどく";
    def._toxic = 0;
    pushLog(battle, `${def.species} は もうどく になった`);
    return;
  }
  if (n === "ねむる") {
    atk.hp = atk.maxHp;
    atk.status = "ねむり";
    atk._sleep = 2;
    pushLog(battle, `${atk.species} は眠って体力を回復した`);
    return;
  }
  pushLog(battle, `（${n} の詳細効果は未実装 — 行動のみ）`);
}

function movePriority(move) {
  if (!move) return 0;
  if (typeof move.priority === "number") return move.priority;
  const t = `${move.effect || ""} ${move.target || ""}`;
  const m = t.match(/優先度\s*\+?\s*(-?\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * actions: { player: { type:'move'|'switch', move?, index? }, foe: same }
 */
export function resolveTurn(battle, actions, movesDb) {
  if (battle.winner) return battle;
  battle.pendingSwitch = null;
  battle.turn += 1;

  const order = [];
  for (const side of ["player", "foe"]) {
    const act = actions[side];
    if (!act) continue;
    if (act.type === "switch") {
      order.push({ side, act, pri: 6, spe: 0 });
    } else {
      const move = moveObj(act.move, movesDb);
      const b = activeOf(battle[side]);
      order.push({
        side,
        act,
        pri: movePriority(move),
        spe: effectiveSpe(b),
      });
    }
  }
  order.sort((a, b) => b.pri - a.pri || b.spe - a.spe || Math.random() - 0.5);

  for (const step of order) {
    if (battle.winner) break;
    const { side, act } = step;
    if (act.type === "switch") {
      const sideState = battle[side];
      const target = sideState.party[act.index];
      if (!target || target.fainted) continue;
      sideState.active = act.index;
      const b = activeOf(sideState);
      pushLog(battle, `${side === "player" ? "自分" : "相手"}は ${b.species} を出した`);
      if (battle._sr?.[side]) {
        // simplified SR: type-based chip omitted → flat 1/8
        const d = Math.max(1, Math.floor(b.maxHp / 8));
        b.hp = Math.max(0, b.hp - d);
        pushLog(battle, `ステロで ${d} ダメージ`);
        if (b.hp <= 0) {
          b.fainted = true;
          pushLog(battle, `${b.species} はたおれた！`);
          if (!tryFaintSwitch(battle, side)) return battle;
        }
      }
      continue;
    }
    // protect check
    const defSide = side === "player" ? "foe" : "player";
    const def = activeOf(battle[defSide]);
    if (def?._protect) {
      pushLog(battle, `${def.species} は まもる で防いだ`);
      continue;
    }
    executeMove(battle, side, defSide, act.move, movesDb);
    const def2 = activeOf(battle[defSide]);
    if (def2?.fainted) {
      if (!tryFaintSwitch(battle, defSide)) return battle;
    }
  }

  // clear protect
  for (const side of ["player", "foe"]) {
    const b = activeOf(battle[side]);
    if (b) b._protect = false;
    if (b?.status === "ねむり") {
      b._sleep = (b._sleep || 1) - 1;
      if (b._sleep <= 0) {
        b.status = "なし";
        pushLog(battle, `${b.species} は目を覚ました`);
      }
    }
  }

  applyEndTurn(battle, activeOf(battle.player));
  applyEndTurn(battle, activeOf(battle.foe));
  if (activeOf(battle.player)?.fainted && !tryFaintSwitch(battle, "player")) return battle;
  if (activeOf(battle.foe)?.fainted && !tryFaintSwitch(battle, "foe")) return battle;

  return battle;
}

export function botChooseAction(battle, movesDb) {
  if (battle.pendingSwitch === "foe") {
    const alive = livingIndices(battle.foe);
    return { type: "switch", index: alive[0] };
  }
  const atk = activeOf(battle.foe);
  const def = activeOf(battle.player);
  if (!atk || !def) return { type: "move", move: atk?.moves?.[0] };

  let best = null;
  for (const name of atk.moves) {
    const move = moveObj(name, movesDb);
    if (!move || move.category === "変化") continue;
    const result = calculateDamage({
      attackerPoke: atk.poke,
      defenderPoke: def.poke,
      move,
      attackerEvs: atk.evs,
      defenderEvs: def.evs,
      attackerNature: atk.nature,
      defenderNature: def.nature,
      attackerAbility: atk.ability,
      defenderAbility: def.ability,
      attackerItem: atk.item,
      defenderItem: def.item,
      attackerRanks: atk.ranks || emptyRanks(),
      defenderRanks: def.ranks || emptyRanks(),
      attackerStatus: atk.status,
      defenderStatus: def.status,
      weather: battle.weather,
      field: battle.field,
      screens: battle.screens,
      hpNotFull: def.hp < def.maxHp,
    });
    if (result.error) continue;
    const score = result.percentMax || 0;
    if (!best || score > best.score) best = { name, score };
  }
  // setup if no damage moves
  if (!best) {
    const setup = atk.moves.find((n) => ["りゅうのまい", "つるぎのまい", "めいそう"].includes(n));
    return { type: "move", move: setup || atk.moves[0] };
  }
  // switch if totally walled and have better switch-in
  if (best.score < 15) {
    const alive = livingIndices(battle.foe).filter((i) => i !== battle.foe.active);
    for (const i of alive) {
      // naive: just switch sometimes
      if (Math.random() < 0.35) return { type: "switch", index: i };
    }
  }
  return { type: "move", move: best.name };
}

export function botSelectThree(myMembers, foeMembers, pokeByName, movesDb) {
  // score each foe member by sum of best damage vs my team
  const scored = foeMembers.map((fm, idx) => {
    let score = 0;
    for (const mm of myMembers) {
      const atk = pokeByName(fm.species);
      const def = pokeByName(mm.species);
      if (!atk || !def) continue;
      for (const mn of fm.moves || []) {
        const move = movesDb.find((x) => x.name === mn);
        if (!move || move.category === "変化") continue;
        const r = calculateDamage({
          attackerPoke: atk,
          defenderPoke: def,
          move,
          attackerEvs: fm.evs,
          defenderEvs: mm.evs,
          attackerNature: fm.nature,
          defenderNature: mm.nature,
          attackerAbility: fm.ability,
          defenderAbility: mm.ability,
          attackerItem: fm.item,
          defenderItem: mm.item,
          attackerRanks: emptyRanks(),
          defenderRanks: emptyRanks(),
        });
        if (!r.error) score += r.percentMax || 0;
      }
    }
    return { idx, member: fm, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.member);
}

export { hpRatio, activeOf, livingIndices };
