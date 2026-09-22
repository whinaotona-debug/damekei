import { calcStat, applyRank, emptyEvs } from "./stats.js?v=20260920h";
import { applyUiMode } from "./team-store.js?v=20260922c";
import { $, textMatchesQuery, openModal, closeModal, loadGameData, wireModalClose, wireUiModeToggle } from "./common.js?v=20260922c";
import { pokeImgHtml } from "./media.js?v=20260920m";

const state = { pokemon: [], a: null, b: null };

function effectiveSpe(poke, nature, ev, item, rank, tailwind, paralyzed) {
  let spe = calcStat(poke.baseStats.spe, Number(ev) || 0, nature, "spe");
  spe = applyRank(spe, Number(rank) || 0);
  if (item === "こだわりスカーフ") spe = Math.floor(spe * 1.5);
  if (item === "くろいてっきゅう" || item === "きょうせいギプス") spe = Math.floor(spe * 0.5);
  if (tailwind) spe = Math.floor(spe * 2);
  if (paralyzed) spe = Math.floor(spe * 0.5);
  return spe;
}

function pick(side) {
  openModal("ポケモン", `<div class="list-filters"><input id="q" /></div><div id="list"></div>`);
  const ren = () => {
    $("list").innerHTML = state.pokemon
      .filter((p) => textMatchesQuery(p.name, $("q").value))
      .slice(0, 80)
      .map(
        (p) =>
          `<button type="button" class="list-item" data-n="${p.name}"><div style="display:flex;gap:8px;align-items:center">${pokeImgHtml(p.name, { size: 36, dex: p.dex, round: true })}${p.name}<div class="s">S種族 ${p.baseStats.spe}</div></div></button>`
      )
      .join("");
    $("list").querySelectorAll("[data-n]").forEach((b) =>
      b.addEventListener("click", () => {
        state[side] = state.pokemon.find((p) => p.name === b.dataset.n);
        closeModal();
        render();
      })
    );
  };
  $("q").addEventListener("input", ren);
  ren();
}

function render() {
  for (const [side, id] of [["a", "pick-a"], ["b", "pick-b"]]) {
    const p = state[side];
    const el = $(id);
    if (!p) el.innerHTML = `<div class="title">選ぶ</div>`;
    else
      el.innerHTML = `<div class="title" style="display:flex;gap:8px;align-items:center">${pokeImgHtml(p.name, { size: 40, dex: p.dex, round: true })}${p.name}</div><div class="sub">種族S ${p.baseStats.spe}</div>`;
  }
}

function run() {
  const out = $("speed-out");
  if (!state.a || !state.b) {
    out.innerHTML = `<p class="hint">2匹選んでください</p>`;
    return;
  }
  const speA = effectiveSpe(
    state.a,
    $("nat-a").value.trim() || "がんばりや",
    $("ev-a").value,
    $("item-a").value,
    $("rank-a").value,
    $("tail-a").checked,
    $("para-a").checked
  );
  const speB = effectiveSpe(
    state.b,
    $("nat-b").value.trim() || "がんばりや",
    $("ev-b").value,
    $("item-b").value,
    $("rank-b").value,
    $("tail-b").checked,
    $("para-b").checked
  );
  const tr = $("trick-room").checked;
  let first;
  let second;
  let note;
  if (speA === speB) {
    note = "同速（乱数 or 行動順依存）";
    first = second = null;
  } else if (!tr) {
    first = speA > speB ? "A" : "B";
    second = first === "A" ? "B" : "A";
    note = `通常：${first} が先攻`;
  } else {
    first = speA < speB ? "A" : "B";
    second = first === "A" ? "B" : "A";
    note = `トリル：遅い ${first} が先攻`;
  }
  out.innerHTML = `
    <article class="rev-card">
      <div class="rev-ev">${state.a.name}　実効S <strong>${speA}</strong></div>
      <div class="rev-ev">${state.b.name}　実効S <strong>${speB}</strong></div>
      <div class="rev-nat">${note}</div>
      <div class="rev-roll">差 ${Math.abs(speA - speB)}${tr ? "（トリル反転）" : ""}</div>
    </article>`;
}

async function main() {
  applyUiMode();
  wireUiModeToggle();
  wireModalClose();
  const data = await loadGameData();
  state.pokemon = data.pokemon;
  $("pick-a").addEventListener("click", () => pick("a"));
  $("pick-b").addEventListener("click", () => pick("b"));
  $("btn-run").addEventListener("click", run);
  ["nat-a","nat-b","ev-a","ev-b","item-a","item-b","rank-a","rank-b","tail-a","tail-b","para-a","para-b","trick-room"].forEach((id) => {
    $(id)?.addEventListener("change", () => { if (state.a && state.b) run(); });
  });
}
main();
