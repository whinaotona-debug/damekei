# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

html = """<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>構築データ救出 | ダメ計</title>
  <style>
    body { font-family: sans-serif; max-width: 720px; margin: 16px auto; padding: 0 12px; line-height: 1.5; }
    textarea { width: 100%; min-height: 180px; font-family: monospace; font-size: 12px; }
    button { margin: 4px 6px 4px 0; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    .box { border: 1px solid #ccc; border-radius: 10px; padding: 12px; margin: 12px 0; background: #f7fbfd; }
    .ok { color: #1b7a3d; font-weight: 700; }
    .bad { color: #b00020; font-weight: 700; }
    code { background: #eee; padding: 1px 4px; }
  </style>
</head>
<body>
  <h1>構築データ救出</h1>
  <p>このページは <strong>いま開いているURL</strong> の保存領域だけを見ます。<br/>
  GitHub Pages と、PCのファイル直開き（<code>file://</code>）は保存場所が別です。</p>

  <div class="box">
    <p><strong>いまの場所:</strong> <span id="origin"></span></p>
    <p id="summary"></p>
    <button type="button" id="btn-scan">再スキャン</button>
    <button type="button" id="btn-copy">見つかった構築JSONをコピー</button>
    <button type="button" id="btn-dl">JSONファイル保存</button>
  </div>

  <div class="box">
    <h2>手順（復活させたいとき）</h2>
    <ol>
      <li>昔データを入れた開き方でもう一度この <code>recover.html</code> を開く<br/>
        （例: エクスプローラーで <code>ダメ計/recover.html</code> をダブルクリック）</li>
      <li>「見つかった構築JSONをコピー」</li>
      <li>いつものサイト（GitHub Pages）の構築画面 → <strong>データ救出</strong> → 貼り付けて取込</li>
    </ol>
  </div>

  <h2>診断</h2>
  <pre id="diag" class="box" style="white-space:pre-wrap;word-break:break-all"></pre>
  <h2>抽出JSON</h2>
  <textarea id="out" readonly></textarea>

  <script>
    const KEYS = ["damekei-builds-v2","damekei-teams-v1","damekei-builds-v1","damekei-teams","damekei-builds"];

    function fillCount(list) {
      if (!Array.isArray(list)) return 0;
      return list.reduce((n,t)=> n + ((t&&t.members)||[]).filter(m=>m&&m.species).length, 0);
    }
    function coerce(data) {
      if (!data) return null;
      let list = null;
      if (Array.isArray(data)) list = data;
      else if (Array.isArray(data.teams)) list = data.teams;
      else if (data.members) list = [data];
      if (!list || !list.length) return null;
      const teams = list.filter(t => t && Array.isArray(t.members));
      return teams.length ? teams : null;
    }
    function scan() {
      document.getElementById("origin").textContent = location.href;
      const rows = [];
      let best = null;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const raw = localStorage.getItem(key) || "";
        let list = null;
        try { list = coerce(JSON.parse(raw)); } catch(e) {}
        const fill = fillCount(list);
        rows.push({key, bytes: raw.length, fill, list});
        if (fill && (!best || fill > best.fill)) best = {key, list, fill, raw};
      }
      // prefer known keys if equal
      for (const k of KEYS) {
        try {
          const list = coerce(JSON.parse(localStorage.getItem(k)||"null"));
          const fill = fillCount(list);
          if (fill && (!best || fill >= best.fill)) best = {key:k, list, fill, raw: localStorage.getItem(k)};
        } catch(e) {}
      }
      rows.sort((a,b)=> b.fill - a.fill || b.bytes - a.bytes);
      const sum = document.getElementById("summary");
      if (best) {
        sum.innerHTML = '<span class="ok">構築データ発見: ' + best.key + '（' + best.fill + '匹）</span>';
        const payload = JSON.stringify({app:"damekei", version:2, exportedAt:new Date().toISOString(), origin:location.href, teams:best.list}, null, 2);
        document.getElementById("out").value = payload;
      } else {
        sum.innerHTML = '<span class="bad">このURLの保存領域に構築データはありません。</span><br/>別の開き方（file:// や別サイト）で保存していた可能性が高いです。';
        document.getElementById("out").value = "";
      }
      document.getElementById("diag").textContent = rows.length
        ? rows.map(r => r.key + "  " + r.bytes + "B  fill=" + r.fill).join("\\n")
        : "(localStorage 空)";
      window.__best = best;
    }
    document.getElementById("btn-scan").onclick = scan;
    document.getElementById("btn-copy").onclick = async () => {
      const t = document.getElementById("out").value;
      if (!t) { alert("コピーするデータがありません"); return; }
      try { await navigator.clipboard.writeText(t); alert("コピーしました。GitHub Pages側の構築→データ救出に貼ってください"); }
      catch(e) { document.getElementById("out").select(); document.execCommand("copy"); alert("コピーしました"); }
    };
    document.getElementById("btn-dl").onclick = () => {
      const t = document.getElementById("out").value;
      if (!t) { alert("保存するデータがありません"); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([t], {type:"application/json"}));
      a.download = "damekei-teams-backup.json";
      a.click();
    };
    scan();
  </script>
</body>
</html>
"""
(ROOT / "recover.html").write_text(html, encoding="utf-8")
print("wrote recover.html", (ROOT / "recover.html").stat().st_size)
