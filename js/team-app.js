import {
  NATURE_TABLE,
  NATURE_STAT_ORDER,
  NEUTRAL_NATURES,
  STAT_KEYS,
  STAT_LABELS,
  EV_MAX_PER,
  EV_MAX_TOTAL,
  calcAllStats,
  emptyEvs,
  totalEv,
  clampEvAssign,
  getNature,
} from "./stats.js?v=20260920a";
import { TYPES } from "./types.js?v=20260920a";
import {
  loadTeams,
  replaceTeamAt,
  clearTeamAt,
  getActiveSlot,
  setActiveSlot,
  applyUiMode,
  isMegaName,
  emptyMember,
} from "./team-store.js?v=20260920a";
import {
  $,
  textMatchesQuery,
  openModal,
  closeModal,
  loadGameData,
  wireModalClose,
  wireUiModeToggle,
} from "./common.js?v=20260920a";
import { buildOverviewHtml, downloadOverviewPng } from "./overview.js?v=20260920a";

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
  slot: 0,
  teams: loadTeams(),
};

function team() {
  return state.teams[state.slot];
}

function pokeByName(name) {
  return state.pokemon.find((p) => p.name === name) || null;
}
function moveByName(name) {
  return state.moves.find((m) => m.name === name) || null;
}
function learnable(name) {
  return state.learnsets[name] || [];
}

function toast(msg) {
  const tip = document.createElement("div");
  tip.className = "toast";
  tip.textContent = msg;
  document.body.appendChild(tip);
  setTimeout(() => tip.remove(), 1400);
}

function persist() {
  replaceTeamAt(state.slot, state.teams[state.slot]);
  state.teams = loadTeams();
}

function syncMegaItem(m) {
  if (isMegaName(m.species)) m.item = "メガストーン";
  else if (m.item === "メガストーン") m.item = "なし";
}

function natureHintHtml(natureName) {
  const n = getNature(natureName);
  if (n.up && n.down) {
    return `<span class="nature-hint"><span class="up">▲${STAT_LABELS[n.up]}</span> <span class="down">▼${STAT_LABELS[n.down]}</span></span>`;
  }
  return `<span class="nature-hint">補正なし</span>`;
}

function natureArrow(stat, natureName) {
  const n = getNature(natureName);
  if (n.up === stat) return `<span class="arrow up">▲</span>`;
  if (n.down === stat) return `<span class="arrow down">▼</span>`;
  return "";
}

function moveSlotHtml(moveName, slotLabel) {
  const mv = moveByName(moveName);
  if (!mv) {
    return `<div class="k">${slotLabel}</div><div class="title move-empty">＋ 技</div>`;
  }
  return `<div class="k">${slotLabel}</div><div class="title">${mv.name}</div><div class="sub"><span class="type-pill type-${mv.type}">${mv.type}</span></div>`;
}

function renderSlotTabs() {
  $("slot-tabs").innerHTML = state.teams
    .map((t, i) => {
      const filled = t.members.filter((m) => m.species).length;
      return `<button type="button" class="slot-tab ${i === state.slot ? "active" : ""}" data-slot="${i}">
        ${t.name || `構築${i + 1}`}
        <span class="sub">${filled}/6</span>
      </button>`;
    })
    .join("");
}

function renderMembers() {
  const t = team();
  $("team-name").value = t.name || "";
  $("team-memo").value = t.memo || "";
  renderSlotTabs();

  $("member-grid").innerHTML = t.members
    .map((m, i) => {
      const poke = pokeByName(m.species);
      const stats = poke ? calcAllStats(poke.baseStats, m.evs || emptyEvs(), m.nature) : null;
      const evSum = totalEv(m.evs || emptyEvs());
      const abs = poke?.abilities || [];
      const mega = isMegaName(m.species);
      return `
      <section class="member-card ${poke ? "filled" : "empty"}" data-i="${i}">
        <div class="member-head">
          <span class="slot-no">#${i + 1}</span>
          <button type="button" class="selector-btn compact" data-pick-poke="${i}">
            <div class="title">${m.species || "＋ ポケモンを選ぶ"}</div>
            <div class="sub">${poke ? poke.types.join(" / ") : "タップ"}</div>
          </button>
          ${poke ? `<button type="button" class="icon-btn danger" data-clear="${i}" title="枠を空に">消</button>` : ""}
        </div>
        ${
          poke
            ? `
        <div class="field-row">
          <div>
            <div class="field-label">特性</div>
            <select data-ability="${i}">${abs
              .map((a) => `<option value="${a}" ${a === m.ability ? "selected" : ""}>${a}</option>`)
              .join("")}</select>
          </div>
          <div>
            <div class="field-label">性格</div>
            <button type="button" class="nature-btn" data-open-nature="${i}">${m.nature}</button>
            ${natureHintHtml(m.nature)}
          </div>
        </div>
        <button type="button" class="selector-btn compact" data-pick-item="${i}">
          <div class="k">持ち物${mega ? "（メガ固定）" : ""}</div>
          <div class="title">${m.item || "なし"}${mega ? " 🔒" : ""}</div>
        </button>
        <div class="ev-block">
          <div class="ev-block-head">
            <strong>努力値</strong>
            <span class="ev-sum ${evSum > EV_MAX_TOTAL ? "warn" : ""}" data-ev-sum="${i}">合計 ${evSum} / ${EV_MAX_TOTAL}</span>
          </div>
          <div class="ev-list">
            ${STAT_KEYS.map(
              (k) => `
              <div class="ev-line">
                <div class="ev-line-name">${STAT_LABELS[k]}${natureArrow(k, m.nature)}</div>
                <input class="ev-num" type="number" inputmode="numeric" min="0" max="${EV_MAX_PER}" step="1" data-ev="${i}" data-stat="${k}" value="${m.evs?.[k] || 0}" />
                <div class="ev-line-controls">
                  <button type="button" class="ev-btn" data-ev-set="${i}" data-stat="${k}" data-ev-val="0">0</button>
                  <button type="button" class="ev-btn primary32" data-ev-set="${i}" data-stat="${k}" data-ev-val="32">32</button>
                </div>
                <div class="ev-line-stat">実数 <strong data-stat-v="${i}" data-stat="${k}">${stats[k]}</strong></div>
              </div>`
            ).join("")}
          </div>
          <div class="ev-presets">
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="as">AS</button>
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="cs">CS</button>
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="hb">HB</button>
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="hd">HD</button>
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="clear">全0</button>
          </div>
        </div>
        <div class="move-block">
          <strong>技</strong>
          <div class="move-slots">
            ${[0, 1, 2, 3]
              .map(
                (mi) => `
              <button type="button" class="selector-btn compact move-slot" data-pick-move="${i}" data-mi="${mi}">
                ${moveSlotHtml(m.moves?.[mi], `技${mi + 1}`)}
              </button>`
              )
              .join("")}
          </div>
        </div>`
            : ""
        }
      </section>`;
    })
    .join("");
}

function refreshEvDisplay(i) {
  const m = team().members[i];
  const poke = pokeByName(m.species);
  if (!poke) return;
  const card = document.querySelector(`.member-card[data-i="${i}"]`);
  if (!card) return;
  const stats = calcAllStats(poke.baseStats, m.evs || emptyEvs(), m.nature);
  const evSum = totalEv(m.evs || emptyEvs());
  const sumEl = card.querySelector(`[data-ev-sum="${i}"]`);
  if (sumEl) {
    sumEl.textContent = `合計 ${evSum} / ${EV_MAX_TOTAL}`;
    sumEl.classList.toggle("warn", evSum > EV_MAX_TOTAL);
  }
  for (const k of STAT_KEYS) {
    const el = card.querySelector(`[data-stat-v="${i}"][data-stat="${k}"]`);
    if (el) el.textContent = String(stats[k]);
    const input = card.querySelector(`input[data-ev="${i}"][data-stat="${k}"]`);
    if (input && document.activeElement !== input) input.value = String(m.evs?.[k] || 0);
  }
}

function applyEvPreset(i, preset) {
  const m = team().members[i];
  let evs = emptyEvs();
  if (preset === "as") {
    evs = clampEvAssign(evs, "atk", 32);
    evs = clampEvAssign(evs, "spe", 32);
    m.nature = "ようき";
  } else if (preset === "cs") {
    evs = clampEvAssign(evs, "spa", 32);
    evs = clampEvAssign(evs, "spe", 32);
    m.nature = "おくびょう";
  } else if (preset === "hb") {
    evs = clampEvAssign(evs, "hp", 32);
    evs = clampEvAssign(evs, "def", 32);
    m.nature = "ずぶとい";
  } else if (preset === "hd") {
    evs = clampEvAssign(evs, "hp", 32);
    evs = clampEvAssign(evs, "spd", 32);
    m.nature = "おだやか";
  }
  m.evs = evs;
  persist();
  renderMembers();
}

function openPokePicker(i) {
  openModal(
    "ポケモン",
    `<div class="list-filters">
      <input type="search" id="q" placeholder="名前検索" />
      <select id="poke-type"><option value="">タイプ</option>${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
    </div>
    <div id="list"></div>`
  );
  const render = () => {
    const q = $("q").value;
    const typ = $("poke-type").value;
    const rows = state.pokemon
      .filter((p) => textMatchesQuery(p.name, q))
      .filter((p) => !typ || p.types.includes(typ))
      .slice(0, 80)
      .map(
        (p) => `<button type="button" class="list-item" data-name="${p.name}">
        <div>${p.name}</div>
        <div class="s">${p.types.join("/")}　H${p.baseStats.hp} A${p.baseStats.atk} B${p.baseStats.def} C${p.baseStats.spa} D${p.baseStats.spd} S${p.baseStats.spe}</div>
      </button>`
      )
      .join("");
    $("list").innerHTML = rows || `<p class="hint">見つかりません</p>`;
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        const poke = pokeByName(el.dataset.name);
        const m = team().members[i];
        m.species = poke.name;
        m.ability = poke.abilities?.[0] || "";
        m.moves = ["", "", "", ""];
        syncMegaItem(m);
        persist();
        closeModal();
        renderMembers();
      });
    });
  };
  $("q").addEventListener("input", render);
  $("poke-type").addEventListener("change", render);
  render();
}

function openItemPicker(i) {
  const m = team().members[i];
  if (isMegaName(m.species)) return;
  openModal(
    "持ち物",
    `<div class="list-filters"><input type="search" id="q" placeholder="検索" /></div><div id="list"></div>`
  );
  const render = () => {
    const q = $("q").value;
    const rows = [{ name: "なし", effect: "" }, ...state.items]
      .filter((it) => textMatchesQuery(it.name, q) || textMatchesQuery(it.effect || "", q))
      .slice(0, 100)
      .map(
        (it) => `<button type="button" class="list-item" data-name="${it.name}">
        <div>${it.name}</div><div class="s">${(it.effect || "").slice(0, 80)}</div>
      </button>`
      )
      .join("");
    $("list").innerHTML = rows;
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        m.item = el.dataset.name;
        persist();
        closeModal();
        renderMembers();
      });
    });
  };
  $("q").addEventListener("input", render);
  render();
}

function openMovePicker(i, mi) {
  const m = team().members[i];
  const allowed = learnable(m.species);
  openModal(
    `技${mi + 1}`,
    `<div class="list-filters">
      <input type="search" id="q" placeholder="検索" />
      <select id="move-type"><option value="">タイプ</option>${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
    </div>
    <div id="list"></div>`
  );
  const render = () => {
    const q = $("q").value;
    const typ = $("move-type").value;
    let list = state.moves;
    if (allowed.length) list = list.filter((mv) => allowed.includes(mv.name));
    const rows = [
      `<button type="button" class="list-item" data-name=""><div>（なし）</div></button>`,
      ...list
        .filter((mv) => textMatchesQuery(mv.name, q))
        .filter((mv) => !typ || mv.type === typ)
        .slice(0, 100)
        .map(
          (mv) => `<button type="button" class="list-item" data-name="${mv.name}">
          <div>${mv.name}</div>
          <div class="s">${mv.type} ${mv.category}　威力 ${mv.power ?? "—"}</div>
        </button>`
        ),
    ].join("");
    $("list").innerHTML = rows;
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        m.moves[mi] = el.dataset.name || "";
        persist();
        closeModal();
        renderMembers();
      });
    });
  };
  $("q").addEventListener("input", render);
  $("move-type").addEventListener("change", render);
  render();
}

function openNaturePicker(i) {
  const m = team().members[i];
  const current = m.nature;
  const head = NATURE_STAT_ORDER.map((k) => `<th class="up-h">▲${STAT_LABELS[k]}</th>`).join("");
  const rows = NATURE_STAT_ORDER.map((down) => {
    const cells = NATURE_STAT_ORDER.map((up) => {
      if (up === down) return `<td class="na">—</td>`;
      const name = NATURE_TABLE[down][up];
      const sel = name === current ? " selected" : "";
      return `<td><button type="button" class="nat-cell${sel}" data-nature="${name}">${name}</button></td>`;
    }).join("");
    return `<tr><th class="down-h">▼${STAT_LABELS[down]}</th>${cells}</tr>`;
  }).join("");
  const neutrals = NEUTRAL_NATURES.map(
    (n) => `<button type="button" class="nat-cell${n === current ? " selected" : ""}" data-nature="${n}">${n}</button>`
  ).join("");
  openModal(
    "性格",
    `<p class="hint">縦＝下がる / 横＝上がる</p>
    <div class="nature-table-wrap"><table class="nature-table"><tr><th></th>${head}</tr>${rows}</table></div>
    <div class="neutral-row">無補正 ${neutrals}</div>`
  );
  $("modal-body").querySelectorAll("[data-nature]").forEach((btn) => {
    btn.addEventListener("click", () => {
      m.nature = btn.dataset.nature;
      persist();
      closeModal();
      renderMembers();
    });
  });
}

function showOverview() {
  const t = team();
  const html = buildOverviewHtml(t, pokeByName, moveByName);
  openModal(
    "構築概要",
    `<div class="overview-actions">
      <button type="button" class="icon-btn primary" id="btn-save-png">画像として保存</button>
    </div>
    <div class="overview-wrap">${html}</div>`
  );
  $("btn-save-png").addEventListener("click", async () => {
    const sheet = $("overview-sheet");
    if (!sheet) return;
    const safe = (t.name || "構築").replace(/[\\/:*?"<>|]/g, "_");
    await downloadOverviewPng(sheet, `${safe}-概要.png`);
    toast("画像を保存しました");
  });
}

function wire() {
  wireModalClose();
  wireUiModeToggle();

  $("slot-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-slot]");
    if (!btn) return;
    // save current fields first
    team().name = ($("team-name").value || "").trim() || `構築${state.slot + 1}`;
    team().memo = $("team-memo").value || "";
    persist();
    state.slot = setActiveSlot(Number(btn.dataset.slot));
    state.teams = loadTeams();
    renderMembers();
  });

  $("team-name").addEventListener("change", () => {
    team().name = ($("team-name").value || "").trim() || `構築${state.slot + 1}`;
    persist();
    renderSlotTabs();
  });
  $("team-memo").addEventListener("input", () => {
    team().memo = $("team-memo").value || "";
  });
  $("team-memo").addEventListener("change", () => persist());
  $("team-memo").addEventListener("blur", () => persist());

  $("btn-save").addEventListener("click", () => {
    team().name = ($("team-name").value || "").trim() || `構築${state.slot + 1}`;
    team().memo = $("team-memo").value || "";
    team().members.forEach(syncMegaItem);
    persist();
    toast("保存しました");
    renderSlotTabs();
  });

  $("btn-clear").addEventListener("click", () => {
    if (!confirm("この構築を空にしますか？")) return;
    state.teams[state.slot] = clearTeamAt(state.slot);
    state.teams = loadTeams();
    renderMembers();
    toast("クリアしました");
  });

  $("btn-overview").addEventListener("click", () => {
    team().name = ($("team-name").value || "").trim() || `構築${state.slot + 1}`;
    team().memo = $("team-memo").value || "";
    persist();
    showOverview();
  });

  $("member-grid").addEventListener("click", (e) => {
    const t = e.target.closest(
      "[data-pick-poke],[data-pick-item],[data-pick-move],[data-clear],[data-open-nature],[data-ev-set],[data-ev-preset]"
    );
    if (!t) return;
    if (t.dataset.pickPoke != null) openPokePicker(Number(t.dataset.pickPoke));
    if (t.dataset.pickItem != null) openItemPicker(Number(t.dataset.pickItem));
    if (t.dataset.pickMove != null) openMovePicker(Number(t.dataset.pickMove), Number(t.dataset.mi));
    if (t.dataset.openNature != null) openNaturePicker(Number(t.dataset.openNature));
    if (t.dataset.clear != null) {
      team().members[Number(t.dataset.clear)] = emptyMember();
      persist();
      renderMembers();
    }
    if (t.dataset.evSet != null) {
      const i = Number(t.dataset.evSet);
      const m = team().members[i];
      m.evs = clampEvAssign(m.evs || emptyEvs(), t.dataset.stat, Number(t.dataset.evVal) || 0);
      persist();
      refreshEvDisplay(i);
    }
    if (t.dataset.evPreset != null) applyEvPreset(Number(t.dataset.evPreset), t.dataset.preset);
  });

  $("member-grid").addEventListener("change", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.dataset.ability != null) {
      team().members[Number(el.dataset.ability)].ability = el.value;
      persist();
    }
  });

  $("member-grid").addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el.dataset.ev == null) return;
    const i = Number(el.dataset.ev);
    const m = team().members[i];
    m.evs = clampEvAssign(m.evs || emptyEvs(), el.dataset.stat, Number(el.value) || 0);
    if (Number(el.value) !== (m.evs[el.dataset.stat] || 0)) el.value = String(m.evs[el.dataset.stat] || 0);
    persist();
    refreshEvDisplay(i);
  });

  $("member-grid").addEventListener(
    "wheel",
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.dataset.ev == null) return;
      e.preventDefault();
      const i = Number(el.dataset.ev);
      const m = team().members[i];
      const cur = Number(el.value) || 0;
      const next = cur + (e.deltaY < 0 ? 1 : -1);
      m.evs = clampEvAssign(m.evs || emptyEvs(), el.dataset.stat, next);
      el.value = String(m.evs[el.dataset.stat] || 0);
      persist();
      refreshEvDisplay(i);
    },
    { passive: false }
  );
}

async function main() {
  applyUiMode();
  const data = await loadGameData();
  Object.assign(state, data);
  state.slot = getActiveSlot();
  state.teams = loadTeams();
  renderMembers();
  wire();
}

main();
