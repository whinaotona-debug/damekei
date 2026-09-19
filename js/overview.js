/**
 * 構築概要カード描画 & PNG保存
 */
import { calcAllStats, emptyEvs, STAT_LABELS, STAT_KEYS } from "./stats.js?v=20260920e";
import { typeIconHtml, pokeImgHtml, itemImgHtml } from "./media.js?v=20260920e";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moveRow(moveName, moveByName) {
  const mv = moveName ? moveByName(moveName) : null;
  if (!mv) {
    return `<div class="ov-move empty">${typeIconHtml("", { size: "md" })}<span>未設定</span></div>`;
  }
  return `<div class="ov-move">${typeIconHtml(mv.type, { size: "md" })}<span>${esc(mv.name)}</span></div>`;
}

function evShort(evs) {
  const e = evs || emptyEvs();
  const parts = STAT_KEYS.filter((k) => (e[k] || 0) > 0).map((k) => `${STAT_LABELS[k]}${e[k]}`);
  return parts.length ? parts.join(" ") : "努力0";
}

export function buildOverviewHtml(team, pokeByName, moveByName) {
  const cards = team.members
    .map((m, i) => {
      const poke = pokeByName(m.species);
      if (!poke) {
        return `
        <article class="ov-card empty">
          <div class="ov-slot">${i + 1}</div>
          <div class="ov-empty-label">空き枠</div>
        </article>`;
      }
      const stats = calcAllStats(poke.baseStats, m.evs || emptyEvs(), m.nature);
      const types = poke.types || [];
      return `
      <article class="ov-card">
        <div class="ov-slot">${i + 1}</div>
        <div class="ov-main">
          <div class="ov-left">
            <div class="ov-name">${esc(poke.name)}</div>
            <div class="ov-meta">${esc(m.ability || "—")}</div>
            <div class="ov-meta ov-item-row">${itemImgHtml(m.item, { size: 24 })}<span>${esc(m.item || "なし")}</span></div>
            <div class="ov-meta muted">${esc(m.nature)}　${esc(evShort(m.evs))}</div>
            <div class="ov-stats">H${stats.hp} A${stats.atk} B${stats.def} C${stats.spa} D${stats.spd} S${stats.spe}</div>
          </div>
          <div class="ov-sprite-wrap">
            <div class="ov-types">${types.map((t) => typeIconHtml(t, { size: "md" })).join("")}</div>
            ${pokeImgHtml(poke.name, { size: 104, dex: poke.dex, round: true })}
          </div>
          <div class="ov-moves">
            ${[0, 1, 2, 3].map((mi) => moveRow(m.moves?.[mi], moveByName)).join("")}
          </div>
        </div>
      </article>`;
    })
    .join("");

  return `
  <div class="overview-sheet" id="overview-sheet">
    <header class="overview-head">
      <h2 class="overview-title">${esc(team.name || "構築")}</h2>
      <p class="overview-sub">ダメ計　構築概要</p>
    </header>
    <div class="overview-grid">${cards}</div>
  </div>`;
}

export async function downloadOverviewPng(sheetEl, filename) {
  const imgs = [...sheetEl.querySelectorAll("img")];
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((res) => {
            img.addEventListener("load", res, { once: true });
            img.addEventListener("error", res, { once: true });
          })
    )
  );
  // フォールバック連鎖の猶予
  await new Promise((r) => setTimeout(r, 400));

  if (typeof window.html2canvas === "function") {
    const canvas = await window.html2canvas(sheetEl, {
      backgroundColor: "#152238",
      scale: 2,
      useCORS: true,
      allowTaint: true,
    });
    triggerDownload(canvas.toDataURL("image/png"), filename);
    return;
  }
  alert("画像ライブラリの読み込みに失敗しました。再読み込みしてから試してください。");
}

function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "team-overview.png";
  a.click();
}
