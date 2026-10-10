/**
 * ダメ計 — 構築を攻撃側 / 受け側どちらにも置ける
 */
import {
  STAT_KEYS,
  STAT_LABELS,
  EV_MAX_PER,
  EV_MAX_TOTAL,
  ATK_VISIBLE_STATS,
  calcAllStatsFromMults,
  emptyEvs,
  emptyRanks,
  emptyNatureMults,
  natureMultsFromName,
  clampNatureMult,
  totalEv,
  clampEvAssign,
} from "./stats.js?v=20260922h";
import { TYPES } from "./types.js?v=20260922a";
import { calculateDamage } from "./damage.js?v=20260922k";
import {
  loadTeams,
  getActiveSlot,
  setActiveSlot,
  applyUiMode,
  isMegaName,
} from "./team-store.js?v=20260922k";
import {
  $,
  textMatchesQuery,
  openModal,
  closeModal,
  loadGameData,
  wireModalClose,
  wireUiModeToggle,
} from "./common.js?v=20260922c";
import { typeIconHtml, pokeImgHtml, itemImgHtml } from "./media.js?v=20260922d";
import { openMovePickerList } from "./move-picker.js?v=20260922a";

const NATURE_OPTS = [0.9, 1, 1.1];

function emptyFreeSide() {
  return {
    poke: null,
    item: "なし",
    ability: "",
    evs: emptyEvs(),
    natureMults: emptyNatureMults(),
    ranks: emptyRanks(),
    currentHp: null,
  };
}

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
  teams: loadTeams(),
  slot: getActiveSlot(),
  myIndex: 0,
  /** team | free */
  mode: "team",
  /** 構築メンバーの役割: atk=攻撃する / def=受ける */
  teamRole: "atk",
  move: null,
  editSide: "atk",
  /** 相手（図鑑から・構築モード） */
  opp: null,
  oppItem: "なし",
  oppAbility: "",
  oppEvs: emptyEvs(),
  oppNatureMults: emptyNatureMults(),
  oppRanks: emptyRanks(),
  oppCurrentHp: null,
  /** 自由選択モード */
  freeAtk: emptyFreeSide(),
  freeDef: emptyFreeSide(),
  /** 構築メンバー側の補正 */
  teamNatureMults: emptyNatureMults(),
  teamRanks: emptyRanks(),
  teamCurrentHp: null,
  resultsOpen: true,
};

function isFreeMode() {
  return state.mode === "free";
}

function pokeByName(name) {
  return state.pokemon.find((p) => p.name === name) || null;
}
function moveByName(name) {
  return state.moves.find((m) => m.name === name) || null;
}
function team() {
  return state.teams[state.slot];
}
function myMember() {
  return team()?.members?.[state.myIndex] || null;
}
function teamIsAtk() {
  return state.teamRole !== "def";
}

function escAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

function syncTeamFromMember() {
  const m = myMember();
  const poke = m?.species ? pokeByName(m.species) : null;
  state.teamNatureMults = natureMultsFromName(m?.nature || "がんばりや");
  state.teamRanks = emptyRanks();
  if (poke) {
    const stats = calcAllStatsFromMults(poke.baseStats, m.evs || emptyEvs(), state.teamNatureMults);
    state.teamCurrentHp = stats.hp;
  } else {
    state.teamCurrentHp = null;
  }
}

function fieldOpts() {
  return {
    attackerStatus: $("atk-status")?.value || "なし",
    weather: $("weather")?.value || "なし",
    field: $("field")?.value || "なし",
    screens: {
      reflect: !!$("reflect")?.checked,
      lightScreen: !!$("lightScreen")?.checked,
      auroraVeil: !!$("auroraVeil")?.checked,
    },
    critical: !!$("critical")?.checked,
    gravity: !!$("gravity")?.checked,
    helpBoost: !!$("helpBoost")?.checked,
    stealthRock: !!$("stealthRock")?.checked,
    spikes: Number($("spikes")?.value || 0),
    leechSeed: !!$("leechSeed")?.checked,
    burn: !!$("burnChip")?.checked,
    poison: $("poisonChip")?.checked ? "どく" : null,
    movingLast: !!$("movingLast")?.checked,
  };
}

function ensureMyIndex() {
  const t = team();
  if (!t) {
    state.myIndex = 0;
    return;
  }
  if (t.members[state.myIndex]?.species) return;
  const first = t.members.findIndex((m) => m.species);
  state.myIndex = first >= 0 ? first : 0;
}

function renderTeamSelect() {
  state.teams = loadTeams();
  $("team-slot").innerHTML = state.teams
    .map((t, i) => {
      const n = t.members.filter((m) => m.species).length;
      return `<option value="${i}" ${i === state.slot ? "selected" : ""}>${t.name}（${n}/6）</option>`;
    })
    .join("");
}

function setCalcMode(mode) {
  const next = mode === "free" ? "free" : "team";
  if (state.mode === next) return;
  state.mode = next;
  state.move = null;
  document.querySelectorAll(".mode-tab").forEach((btn) => {
    const on = btn.dataset.mode === state.mode;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  const tb = $("team-toolbar");
  const rt = $("role-tabs");
  if (tb) tb.hidden = isFreeMode();
  if (rt) rt.hidden = isFreeMode();
  setEditSide("atk");
  renderAll();
  recalc();
}

function setTeamRole(role) {
  const next = role === "def" ? "def" : "atk";
  if (state.teamRole === next) return;
  state.teamRole = next;
  state.move = null;
  document.querySelectorAll(".role-tab").forEach((btn) => {
    const on = btn.dataset.role === state.teamRole;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  setEditSide("atk");
  renderAll();
  recalc();
}

function setEditSide(side) {
  state.editSide = side === "def" ? "def" : "atk";
  document.querySelectorAll(".side-tab").forEach((btn) => {
    const on = btn.dataset.side === state.editSide;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  $("side-atk").hidden = state.editSide !== "atk";
  $("side-def").hidden = state.editSide !== "def";
}

function natureMultRow(statKeys, mults, key) {
  return `<div class="stat-edit-block">
    <div class="stat-edit-label">性格補正</div>
    <div class="stat-edit-grid">
      ${statKeys
        .map((k) => {
          const cur = clampNatureMult(mults[k] ?? 1);
          return `<div class="stat-edit-cell">
            <span class="stat-edit-name">${STAT_LABELS[k]}</span>
            <div class="mult-group" data-key="${key}" data-stat="${k}">
              ${NATURE_OPTS.map(
                (v) =>
                  `<button type="button" class="mult-btn ${cur === v ? "on" : ""}" data-mult="${v}">${v}</button>`
              ).join("")}
            </div>
          </div>`;
        })
        .join("")}
    </div>
  </div>`;
}

function rankRow(statKeys, ranks, key) {
  return `<div class="stat-edit-block">
    <div class="stat-edit-label">ランク補正</div>
    <div class="stat-edit-grid">
      ${statKeys
        .map((k) => {
          const r = ranks[k] || 0;
          const sign = r > 0 ? `+${r}` : String(r);
          return `<div class="stat-edit-cell">
            <span class="stat-edit-name">${STAT_LABELS[k]}</span>
            <div class="rank-group">
              <button type="button" class="rank-btn" data-rank-key="${key}" data-rank-stat="${k}" data-rank-delta="-1" aria-label="下げる">−</button>
              <span class="rank-val ${r > 0 ? "up" : r < 0 ? "down" : ""}">${sign}</span>
              <button type="button" class="rank-btn" data-rank-key="${key}" data-rank-stat="${k}" data-rank-delta="1" aria-label="上げる">＋</button>
            </div>
          </div>`;
        })
        .join("")}
    </div>
  </div>`;
}

function hpRow(key, current, maxHp) {
  const cur = current == null ? maxHp : Math.max(1, Math.min(maxHp, current));
  return `<div class="stat-edit-block">
    <div class="stat-edit-label">現在HP</div>
    <div class="hp-edit">
      <input type="number" inputmode="numeric" min="1" max="${maxHp}" step="1" data-hp-key="${key}" value="${cur}" />
      <span class="hp-max">/ ${maxHp}</span>
      <button type="button" class="ev-btn" data-hp-fill="${key}" data-hp-val="${maxHp}">満タン</button>
      <button type="button" class="ev-btn" data-hp-fill="${key}" data-hp-val="${Math.max(1, Math.floor(maxHp * 0.75))}">3/4</button>
      <button type="button" class="ev-btn" data-hp-fill="${key}" data-hp-val="${Math.max(1, Math.floor(maxHp * 0.5))}">1/2</button>
    </div>
  </div>`;
}

function teamPickHtml(containerId) {
  ensureMyIndex();
  const t = team();
  return t.members
    .map((m, i) => {
      if (!m.species) {
        return `<button type="button" class="rev-mine empty" disabled>#${i + 1}</button>`;
      }
      const poke = pokeByName(m.species);
      return `<button type="button" class="rev-mine ${i === state.myIndex ? "active" : ""}" data-mine="${i}">
        ${pokeImgHtml(m.species, { size: 40, dex: poke?.dex, round: true })}
        <span class="rev-mine-text">
          <strong>${m.species}</strong>
          <span class="s">${itemImgHtml(m.item, { size: 16 })} ${m.item || "なし"}</span>
        </span>
      </button>`;
    })
    .join("");
}

function wireTeamPick(container) {
  container.querySelectorAll("[data-mine]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.myIndex = Number(btn.dataset.mine);
      if (teamIsAtk()) state.move = null;
      syncTeamFromMember();
      renderAll();
      recalc();
    });
  });
}

function oppSlotHtml(label) {
  if (!state.opp) {
    return `<button type="button" class="poke-slot foe-slot" data-open-opp>
      <strong>${label}</strong><span class="meta">タップで図鑑から選択</span>
    </button>`;
  }
  const poke = state.opp;
  return `<button type="button" class="poke-slot foe-slot" data-open-opp>
    ${pokeImgHtml(poke.name, { size: 48, dex: poke.dex, round: true })}
    <div><strong>${poke.name}</strong><span class="meta">${poke.types.join(" / ")}</span></div>
  </button>`;
}

function teamDetailHtml(asSide) {
  const m = myMember();
  if (!m?.species) {
    return `<p class="hint">構築にポケモンを入れてください。<a href="./team.html">構築を編集</a></p>`;
  }
  const poke = pokeByName(m.species);
  if (!poke) return `<p class="hint">データなし: ${m.species}</p>`;

  const evs = m.evs || emptyEvs();
  const stats = calcAllStatsFromMults(poke.baseStats, evs, state.teamNatureMults);
  if (state.teamCurrentHp == null) state.teamCurrentHp = stats.hp;
  state.teamCurrentHp = Math.max(1, Math.min(stats.hp, state.teamCurrentHp));
  const item = isMegaName(poke.name) ? "メガストーン" : m.item || "なし";
  const natureKeys = asSide === "atk" ? ATK_VISIBLE_STATS : ["atk", "def", "spa", "spd", "spe"];
  const rankKeys = asSide === "atk" ? ATK_VISIBLE_STATS : ["atk", "def", "spa", "spd"];

  let movesHtml = "";
  if (asSide === "atk") {
    movesHtml = `<div class="team-moves-quick">
      ${[0, 1, 2, 3]
        .map((i) => {
          const mv = moveByName(m.moves?.[i]);
          if (!mv) return `<button type="button" class="move-chip empty" disabled>技${i + 1}</button>`;
          const active = state.move?.name === mv.name ? "active" : "";
          return `<button type="button" class="move-chip ${active}" data-quick-move="${escAttr(mv.name)}">${typeIconHtml(mv.type, { size: "sm" })} ${mv.name}</button>`;
        })
        .join("")}
    </div>`;
  }

  return `
    <div class="atk-summary">
      <div class="atk-summary-main">
        ${pokeImgHtml(poke.name, { size: 64, dex: poke.dex, round: true })}
        <div>
          <div class="ov-name">${poke.name} <span class="tag-mine">構築</span></div>
          <div class="ov-meta">${(poke.types || []).map((t) => typeIconHtml(t, { size: "sm" })).join("")} ${m.ability || poke.abilities?.[0] || "—"}</div>
          <div class="ov-meta ov-item-row">${itemImgHtml(item, { size: 22 })}<span>${item}</span></div>
          <div class="ov-meta muted">努力 ${totalEv(evs)}/${EV_MAX_TOTAL}</div>
        </div>
      </div>
      <div class="stats-inline">
        ${STAT_KEYS.map((k) => `<div class="cell"><span>${STAT_LABELS[k]}</span><strong>${stats[k]}</strong></div>`).join("")}
      </div>
      ${hpRow("team", state.teamCurrentHp, stats.hp)}
      ${natureMultRow(natureKeys, state.teamNatureMults, "team")}
      ${rankRow(rankKeys, state.teamRanks, "team")}
      ${movesHtml}
    </div>`;
}

function oppDetailHtml(asSide) {
  if (!state.opp) return "";
  const poke = state.opp;
  const abs = poke.abilities || [];
  if (!state.oppAbility || !abs.includes(state.oppAbility)) state.oppAbility = abs[0] || "";
  if (isMegaName(poke.name)) state.oppItem = "メガストーン";
  const stats = calcAllStatsFromMults(poke.baseStats, state.oppEvs, state.oppNatureMults);
  if (state.oppCurrentHp == null) state.oppCurrentHp = stats.hp;
  state.oppCurrentHp = Math.max(1, Math.min(stats.hp, state.oppCurrentHp));
  const evSum = totalEv(state.oppEvs);
  const mega = isMegaName(poke.name);
  const natureKeys = asSide === "atk" ? ATK_VISIBLE_STATS.concat(["spe"]) : ["atk", "def", "spa", "spd", "spe"];
  const rankKeys = asSide === "atk" ? ATK_VISIBLE_STATS : ["atk", "def", "spa", "spd"];

  return `
    <div class="base-stats-line">種族 H${poke.baseStats.hp} A${poke.baseStats.atk} B${poke.baseStats.def} C${poke.baseStats.spa} D${poke.baseStats.spd} S${poke.baseStats.spe}</div>
    <div class="stats-inline">
      ${STAT_KEYS.map((k) => `<div class="cell"><span>${STAT_LABELS[k]}</span><strong data-stat="${k}">${stats[k]}</strong></div>`).join("")}
    </div>
    ${hpRow("opp", state.oppCurrentHp, stats.hp)}
    <div class="ctrl-row">
      <label>特性</label>
      <select data-field="ability">${abs.map((a) => `<option value="${a}" ${a === state.oppAbility ? "selected" : ""}>${a}</option>`).join("")}</select>
    </div>
    <div class="ctrl-row">
      <label>持ち物</label>
      <button type="button" class="nature-btn item-pick-btn" data-open-item ${mega ? "disabled" : ""}>
        ${itemImgHtml(state.oppItem, { size: 20 })} ${state.oppItem}${mega ? " 🔒" : ""}
      </button>
    </div>
    ${natureMultRow([...new Set(natureKeys)], state.oppNatureMults, "opp")}
    ${rankRow(rankKeys, state.oppRanks, "opp")}
    <div class="ev-row cols-3">
      ${STAT_KEYS.map(
        (k) => `
        <div class="ev-cell">
          <label>${STAT_LABELS[k]}</label>
          <div class="ev-controls">
            <input type="number" inputmode="numeric" min="0" max="${EV_MAX_PER}" step="1" data-ev="${k}" value="${state.oppEvs[k] || 0}" />
            <button type="button" class="ev-btn" data-ev-set="${k}" data-ev-val="0">0</button>
            <button type="button" class="ev-btn primary32" data-ev-set="${k}" data-ev-val="32">32</button>
          </div>
        </div>`
      ).join("")}
    </div>
    <div class="ev-total ${evSum > EV_MAX_TOTAL ? "warn" : ""}">努力値合計 ${evSum} / ${EV_MAX_TOTAL}</div>
  `;
}

function freeSlotHtml(side, label) {
  const fs = side === "atk" ? state.freeAtk : state.freeDef;
  if (!fs.poke) {
    return `<button type="button" class="poke-slot foe-slot" data-open-free="${side}">
      <strong>${label}</strong><span class="meta">タップで図鑑から選択</span>
    </button>`;
  }
  const poke = fs.poke;
  return `<button type="button" class="poke-slot foe-slot" data-open-free="${side}">
    ${pokeImgHtml(poke.name, { size: 48, dex: poke.dex, round: true })}
    <div><strong>${poke.name}</strong><span class="meta">${poke.types.join(" / ")}</span></div>
  </button>`;
}

function freeDetailHtml(side, asSide) {
  const fs = side === "atk" ? state.freeAtk : state.freeDef;
  if (!fs.poke) return "";
  const poke = fs.poke;
  const abs = poke.abilities || [];
  if (!fs.ability || !abs.includes(fs.ability)) fs.ability = abs[0] || "";
  if (isMegaName(poke.name)) fs.item = "メガストーン";
  const stats = calcAllStatsFromMults(poke.baseStats, fs.evs, fs.natureMults);
  if (fs.currentHp == null) fs.currentHp = stats.hp;
  fs.currentHp = Math.max(1, Math.min(stats.hp, fs.currentHp));
  const evSum = totalEv(fs.evs);
  const mega = isMegaName(poke.name);
  const natureKeys = asSide === "atk" ? ATK_VISIBLE_STATS.concat(["spe"]) : ["atk", "def", "spa", "spd", "spe"];
  const rankKeys = asSide === "atk" ? ATK_VISIBLE_STATS : ["atk", "def", "spa", "spd"];
  const key = side === "atk" ? "freeAtk" : "freeDef";

  return `
    <div class="base-stats-line">種族 H${poke.baseStats.hp} A${poke.baseStats.atk} B${poke.baseStats.def} C${poke.baseStats.spa} D${poke.baseStats.spd} S${poke.baseStats.spe}</div>
    <div class="stats-inline">
      ${STAT_KEYS.map((k) => `<div class="cell"><span>${STAT_LABELS[k]}</span><strong data-stat="${k}">${stats[k]}</strong></div>`).join("")}
    </div>
    ${hpRow(key, fs.currentHp, stats.hp)}
    <div class="ctrl-row">
      <label>特性</label>
      <select data-free-side="${side}" data-field="ability">${abs.map((a) => `<option value="${a}" ${a === fs.ability ? "selected" : ""}>${a}</option>`).join("")}</select>
    </div>
    <div class="ctrl-row">
      <label>持ち物</label>
      <button type="button" class="nature-btn item-pick-btn" data-open-free-item="${side}" ${mega ? "disabled" : ""}>
        ${itemImgHtml(fs.item, { size: 20 })} ${fs.item}${mega ? " 🔒" : ""}
      </button>
    </div>
    ${natureMultRow([...new Set(natureKeys)], fs.natureMults, key)}
    ${rankRow(rankKeys, fs.ranks, key)}
    <div class="ev-row cols-3">
      ${STAT_KEYS.map(
        (k) => `
        <div class="ev-cell">
          <label>${STAT_LABELS[k]}</label>
          <div class="ev-controls">
            <input type="number" inputmode="numeric" min="0" max="${EV_MAX_PER}" step="1" data-free-ev="${side}" data-ev="${k}" value="${fs.evs[k] || 0}" />
            <button type="button" class="ev-btn" data-free-ev-set="${side}" data-ev-set="${k}" data-ev-val="0">0</button>
            <button type="button" class="ev-btn primary32" data-free-ev-set="${side}" data-ev-set="${k}" data-ev-val="32">32</button>
          </div>
        </div>`
      ).join("")}
    </div>
    <div class="ev-total ${evSum > EV_MAX_TOTAL ? "warn" : ""}">努力値合計 ${evSum} / ${EV_MAX_TOTAL}</div>
  `;
}

function renderAll() {
  const atkPick = $("atk-pick");
  const defPick = $("def-pick");
  const atkDetail = $("atk-detail");
  const defDetail = $("def-detail");

  if (isFreeMode()) {
    atkPick.innerHTML = freeSlotHtml("atk", "攻撃側を選ぶ");
    defPick.innerHTML = freeSlotHtml("def", "防御側を選ぶ");
    atkPick.querySelector("[data-open-free]")?.addEventListener("click", () => openFreePicker("atk"));
    defPick.querySelector("[data-open-free]")?.addEventListener("click", () => openFreePicker("def"));
    if (state.freeAtk.poke) {
      atkDetail.hidden = false;
      atkDetail.innerHTML = freeDetailHtml("atk", "atk");
      wireFreeDetail(atkDetail, "atk");
    } else {
      atkDetail.hidden = true;
      atkDetail.innerHTML = "";
    }
    if (state.freeDef.poke) {
      defDetail.hidden = false;
      defDetail.innerHTML = freeDetailHtml("def", "def");
      wireFreeDetail(defDetail, "def");
    } else {
      defDetail.hidden = true;
      defDetail.innerHTML = "";
    }
    updateMoveBtn();
    return;
  }

  if (teamIsAtk()) {
    atkPick.innerHTML = `<div class="rev-mine-grid">${teamPickHtml()}</div>`;
    wireTeamPick(atkPick);
    atkDetail.hidden = false;
    atkDetail.innerHTML = teamDetailHtml("atk");
    wireTeamDetail(atkDetail);

    defPick.innerHTML = oppSlotHtml("相手（防御）を選ぶ");
    defPick.querySelector("[data-open-opp]")?.addEventListener("click", openOppPicker);
    if (state.opp) {
      defDetail.hidden = false;
      defDetail.innerHTML = oppDetailHtml("def");
      wireOppDetail(defDetail);
    } else {
      defDetail.hidden = true;
      defDetail.innerHTML = "";
    }
  } else {
    atkPick.innerHTML = oppSlotHtml("相手（攻撃）を選ぶ");
    atkPick.querySelector("[data-open-opp]")?.addEventListener("click", openOppPicker);
    if (state.opp) {
      atkDetail.hidden = false;
      atkDetail.innerHTML = oppDetailHtml("atk");
      wireOppDetail(atkDetail);
    } else {
      atkDetail.hidden = true;
      atkDetail.innerHTML = "";
    }

    defPick.innerHTML = `<div class="rev-mine-grid">${teamPickHtml()}</div>`;
    wireTeamPick(defPick);
    defDetail.hidden = false;
    defDetail.innerHTML = teamDetailHtml("def");
    wireTeamDetail(defDetail);
  }

  updateMoveBtn();
}

function wireFreeDetail(root, side) {
  wireStatEditors(root);
  root.querySelector("[data-open-free-item]")?.addEventListener("click", () => openFreeItemPicker(side));
  root.querySelectorAll("[data-free-ev-set]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fs = side === "atk" ? state.freeAtk : state.freeDef;
      fs.evs = clampEvAssign(fs.evs, btn.dataset.evSet, Number(btn.dataset.evVal) || 0);
      renderAll();
      recalc();
    });
  });
  root.querySelectorAll("[data-free-ev]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const fs = side === "atk" ? state.freeAtk : state.freeDef;
      fs.evs = clampEvAssign(fs.evs, inp.dataset.ev, Number(inp.value) || 0);
      renderAll();
      recalc();
    });
    inp.addEventListener("input", () => {
      const fs = side === "atk" ? state.freeAtk : state.freeDef;
      fs.evs = clampEvAssign(fs.evs, inp.dataset.ev, Number(inp.value) || 0);
      recalc();
    });
  });
  root.querySelector("[data-field=ability]")?.addEventListener("change", (e) => {
    const fs = side === "atk" ? state.freeAtk : state.freeDef;
    fs.ability = e.target.value;
    recalc();
  });
}

function wireTeamDetail(root) {
  root.querySelectorAll("[data-quick-move]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.move = moveByName(btn.dataset.quickMove);
      updateMoveBtn();
      renderAll();
      recalc();
    });
  });
  wireStatEditors(root);
}

function wireOppDetail(root) {
  wireStatEditors(root);
}

function wireStatEditors(root) {
  root.querySelectorAll(".mult-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".mult-group");
      if (!group) return;
      const key = group.dataset.key;
      const stat = group.dataset.stat;
      const mult = clampNatureMult(btn.dataset.mult);
      if (key === "team") state.teamNatureMults[stat] = mult;
      else if (key === "freeAtk") state.freeAtk.natureMults[stat] = mult;
      else if (key === "freeDef") state.freeDef.natureMults[stat] = mult;
      else state.oppNatureMults[stat] = mult;
      renderAll();
      recalc();
    });
  });
  root.querySelectorAll("[data-rank-delta]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.rankKey;
      const stat = btn.dataset.rankStat;
      const delta = Number(btn.dataset.rankDelta) || 0;
      const ranks =
        key === "team"
          ? state.teamRanks
          : key === "freeAtk"
            ? state.freeAtk.ranks
            : key === "freeDef"
              ? state.freeDef.ranks
              : state.oppRanks;
      ranks[stat] = Math.max(-6, Math.min(6, (ranks[stat] || 0) + delta));
      renderAll();
      recalc();
    });
  });
  root.querySelectorAll("[data-hp-key]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const key = inp.dataset.hpKey;
      const v = Math.max(1, Number(inp.value) || 1);
      if (key === "team") state.teamCurrentHp = v;
      else if (key === "freeAtk") state.freeAtk.currentHp = v;
      else if (key === "freeDef") state.freeDef.currentHp = v;
      else state.oppCurrentHp = v;
      renderAll();
      recalc();
    });
  });
  root.querySelectorAll("[data-hp-fill]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.hpFill;
      const v = Number(btn.dataset.hpVal) || 1;
      if (key === "team") state.teamCurrentHp = v;
      else if (key === "freeAtk") state.freeAtk.currentHp = v;
      else if (key === "freeDef") state.freeDef.currentHp = v;
      else state.oppCurrentHp = v;
      renderAll();
      recalc();
    });
  });
}

function updateMoveBtn() {
  const btn = $("move-btn");
  const who = isFreeMode() ? "攻撃側" : teamIsAtk() ? "構築" : "相手";
  if (!state.move) {
    btn.innerHTML = `<div class="k">${who}の技</div><div class="title">技を選択</div>`;
    return;
  }
  const mv = state.move;
  btn.innerHTML = `<div class="k">${who}の技</div><div class="title">${typeIconHtml(mv.type, { size: "sm" })} ${mv.name}</div><div class="sub">${mv.category}　威力 ${mv.power ?? "—"}</div>`;
}

function sidesForCalc() {
  if (isFreeMode()) {
    const a = state.freeAtk;
    const d = state.freeDef;
    if (!a.poke || !d.poke || !state.move) return null;
    const atkItem = isMegaName(a.poke.name) ? "メガストーン" : a.item || "なし";
    const defItem = isMegaName(d.poke.name) ? "メガストーン" : d.item || "なし";
    const atkStats = calcAllStatsFromMults(a.poke.baseStats, a.evs, a.natureMults);
    const defStats = calcAllStatsFromMults(d.poke.baseStats, d.evs, d.natureMults);
    const atkHp = a.currentHp ?? atkStats.hp;
    const defHp = d.currentHp ?? defStats.hp;
    return {
      attackerPoke: a.poke,
      defenderPoke: d.poke,
      attackerEvs: a.evs,
      defenderEvs: d.evs,
      attackerNatureMults: a.natureMults,
      defenderNatureMults: d.natureMults,
      attackerAbility: a.ability || a.poke.abilities?.[0] || "",
      defenderAbility: d.ability || d.poke.abilities?.[0] || "",
      attackerItem: atkItem,
      defenderItem: defItem,
      attackerRanks: a.ranks,
      defenderRanks: d.ranks,
      attackerHpRatio: atkStats.hp > 0 ? atkHp / atkStats.hp : 1,
      defenderCurrentHp: defHp,
      atkName: a.poke.name,
      defName: d.poke.name,
      atkItemLabel: atkItem,
      defItemLabel: defItem,
    };
  }

  const m = myMember();
  const teamPoke = m?.species ? pokeByName(m.species) : null;
  if (!teamPoke || !state.opp || !state.move) return null;

  const teamItem = isMegaName(teamPoke.name) ? "メガストーン" : m.item || "なし";
  const teamEvs = m.evs || emptyEvs();
  const teamStats = calcAllStatsFromMults(teamPoke.baseStats, teamEvs, state.teamNatureMults);
  const teamHp = state.teamCurrentHp ?? teamStats.hp;

  const opp = state.opp;
  const oppItem = isMegaName(opp.name) ? "メガストーン" : state.oppItem || "なし";
  const oppStats = calcAllStatsFromMults(opp.baseStats, state.oppEvs, state.oppNatureMults);
  const oppHp = state.oppCurrentHp ?? oppStats.hp;

  if (teamIsAtk()) {
    return {
      attackerPoke: teamPoke,
      defenderPoke: opp,
      attackerEvs: teamEvs,
      defenderEvs: state.oppEvs,
      attackerNatureMults: state.teamNatureMults,
      defenderNatureMults: state.oppNatureMults,
      attackerAbility: m.ability || teamPoke.abilities?.[0] || "",
      defenderAbility: state.oppAbility || opp.abilities?.[0] || "",
      attackerItem: teamItem,
      defenderItem: oppItem,
      attackerRanks: state.teamRanks,
      defenderRanks: state.oppRanks,
      attackerHpRatio: teamStats.hp > 0 ? teamHp / teamStats.hp : 1,
      defenderCurrentHp: oppHp,
      atkName: teamPoke.name,
      defName: opp.name,
      atkItemLabel: teamItem,
      defItemLabel: oppItem,
    };
  }
  return {
    attackerPoke: opp,
    defenderPoke: teamPoke,
    attackerEvs: state.oppEvs,
    defenderEvs: teamEvs,
    attackerNatureMults: state.oppNatureMults,
    defenderNatureMults: state.teamNatureMults,
    attackerAbility: state.oppAbility || opp.abilities?.[0] || "",
    defenderAbility: m.ability || teamPoke.abilities?.[0] || "",
    attackerItem: oppItem,
    defenderItem: teamItem,
    attackerRanks: state.oppRanks,
    defenderRanks: state.teamRanks,
    attackerHpRatio: oppStats.hp > 0 ? oppHp / oppStats.hp : 1,
    defenderCurrentHp: teamHp,
    atkName: opp.name,
    defName: teamPoke.name,
    atkItemLabel: oppItem,
    defItemLabel: teamItem,
  };
}

function formatResult(result, sides) {
  if (result?.error) {
    return `<div class="bulk-card"><div class="who">計算不可</div><div class="ko">${result.error}</div></div>`;
  }
  const field = fieldOpts();
  const pack = result.critical && field.critical ? result.critical : result.normal || result;
  const minP = pack.percentMin ?? result.percentMin;
  const maxP = pack.percentMax ?? result.percentMax;
  const dmgMin = pack.min ?? result.min;
  const dmgMax = pack.max ?? result.max;
  const ko = pack.koText || result.koText || "";
  const hp = result.defenderHp ?? "—";
  const hpMax = result.defenderHpMax;
  const hpLabel = hpMax && hpMax !== hp ? `${hp}/${hpMax}` : String(hp);
  const pct = minP != null && maxP != null ? `${minP}〜${maxP}%` : "—";
  const hi = Number(maxP) || 0;
  const tone = hi >= 100 ? "tone-bad" : hi >= 50 ? "tone-warn" : "tone-ok";
  const details = (result.details || []).map((d) => `<li>${d}</li>`).join("");
  const roleNote = isFreeMode() ? "自由選択" : teamIsAtk() ? "構築→相手" : "相手→構築";
  const critPack = result.critical;
  const critLine =
    critPack && !field.critical
      ? `<div class="result-crit">急所 ${critPack.percentMin}〜${critPack.percentMax}%　${critPack.min}〜${critPack.max}　${critPack.koText || ""}</div>`
      : "";
  return `<div class="bulk-card ${tone} result-main">
    <div class="result-matchup">${sides.atkName} → ${sides.defName}</div>
    <div class="result-pct ${tone}">${pct}</div>
    <div class="result-ko">${ko || "—"}</div>
    <div class="result-dmg">ダメージ ${dmgMin}〜${dmgMax}　受けHP ${hpLabel}</div>
    <div class="meta">${roleNote}　${itemImgHtml(sides.atkItemLabel, { size: 18 })} ${sides.atkItemLabel}　vs　${itemImgHtml(sides.defItemLabel, { size: 18 })} ${sides.defItemLabel}</div>
    ${critLine}
    <details class="result-details-wrap"><summary>計算詳細</summary><ul class="result-details">${details}</ul></details>
  </div>`;
}

function recalc() {
  const box = $("bulk-results");
  const sides = sidesForCalc();
  $("results-title").textContent = sides ? `${sides.atkName} → ${sides.defName}` : "ダメージ結果";

  if (!sides) {
    const need = isFreeMode()
      ? "攻撃側・技・防御側を選ぶとダメージが出ます"
      : teamIsAtk()
        ? "構築・技・相手（防御）を選ぶとダメージが出ます"
        : "相手（攻撃）・技・構築を選ぶとダメージが出ます";
    box.innerHTML = `<p class="hint">${need}</p>`;
    $("result-mini").textContent = "未計算";
    const bar = $("result-mini-bar");
    if (bar) bar.textContent = "未計算";
    return;
  }

  const result = calculateDamage({
    move: state.move,
    defenderStatus: "なし",
    ...sides,
    ...fieldOpts(),
  });

  box.innerHTML = formatResult(result, sides);
  const field = fieldOpts();
  const pack = !result.error
    ? result.critical && field.critical
      ? result.critical
      : result.normal || result
    : null;
  const maxP = pack?.percentMax ?? result.percentMax;
  const minP = pack?.percentMin ?? result.percentMin;
  const ko = pack?.koText || result.koText || "";
  const mini =
    result.error
      ? "—"
      : maxP != null
        ? `${minP}〜${maxP}%　${ko}`
        : "計算済";
  $("result-mini").textContent = maxP != null ? `${Math.round(Number(maxP))}%` : mini;
  const bar = $("result-mini-bar");
  if (bar) bar.textContent = mini;
}

function openPokeListModal(title, onPick) {
  openModal(
    title,
    `<div class="list-filters">
      <input type="search" id="q" placeholder="名前検索" />
      <select id="poke-type"><option value="">タイプ</option>${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
    </div><div id="list"></div>`
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
        <div style="display:flex;gap:8px;align-items:center">${pokeImgHtml(p.name, { size: 36, dex: p.dex, round: true })}
          <div><div>${p.name}</div><div class="s">${p.types.join("/")}</div></div>
        </div>
      </button>`
      )
      .join("");
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => onPick(pokeByName(el.dataset.name)));
    });
  };
  $("q").addEventListener("input", render);
  $("poke-type").addEventListener("change", render);
  render();
}

function openOppPicker() {
  const title = teamIsAtk() ? "相手（防御側）" : "相手（攻撃側）";
  openPokeListModal(title, (poke) => {
    state.opp = poke;
    state.oppAbility = state.opp.abilities?.[0] || "";
    state.oppItem = isMegaName(state.opp.name) ? "メガストーン" : "なし";
    state.oppEvs = emptyEvs();
    state.oppNatureMults = emptyNatureMults();
    state.oppRanks = emptyRanks();
    state.oppCurrentHp = null;
    if (!teamIsAtk()) state.move = null;
    closeModal();
    setEditSide(teamIsAtk() ? "def" : "atk");
    renderAll();
    recalc();
  });
}

function openFreePicker(side) {
  openPokeListModal(side === "atk" ? "攻撃側" : "防御側", (poke) => {
    const fs = side === "atk" ? state.freeAtk : state.freeDef;
    fs.poke = poke;
    fs.ability = poke.abilities?.[0] || "";
    fs.item = isMegaName(poke.name) ? "メガストーン" : "なし";
    fs.evs = emptyEvs();
    fs.natureMults = emptyNatureMults();
    fs.ranks = emptyRanks();
    fs.currentHp = null;
    if (side === "atk") state.move = null;
    closeModal();
    setEditSide(side);
    renderAll();
    recalc();
  });
}

function openFreeItemPicker(side) {
  const fs = side === "atk" ? state.freeAtk : state.freeDef;
  if (isMegaName(fs.poke?.name)) return;
  openModal("持ち物", `<div class="list-filters"><input type="search" id="q" /></div><div id="list"></div>`);
  const render = () => {
    const q = $("q").value;
    $("list").innerHTML = [{ name: "なし", effect: "" }, ...state.items]
      .filter((it) => textMatchesQuery(it.name, q))
      .slice(0, 120)
      .map(
        (it) => `<button type="button" class="list-item" data-name="${it.name}">
        <div style="display:flex;gap:8px;align-items:center">${itemImgHtml(it.name, { size: 28 })}
          <div><div>${it.name}</div><div class="s">${(it.effect || "").slice(0, 60)}</div></div>
        </div>
      </button>`
      )
      .join("");
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        fs.item = el.dataset.name;
        closeModal();
        renderAll();
        recalc();
      });
    });
  };
  $("q").addEventListener("input", render);
  render();
}

function openMovePicker() {
  let species = null;
  if (isFreeMode()) {
    species = state.freeAtk.poke?.name || null;
  } else if (teamIsAtk()) {
    const m = myMember();
    species = m?.species || null;
  } else {
    species = state.opp?.name || null;
  }
  if (!species) {
    alert(
      isFreeMode()
        ? "先に攻撃側のポケモンを選んでください"
        : teamIsAtk()
          ? "先に構築のポケモンを選んでください"
          : "先に相手（攻撃側）を選んでください"
    );
    return;
  }
  openMovePickerList({
    title: isFreeMode() ? "攻撃側の技" : teamIsAtk() ? "構築の技" : "相手の技",
    moves: state.moves,
    learnsets: state.learnsets,
    species,
    allowStatus: false,
    onPick: (mv) => {
      state.move = mv;
      updateMoveBtn();
      renderAll();
      recalc();
    },
  });
}

function openItemPicker() {
  if (isMegaName(state.opp?.name)) return;
  openModal("相手持ち物", `<div class="list-filters"><input type="search" id="q" /></div><div id="list"></div>`);
  const render = () => {
    const q = $("q").value;
    $("list").innerHTML = [{ name: "なし", effect: "" }, ...state.items]
      .filter((it) => textMatchesQuery(it.name, q))
      .slice(0, 120)
      .map(
        (it) => `<button type="button" class="list-item" data-name="${it.name}">
        <div style="display:flex;gap:8px;align-items:center">${itemImgHtml(it.name, { size: 28 })}
          <div><div>${it.name}</div><div class="s">${(it.effect || "").slice(0, 60)}</div></div>
        </div>
      </button>`
      )
      .join("");
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        state.oppItem = el.dataset.name;
        closeModal();
        renderAll();
        recalc();
      });
    });
  };
  $("q").addEventListener("input", render);
  render();
}

function updateResultsOpen() {
  document.body.classList.toggle("results-collapsed", !state.resultsOpen);
  const btn = $("btn-results-toggle");
  if (btn) btn.textContent = state.resultsOpen ? "閉じる" : "結果";
}

function wire() {
  wireModalClose();
  wireUiModeToggle();

  document.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.addEventListener("click", () => setCalcMode(btn.dataset.mode));
  });
  document.querySelectorAll(".role-tab").forEach((btn) => {
    btn.addEventListener("click", () => setTeamRole(btn.dataset.role));
  });
  document.querySelectorAll(".side-tab").forEach((btn) => {
    btn.addEventListener("click", () => setEditSide(btn.dataset.side));
  });

  $("btn-results-toggle")?.addEventListener("click", () => {
    state.resultsOpen = !state.resultsOpen;
    updateResultsOpen();
  });

  $("team-slot").addEventListener("change", () => {
    state.slot = setActiveSlot(Number($("team-slot").value));
    state.teams = loadTeams();
    state.move = null;
    ensureMyIndex();
    syncTeamFromMember();
    renderAll();
    recalc();
  });

  $("move-btn").addEventListener("click", openMovePicker);

  const onOppDetailClick = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.openItem !== undefined || t.closest?.("[data-open-item]")) {
      openItemPicker();
      return;
    }
    if (t.dataset.evSet) {
      state.oppEvs = clampEvAssign(state.oppEvs, t.dataset.evSet, Number(t.dataset.evVal) || 0);
      renderAll();
      recalc();
    }
  };
  const onOppDetailChange = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.field === "ability") {
      state.oppAbility = t.value;
      recalc();
    }
    if (t.dataset.ev) {
      state.oppEvs = clampEvAssign(state.oppEvs, t.dataset.ev, Number(t.value) || 0);
      t.value = String(state.oppEvs[t.dataset.ev]);
      renderAll();
      recalc();
    }
  };
  const onOppDetailInput = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.ev) return;
    state.oppEvs = clampEvAssign(state.oppEvs, t.dataset.ev, Number(t.value) || 0);
    if (state.opp) {
      const stats = calcAllStatsFromMults(state.opp.baseStats, state.oppEvs, state.oppNatureMults);
      for (const k of STAT_KEYS) {
        const el = document.querySelector(`#atk-detail [data-stat="${k}"], #def-detail [data-stat="${k}"]`);
        if (el) el.textContent = String(stats[k]);
      }
      if (state.oppCurrentHp != null) state.oppCurrentHp = Math.min(state.oppCurrentHp, stats.hp);
    }
    recalc();
  };

  $("atk-detail").addEventListener("click", onOppDetailClick);
  $("def-detail").addEventListener("click", onOppDetailClick);
  $("atk-detail").addEventListener("change", onOppDetailChange);
  $("def-detail").addEventListener("change", onOppDetailChange);
  $("atk-detail").addEventListener("input", onOppDetailInput);
  $("def-detail").addEventListener("input", onOppDetailInput);

  [
    "weather",
    "field",
    "atk-status",
    "spikes",
    "critical",
    "reflect",
    "lightScreen",
    "auroraVeil",
    "stealthRock",
    "leechSeed",
    "burnChip",
    "poisonChip",
    "gravity",
    "helpBoost",
    "movingLast",
  ].forEach((id) => {
    $(id)?.addEventListener("change", recalc);
  });

  $("btn-edit-team")?.addEventListener("click", () => {
    location.href = "./team.html";
  });
}

async function main() {
  applyUiMode();
  const data = await loadGameData();
  Object.assign(state, data);
  state.teams = loadTeams();
  state.slot = getActiveSlot();
  ensureMyIndex();
  syncTeamFromMember();
  renderTeamSelect();
  setEditSide("atk");
  document.querySelectorAll(".role-tab").forEach((btn) => {
    const on = btn.dataset.role === state.teamRole;
    btn.classList.toggle("on", on);
  });
  renderAll();
  updateResultsOpen();
  wire();
  recalc();
}

main();
