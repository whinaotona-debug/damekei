/**
 * 相手AI構築ジェネレータ（Phase 1）
 * 図鑑からタイプ分散した6匹を選び、役割に応じた努力値・持ち物・技をセットする
 */
import { emptyEvs, EV_MAX_PER, EV_MAX_TOTAL } from "../stats.js?v=20260922b";
import { calculateDamage } from "../damage.js?v=20260922b";
import { emptyRanks } from "../stats.js?v=20260922b";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isMega(name) {
  return !!(name && name.startsWith("メガ") && name !== "メガニウム");
}

function baseFormOfMega(name) {
  if (!isMega(name)) return name;
  return name.replace(/^メガ/, "").replace(/[XYZ]$/, "");
}

function roleOf(poke) {
  const { atk, spa, def, spd, spe, hp } = poke.baseStats;
  const phys = atk >= spa;
  const bulk = hp + def + spd;
  const offense = Math.max(atk, spa) + spe;
  if (bulk >= 280 && offense < 220) return phys ? "physBulk" : "specBulk";
  if (spe >= 100) return phys ? "physFast" : "specFast";
  return phys ? "phys" : "spec";
}

function natureFor(role) {
  switch (role) {
    case "physFast":
      return "ようき";
    case "specFast":
      return "おくびょう";
    case "physBulk":
      return "わんぱく";
    case "specBulk":
      return "おだやか";
    case "phys":
      return "いじっぱり";
    default:
      return "ひかえめ";
  }
}

function itemFor(role, mega) {
  if (mega) return "メガストーン";
  const table = {
    physFast: ["こだわりスカーフ", "いのちのたま", "きあいのタスキ"],
    specFast: ["こだわりスカーフ", "いのちのたま", "きあいのタスキ"],
    phys: ["いのちのたま", "こだわりハチマキ", "たつじんのおび"],
    spec: ["いのちのたま", "こだわりメガネ", "たつじんのおび"],
    physBulk: ["たべのこし", "オボンのみ", "ゴツゴツメット"],
    specBulk: ["たべのこし", "オボンのみ", "ものしりメガネ"],
  };
  const opts = table[role] || ["たべのこし"];
  return opts[Math.floor(Math.random() * opts.length)];
}

function investEvs(role) {
  const evs = emptyEvs();
  const put = (stat, n) => {
    const room = EV_MAX_TOTAL - Object.values(evs).reduce((a, b) => a + b, 0);
    evs[stat] = Math.min(EV_MAX_PER, n, room);
  };
  switch (role) {
    case "physFast":
      put("spe", 32);
      put("atk", 32);
      put("hp", 2);
      break;
    case "specFast":
      put("spe", 32);
      put("spa", 32);
      put("hp", 2);
      break;
    case "phys":
      put("atk", 32);
      put("hp", 32);
      put("spe", 2);
      break;
    case "spec":
      put("spa", 32);
      put("hp", 32);
      put("spe", 2);
      break;
    case "physBulk":
      put("hp", 32);
      put("def", 32);
      put("spd", 2);
      break;
    case "specBulk":
      put("hp", 32);
      put("spd", 32);
      put("def", 2);
      break;
    default:
      put("hp", 32);
      put("spe", 20);
      put("atk", 14);
  }
  return evs;
}

function pickMoves(poke, learnset, movesDb, role) {
  const names = learnset || [];
  const phys = role.startsWith("phys");
  const scored = [];
  for (const name of names) {
    const mv = movesDb.find((m) => m.name === name);
    if (!mv || mv.category === "変化") continue;
    if (phys && mv.category !== "物理") continue;
    if (!phys && mv.category !== "特殊") continue;
    const stab = poke.types.includes(mv.type) ? 1.5 : 1;
    const pow = Number(mv.power) || 0;
    if (pow <= 0) continue;
    scored.push({ name, score: pow * stab + (Number(mv.priority) > 0 ? 40 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  const picked = [];
  const typesUsed = new Set();
  for (const s of scored) {
    const mv = movesDb.find((m) => m.name === s.name);
    if (picked.length >= 3 && typesUsed.has(mv.type) && picked.length < 4) continue;
    if (picked.includes(s.name)) continue;
    picked.push(s.name);
    typesUsed.add(mv.type);
    if (picked.length >= 4) break;
  }
  // fill with any damaging moves if short
  if (picked.length < 4) {
    for (const name of names) {
      const mv = movesDb.find((m) => m.name === name);
      if (!mv || mv.category === "変化" || !(Number(mv.power) > 0)) continue;
      if (!picked.includes(name)) picked.push(name);
      if (picked.length >= 4) break;
    }
  }
  // one utility / setup if available
  const utility = [
    "ステルスロック",
    "まきびし",
    "どくびし",
    "りゅうのまい",
    "つるぎのまい",
    "めいそう",
    "てっぺき",
    "わるだくみ",
    "でんじは",
    "おにび",
    "やどりぎのタネ",
    "こうそくスピン",
    "にほんばれ",
    "あまごい",
    "みがわり",
    "とんぼがえり",
    "ボルトチェンジ",
    "クイックターン",
    "すてゼリフ",
    "ほえる",
    "ドラゴンテール",
    "トリックルーム",
    "おいかぜ",
    "じこさいせい",
    "なまける",
    "みちずれ",
  ].filter((n) => names.includes(n));
  if (utility.length && picked.length >= 3 && Math.random() < 0.55) {
    picked[3] = utility[Math.floor(Math.random() * utility.length)];
  } else if (utility.length && picked.length < 4) {
    picked.push(utility[0]);
  }
  while (picked.length < 4) picked.push("");
  return picked.slice(0, 4);
}

function candidatePool(pokemon) {
  // Prefer non-mega bases; allow some megas (max later)
  return pokemon.filter((p) => {
    const bst =
      p.baseStats.hp +
      p.baseStats.atk +
      p.baseStats.def +
      p.baseStats.spa +
      p.baseStats.spd +
      p.baseStats.spe;
    return bst >= 480;
  });
}

/**
 * @returns {Array} member[] length 6 (team-store member shape)
 */
export function generateFoeTeam({ pokemon, moves, learnsets, avoidSpecies = [] }) {
  const pool = shuffle(candidatePool(pokemon));
  const avoid = new Set(avoidSpecies.filter(Boolean));
  const usedTypes = new Map(); // type -> count
  const usedBases = new Set();
  const picked = [];
  let megaCount = 0;

  const typeOk = (types) => {
    for (const t of types) {
      if ((usedTypes.get(t) || 0) >= 2) return false;
    }
    return true;
  };

  for (const poke of pool) {
    if (picked.length >= 6) break;
    if (avoid.has(poke.name)) continue;
    const base = baseFormOfMega(poke.name);
    if (usedBases.has(base)) continue;
    if (isMega(poke.name)) {
      if (megaCount >= 1) continue;
    }
    if (!typeOk(poke.types || [])) continue;

    let species = poke.name;
    let item = itemFor(roleOf(poke), isMega(poke.name));
    let ability = poke.abilities?.[0] || "";
    let learnName = poke.name;
    let megaTarget = "";

    // メガは必ず通常姿＋石で開始（試合中にメガシンカ）
    if (isMega(poke.name)) {
      const baseName = baseFormOfMega(poke.name);
      const basePoke = pokemon.find((p) => p.name === baseName);
      if (basePoke && (learnsets[baseName] || []).length >= 4) {
        species = baseName;
        item = "メガストーン";
        ability = basePoke.abilities?.[0] || ability;
        learnName = baseName;
        megaTarget = poke.name;
      } else {
        continue; // ベースが組めないメガはスキップ
      }
    }

    const learn = learnsets[learnName] || learnsets[poke.name] || [];
    if (learn.length < 4) continue;

    const buildPoke = pokemon.find((p) => p.name === species) || poke;
    const role = roleOf(buildPoke);
    const member = {
      species,
      ability,
      item,
      nature: natureFor(role),
      evs: investEvs(role),
      moves: pickMoves(buildPoke, learn, moves, role),
      megaTarget,
    };
    if (!member.moves.some(Boolean)) continue;

    picked.push(member);
    usedBases.add(base);
    if (isMega(poke.name) || megaTarget) megaCount += 1;
    for (const t of poke.types || []) {
      usedTypes.set(t, (usedTypes.get(t) || 0) + 1);
    }
  }

  // fallback fill if pool too strict
  while (picked.length < 6) {
    const poke = pool.find((p) => !usedBases.has(baseFormOfMega(p.name)) && !avoid.has(p.name));
    if (!poke) break;
    const role = roleOf(poke);
    const learn = learnsets[poke.name] || [];
    picked.push({
      species: poke.name,
      ability: poke.abilities?.[0] || "",
      item: itemFor(role, isMega(poke.name)),
      nature: natureFor(role),
      evs: investEvs(role),
      moves: pickMoves(poke, learn, moves, role),
    });
    usedBases.add(baseFormOfMega(poke.name));
  }

  return picked.slice(0, 6);
}

/** 相手6匹から、自分選出に対して強い3匹を選ぶ */
export function selectFoeThree(mySelect, foeMembers, pokeByName, movesDb) {
  const scored = foeMembers.map((fm) => {
    let score = 0;
    const atk = pokeByName(fm.species);
    if (!atk) return { member: fm, score: 0 };
    for (const mm of mySelect) {
      const def = pokeByName(mm.species);
      if (!def) continue;
      for (const mn of fm.moves || []) {
        if (!mn) continue;
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
    return { member: fm, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.member);
}
