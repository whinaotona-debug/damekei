import {
  emptyEvs,
  emptyRanks,
  STAT_LABELS,
} from "./stats.js?v=20260922i";
import { TYPES } from "./types.js?v=20260922a";
import {
  loadTeams,
  getActiveSlot,
  setActiveSlot,
  applyUiMode,
} from "./team-store.js?v=20260922c";
import {
  $,
  textMatchesQuery,
  openModal,
  closeModal,
  loadGameData,
  wireModalClose,
  wireUiModeToggle,
} from "./common.js?v=20260922c";
import { typeIconHtml, pokeImgHtml } from "./media.js?v=20260922d";
import { openMovePickerList } from "./move-picker.js?v=20260922a";
import {
  reverseOffense,
  reverseDefense,
  parseObservedDamage,
} from "./reverse.js?v=20260922j";

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
  category: "物理",
  atkRank: 0,
  defRank: 0,
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
  return state.teams[state.slot] || state.teams[0] || null;
}
function myMember() {
  const t = team();
  if (!t?.members?.length) return null;
  return t.members[state.myIndex] || null;
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
  if (!t) {
    $("my-pick").innerHTML = `<p class="hint">構築がありません</p>`;
    return;
  }
  $("my-pick").innerHTML = t.members
    .map((m, i) => {
      if (!m.species) {
        return `<button type="button" class="rev-mine empty" disabled>#${i + 1} 空き</button>`;
      }
      const poke = pokeByName(m.species);
      return `<button type="button" class="rev-mine ${i === state.myIndex ? "active" : ""}" data-mine="${i}">
        ${pokeImgHtml(m.species, { size: 40, dex: poke?.dex, round: true })}
        <span class="rev-mine-text"><strong>${m.species}</strong></span>
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

function catNow() {
  return $("rev-cat")?.value === "特殊" ? "特殊" : "物理";
}

function rankMeta() {
  const phys = catNow() === "物理";
  const mode = $("rev-mode")?.value || "offense";
  return {
    atkStat: phys ? "atk" : "spa",
    defStat: phys ? "def" : "spd",
    atkName: phys ? "攻撃" : "特攻",
    defName: phys ? "防御" : "特防",
    atkWho: mode === "defense" ? "自分" : "相手",
    defWho: mode === "defense" ? "相手" : "自分",
  };
}

function renderRanks() {
  const box = $("rev-ranks");
  if (!box) return;
  const m = rankMeta();
  const row = (who, name, key, val) => `
    <div class="field-label">${who}の${name}ランク</div>
    <div class="rank-group">
      <button type="button" class="rank-btn" data-rev-rank="${key}" data-rank-delta="-1" aria-label="下げる">−</button>
      <span class="rank-val ${val > 0 ? "up" : val < 0 ? "down" : ""}">${val > 0 ? `+${val}` : String(val)}</span>
      <button type="button" class="rank-btn" data-rev-rank="${key}" data-rank-delta="1" aria-label="上げる">＋</button>
    </div>`;
  box.innerHTML = `<div class="field-row">
    <div>${row(m.atkWho, m.atkName, "atk", state.atkRank)}</div>
    <div>${row(m.defWho, m.defName, "def", state.defRank)}</div>
  </div>`;
  const hint = $("rev-stat-hint");
  if (hint) {
    hint.textContent =
      catNow() === "物理"
        ? "物理技 → 殴った側は攻撃の努力値、受け側は防御の努力値"
        : "特殊技 → 殴った側は特攻の努力値、受け側は特防の努力値";
  }
  box.querySelectorAll("[data-rev-rank]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.dataset.rankDelta) || 0;
      if (btn.dataset.revRank === "atk") {
        state.atkRank = Math.max(-6, Math.min(6, state.atkRank + delta));
      } else {
        state.defRank = Math.max(-6, Math.min(6, state.defRank + delta));
      }
      renderRanks();
    });
  });
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

  const meta = rankMeta();
  const attackerRanks = emptyRanks();
  const defenderRanks = emptyRanks();
  attackerRanks[meta.atkStat] = state.atkRank;
  defenderRanks[meta.defStat] = state.defRank;

  const opts = {
    myPoke,
    myMember: m,
    foePoke: state.foe,
    move: state.move,
    observed,
    foeItem: state.foeItem,
    foeAbility: state.foeAbility,
    category: catNow(),
    attackerRanks,
    defenderRanks,
    ...fieldOpts(),
  };

  const rows = mode === "defense" ? reverseDefense(opts) : reverseOffense(opts);
  if (!rows.length) {
    out.innerHTML = `<p class="hint">一致する努力値・性格補正が見つかりませんでした。ダメージや条件を確認してください。</p>`;
    return;
  }

  const title =
    mode === "defense"
      ? `自分が殴った → 相手のHPと${meta.defName}`
      : `相手に殴られた → 相手の${meta.atkName}`;

  out.innerHTML = `
    <h3 class="rev-result-title">${title}</h3>
    <p class="hint">観測 ${observed.minDmg === observed.maxDmg ? observed.minDmg : `${observed.minDmg}〜${observed.maxDmg}`}　／　生ダメージ・回復差し引き表示のどちらでも照合</p>
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
  if (!species) {
    alert(mode === "defense" ? "先に自分のポケモンを選んでください" : "先に相手ポケモンを選んでください");
    return;
  }
  openMovePickerList({
    title: "技",
    moves: state.moves,
    learnsets: state.learnsets,
    species,
    allowStatus: false,
    onPick: (mv) => {
      state.move = mv;
      if (mv.category === "物理" || mv.category === "特殊") {
        state.category = mv.category;
        if ($("rev-cat")) $("rev-cat").value = mv.category;
      }
      renderMove();
      renderRanks();
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
  renderRanks();

  $("team-slot").addEventListener("change", () => {
    state.slot = setActiveSlot(Number($("team-slot").value));
    state.teams = loadTeams();
    const t = team();
    state.myIndex = t?.members?.findIndex((m) => m.species) ?? 0;
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
    renderRanks();
  });
  $("rev-cat")?.addEventListener("change", () => {
    state.category = catNow();
    renderRanks();
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
  const t = team();
  const idx = t?.members?.findIndex((m) => m.species) ?? 0;
  state.myIndex = Math.max(0, idx);
  wire();
}

main();
