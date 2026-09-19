/**
 * Build data/media-ids.json: Japanese name -> Showdown sprite id
 */
import { writeFileSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://raw.githubusercontent.com/nonz250/ai-rotom/main/data/champions";

async function fetchJson(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

function norm(s) {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[()（）\s　]/g, "")
    .toLowerCase();
}

async function main() {
  const [rotomPokes, rotomItems] = await Promise.all([
    fetchJson("pokemon.json"),
    fetchJson("items.json"),
  ]);
  const ours = JSON.parse(readFileSync(join(ROOT, "data", "pokemon.json"), "utf8"));
  const ourItems = JSON.parse(readFileSync(join(ROOT, "data", "items.json"), "utf8"));

  const pokeByJa = new Map();
  const pokeByNorm = new Map();
  for (const p of rotomPokes) {
    pokeByJa.set(p.nameJa, p.id);
    pokeByNorm.set(norm(p.nameJa), p.id);
  }

  const pokemon = {};
  const missingPoke = [];
  for (const p of ours) {
    let id = pokeByJa.get(p.name) || pokeByNorm.get(norm(p.name));
    if (!id && p.name.startsWith("メガ")) {
      const base = p.name.replace(/^メガ/, "").replace(/[XYZ]$/, "");
      // try mega form id patterns later via rotom list
      const mega = rotomPokes.find((x) => x.nameJa === p.name);
      if (mega) id = mega.id;
      else {
        const baseEntry = rotomPokes.find((x) => x.nameJa === base || norm(x.nameJa) === norm(base));
        if (baseEntry) {
          const m = rotomPokes.find(
            (x) =>
              x.baseSpecies === baseEntry.name &&
              /mega/i.test(x.id) &&
              (p.name.endsWith("X") ? /megax|mega.*x/i.test(x.id) : true) &&
              (p.name.endsWith("Y") ? /megay|mega.*y/i.test(x.id) : true)
          );
          if (m) id = m.id;
          else id = baseEntry.id + "mega";
        }
      }
    }
    if (!id) {
      // gendered / form aliases
      const stripped = p.name.replace(/\(.*\)$/, "");
      id = pokeByJa.get(stripped) || pokeByNorm.get(norm(stripped));
    }
    if (id) pokemon[p.name] = id;
    else missingPoke.push(p.name);
  }

  const itemByJa = new Map();
  for (const it of rotomItems) {
    if (it.nameJa) itemByJa.set(it.nameJa, it.id);
    // also NFKC
    itemByJa.set(norm(it.nameJa), it.id);
  }

  const items = {};
  const missingItem = [];
  for (const it of ourItems) {
    let id = itemByJa.get(it.name) || itemByJa.get(norm(it.name));
    if (!id && it.name === "メガストーン") id = "latiasite"; // generic fallback; UI may override
    if (id) items[it.name] = id;
    else missingItem.push(it.name);
  }
  items["なし"] = "";
  items["メガストーン"] = "latiasite";

  const out = { pokemon, items };
  writeFileSync(join(ROOT, "data", "media-ids.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(
    JSON.stringify(
      {
        pokemonMapped: Object.keys(pokemon).length,
        pokemonTotal: ours.length,
        missingPoke: missingPoke.slice(0, 40),
        itemsMapped: Object.keys(items).length,
        missingItem: missingItem.slice(0, 40),
        sample: {
          メガボーマンダ: pokemon["メガボーマンダ"],
          ウォッシュロトム: pokemon["ウォッシュロトム"],
          こだわりスカーフ: items["こだわりスカーフ"],
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
