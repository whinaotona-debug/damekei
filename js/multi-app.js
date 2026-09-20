import { emptyEvs, emptyRanks, clampEvAssign } from "./stats.js?v=20260920h";
import { TYPES } from "./types.js?v=20260920h";
import { calculateDamage } from "./damage.js?v=20260920h";
import { loadTeams, getActiveSlot, setActiveSlot, applyUiMode } from "./team-store.js?v=20260920h";
import { $, textMatchesQuery, openModal, closeModal, loadGameData, wireModalClose, wireUiModeToggle } from "./common.js?v=20260920h";
import { typeIconHtml, pokeImgHtml } from "./media.js?v=20260920h";
import { openMovePickerList } from "./move-picker.js?v=20260920h";

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
  teams: loadTeams(),
  slot: getActiveSlot(),
  atk: null,
  atkItem: "なし",
  move1: null,
  move2: null,
};

function pokeByName(n) { return state.pokemon.find((p) => p.name === n) || null; }
function moveByName(n) { return state.moves.find((m) => m.name === n) || null; }

function atkEvsFor(move) {
  let evs = emptyEvs();
  if (move?.category === "物理") evs = clampEvAssign(evs, "atk", 32);
  else if (move?.category === "特殊") evs = clampEvAssign(evs, "spa", 32);
  return evs;
}

function field() {
  return {
    weather: $("weather")?.value || "なし",
    field: $("field")?.value || "なし",
    screens: {
      reflect: !!$("reflect")?.checked,
      lightScreen: !!$("lightScreen")?.checked,
      auroraVeil: !!$("auroraVeil")?.checked,
    },
    critical: !!$("critical")?.checked,
    attackerRanks: emptyRanks(),
    defenderRanks: emptyRanks(),
  };
}

function oneHit(atk, defPoke, defMember, move) {
  if (!move || move.category === "変化") return { error: "変化技" };
  return calculateDamage({
    attackerPoke: atk,
    defenderPoke: defPoke,
    move,
    attackerEvs: atkEvsFor(move),
    defenderEvs: defMember.evs || emptyEvs(),
    attackerNature: ($("atk-nature").value || "いじっぱり").trim(),
    defenderNature: defMember.nature || "がんばりや",
    attackerAbility: atk.abilities?.[0] || "",
    defenderAbility: defMember.ability || defPoke.abilities?.[0] || "",
    attackerItem: state.atkItem,
    defenderItem: defMember.item || "なし",
    ...field(),
  });
}

function run() {
  const box = $("results");
  const team = state.teams[state.slot];
  if (!state.atk || !state.move1 || !state.move2) {
    box.innerHTML = `<p class="hint">相手・技1・技2を選んでください</p>`;
    return;
  }
  const cards = team.members.map((m, i) => {
    if (!m.species) return `<div class="bulk-card empty"><div class="who">#${i + 1} 空き</div></div>`;
    const def = pokeByName(m.species);
    if (!def) return `<div class="bulk-card"><div class="who">#${i + 1}</div><div class="ko">データなし</div></div>`;
    const r1 = oneHit(state.atk, def, m, state.move1);
    const r2 = oneHit(state.atk, def, m, state.move2);
    if (r1.error || r2.error) {
      return `<div class="bulk-card"><div class="who">#${i + 1} ${m.species}</div><div class="ko">${r1.error || r2.error}</div></div>`;
    }
    const minSum = r1.min + r2.min;
    const maxSum = r1.max + r2.max;
    const hp = r1.defenderHp || r2.defenderHp;
    const pMin = hp ? Math.floor((minSum / hp) * 1000) / 10 : 0;
    const pMax = hp ? Math.floor((maxSum / hp) * 1000) / 10 : 0;
    const tone = pMax >= 100 ? "tone-bad" : pMax >= 50 ? "tone-warn" : "tone-ok";
    return `<div class="bulk-card ${tone}">
      <div class="who">#${i + 1} ${m.species}</div>
      <div class="dmg">${pMin}〜${pMax}%</div>
      <div class="meta">技1 ${r1.min}〜${r1.max} ＋ 技2 ${r2.min}〜${r2.max}</div>
      <div class="ko">合算 ${minSum}〜${maxSum} / HP${hp}</div>
    </div>`;
  });
  box.innerHTML = cards.join("");
}

function renderAtk() {
  const btn = $("btn-atk");
  if (!state.atk) btn.innerHTML = `<div class="k">相手ポケモン</div><div class="title">選ぶ</div>`;
  else btn.innerHTML = `<div class="k">相手ポケモン</div><div class="title" style="display:flex;gap:8px;align-items:center">${pokeImgHtml(state.atk.name, { size: 40, dex: state.atk.dex, round: true })}${state.atk.name}</div>`;
  $("btn-atk-item").textContent = state.atkItem;
}
function renderMoves() {
  for (const [id, mv] of [["btn-move1", state.move1], ["btn-move2", state.move2]]) {
    const el = $(id);
    if (!mv) el.innerHTML = `<div class="k">${id === "btn-move1" ? "技1" : "技2"}</div><div class="title">選ぶ</div>`;
    else el.innerHTML = `<div class="k">${id === "btn-move1" ? "技1" : "技2"}</div><div class="title">${typeIconHtml(mv.type, { size: "sm" })} ${mv.name}</div><div class="sub">${mv.category}　威力 ${mv.power ?? "—"}</div>`;
  }
}

async function main() {
  applyUiMode();
  wireUiModeToggle();
  wireModalClose();
  Object.assign(state, await loadGameData());
  state.teams = loadTeams();
  state.slot = getActiveSlot();
  $("team-slot").innerHTML = state.teams.map((t, i) => `<option value="${i}" ${i === state.slot ? "selected" : ""}>${t.name}</option>`).join("");
  renderAtk();
  renderMoves();

  $("team-slot").addEventListener("change", () => {
    state.slot = setActiveSlot(Number($("team-slot").value));
    state.teams = loadTeams();
  });
  $("btn-atk").addEventListener("click", () => {
    openModal("相手", `<div class="list-filters"><input id="q" placeholder="検索" /></div><div id="list"></div>`);
    const ren = () => {
      const q = $("q").value;
      $("list").innerHTML = state.pokemon.filter((p) => textMatchesQuery(p.name, q)).slice(0, 80)
        .map((p) => `<button type="button" class="list-item" data-n="${p.name}"><div style="display:flex;gap:8px;align-items:center">${pokeImgHtml(p.name,{size:36,dex:p.dex,round:true})}${p.name}</div></button>`).join("");
      $("list").querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => {
        state.atk = pokeByName(b.dataset.n); closeModal(); renderAtk();
      }));
    };
    $("q").addEventListener("input", ren); ren();
  });
  $("btn-atk-item").addEventListener("click", () => {
    openModal("持ち物", `<div class="list-filters"><input id="q" /></div><div id="list"></div>`);
    const ren = () => {
      $("list").innerHTML = [{ name: "なし" }, ...state.items].filter((it) => textMatchesQuery(it.name, $("q").value)).slice(0, 80)
        .map((it) => `<button type="button" class="list-item" data-n="${it.name}">${it.name}</button>`).join("");
      $("list").querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => {
        state.atkItem = b.dataset.n; closeModal(); renderAtk();
      }));
    };
    $("q").addEventListener("input", ren); ren();
  });
  $("btn-move1").addEventListener("click", () => openMovePickerList({
    moves: state.moves,
    learnsets: state.learnsets,
    species: state.atk?.name,
    onPick: (mv) => { state.move1 = mv; renderMoves(); },
  }));
  $("btn-move2").addEventListener("click", () => openMovePickerList({
    moves: state.moves,
    learnsets: state.learnsets,
    species: state.atk?.name,
    onPick: (mv) => { state.move2 = mv; renderMoves(); },
  }));
  $("btn-run").addEventListener("click", run);
}
main();
