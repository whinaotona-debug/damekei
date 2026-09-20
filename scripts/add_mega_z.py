# -*- coding: utf-8 -*-
"""Add Mega Evolution Z forms for Champions M-C."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

Z_FORMS = [
    {
        "after": "メガアブソル",
        "entry": {
            "id": "0359-メガアブソルZ",
            "dex": 359,
            "name": "メガアブソルZ",
            "types": ["あく"],
            "typesAbbr": "悪",
            "abilities": ["きれあじ"],
            "baseStats": {"hp": 65, "atk": 154, "def": 60, "spa": 75, "spd": 60, "spe": 151},
        },
        "learn_from": "メガアブソル",
        "sprite": "absolmegaz",
    },
    {
        "after": "メガガブリアス",
        "entry": {
            "id": "0445-メガガブリアスZ",
            "dex": 445,
            "name": "メガガブリアスZ",
            "types": ["ドラゴン", "じめん"],
            "typesAbbr": "ド地",
            "abilities": ["ふゆう"],
            "baseStats": {"hp": 108, "atk": 130, "def": 85, "spa": 141, "spd": 85, "spe": 151},
        },
        "learn_from": "メガガブリアス",
        "sprite": "garchompmegaz",
    },
    {
        "after": "メガルカリオ",
        "entry": {
            "id": "0448-メガルカリオZ",
            "dex": 448,
            "name": "メガルカリオZ",
            "types": ["かくとう", "はがね"],
            "typesAbbr": "闘鋼",
            "abilities": ["はどうのぼうご"],
            "baseStats": {"hp": 70, "atk": 100, "def": 70, "spa": 164, "spd": 70, "spe": 151},
        },
        "learn_from": "メガルカリオ",
        "sprite": "lucariomegaz",
    },
]


def main():
    poke_path = ROOT / "data" / "pokemon.json"
    pokemon = json.loads(poke_path.read_text(encoding="utf-8"))
    names = {p["name"] for p in pokemon}

    for z in Z_FORMS:
        if z["entry"]["name"] in names:
            print("skip existing", z["entry"]["name"])
            continue
        idx = next(i for i, p in enumerate(pokemon) if p["name"] == z["after"])
        pokemon.insert(idx + 1, z["entry"])
        names.add(z["entry"]["name"])
        print("added pokemon", z["entry"]["name"])

    poke_path.write_text(json.dumps(pokemon, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    learn_path = ROOT / "data" / "learnsets.json"
    learn = json.loads(learn_path.read_text(encoding="utf-8"))
    for z in Z_FORMS:
        src = learn.get(z["learn_from"]) or learn.get(z["learn_from"].replace("メガ", "")) or []
        # prefer mega learnset, else base
        base = z["learn_from"].replace("メガ", "")
        if not src:
            src = learn.get(base, [])
        # merge mega + base unique
        base_ls = learn.get(base, [])
        mega_ls = learn.get(z["learn_from"], [])
        merged = []
        seen = set()
        for name in mega_ls + base_ls + src:
            if name and name not in seen:
                seen.add(name)
                merged.append(name)
        learn[z["entry"]["name"]] = merged
        print("learnset", z["entry"]["name"], len(merged))
    learn_path.write_text(json.dumps(learn, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    media_path = ROOT / "data" / "media-ids.json"
    media = json.loads(media_path.read_text(encoding="utf-8"))
    for z in Z_FORMS:
        media["pokemon"][z["entry"]["name"]] = z["sprite"]
    media_path.write_text(json.dumps(media, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # sync js/media-ids.js
    js_path = ROOT / "js" / "media-ids.js"
    js_path.write_text(
        "export default " + json.dumps(media, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print("media ids updated")


if __name__ == "__main__":
    main()
