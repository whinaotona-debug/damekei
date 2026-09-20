# -*- coding: utf-8 -*-
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def head(url: str) -> int:
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status
    except Exception as e:
        code = getattr(e, "code", None)
        return int(code) if code else 0


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


candidates = [
    # Showdown variants
    "https://play.pokemonshowdown.com/sprites/dex/raichu-mega-x.png",
    "https://play.pokemonshowdown.com/sprites/dex/raichu-mega-y.png",
    "https://play.pokemonshowdown.com/sprites/home-centered/raichu-mega-x.png",
    "https://play.pokemonshowdown.com/sprites/home-centered/raichu-mega-y.png",
    "https://play.pokemonshowdown.com/sprites/afd/raichu-mega-x.png",
    "https://play.pokemonshowdown.com/sprites/afd/raichu-mega-y.png",
    "https://play.pokemonshowdown.com/sprites/gen5/raichu-mega-x.png",
    # possible ZA ids
    "https://play.pokemonshowdown.com/sprites/dex/raichumegax.png",
    "https://play.pokemonshowdown.com/sprites/dex/raichumegay.png",
    # Mega Z
    "https://play.pokemonshowdown.com/sprites/dex/absol-mega-z.png",
    "https://play.pokemonshowdown.com/sprites/dex/lucario-mega-z.png",
    "https://play.pokemonshowdown.com/sprites/dex/garchomp-mega-z.png",
    "https://play.pokemonshowdown.com/sprites/home-centered/absol-mega-z.png",
    "https://play.pokemonshowdown.com/sprites/home-centered/lucario-mega-z.png",
    "https://play.pokemonshowdown.com/sprites/home-centered/garchomp-mega-z.png",
]

print("=== HEAD checks ===")
for u in candidates:
    print(head(u), u)

# scrape game8 / gamewith for img src
pages = [
    "https://game8.jp/pokemon-champions/553173",
    "https://game8.jp/pokemon-champions/812621",
    "https://gamewith.jp/pokemon-champions/553173",
]

print("\n=== page images ===")
for page in pages:
    try:
        html = get(page).decode("utf-8", "replace")
    except Exception as e:
        print("fail", page, e)
        continue
    urls = sorted(set(re.findall(r"https?://[^\"'\s>]+\.(?:png|jpg|webp|gif)", html, re.I)))
    print(page, "imgs", len(urls))
    for u in urls:
        low = u.lower()
        if any(k in low for k in ["raichu", "026", "absol", "lucario", "garchomp", "359", "448", "445", "mega"]):
            print(" ", head(u), u)
