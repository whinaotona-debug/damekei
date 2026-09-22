/**
 * 構築概要カード描画 & PNG保存（可能ならアルバム共有）
 */
import { calcAllStats, emptyEvs, STAT_LABELS, STAT_KEYS } from "./stats.js?v=20260920h";
import { typeIconHtml, pokeImgHtml, itemImgHtml } from "./media.js?v=20260922d";

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
            <div class="ov-meta ov-item-row">${itemImgHtml(m.item, { size: 28 })}<span>${esc(m.item || "なし")}</span></div>
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

async function waitForImg(img, ms = 8000) {
  if (img.complete && img.naturalWidth > 0) return true;
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    const t = setTimeout(() => finish(img.complete && img.naturalWidth > 0), ms);
    img.addEventListener(
      "load",
      () => {
        clearTimeout(t);
        finish(true);
      },
      { once: true }
    );
    img.addEventListener(
      "error",
      () => {
        clearTimeout(t);
        finish(false);
      },
      { once: true }
    );
  });
}

/** 外部画像を data URL 化（html2canvas の CORS 切れ対策） */
async function inlineImage(img) {
  const candidates = [];
  try {
    const parsed = JSON.parse(img.getAttribute("data-urls") || "[]");
    if (Array.isArray(parsed)) candidates.push(...parsed);
  } catch (_) {
    /* ignore */
  }
  if (img.currentSrc) candidates.unshift(img.currentSrc);
  else if (img.src) candidates.unshift(img.src);

  // Showdown 等は CORS 無しなので weserv 経由も試す
  const expanded = [];
  for (const url of candidates) {
    if (!url) continue;
    expanded.push(url);
    if (/^https?:\/\/play\.pokemonshowdown\.com\//i.test(url)) {
      const stripped = url.replace(/^https?:\/\//, "");
      expanded.push(`https://images.weserv.nl/?url=${encodeURIComponent(stripped)}`);
    }
  }

  const tried = new Set();
  for (const url of expanded) {
    if (!url || tried.has(url)) continue;
    tried.add(url);
    try {
      if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("./") || url.startsWith("sprites/")) {
        img.removeAttribute("crossorigin");
        img.src = url;
        await waitForImg(img, 4000);
        if (img.naturalWidth > 0) return true;
        continue;
      }
      const res = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      img.removeAttribute("crossorigin");
      img.src = dataUrl;
      await waitForImg(img, 4000);
      if (img.naturalWidth > 0) return true;
    } catch (_) {
      /* try next */
    }
  }
  return img.naturalWidth > 0;
}

export async function downloadOverviewPng(sheetEl, filename) {
  if (typeof window.html2canvas !== "function") {
    alert("画像ライブラリの読み込みに失敗しました。再読み込みしてから試してください。");
    return "error";
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:1100px;padding:0;margin:0;overflow:visible;z-index:-1;pointer-events:none;";
  const clone = sheetEl.cloneNode(true);
  clone.id = "overview-sheet-capture";
  clone.style.cssText =
    "width:1100px;max-width:none;min-width:1100px;box-sizing:border-box;overflow:visible;margin:0;";
  clone.querySelectorAll(".ov-card").forEach((el) => {
    el.style.overflow = "visible";
  });
  clone.querySelectorAll(".ov-left").forEach((el) => {
    el.style.minWidth = "0";
    el.style.overflow = "visible";
  });
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    const imgs = [...clone.querySelectorAll("img")];
    await Promise.all(imgs.map((img) => inlineImage(img)));
    await new Promise((r) => setTimeout(r, 200));

    const canvas = await window.html2canvas(clone, {
      backgroundColor: "#152238",
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 1100,
      width: Math.max(clone.scrollWidth, 1100),
      height: Math.max(clone.scrollHeight, clone.offsetHeight),
    });

    const name = filename || "team-overview.png";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      triggerDownload(canvas.toDataURL("image/png"), name);
      return "download";
    }

    const file = new File([blob], name, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: name,
          text: "構築概要",
        });
        return "shared";
      } catch (err) {
        if (err && err.name === "AbortError") return "cancelled";
      }
    }

    triggerDownload(URL.createObjectURL(blob), name);
    return "download";
  } finally {
    host.remove();
  }
}

function triggerDownload(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename || "team-overview.png";
  a.click();
  if (href.startsWith("blob:")) {
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  }
}
