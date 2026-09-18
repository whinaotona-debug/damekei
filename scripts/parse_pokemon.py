# -*- coding: utf-8 -*-
"""Parse po.txt into data/pokemon.json (names/types/abilities/base stats only)."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "po.txt"
OUT = ROOT / "data" / "pokemon.json"

TYPE_MAP = {
    "ノ": "ノーマル",
    "炎": "ほのお",
    "水": "みず",
    "電": "でんき",
    "草": "くさ",
    "氷": "こおり",
    "格": "かくとう",
    "毒": "どく",
    "地": "じめん",
    "飛": "ひこう",
    "エ": "エスパー",
    "虫": "むし",
    "岩": "いわ",
    "ゴ": "ゴースト",
    "ド": "ドラゴン",
    "悪": "あく",
    "鋼": "はがね",
    "妖": "フェアリー",
}

NOISE = {
    "image色違い",
    "覚えるわざを見るimage",
    "覚えるわざを見る",
    "特性",
    "種族値",
    "image",
}

HEADER_RE = re.compile(r"^No\.(\d+)(.+)$")
STATS_RE = re.compile(r"^(\d+)-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)\s*[\[［]")


def decode_types(abbr: str) -> list[str]:
    types: list[str] = []
    i = 0
    while i < len(abbr):
        ch = abbr[i]
        if ch not in TYPE_MAP:
            raise ValueError(f"Unknown type char: {abbr!r}")
        types.append(TYPE_MAP[ch])
        i += 1
    return types


def is_ability_line(s: str) -> bool:
    if not s or s in NOISE:
        return False
    if HEADER_RE.match(s):
        return False
    if STATS_RE.match(s):
        return False
    if s in TYPE_MAP or (len(s) <= 2 and all(c in TYPE_MAP for c in s)):
        return False
    # names / forms often contain parentheses or メガ
    if re.fullmatch(r"[ぁ-んーァ-ヶー一-龥A-Za-z0-9（）()・＋+]+", s):
        # exclude pure type-ish short words already handled
        return True
    return False


def parse() -> list[dict]:
    text = SRC.read_text(encoding="utf-8")
    # normalize NBSP
    text = text.replace("\u00a0", " ")
    lines = [ln.strip() for ln in text.splitlines()]

    entries: list[dict] = []
    i = 0
    while i < len(lines):
        m = HEADER_RE.match(lines[i])
        if not m:
            i += 1
            continue

        dex = int(m.group(1))
        header_rest = m.group(2).replace("育成論", "").strip()
        i += 1

        # skip blank / noise until name
        name = header_rest
        while i < len(lines) and not lines[i]:
            i += 1
        if i < len(lines) and lines[i] not in NOISE and not HEADER_RE.match(lines[i]) and not STATS_RE.match(lines[i]):
            # Prefer standalone name line if present
            candidate = lines[i]
            if candidate not in ("特性",) and not candidate.startswith("No."):
                # if candidate looks like a pokemon name / form
                if candidate != "image色違い" and "覚えるわざ" not in candidate:
                    name = candidate
                    i += 1

        types_abbr = None
        abilities: list[str] = []
        stats = None

        # scan until next header or end of this block's stats
        while i < len(lines):
            if HEADER_RE.match(lines[i]) and stats is not None:
                break
            if HEADER_RE.match(lines[i]) and stats is None and types_abbr is not None:
                # next pokemon without stats? break carefully
                break

            s = lines[i]
            if not s or s in NOISE:
                i += 1
                continue

            sm = STATS_RE.match(s)
            if sm:
                stats = {
                    "hp": int(sm.group(1)),
                    "atk": int(sm.group(2)),
                    "def": int(sm.group(3)),
                    "spa": int(sm.group(4)),
                    "spd": int(sm.group(5)),
                    "spe": int(sm.group(6)),
                }
                i += 1
                break

            # type abbreviation
            if types_abbr is None and 1 <= len(s) <= 2 and all(c in TYPE_MAP for c in s):
                types_abbr = s
                i += 1
                continue

            if s == "特性":
                i += 1
                continue

            # abilities: lines after type / 特性 until 種族値
            if types_abbr is not None and stats is None and is_ability_line(s) and s != name:
                # avoid treating next pokemon name as ability — only before 種族値
                abilities.append(s)

            i += 1

        if stats is None or types_abbr is None:
            # incomplete; skip but advance
            continue

        # dedupe abilities preserving order
        seen = set()
        uniq_abilities = []
        for a in abilities:
            if a not in seen and a != name:
                seen.add(a)
                uniq_abilities.append(a)

        entries.append(
            {
                "id": f"{dex:04d}-{name}",
                "dex": dex,
                "name": name,
                "types": decode_types(types_abbr),
                "typesAbbr": types_abbr,
                "abilities": uniq_abilities,
                "baseStats": stats,
            }
        )

    return entries


def main() -> None:
    entries = parse()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(entries)} pokemon -> {OUT}")
    # sample ブリジュラス
    for e in entries:
        if "ブリジュラス" in e["name"]:
            print("sample:", e)


if __name__ == "__main__":
    main()
