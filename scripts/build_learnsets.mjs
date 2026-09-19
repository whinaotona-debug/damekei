/**
 * Build data/learnsets.json from ai-rotom Champions data.
 * Keys = our pokemon.json names (Japanese). Values = Japanese move names.
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "learnsets.json");

const BASE =
  "https://raw.githubusercontent.com/nonz250/ai-rotom/main/data/champions";

async function fetchJson(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function stripMega(name) {
  return name
    .replace(/^メガ/, "")
    .replace(/X$/, "")
    .replace(/Y$/, "")
    .replace(/Z$/, "");
}

/** Normalize for fuzzy match */
function norm(s) {
  return String(s)
    .normalize("NFKC")
    .replace(/[()（）\s　]/g, "")
    .replace(/フォルム/g, "")
    .replace(/のすがた/g, "")
    .replace(/だましゅ/g, "")
    .toLowerCase();
}

async function main() {
  const [rotomPokes, learnsetsEn, rotomMoves] = await Promise.all([
    fetchJson("pokemon.json"),
    fetchJson("learnsets.json"),
    fetchJson("moves.json"),
  ]);
  const ours = JSON.parse(readFileSync(join(ROOT, "data", "pokemon.json"), "utf8"));
  const ourMoves = JSON.parse(readFileSync(join(ROOT, "data", "moves.json"), "utf8"));
  const ourMoveNames = new Set(ourMoves.map((m) => m.name));

  // en id -> ja move name
  const moveIdToJa = new Map();
  for (const m of rotomMoves) {
    moveIdToJa.set(m.id, m.nameJa);
  }

  // ja name -> rotom pokemon entry
  const byJa = new Map();
  const byNormJa = new Map();
  for (const p of rotomPokes) {
    byJa.set(p.nameJa, p);
    byNormJa.set(norm(p.nameJa), p);
  }

  // Find learnset id for a rotom poke (megas/forms may share base)
  function learnsetIdFor(rotomPoke) {
    if (!rotomPoke) return null;
    if (learnsetsEn[rotomPoke.id]) return rotomPoke.id;
    if (rotomPoke.baseSpecies) {
      const base = rotomPokes.find(
        (x) => x.name === rotomPoke.baseSpecies || x.id === rotomPoke.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, "")
      );
      // baseSpecies is like "Charizard"
      const baseEntry =
        rotomPokes.find((x) => x.name === rotomPoke.baseSpecies) ||
        rotomPokes.find((x) => x.id === String(rotomPoke.baseSpecies).toLowerCase());
      if (baseEntry && learnsetsEn[baseEntry.id]) return baseEntry.id;
      // try id from baseSpecies name
      const guess = String(rotomPoke.baseSpecies)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (learnsetsEn[guess]) return guess;
    }
    // mega: strip mega from id
    const stripped = rotomPoke.id.replace(/mega$/, "").replace(/megax$/, "").replace(/megay$/, "");
    if (learnsetsEn[stripped]) return stripped;
    return null;
  }

  function resolveRotom(ourName) {
    // explicit aliases for form naming differences
    const ALIAS = {
      "カエンジシ(オスのすがた)": "カエンジシ",
      "カエンジシ(メスのすがた)": "カエンジシ",
      イッカネズミ: "イッカネズミ(4ひきかぞく)",
    };
    const lookup = ALIAS[ourName] || ourName;

    if (byJa.has(lookup)) return byJa.get(lookup);
    const n = norm(lookup);
    if (byNormJa.has(n)) return byNormJa.get(n);

    // mega: look up base then find mega forme
    if (ourName.startsWith("メガ")) {
      const baseJa = stripMega(ourName);
      // try exact base
      let base = byJa.get(baseJa) || byNormJa.get(norm(baseJa));
      // special: メガメガニウム -> メガニウム
      if (!base && ourName === "メガメガニウム") base = byJa.get("メガニウム");
      if (base) {
        // prefer matching X/Y
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
        return base; // use base learnset
      }
    }

    // partial contains
    for (const p of rotomPokes) {
      if (norm(p.nameJa) === n) return p;
      if (n.includes(norm(p.nameJa)) || norm(p.nameJa).includes(n)) {
        // careful
      }
    }
    return null;
  }

  const out = {};
  const missing = [];
  const emptyLearn = [];
  let matched = 0;

  for (const poke of ours) {
    const rotom = resolveRotom(poke.name);
    const lsId = learnsetIdFor(rotom) || (rotom && learnsetsEn[rotom.id] ? rotom.id : null);

    // fallback: try english-ish from our name via rotom list search by stripping
    let id = lsId;
    if (!id && rotom) {
      const baseName = rotom.baseSpecies || rotom.name;
      const guess = String(baseName).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (learnsetsEn[guess]) id = guess;
    }

    if (!id || !learnsetsEn[id]) {
      // last resort: mega strip Japanese and find
      if (poke.name.startsWith("メガ")) {
        const baseJa = stripMega(poke.name);
        const baseRotom = byJa.get(baseJa) || byNormJa.get(norm(baseJa));
        if (baseRotom && learnsetsEn[baseRotom.id]) id = baseRotom.id;
      }
    }

    if (!id || !learnsetsEn[id]) {
      missing.push(poke.name);
      out[poke.name] = [];
      continue;
    }

    const jaMoves = [];
    for (const enId of learnsetsEn[id]) {
      const ja = moveIdToJa.get(enId);
      if (ja && ourMoveNames.has(ja)) jaMoves.push(ja);
    }
    // unique sorted
    out[poke.name] = [...new Set(jaMoves)].sort((a, b) => a.localeCompare(b, "ja"));
    if (out[poke.name].length === 0) emptyLearn.push(poke.name);
    else matched++;
  }

  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(
    JSON.stringify(
      {
        pokemon: ours.length,
        withMoves: matched,
        missingRotom: missing.length,
        missingSample: missing.slice(0, 30),
        emptyLearn: emptyLearn.slice(0, 20),
        sample: {
          メガリザードンX: out["メガリザードンX"]?.slice(0, 15),
          カバルドン: out["カバルドン"]?.slice(0, 10),
          ミミッキュ: out["ミミッキュ"]?.length,
        },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
