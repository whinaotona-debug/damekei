# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = (ROOT / "calc.html").read_bytes()
# If calc was already turned into redirect, regenerate from writer first
if b"&#12480;" not in src:
    import runpy

    runpy.run_path(str(ROOT / "scripts" / "write_calc_ascii.py"))
    src = (ROOT / "calc.html").read_bytes()

dame = src.replace(b'href="./calc.html"', b'href="./dame.html"')
(ROOT / "dame.html").write_bytes(dame)

redir = b"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0;url=./dame.html" />
  <link rel="canonical" href="./dame.html" />
  <title>redirect</title>
  <script>location.replace("./dame.html"+location.search+location.hash);</script>
</head>
<body><p><a href="./dame.html">open</a></p></body>
</html>
"""
(ROOT / "calc.html").write_bytes(redir)

idx_path = ROOT / "index.html"
idx = idx_path.read_text(encoding="utf-8")
idx = idx.replace('href="./calc.html?v=20260920i"', 'href="./dame.html"')
idx = idx.replace('href="./calc.html"', 'href="./dame.html"')
idx_path.write_text(idx, encoding="utf-8")

print("dame", (ROOT / "dame.html").stat().st_size, "has entity", b"&#12480;" in dame)
print("calc is redirect", b"dame.html" in (ROOT / "calc.html").read_bytes())
print("index links dame", "dame.html" in idx_path.read_text(encoding="utf-8"))
