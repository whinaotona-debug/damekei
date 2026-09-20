# -*- coding: utf-8 -*-
"""Write calc.html using only ASCII + numeric character references (encoding-safe)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def e(s: str) -> str:
    return "".join(f"&#{ord(c)};" if ord(c) > 127 else c for c in s)


# All Japanese via \\u escapes so this script stays pure ASCII / safe under any editor encoding.
T = {
    "title": "\u30c0\u30e1\u8a08 | \u4e00\u62ec\u8a08\u7b97",
    "home": "\u30db\u30fc\u30e0",
    "damekei": "\u30c0\u30e1\u8a08",
    "sub": "\u653b\u6483\u0031\u5339 \u2192 \u69cb\u7bc9\u0036\u5339\u3078\u4e00\u62ec",
    "phone": "\u30b9\u30de\u30db",
    "recv": "\u53d7\u3051\u5074\u306e\u69cb\u7bc9",
    "pick_team": "\u69cb\u7bc9\u9078\u629e",
    "edit_team": "\u69cb\u7bc9\u3092\u7de8\u96c6",
    "atk_side": "\u653b\u6483\u5074",
    "tap_poke": "\u30bf\u30c3\u30d7\u3067\u30dd\u30b1\u30e2\u30f3\u9078\u629e",
    "use_move": "\u4f7f\u3046\u6280",
    "pick_move": "\u6280\u3092\u9078\u629e",
    "atk_item": "\u653b\u6483\u6301\u3061\u7269",
    "none": "\u306a\u3057",
    "weather": "\u5929\u5019",
    "sunny": "\u6674\u308c",
    "rain": "\u96e8",
    "sand": "\u7802",
    "snow": "\u96ea",
    "hare": "\u306f\u308c",
    "ame": "\u3042\u3081",
    "suna": "\u3059\u306a\u3042\u3089\u3057",
    "yuki": "\u3086\u304d",
    "ba": "\u5834",
    "eleki": "\u30a8\u30ec\u30ad",
    "grass": "\u30b0\u30e9\u30b9",
    "psycho": "\u30b5\u30a4\u30b3",
    "mist": "\u30df\u30b9\u30c8",
    "eleki_f": "\u30a8\u30ec\u30ad\u30d5\u30a3\u30fc\u30eb\u30c9",
    "grass_f": "\u30b0\u30e9\u30b9\u30d5\u30a3\u30fc\u30eb\u30c9",
    "psycho_f": "\u30b5\u30a4\u30b3\u30d5\u30a3\u30fc\u30eb\u30c9",
    "mist_f": "\u30df\u30b9\u30c8\u30d5\u30a3\u30fc\u30eb\u30c9",
    "status": "\u7570\u5e38",
    "burn": "\u3084\u3051\u3069",
    "para": "\u307e\u3072",
    "poison": "\u3069\u304f",
    "toxic": "\u3082\u3046\u3069\u304f",
    "spikes": "\u307e\u304d\u3073\u3057",
    "crit": "\u6025\u6240",
    "reflect": "\u30ea\u30d5\u30ec\u30af",
    "light": "\u5149\u306e\u58c1",
    "veil": "\u30d9\u30fc\u30eb",
    "stealth": "\u30b9\u30c6\u30ed",
    "leech": "\u3084\u3069\u308a\u304e",
    "burn_d": "\u3084\u3051\u3069D",
    "poison_d": "\u3069\u304fD",
    "gravity": "\u91cd\u529b",
    "help": "\u3066\u3060\u3059\u3051",
    "hp_not": "\u76f8\u624bHP\u975e\u6e80\u30bf\u30f3",
    "last": "\u5f8c\u653b(\u304c\u3093\u305b\u304d)",
    "results": "\u5bfe \u69cb\u7bc96\u5339\u306e\u30c0\u30e1\u30fc\u30b8",
    "hint": "\u653b\u6483\u30dd\u30b1\u30e2\u30f3\u3068\u6280\u3092\u9078\u3076\u3068\u3001\u53d7\u3051\u50746\u5339\u3078\u306e\u30c0\u30e1\u30fc\u30b8\u304c\u51fa\u307e\u3059",
    "select": "\u9078\u629e",
    "close": "\u9589\u3058\u308b",
}

html = f"""<!DOCTYPE html>
<html lang="ja" data-ui="phone">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#1a2b33" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta http-equiv="Cache-Control" content="no-cache" />
  <title>{e(T['title'])}</title>
  <link rel="icon" type="image/png" href="./icons/icon.png" />
  <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
  <link rel="stylesheet" href="./css/style.css?v=20260920i" />
  <link rel="stylesheet" href="./css/hub.css?v=20260920i" />
  <link rel="stylesheet" href="./css/type-icons.css?v=20260920i" />
</head>
<body class="tools-page">
  <div class="hub-app">
    <header class="app-header">
      <a class="app-icon-link" href="./index.html" title="{e(T['home'])}">
        <img class="app-icon" src="./icons/icon.png" alt="Poketool" width="36" height="36" />
      </a>
      <div class="titles">
        <h1>{e(T['damekei'])}</h1>
        <p>{e(T['sub'])}</p>
      </div>
      <nav class="hub-nav">
        <a href="./index.html" class="nav-home">{e(T['home'])}</a>
        <a href="./calc.html" aria-current="page">{e(T['damekei'])}</a>
        <div class="ui-toggle">
          <button type="button" data-ui-set="phone">{e(T['phone'])}</button>
          <button type="button" data-ui-set="ipad">iPad</button>
        </div>
        <div class="result-mini" id="result-mini">-</div>
      </nav>
    </header>

    <div class="team-toolbar">
      <label class="field-label" for="team-slot">{e(T['recv'])}</label>
      <select id="team-slot" aria-label="{e(T['pick_team'])}"></select>
      <button type="button" class="icon-btn" id="btn-edit-team">{e(T['edit_team'])}</button>
    </div>

    <div class="calc-layout">
      <section class="calc-attacker">
        <h2>{e(T['atk_side'])}</h2>
        <div class="poke-slot" id="atk-slot" tabindex="0" role="button">{e(T['tap_poke'])}</div>
        <div id="atk-detail" class="poke-detail" hidden></div>

        <div class="mid-row mid-row-2">
          <button type="button" class="selector-btn" id="move-btn">
            <div class="k">{e(T['use_move'])}</div>
            <div class="title">{e(T['pick_move'])}</div>
          </button>
          <button type="button" class="selector-btn" id="atk-item-btn">
            <div class="k">{e(T['atk_item'])}</div>
            <div class="title">{e(T['none'])}</div>
          </button>
        </div>

        <div class="field-compact">
          <label>{e(T['weather'])}<select id="weather">
            <option value="{e(T['none'])}">{e(T['none'])}</option>
            <option value="{e(T['hare'])}">{e(T['sunny'])}</option>
            <option value="{e(T['ame'])}">{e(T['rain'])}</option>
            <option value="{e(T['suna'])}">{e(T['sand'])}</option>
            <option value="{e(T['yuki'])}">{e(T['snow'])}</option>
          </select></label>
          <label>{e(T['ba'])}<select id="field">
            <option value="{e(T['none'])}">{e(T['none'])}</option>
            <option value="{e(T['eleki_f'])}">{e(T['eleki'])}</option>
            <option value="{e(T['grass_f'])}">{e(T['grass'])}</option>
            <option value="{e(T['psycho_f'])}">{e(T['psycho'])}</option>
            <option value="{e(T['mist_f'])}">{e(T['mist'])}</option>
          </select></label>
          <label>{e(T['status'])}<select id="atk-status">
            <option value="{e(T['none'])}">{e(T['none'])}</option>
            <option value="{e(T['burn'])}">{e(T['burn'])}</option>
            <option value="{e(T['para'])}">{e(T['para'])}</option>
            <option value="{e(T['poison'])}">{e(T['poison'])}</option>
            <option value="{e(T['toxic'])}">{e(T['toxic'])}</option>
          </select></label>
          <label>{e(T['spikes'])}<select id="spikes">
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select></label>
        </div>

        <div class="check-list compact">
          <label><input type="checkbox" id="critical" />{e(T['crit'])}</label>
          <label><input type="checkbox" id="reflect" />{e(T['reflect'])}</label>
          <label><input type="checkbox" id="lightScreen" />{e(T['light'])}</label>
          <label><input type="checkbox" id="auroraVeil" />{e(T['veil'])}</label>
          <label><input type="checkbox" id="stealthRock" />{e(T['stealth'])}</label>
          <label><input type="checkbox" id="leechSeed" />{e(T['leech'])}</label>
          <label><input type="checkbox" id="burnChip" />{e(T['burn_d'])}</label>
          <label><input type="checkbox" id="poisonChip" />{e(T['poison_d'])}</label>
          <label><input type="checkbox" id="gravity" />{e(T['gravity'])}</label>
          <label><input type="checkbox" id="helpBoost" />{e(T['help'])}</label>
          <label><input type="checkbox" id="hpNotFull" />{e(T['hp_not'])}</label>
          <label><input type="checkbox" id="movingLast" />{e(T['last'])}</label>
        </div>
      </section>

      <section class="calc-results">
        <h2 id="results-title">{e(T['results'])}</h2>
        <div class="bulk-results" id="bulk-results">
          <p class="hint">{e(T['hint'])}</p>
        </div>
      </section>
    </div>
  </div>

  <div class="modal" id="modal" aria-hidden="true">
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3 id="modal-title">{e(T['select'])}</h3>
        <button type="button" class="icon-btn" id="modal-close">{e(T['close'])}</button>
      </div>
      <div class="modal-body" id="modal-body"></div>
    </div>
  </div>

  <script type="module" src="./js/calc-app.js?v=20260920i"></script>
</body>
</html>
"""

out = ROOT / "calc.html"
# Ensure ASCII-only file body (except we intentionally only emit &#...; and ASCII)
out.write_text(html, encoding="ascii", errors="strict")
raw = out.read_bytes()
assert all(b < 128 for b in raw), "non-ascii slipped in"
assert b"???" not in raw
assert b"&#12480;" in raw  # ダ
print("wrote", out, "bytes", len(raw), "ascii-only OK")
