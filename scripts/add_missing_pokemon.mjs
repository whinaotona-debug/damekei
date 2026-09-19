/**
 * Add missing Champions Pokémon into data/pokemon.json
 * Sources: PokeAPI (base forms) + hardcoded Champions-exclusive megas
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "pokemon.json");

const TYPE_ABBR = {
  ノーマル: "ノ",
  ほのお: "炎",
  みず: "水",
  でんき: "電",
  くさ: "草",
  こおり: "氷",
  かくとう: "格",
  どく: "毒",
  じめん: "地",
  ひこう: "飛",
  エスパー: "エ",
  むし: "虫",
  いわ: "岩",
  ゴースト: "ゴ",
  ドラゴン: "ド",
  あく: "悪",
  はがね: "鋼",
  フェアリー: "妖",
};

const TYPE_EN = {
  normal: "ノーマル",
  fire: "ほのお",
  water: "みず",
  electric: "でんき",
  grass: "くさ",
  ice: "こおり",
  fighting: "かくとう",
  poison: "どく",
  ground: "じめん",
  flying: "ひこう",
  psychic: "エスパー",
  bug: "むし",
  rock: "いわ",
  ghost: "ゴースト",
  dragon: "ドラゴン",
  dark: "あく",
  steel: "はがね",
  fairy: "フェアリー",
};

/** name -> pokeapi pokemon endpoint id/name */
const POKEAPI_MAP = {
  クチート: "mawile",
  メガクチート: "mawile-mega",
  ボスゴドラ: "aggron",
  メガボスゴドラ: "aggron-mega",
  チャーレム: "medicham",
  メガチャーレム: "medicham-mega",
  ライボルト: "manectric",
  メガライボルト: "manectric-mega",
  サメハダー: "sharpedo",
  メガサメハダー: "sharpedo-mega",
  バクーダ: "camerupt",
  メガバクーダ: "camerupt-mega",
  コータス: "torkoal",
  チルタリス: "altaria",
  メガチルタリス: "altaria-mega",
  ミロカロス: "milotic",
  "ポワルン(あまみずのすがた)": "castform-rainy",
  "ポワルン(たいようのすがた)": "castform-sunny",
  "ポワルン(ゆきぐものすがた)": "castform-snowy",
  ジュペッタ: "banette",
  メガジュペッタ: "banette-mega",
  チリーン: "chimecho",
  アブソル: "absol",
  メガアブソル: "absol-mega",
  オニゴーリ: "glalie",
  メガオニゴーリ: "glalie-mega",
  メタグロス: "metagross",
  メガメタグロス: "metagross-mega",
  ドダイトス: "torterra",
  ゴウカザル: "infernape",
  エンペルト: "empoleon",
  ムクホーク: "staraptor",
  レントラー: "luxray",
  ロズレイド: "roserade",
  ラムパルド: "rampardos",
  トリデプス: "bastiodon",
  ミミロップ: "lopunny",
  メガミミロップ: "lopunny-mega",
  ミカルゲ: "spiritomb",
  ガブリアス: "garchomp",
  メガガブリアス: "garchomp-mega",
  ルカリオ: "lucario",
  メガルカリオ: "lucario-mega",
  カバルドン: "hippowdon",
  ドクロッグ: "toxicroak",
  ユキノオー: "abomasnow",
  メガユキノオー: "abomasnow-mega",
  マニューラ: "weavile",
  ドサイドン: "rhyperior",
  リーフィア: "leafeon",
  グレイシア: "glaceon",
  グライオン: "gliscor",
  マンムー: "mamoswine",
  エルレイド: "gallade",
  メガエルレイド: "gallade-mega",
  ユキメノコ: "froslass",
  ウォッシュロトム: "rotom-wash",
  カットロトム: "rotom-mow",
  スピンロトム: "rotom-fan",
  ヒートロトム: "rotom-heat",
  フロストロトム: "rotom-frost",
  ロトム: "rotom",
  ジャローダ: "serperior",
  エンブオー: "emboar",
  ダイケンキ: "samurott",
  ヒスイダイケンキ: "samurott-hisui",
  ミルホッグ: "watchog",
  レパルダス: "liepard",
  ヤナッキー: "simisage",
  バオッキー: "simisear",
  ヒヤッキー: "simipour",
  ムシャーナ: "musharna",
  ドリュウズ: "excadrill",
  タブンネ: "audino",
  メガタブンネ: "audino-mega",
  ローブシン: "conkeldurr",
  ペンドラー: "scolipede",
  エルフーン: "whimsicott",
  ワルビアル: "krookodile",
  ズルズキン: "scrafty",
  デスカーン: "cofagrigus",
  ダストダス: "garbodor",
  ゾロアーク: "zoroark",
  ヒスイゾロアーク: "zoroark-hisui",
  ランクルス: "reuniclus",
  バイバニラ: "vanilluxe",
};

/** Champions-exclusive megas (not on PokeAPI as standard forms) */
const CHAMPIONS_MEGAS = [
  {
    name: "メガチリーン",
    dex: 358,
    types: ["エスパー", "はがね"],
    abilities: ["ふゆう"],
    baseStats: { hp: 75, atk: 50, def: 110, spa: 135, spd: 120, spe: 65 },
  },
  {
    name: "メガムクホーク",
    dex: 398,
    types: ["かくとう", "ひこう"],
    abilities: ["あまのじゃく"],
    baseStats: { hp: 85, atk: 140, def: 100, spa: 60, spd: 90, spe: 110 },
  },
  {
    name: "メガユキメノコ",
    dex: 478,
    types: ["こおり", "ゴースト"],
    abilities: ["ゆきふらし"],
    baseStats: { hp: 70, atk: 80, def: 70, spa: 140, spd: 100, spe: 120 },
  },
  {
    name: "メガエンブオー",
    dex: 500,
    types: ["ほのお", "かくとう"],
    abilities: ["かたやぶり"],
    baseStats: { hp: 110, atk: 148, def: 75, spa: 110, spd: 110, spe: 75 },
  },
  {
    name: "メガドリュウズ",
    dex: 530,
    types: ["じめん", "はがね"],
    abilities: ["かんつうドリル"],
    baseStats: { hp: 110, atk: 165, def: 100, spa: 65, spd: 65, spe: 103 },
  },
  {
    name: "メガペンドラー",
    dex: 545,
    types: ["むし", "どく"],
    abilities: ["シェルアーマー"],
    baseStats: { hp: 60, atk: 140, def: 149, spa: 75, spd: 99, spe: 62 },
  },
  {
    name: "メガズルズキン",
    dex: 560,
    types: ["あく", "かくとう"],
    abilities: ["いかく"],
    baseStats: { hp: 65, atk: 130, def: 135, spa: 55, spd: 135, spe: 68 },
  },
];

const cache = new Map();

async function fetchJson(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

async function jaName(url, fallback) {
  const data = await fetchJson(url);
  const ja = data.names?.find((n) => n.language.name === "ja-Hrkt" || n.language.name === "ja");
  return ja?.name || fallback;
}

function typesAbbr(types) {
  return types.map((t) => TYPE_ABBR[t] || "?").join("");
}

function makeEntry({ name, dex, types, abilities, baseStats }) {
  return {
    id: `${String(dex).padStart(4, "0")}-${name}`,
    dex,
    name,
    types,
    typesAbbr: typesAbbr(types),
    abilities,
    baseStats,
  };
}

async function fromPokeApi(displayName, apiId) {
  const poke = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${apiId}`);
  const types = poke.types
    .sort((a, b) => a.slot - b.slot)
    .map((t) => TYPE_EN[t.type.name]);
  const baseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const s of poke.stats) {
    const n = s.stat.name;
    if (n === "hp") baseStats.hp = s.base_stat;
    else if (n === "attack") baseStats.atk = s.base_stat;
    else if (n === "defense") baseStats.def = s.base_stat;
    else if (n === "special-attack") baseStats.spa = s.base_stat;
    else if (n === "special-defense") baseStats.spd = s.base_stat;
    else if (n === "speed") baseStats.spe = s.base_stat;
  }
  const abilities = [];
  for (const a of poke.abilities.sort((x, y) => x.slot - y.slot)) {
    const nm = await jaName(a.ability.url, a.ability.name);
    if (!abilities.includes(nm)) abilities.push(nm);
  }
  // national dex: prefer species dex numbers
  const species = await fetchJson(poke.species.url);
  const dexEntry = species.pokedex_numbers?.find((p) => p.pokedex.name === "national");
  const dex = dexEntry?.entry_number ?? poke.id;
  return makeEntry({ name: displayName, dex, types, abilities, baseStats });
}

async function main() {
  const existing = JSON.parse(readFileSync(OUT, "utf8"));
  const byName = new Map(existing.map((p) => [p.name, p]));

  const added = [];
  const errors = [];

  for (const [name, apiId] of Object.entries(POKEAPI_MAP)) {
    if (byName.has(name)) continue;
    try {
      process.stdout.write(`fetch ${name} (${apiId})...\n`);
      const entry = await fromPokeApi(name, apiId);
      byName.set(name, entry);
      added.push(name);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }

  for (const mega of CHAMPIONS_MEGAS) {
    if (byName.has(mega.name)) continue;
    const entry = makeEntry(mega);
    byName.set(mega.name, entry);
    added.push(mega.name);
  }

  const merged = [...byName.values()].sort((a, b) => {
    if (a.dex !== b.dex) return a.dex - b.dex;
    // base form before mega / forms: shorter / without メガ first roughly by id
    return a.id.localeCompare(b.id, "ja");
  });

  writeFileSync(OUT, JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ before: existing.length, after: merged.length, added: added.length, addedNames: added, errors }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
