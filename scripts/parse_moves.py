# -*- coding: utf-8 -*-
"""Parse moves_raw.txt into data/moves.json"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "moves_raw.txt"
OUT = ROOT / "data" / "moves.json"

TYPES = [
    "ノーマル",
    "ほのお",
    "みず",
    "でんき",
    "くさ",
    "こおり",
    "かくとう",
    "どく",
    "じめん",
    "ひこう",
    "エスパー",
    "むし",
    "いわ",
    "ゴースト",
    "ドラゴン",
    "あく",
    "はがね",
    "フェアリー",
]
CATEGORIES = ["物理", "特殊", "変化"]

# attributes that may appear in 対象 section
ATTR_FLAGS = [
    ("接触", "contact"),
    ("音", "sound"),
    ("パンチ", "punch"),
    ("切り", "slicing"),
    ("弾", "bullet"),
    ("波動", "pulse"),
    ("粉", "powder"),
    ("風", "wind"),
    ("爆発", "explosion"),
    ("踊り", "dance"),
    ("噛み", "bite"),
    ("メンタル", "mental"),
    ("回復", "healing"),
]


def split_type_category(blob: str) -> tuple[str, str]:
    for cat in CATEGORIES:
        if blob.endswith(cat):
            t = blob[: -len(cat)]
            if t in TYPES:
                return t, cat
    raise ValueError(f"Cannot parse type/category: {blob!r}")


def parse_num(tok: str):
    if tok in ("-", "—", "－"):
        return None
    return int(tok)


def extract_priority(text: str) -> int:
    m = re.search(r"優先度([+-]?\d+)", text)
    return int(m.group(1)) if m else 0


def parse_moves(raw: str) -> list[dict]:
    # Each move starts with: Name TypeCategory power acc pp 対象：...
    # Moves are space-separated continuously. Strategy:
    # Find all "対象：" anchors and work backwards for name/stats.

    # Normalize spaces
    raw = raw.replace("\u3000", " ").strip()
    # Insert separators before each 対象： block by finding pattern:
    # NAME TYPECAT NUM NUM NUM 対象：
    type_cat_alts = "|".join(
        re.escape(t + c) for t in TYPES for c in CATEGORIES
    )
    pattern = re.compile(
        rf"(?P<name>.+?)\s+(?P<tc>(?:{type_cat_alts}))\s+"
        rf"(?P<pow>-|\d+)\s+(?P<acc>-|\d+)\s+(?P<pp>\d+)\s+"
        rf"対象：(?P<body>.*?)(?=(?:(?<=[。．!?！？])\s*)?(?=.+?\s+(?:{type_cat_alts})\s+(?:-|\d+)\s+(?:-|\d+)\s+\d+\s+対象：)|$)",
        re.S,
    )

    # Simpler approach: split by looking ahead for next type+category token after a period ending effect
    # First find all match starts of TYPECAT power acc pp 対象
    marker = re.compile(
        rf"(?P<tc>{type_cat_alts})\s+(?P<pow>-|\d+)\s+(?P<acc>-|\d+)\s+(?P<pp>\d+)\s+対象："
    )

    matches = list(marker.finditer(raw))
    moves: list[dict] = []
    for idx, m in enumerate(matches):
        start_stats = m.start()
        # name is text between previous match end (or start) and this marker
        prev_end = matches[idx - 1].end() if idx else 0
        name_region = raw[prev_end:start_stats].strip()
        # previous effect text may be included; name is the last "token group"
        # After previous move's effect, name starts. Effects end with 。
        # Take everything after the last 。 of previous effect — but first move has no previous.
        if idx == 0:
            name = name_region.strip()
            target_and_effect_prefix = ""
        else:
            # previous body ended at prev_end; name_region is leftover effect? No —
            # marker.end() is after 対象： so prev body includes effect until next name.
            # Actually marker only matches TYPECAT...対象： so between matches we have:
            # [effect text][spaces][name][spaces] before TYPECAT
            # Split: effect ends with 。 then name
            # Find last period before name
            # Heuristic: name has no spaces typically, but some like "ひけん・ちえなみ"
            # Take trailing non-space run... but names can be multi-char without spaces.
            # Better: strip trailing spaces and take the final segment after last 。 or！
            parts = re.split(r"(?<=[。．])\s*", name_region)
            if len(parts) == 1:
                name = parts[0].strip()
                leftover = ""
            else:
                name = parts[-1].strip()
                leftover = "".join(parts[:-1]).strip()
                # attach leftover to previous move effect
                if leftover and moves:
                    moves[-1]["effect"] = (moves[-1]["effect"] + leftover).strip()

        # body from after 対象： until next name start
        body_start = m.end()
        if idx + 1 < len(matches):
            # next name starts just before next TYPECAT
            next_start = matches[idx + 1].start()
            chunk = raw[body_start:next_start]
            # split effect from next name: after last 。
            segs = re.split(r"(?<=[。．])\s*", chunk)
            if len(segs) == 1:
                body = segs[0].strip()
            else:
                body = "".join(segs[:-1]).strip()
                # segs[-1] is next name — already handled when processing next
        else:
            body = raw[body_start:].strip()

        typ, cat = split_type_category(m.group("tc"))
        flags = {k: False for _, k in ATTR_FLAGS}
        for jp, key in ATTR_FLAGS:
            if jp in body or jp in m.group(0):
                # contact etc. usually in target portion before effect
                flags[key] = jp in body.split("。")[0] or jp in body[:40]

        # More precise: target portion is until first 。 or full if short
        first_period = body.find("。")
        target_part = body if first_period < 0 else body[: first_period + 1]
        effect = body if first_period < 0 else body[first_period + 1 :].strip()
        # If effect empty, whole body is effect with target info mixed
        if not effect:
            effect = body
            target_part = body

        for jp, key in ATTR_FLAGS:
            flags[key] = jp in target_part

        priority = extract_priority(target_part + effect)

        moves.append(
            {
                "name": name.strip(),
                "type": typ,
                "category": cat,
                "power": parse_num(m.group("pow")),
                "accuracy": parse_num(m.group("acc")),
                "pp": int(m.group("pp")),
                "target": target_part.strip(),
                "effect": effect.strip(),
                "priority": priority,
                **flags,
            }
        )

    return moves


def main() -> None:
    raw = SRC.read_text(encoding="utf-8")
    moves = parse_moves(raw)
    OUT.write_text(json.dumps(moves, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(moves)} moves")
    print("first:", moves[0]["name"], moves[0]["type"], moves[0]["category"], moves[0]["power"])
    print("last:", moves[-1]["name"], moves[-1]["type"], moves[-1]["category"])
    # spot checks
    for want in ("イカサマ", "サイコショック", "ボディプレス", "トリプルアクセル", "ウェザーボール"):
        hit = next((x for x in moves if x["name"] == want), None)
        print(want, "OK" if hit else "MISSING", hit and hit.get("effect", "")[:40])


if __name__ == "__main__":
    main()
