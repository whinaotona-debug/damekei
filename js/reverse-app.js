import {
  emptyEvs,
  emptyRanks,
  STAT_LABELS,
} from "./stats.js?v=20260920h";
import { TYPES } from "./types.js?v=20260920h";
import {
  loadTeams,
  getActiveSlot,
  setActiveSlot,
  applyUiMode,
} from "./team-store.js?v=20260920h";
import {
  $,
  textMatchesQuery,
  openModal,
  closeModal,
  loadGameData,
  wireModalClose,
  wireUiModeToggle,
} from "./common.js?v=20260920h";
import { typeIconHtml, pokeImgHtml } from "./media.js?v=20260920m";
import { openMovePickerList } from "./move-picker.js?v=20260920h";
import {
  reverseOffense,
  reverseDefense,
  parseObservedDamage,
} from "./reverse.js?v=20260920h";

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
  teams: loadTeams(),
  slot: getActiveSlot(),
  myIndex: 0,
  foe: null,
  move: null,
  foeItem: "なし",
  foeAbility: "",
};

function pokeByName(name) {
  return state.pokemon.find((p) => p.name === name) || null;
}
function moveByName(name) {
  return state.moves.find((m) => m.name === name) || null;
}
function learnable(name) {
  return state.learnsets[name] || [];
}
function team() {
  return state.teams[state.slot];
}
function myMember() {
  return team().members[state.myIndex];
}

function renderTeamSlot() {
  state.teams = loadTeams();
  $("team-slot").innerHTML = state.teams
    .map((t, i) => {
      const n = t.members.filter((m) => m.species).length;
      return `<option value="${i}" ${i === state.slot ? "selected" : ""}>${t.name}（${n}/6）</option>`;
    })
    .join("");
}

function renderMyPick() {
  const t = team();
  $("my-pick").innerHTML = t.members
    .map((m, i) => {
      if (!m.species) {
        return `<button type="button" class="rev-mine empty" disabled>#${i + 1} 空き</button>`;
      }
      const poke = pokeByName(m.species);
      return `<button type="button" class="rev-mine ${i === state.myIndex ? "active" : ""}" data-mine="${i}">
        ${pokeImgHtml(m.species, { size: 40, dex: poke?.dex, round: true })}
        <span>${m.species}</span>
      </button>`;
    })
    .join("");
}

function renderFoe() {
  const box = $("foe-slot");
  if (!state.foe) {
    box.innerHTML = `<button type="button" class="selector-btn" id="btn-foe"><div class="k">相手ポケモン</div><div class="title">選ぶ</div></button>`;
  } else {
    const abs = state.foe.abilities || [];
    if (!state.foeAbility || !abs.includes(state.foeAbility)) state.foeAbility = abs[0] || "";
    box.innerHTML = `
      <button type="button" class="selector-btn" id="btn-foe">
        <div class="k">相手ポケモン</div>
        <div class="title" style="display:flex;align-items:center;gap:8px">${pokeImgHtml(state.foe.name, { size: 40, dex: state.foe.dex, round: true })}${state.foe.name}</div>
      </button>
      <div class="field-row" style="margin-top:8px">
        <div>
          <div class="field-label">相手特性</div>
          <select id="foe-ability">${abs.map((a) => `<option value="${a}" ${a === state.foeAbility ? "selected" : ""}>${a}</option>`).join("")}</select>
        </div>
        <div>
          <div class="field-label">相手持ち物</div>
          <button type="button" class="nature-btn" id="btn-foe-item">${state.foeItem}</button>
        </div>
      </div>`;
  }
  $("btn-foe")?.addEventListener("click", openFoePicker);
  $("foe-ability")?.addEventListener("change", (e) => {
    state.foeAbility = e.target.value;
  });
  $("btn-foe-item")?.addEventListener("click", openItemPicker);
}

function renderMove() {
  const btn = $("btn-move");
  if (!state.move) {
    btn.innerHTML = `<div class="k">使われた技 / 使った技</div><div class="title">技を選択</div>`;
  } else {
    const mv = state.move;
    btn.innerHTML = `<div class="k">技</div><div class="title">${typeIconHtml(mv.type, { size: "sm" })} ${mv.name}</div><div class="sub">${mv.category}　威力 ${mv.power ?? "—"}</div>`;
  }
}

function fieldOpts() {
  return {
    weather: $("weather")?.value || "なし",
    field: $("field")?.value || "なし",
    attackerStatus: $("atk-status")?.value || "なし",
    defenderStatus: "なし",
    screens: {
      reflect: !!$("reflect")?.checked,
      lightScreen: !!$("lightScreen")?.checked,
      auroraVeil: !!$("auroraVeil")?.checked,
    },
    critical: !!$("critical")?.checked,
    helpBoost: !!$("helpBoost")?.checked,
    gravity: !!$("gravity")?.checked,
    hpNotFull: !!$("hpNotFull")?.checked,
    movingLast: !!$("movingLast")?.checked,
  };
}

function runReverse() {
  const out = $("rev-results");
  const observed = parseObservedDamage($("observed-dmg")?.value);
  const mode = $("rev-mode")?.value || "offense";
  const m = myMember();
  const myPoke = pokeByName(m?.species);

  if (!myPoke) {
    out.innerHTML = `<p class="hint">構築から自分のポケモンを選んでください</p>`;
    return;
  }
  if (!state.foe || !state.move) {
    out.innerHTML = `<p class="hint">相手ポケモンと技を選んでください</p>`;
    return;
  }
  if (state.move.category === "変化") {
    out.innerHTML = `<p class="hint">変化技はダメージ逆算できません</p>`;
    return;
  }
  if (!observed) {
    out.innerHTML = `<p class="hint">観測ダメージを入力（例: 72 または 68-80）</p>`;
    return;
  }

  const opts = {
    myPoke,
    myMember: m,
    foePoke: state.foe,
    move: state.move,
    observed,
    foeItem: state.foeItem,
    foeAbility: state.foeAbility,
    ...fieldOpts(),
  };

  const rows = mode === "defense" ? reverseDefense(opts) : reverseOffense(opts);
  if (!rows.length) {
    out.innerHTML = `<p class="hint">一致する努力値・性格補正が見つかりませんでした。ダメージや条件を確認してください。</p>`;
    return;
  }

  const title =
    mode === "defense"
      ? "自分が殴った → 相手の耐久"
      : "相手に殴られた → 相手の火力";

  out.innerHTML = `
    <h3 class="rev-result-title">${title}</h3>
    <p class="hint">観測 ${observed.minDmg === observed.maxDmg ? observed.minDmg : `${observed.minDmg}〜${observed.maxDmg}`}　／　乱数16通りに含まれる配分を集計</p>
    <div class="rev-cards">
      ${rows
        .map(
          (r) => `
        <article class="rev-card">
          <div class="rev-ev">努力値　${r.labelEv}</div>
          <div class="rev-nat">性格　${r.labelNature}</div>
          <div class="rev-roll">乱数帯 ${r.rollMin}〜${r.rollMax}</div>
        </article>`
        )
        .join("")}
    </div>`;
}

function openFoePicker() {
  openModal(
    "相手ポケモン",
    `<div class="list-filters"><input type="search" id="q" placeholder="名前" /><select id="poke-type"><option value="">タイプ</option>${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></div><div id="list"></div>`
  );
  const render = () => {
    const q = $("q").value;
    const typ = $("poke-type").value;
    $("list").innerHTML = state.pokemon
      .filter((p) => textMatchesQuery(p.name, q))
      .filter((p) => !typ || p.types.includes(typ))
      .slice(0, 80)
      .map(
        (p) => `<button type="button" class="list-item" data-name="${p.name}">
        <div style="display:flex;gap:8px;align-items:center">${pokeImgHtml(p.name, { size: 36, dex: p.dex, round: true })}<div>${p.name}<div class="s">${p.types.join("/")}</div></div></div>
      </button>`
      )
      .join("");
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        state.foe = pokeByName(el.dataset.name);
        state.foeAbility = state.foe.abilities?.[0] || "";
        closeModal();
        renderFoe();
      });
    });
  };
  $("q").addEventListener("input", render);
  $("poke-type").addEventListener("change", render);
  render();
}

function openItemPicker() {
  openModal("相手持ち物", `<div class="list-filters"><input type="search" id="q" /></div><div id="list"></div>`);
  const render = () => {
    const q = $("q").value;
    $("list").innerHTML = [{ name: "なし", effect: "" }, ...state.items]
      .filter((it) => textMatchesQuery(it.name, q))
      .slice(0, 80)
      .map((it) => `<button type="button" class="list-item" data-name="${it.name}"><div>${it.name}</div></button>`)
      .join("");
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        state.foeItem = el.dataset.name;
        closeModal();
        renderFoe();
      });
    });
  };
  $("q").addEventListener("input", render);
  render();
}

function openMovePicker() {
  const mode = $("rev-mode")?.value || "offense";
  const species = mode === "defense" ? myMember()?.species : state.foe?.name;
  openMovePickerList({
    title: "技",
    moves: state.moves,
    learnsets: state.learnsets,
    species: species || "",
    allowStatus: false,
    onPick: (mv) => {
      state.move = mv;
      renderMove();
    },
  });
}

function wire() {
  wireModalClose();
  wireUiModeToggle();
  renderTeamSlot();
  renderMyPick();
  renderFoe();
  renderMove();

  $("team-slot").addEventListener("change", () => {
    state.slot = setActiveSlot(Number($("team-slot").value));
    state.teams = loadTeams();
    state.myIndex = team().members.findIndex((m) => m.species);
    if (state.myIndex < 0) state.myIndex = 0;
    renderMyPick();
  });

  $("my-pick").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mine]");
    if (!btn) return;
    state.myIndex = Number(btn.dataset.mine);
    renderMyPick();
  });

  $("btn-move").addEventListener("click", openMovePicker);
  $("btn-run").addEventListener("click", runReverse);
  $("rev-mode").addEventListener("change", () => {
    state.move = null;
    renderMove();
  });
  $("observed-dmg").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runReverse();
  });
}

async function main() {
  applyUiMode();
  const data = await loadGameData();
  Object.assign(state, data);
  state.teams = loadTeams();
  state.slot = getActiveSlot();
  state.myIndex = Math.max(
    0,
    team().members.findIndex((m) => m.species)
  );
  wire();
}

main();
