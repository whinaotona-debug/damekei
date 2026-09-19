/**
 * 1) Add missing Champions moves from ai-rotom into data/moves.json
 * 2) Rebuild learnsets with NFKC name mapping (１０まんボルト → 10まんボルト etc.)
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE =
  "https://raw.githubusercontent.com/nonz250/ai-rotom/main/data/champions";

const TYPE_JA = {
  Normal: "ノーマル",
  Fire: "ほのお",
  Water: "みず",
  Electric: "でんき",
  Grass: "くさ",
  Ice: "こおり",
  Fighting: "かくとう",
  Poison: "どく",
  Ground: "じめん",
  Flying: "ひこう",
  Psychic: "エスパー",
  Bug: "むし",
  Rock: "いわ",
  Ghost: "ゴースト",
  Dragon: "ドラゴン",
  Dark: "あく",
  Steel: "はがね",
  Fairy: "フェアリー",
};
const CAT_JA = { Physical: "物理", Special: "特殊", Status: "変化" };

function nfkc(s) {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[\s　]/g, "");
}

function stripPriorityPrefix(name) {
  const m = String(name).match(/^\(優先度[+-]?\d+\)\s*(.+)$/);
  return m ? m[1] : name;
}

async function fetchJson(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function toOurMove(rm) {
  const flags = new Set(rm.flags || []);
  const type = TYPE_JA[rm.type] || rm.type;
  const category = CAT_JA[rm.category] || rm.category;
  const power = rm.basePower || null;
  const accuracy = rm.accuracy === true ? null : rm.accuracy ?? null;
  return {
    name: rm.nameJa,
    type,
    category,
    power: power === 0 && category === "変化" ? null : power || null,
    accuracy,
    pp: rm.pp ?? 0,
    target: rm.shortDesc || rm.desc || "",
    effect: rm.desc || rm.shortDesc || "",
    priority: rm.priority || 0,
    contact: flags.has("contact"),
    sound: flags.has("sound"),
    punch: flags.has("punch"),
    slicing: flags.has("slicing"),
    bullet: flags.has("bullet"),
    pulse: flags.has("pulse"),
    powder: flags.has("powder"),
    wind: flags.has("wind"),
    explosion: flags.has("explosion") || flags.has("explode"),
    dance: flags.has("dance"),
    bite: flags.has("bite"),
    mental: false,
    healing: flags.has("heal"),
  };
}

async function main() {
  const rotomMoves = await fetchJson("moves.json");
  const movesPath = join(ROOT, "data", "moves.json");
  let moves = JSON.parse(readFileSync(movesPath, "utf8"));

  // Clean priority prefixes / NFKC-dedupe existing
  const byNfkc = new Map();
  const cleaned = [];
  for (const m of moves) {
    let name = stripPriorityPrefix(m.name);
    name = name; // keep halfwidth as canonical when already so
    const key = nfkc(name);
    const next = { ...m, name };
    if (byNfkc.has(key)) {
      const prev = byNfkc.get(key);
      // prefer name without fullwidth if both exist — keep first cleaned
      if (!prev.effect?.includes("優先度") && next.priority) {
        prev.priority = next.priority || prev.priority;
      }
      continue;
    }
    byNfkc.set(key, next);
    cleaned.push(next);
  }
  moves = cleaned;

  // Add missing from rotom (skip placeholders)
  const skip = new Set(["(技なし)", ""]);
  let added = 0;
  for (const rm of rotomMoves) {
    const ja = rm.nameJa;
    if (!ja || skip.has(ja)) continue;
    const key = nfkc(ja);
    if (byNfkc.has(key)) continue;
    const entry = toOurMove(rm);
    byNfkc.set(key, entry);
    moves.push(entry);
    added++;
  }

  moves.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  writeFileSync(movesPath, JSON.stringify(moves, null, 2) + "\n", "utf8");
  console.log("moves:", moves.length, "added", added);

  // Build NFKC -> our canonical name
  const nfkcToOurs = new Map();
  for (const m of moves) nfkcToOurs.set(nfkc(m.name), m.name);

  // Rebuild learnsets (inline, same as build_learnsets but with NFKC map)
  const [rotomPokes, learnsetsEn] = await Promise.all([
    fetchJson("pokemon.json"),
    fetchJson("learnsets.json"),
  ]);
  const ours = JSON.parse(readFileSync(join(ROOT, "data", "pokemon.json"), "utf8"));
  const moveIdToJa = new Map(rotomMoves.map((m) => [m.id, m.nameJa]));

  const byJa = new Map();
  const byNormJa = new Map();
  function pokeNorm(s) {
    return nfkc(s)
      .replace(/[()（）]/g, "")
      .replace(/フォルム/g, "")
      .replace(/のすがた/g, "")
      .toLowerCase();
  }
  for (const p of rotomPokes) {
    byJa.set(p.nameJa, p);
    byNormJa.set(pokeNorm(p.nameJa), p);
  }

  function stripMega(name) {
    return name.replace(/^メガ/, "").replace(/X$/, "").replace(/Y$/, "").replace(/Z$/, "");
  }

  function learnsetIdFor(rotomPoke) {
    if (!rotomPoke) return null;
    if (learnsetsEn[rotomPoke.id]) return rotomPoke.id;
    if (rotomPoke.baseSpecies) {
      const baseEntry =
        rotomPokes.find((x) => x.name === rotomPoke.baseSpecies) ||
        rotomPokes.find((x) => x.id === String(rotomPoke.baseSpecies).toLowerCase());
      if (baseEntry && learnsetsEn[baseEntry.id]) return baseEntry.id;
      const guess = String(rotomPoke.baseSpecies)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (learnsetsEn[guess]) return guess;
    }
    const stripped = rotomPoke.id
      .replace(/mega$/, "")
      .replace(/megax$/, "")
      .replace(/megay$/, "");
    if (learnsetsEn[stripped]) return stripped;
    return null;
  }

  function resolveRotom(ourName) {
    const ALIAS = {
      "カエンジシ(オスのすがた)": "カエンジシ",
      "カエンジシ(メスのすがた)": "カエンジシ",
      イッカネズミ: "イッカネズミ(4ひきかぞく)",
    };
    const lookup = ALIAS[ourName] || ourName;
    if (byJa.has(lookup)) return byJa.get(lookup);
    const n = pokeNorm(lookup);
    if (byNormJa.has(n)) return byNormJa.get(n);
    if (ourName.startsWith("メガ")) {
      const baseJa = stripMega(ourName);
      let base = byJa.get(baseJa) || byNormJa.get(pokeNorm(baseJa));
      if (!base && ourName === "メガメガニウム") base = byJa.get("メガニウム");
      if (base) {
        if (ourName.endsWith("X")) {
          const mx = rotomPokes.find(
            (p) =>
              (p.baseSpecies === base.name || p.id.startsWith(base.id)) &&
              /mega.*x|megax/i.test(p.id + p.name)
          );
          if (mx) return mx;
        }
        if (ourName.endsWith("Y")) {
          const my = rotomPokes.find(
            (p) =>
              (p.baseSpecies === base.name || p.id.startsWith(base.id)) &&
              /mega.*y|megay/i.test(p.id + p.name)
          );
          if (my) return my;
        }
        const mega = rotomPokes.find(
          (p) => p.baseSpecies === base.name && /mega/i.test(p.id + p.name)
        );
        if (mega) return mega;
        return base;
      }
    }
    return null;
  }

  const out = {};
  let matched = 0;
  let unresolvedMoves = new Map();
  for (const poke of ours) {
    const rotom = resolveRotom(poke.name);
    let id = learnsetIdFor(rotom);
    if (!id && rotom) {
      const guess = String(rotom.baseSpecies || rotom.name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (learnsetsEn[guess]) id = guess;
    }
    if (!id && poke.name.startsWith("メガ")) {
      const baseRotom =
        byJa.get(stripMega(poke.name)) || byNormJa.get(pokeNorm(stripMega(poke.name)));
      if (baseRotom && learnsetsEn[baseRotom.id]) id = baseRotom.id;
    }
    if (!id || !learnsetsEn[id]) {
      out[poke.name] = [];
      continue;
    }
    const jaMoves = [];
    for (const enId of learnsetsEn[id]) {
      const ja = moveIdToJa.get(enId);
      if (!ja || ja === "(技なし)") continue;
      const canon = nfkcToOurs.get(nfkc(ja));
      if (canon) jaMoves.push(canon);
      else unresolvedMoves.set(ja, (unresolvedMoves.get(ja) || 0) + 1);
    }
    out[poke.name] = [...new Set(jaMoves)].sort((a, b) => a.localeCompare(b, "ja"));
    if (out[poke.name].length) matched++;
  }

  writeFileSync(join(ROOT, "data", "learnsets.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("learnsets matched", matched, "/", ours.length);
  console.log(
    "unresolved",
    [...unresolvedMoves.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  );
  console.log("サザンドラ あくのはどう", out["サザンドラ"]?.includes("あくのはどう"), out["サザンドラ"]?.length);
  console.log("ピカチュウ 10まんボルト", out["ピカチュウ"]?.includes("10まんボルト"));
  console.log("カイリキー DDラリアット", out["カイリキー"]?.includes("DDラリアット"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
