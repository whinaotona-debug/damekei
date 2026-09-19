/**
 * 構築概要カード描画 & PNG保存
 */
import { calcAllStats, emptyEvs, STAT_LABELS, STAT_KEYS } from "./stats.js?v=20260920a";

const TYPE_COLORS = {
  ノーマル: "#a8a878",
  ほのお: "#f08030",
  みず: "#6890f0",
  でんき: "#f8d030",
  くさ: "#78c850",
  こおり: "#98d8d8",
  かくとう: "#c03028",
  どく: "#a040a0",
  じめん: "#e0c068",
  ひこう: "#a890f0",
  エスパー: "#f85888",
  むし: "#a8b820",
  いわ: "#b8a038",
  ゴースト: "#705898",
  ドラゴン: "#7038f8",
  あく: "#705848",
  はがね: "#b8b8d0",
  フェアリー: "#ee99ac",
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function typeDot(type) {
  if (!type) return "";
  const c = TYPE_COLORS[type] || "#888";
  return `<span class="ov-type" style="background:${c}" title="${esc(type)}">${esc(type.slice(0, 1))}</span>`;
}

function moveRow(moveName, moveByName) {
  const mv = moveName ? moveByName(moveName) : null;
  if (!mv) {
    return `<div class="ov-move empty"><span class="ov-type ghost">—</span><span>未設定</span></div>`;
  }
  const c = TYPE_COLORS[mv.type] || "#888";
  return `<div class="ov-move"><span class="ov-type" style="background:${c}"></span><span>${esc(mv.name)}</span></div>`;
}

function evShort(evs) {
  const e = evs || emptyEvs();
  const parts = STAT_KEYS.filter((k) => (e[k] || 0) > 0).map((k) => `${STAT_LABELS[k]}${e[k]}`);
  return parts.length ? parts.join(" ") : "努力0";
}

/**
 * @param {object} team
 * @param {(name:string)=>any} pokeByName
 * @param {(name:string)=>any} moveByName
 */
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
            <div class="ov-meta ov-item">${esc(m.item || "なし")}</div>
            <div class="ov-meta muted">${esc(m.nature)}　${esc(evShort(m.evs))}</div>
            <div class="ov-stats">H${stats.hp} A${stats.atk} B${stats.def} C${stats.spa} D${stats.spd} S${stats.spe}</div>
          </div>
          <div class="ov-mid">
            <div class="ov-types">${types.map(typeDot).join("")}</div>
            <div class="ov-sprite" aria-hidden="true">${esc(poke.name.slice(0, 2))}</div>
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
  if (typeof window.html2canvas === "function") {
    const canvas = await window.html2canvas(sheetEl, {
      backgroundColor: "#152238",
      scale: 2,
      useCORS: true,
    });
    triggerDownload(canvas.toDataURL("image/png"), filename);
    return;
  }

  const rect = sheetEl.getBoundingClientRect();
  const scale = Math.min(2, window.devicePixelRatio || 2);
  const w = Math.ceil(sheetEl.scrollWidth || rect.width);
  const h = Math.max(200, Math.ceil(sheetEl.scrollHeight || rect.height));
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#152238";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e8eef8";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(sheetEl.querySelector(".overview-title")?.textContent || "構築", 24, 36);
  ctx.font = "14px sans-serif";
  let y = 70;
  sheetEl.querySelectorAll(".ov-card").forEach((card, i) => {
    const name = card.querySelector(".ov-name")?.textContent || "空き枠";
    const moves = [...card.querySelectorAll(".ov-move span:last-child")].map((s) => s.textContent).join(" / ");
    ctx.fillStyle = "#243552";
    ctx.fillRect(16, y, w - 32, 52);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(`${i + 1}. ${name}`, 28, y + 22);
    ctx.fillStyle = "#b8c4d8";
    ctx.font = "12px sans-serif";
    ctx.fillText(moves || "—", 28, y + 42);
    y += 60;
  });
  triggerDownload(canvas.toDataURL("image/png"), filename);
}

function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "team-overview.png";
  a.click();
}
