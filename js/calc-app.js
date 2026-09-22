/**
 * ダメ計 — 構築1匹 → 相手
 * 攻撃/防御タブ、性格倍率、ランク矢印、現在HP対応
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
import { calculateDamage } from "./damage.js?v=20260922h";
import {
  loadTeams,
  getActiveSlot,
  setActiveSlot,
  applyUiMode,
  isMegaName,
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
import { typeIconHtml, pokeImgHtml, itemImgHtml } from "./media.js?v=20260922d";
import { openMovePickerList } from "./move-picker.js?v=20260922a";

const NATURE_OPTS = [0.9, 1, 1.1];

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
  teams: loadTeams(),
  slot: getActiveSlot(),
  myIndex: 0,
  move: null,
  editSide: "atk",
  foe: null,
  foeItem: "なし",
  foeAbility: "",
  foeEvs: emptyEvs(),
  foeNatureMults: emptyNatureMults(),
  foeRanks: emptyRanks(),
  foeCurrentHp: null,
  atkNatureMults: emptyNatureMults(),
  atkRanks: emptyRanks(),
  atkCurrentHp: null,
  resultsOpen: true,
};

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

function escAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

function syncAtkFromMember() {
  const m = myMember();
  const poke = m?.species ? pokeByName(m.species) : null;
  state.atkNatureMults = natureMultsFromName(m?.nature || "がんばりや");
  state.atkRanks = emptyRanks();
  if (poke) {
    const stats = calcAllStatsFromMults(poke.baseStats, m.evs || emptyEvs(), state.atkNatureMults);
    state.atkCurrentHp = stats.hp;
  } else {
    state.atkCurrentHp = null;
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

function natureMultRow(statKeys, mults, side) {
  return `<div class="stat-edit-block">
    <div class="stat-edit-label">性格補正</div>
    <div class="stat-edit-grid">
      ${statKeys
        .map((k) => {
          const cur = clampNatureMult(mults[k] ?? 1);
          return `<div class="stat-edit-cell">
            <span class="stat-edit-name">${STAT_LABELS[k]}</span>
            <div class="mult-group" data-side="${side}" data-stat="${k}">
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

function rankRow(statKeys, ranks, side) {
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
              <button type="button" class="rank-btn" data-rank-side="${side}" data-rank-stat="${k}" data-rank-delta="-1" aria-label="下げる">−</button>
              <span class="rank-val ${r > 0 ? "up" : r < 0 ? "down" : ""}">${sign}</span>
              <button type="button" class="rank-btn" data-rank-side="${side}" data-rank-stat="${k}" data-rank-delta="1" aria-label="上げる">＋</button>
            </div>
          </div>`;
        })
        .join("")}
    </div>
  </div>`;
}

function hpRow(side, current, maxHp) {
  const cur = current == null ? maxHp : Math.max(1, Math.min(maxHp, current));
  return `<div class="stat-edit-block">
    <div class="stat-edit-label">現在HP</div>
    <div class="hp-edit">
      <input type="number" inputmode="numeric" min="1" max="${maxHp}" step="1" data-hp-side="${side}" value="${cur}" />
      <span class="hp-max">/ ${maxHp}</span>
      <button type="button" class="ev-btn" data-hp-fill="${side}" data-hp-val="${maxHp}">満タン</button>
      <button type="button" class="ev-btn" data-hp-fill="${side}" data-hp-val="${Math.max(1, Math.floor(maxHp * 0.75))}">3/4</button>
      <button type="button" class="ev-btn" data-hp-fill="${side}" data-hp-val="${Math.max(1, Math.floor(maxHp * 0.5))}">1/2</button>
    </div>
  </div>`;
}

function renderMyPick() {
  ensureMyIndex();
  const t = team();
  $("my-pick").innerHTML = t.members
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
  $("my-pick").querySelectorAll("[data-mine]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.myIndex = Number(btn.dataset.mine);
      state.move = null;
      syncAtkFromMember();
      renderAttacker();
      recalc();
    });
  });
}

function renderAttacker() {
  ensureMyIndex();
  renderMyPick();
  const m = myMember();
  const box = $("atk-detail");
  if (!m?.species) {
    box.hidden = false;
    box.innerHTML = `<p class="hint">構築にポケモンを入れてください。<a href="./team.html">構築を編集</a></p>`;
    updateMoveBtn();
    return;
  }
  const poke = pokeByName(m.species);
  if (!poke) {
    box.hidden = false;
    box.innerHTML = `<p class="hint">データなし: ${m.species}</p>`;
    updateMoveBtn();
    return;
  }
  const evs = m.evs || emptyEvs();
  const stats = calcAllStatsFromMults(poke.baseStats, evs, state.atkNatureMults);
  if (state.atkCurrentHp == null) state.atkCurrentHp = stats.hp;
  state.atkCurrentHp = Math.max(1, Math.min(stats.hp, state.atkCurrentHp));
  const item = isMegaName(poke.name) ? "メガストーン" : m.item || "なし";

  box.hidden = false;
  box.innerHTML = `
    <div class="atk-summary">
      <div class="atk-summary-main">
        ${pokeImgHtml(poke.name, { size: 64, dex: poke.dex, round: true })}
        <div>
          <div class="ov-name">${poke.name}</div>
          <div class="ov-meta">${(poke.types || []).map((t) => typeIconHtml(t, { size: "sm" })).join("")} ${m.ability || poke.abilities?.[0] || "—"}</div>
          <div class="ov-meta ov-item-row">${itemImgHtml(item, { size: 22 })}<span>${item}</span></div>
          <div class="ov-meta muted">努力 ${totalEv(evs)}/${EV_MAX_TOTAL}</div>
        </div>
      </div>
      <div class="stats-inline">
        ${STAT_KEYS.map((k) => `<div class="cell"><span>${STAT_LABELS[k]}</span><strong>${stats[k]}</strong></div>`).join("")}
      </div>
      ${hpRow("atk", state.atkCurrentHp, stats.hp)}
      ${natureMultRow(ATK_VISIBLE_STATS, state.atkNatureMults, "atk")}
      ${rankRow(ATK_VISIBLE_STATS, state.atkRanks, "atk")}
      <div class="team-moves-quick">
        ${[0, 1, 2, 3]
          .map((i) => {
            const mv = moveByName(m.moves?.[i]);
            if (!mv) return `<button type="button" class="move-chip empty" disabled>技${i + 1}</button>`;
            const active = state.move?.name === mv.name ? "active" : "";
            return `<button type="button" class="move-chip ${active}" data-quick-move="${escAttr(mv.name)}">${typeIconHtml(mv.type, { size: "sm" })} ${mv.name}</button>`;
          })
          .join("")}
      </div>
    </div>`;

  box.querySelectorAll("[data-quick-move]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.move = moveByName(btn.dataset.quickMove);
      updateMoveBtn();
      renderAttacker();
      recalc();
    });
  });
  wireStatEditors(box);
  updateMoveBtn();
}

function updateMoveBtn() {
  const btn = $("move-btn");
  if (!state.move) {
    btn.innerHTML = `<div class="k">使う技</div><div class="title">技を選択</div>`;
    return;
  }
  const mv = state.move;
  btn.innerHTML = `<div class="k">使う技</div><div class="title">${typeIconHtml(mv.type, { size: "sm" })} ${mv.name}</div><div class="sub">${mv.category}　威力 ${mv.power ?? "—"}</div>`;
}

function renderFoe() {
  const slot = $("foe-slot");
  const detail = $("foe-detail");
  if (!state.foe) {
    slot.innerHTML = `<strong>相手を選ぶ</strong><span class="meta">タップで図鑑から選択</span>`;
    detail.hidden = true;
    detail.innerHTML = "";
    return;
  }
  const poke = state.foe;
  const abs = poke.abilities || [];
  if (!state.foeAbility || !abs.includes(state.foeAbility)) state.foeAbility = abs[0] || "";
  if (isMegaName(poke.name)) state.foeItem = "メガストーン";
  const stats = calcAllStatsFromMults(poke.baseStats, state.foeEvs, state.foeNatureMults);
  if (state.foeCurrentHp == null) state.foeCurrentHp = stats.hp;
  state.foeCurrentHp = Math.max(1, Math.min(stats.hp, state.foeCurrentHp));
  const evSum = totalEv(state.foeEvs);
  const mega = isMegaName(poke.name);

  slot.innerHTML = `${pokeImgHtml(poke.name, { size: 48, dex: poke.dex, round: true })}
    <div><strong>${poke.name}</strong><span class="meta">${poke.types.join(" / ")}</span></div>`;
  detail.hidden = false;
  detail.innerHTML = `
    <div class="base-stats-line">種族 H${poke.baseStats.hp} A${poke.baseStats.atk} B${poke.baseStats.def} C${poke.baseStats.spa} D${poke.baseStats.spd} S${poke.baseStats.spe}</div>
    <div class="stats-inline">
      ${STAT_KEYS.map((k) => `<div class="cell"><span>${STAT_LABELS[k]}</span><strong data-stat="${k}">${stats[k]}</strong></div>`).join("")}
    </div>
    ${hpRow("def", state.foeCurrentHp, stats.hp)}
    <div class="ctrl-row">
      <label>特性</label>
      <select data-field="ability">${abs.map((a) => `<option value="${a}" ${a === state.foeAbility ? "selected" : ""}>${a}</option>`).join("")}</select>
    </div>
    <div class="ctrl-row">
      <label>持ち物</label>
      <button type="button" class="nature-btn item-pick-btn" data-open-item ${mega ? "disabled" : ""}>
        ${itemImgHtml(state.foeItem, { size: 20 })} ${state.foeItem}${mega ? " 🔒" : ""}
      </button>
    </div>
    ${natureMultRow(["atk", "def", "spa", "spd", "spe"], state.foeNatureMults, "def")}
    ${rankRow(["atk", "def", "spa", "spd"], state.foeRanks, "def")}
    <div class="ev-row cols-3">
      ${STAT_KEYS.map(
        (k) => `
        <div class="ev-cell">
          <label>${STAT_LABELS[k]}</label>
          <div class="ev-controls">
            <input type="number" inputmode="numeric" min="0" max="${EV_MAX_PER}" step="1" data-ev="${k}" value="${state.foeEvs[k] || 0}" />
            <button type="button" class="ev-btn" data-ev-set="${k}" data-ev-val="0">0</button>
            <button type="button" class="ev-btn primary32" data-ev-set="${k}" data-ev-val="32">32</button>
          </div>
        </div>`
      ).join("")}
    </div>
    <div class="ev-total ${evSum > EV_MAX_TOTAL ? "warn" : ""}">努力値合計 ${evSum} / ${EV_MAX_TOTAL}</div>
  `;
  wireStatEditors(detail);
}

function wireStatEditors(root) {
  root.querySelectorAll(".mult-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const group = btn.closest(".mult-group");
      if (!group) return;
      const side = group.dataset.side;
      const stat = group.dataset.stat;
      const mult = clampNatureMult(btn.dataset.mult);
      if (side === "atk") state.atkNatureMults[stat] = mult;
      else state.foeNatureMults[stat] = mult;
      if (side === "atk") renderAttacker();
      else renderFoe();
      recalc();
    });
  });
  root.querySelectorAll("[data-rank-delta]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.rankSide;
      const stat = btn.dataset.rankStat;
      const delta = Number(btn.dataset.rankDelta) || 0;
      const ranks = side === "atk" ? state.atkRanks : state.foeRanks;
      ranks[stat] = Math.max(-6, Math.min(6, (ranks[stat] || 0) + delta));
      if (side === "atk") renderAttacker();
      else renderFoe();
      recalc();
    });
  });
  root.querySelectorAll("[data-hp-side]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const side = inp.dataset.hpSide;
      const v = Math.max(1, Number(inp.value) || 1);
      if (side === "atk") {
        state.atkCurrentHp = v;
        renderAttacker();
      } else {
        state.foeCurrentHp = v;
        renderFoe();
      }
      recalc();
    });
  });
  root.querySelectorAll("[data-hp-fill]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.hpFill;
      const v = Number(btn.dataset.hpVal) || 1;
      if (side === "atk") {
        state.atkCurrentHp = v;
        renderAttacker();
      } else {
        state.foeCurrentHp = v;
        renderFoe();
      }
      recalc();
    });
  });
}

function formatResult(result) {
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
  const m = myMember();
  const details = (result.details || []).map((d) => `<li>${d}</li>`).join("");
  return `<div class="bulk-card ${tone} result-main">
    <div class="who">${m?.species || "?"} → ${state.foe?.name || "?"}</div>
    <div class="dmg">${pct}</div>
    <div class="meta">${itemImgHtml(m?.item, { size: 18 })} ${m?.item || "なし"}　vs　${itemImgHtml(state.foeItem, { size: 18 })} ${state.foeItem}　HP${hpLabel}</div>
    <div class="ko">${dmgMin}〜${dmgMax}　${ko}</div>
    <ul class="result-details">${details}</ul>
  </div>`;
}

function recalc() {
  const box = $("bulk-results");
  const m = myMember();
  const atkPoke = m?.species ? pokeByName(m.species) : null;
  $("results-title").textContent =
    atkPoke && state.foe ? `${atkPoke.name} → ${state.foe.name}` : "ダメージ結果";

  if (!atkPoke || !state.move || !state.foe) {
    box.innerHTML = `<p class="hint">攻撃側・技・防御側を選ぶとダメージが出ます</p>`;
    $("result-mini").textContent = "未計算";
    return;
  }

  const atkItem = isMegaName(atkPoke.name) ? "メガストーン" : m.item || "なし";
  const atkStats = calcAllStatsFromMults(atkPoke.baseStats, m.evs || emptyEvs(), state.atkNatureMults);
  const atkHp = state.atkCurrentHp ?? atkStats.hp;
  const result = calculateDamage({
    attackerPoke: atkPoke,
    defenderPoke: state.foe,
    move: state.move,
    attackerEvs: m.evs || emptyEvs(),
    defenderEvs: state.foeEvs,
    attackerNatureMults: state.atkNatureMults,
    defenderNatureMults: state.foeNatureMults,
    attackerAbility: m.ability || atkPoke.abilities?.[0] || "",
    defenderAbility: state.foeAbility || state.foe.abilities?.[0] || "",
    attackerItem: atkItem,
    defenderItem: state.foeItem || "なし",
    attackerRanks: state.atkRanks,
    defenderRanks: state.foeRanks,
    defenderStatus: "なし",
    attackerHpRatio: atkStats.hp > 0 ? atkHp / atkStats.hp : 1,
    defenderCurrentHp: state.foeCurrentHp,
    ...fieldOpts(),
  });

  box.innerHTML = formatResult(result);
  if (!result.error) {
    const field = fieldOpts();
    const pack = result.critical && field.critical ? result.critical : result.normal || result;
    const maxP = pack.percentMax ?? result.percentMax;
    $("result-mini").textContent = maxP != null ? `${Math.round(Number(maxP))}%` : "計算済";
  } else {
    $("result-mini").textContent = "—";
  }
}

function openFoePicker() {
  openModal(
    "相手ポケモン",
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
      el.addEventListener("click", () => {
        state.foe = pokeByName(el.dataset.name);
        state.foeAbility = state.foe.abilities?.[0] || "";
        state.foeItem = isMegaName(state.foe.name) ? "メガストーン" : "なし";
        state.foeEvs = emptyEvs();
        state.foeNatureMults = emptyNatureMults();
        state.foeRanks = emptyRanks();
        state.foeCurrentHp = null;
        closeModal();
        setEditSide("def");
        renderFoe();
        recalc();
      });
    });
  };
  $("q").addEventListener("input", render);
  $("poke-type").addEventListener("change", render);
  render();
}

function openMovePicker() {
  const m = myMember();
  const atk = m?.species ? pokeByName(m.species) : null;
  if (!atk) return;
  openMovePickerList({
    title: "技",
    moves: state.moves,
    learnsets: state.learnsets,
    species: atk.name,
    allowStatus: false,
    onPick: (mv) => {
      state.move = mv;
      updateMoveBtn();
      renderAttacker();
      recalc();
    },
  });
}

function openItemPicker() {
  if (isMegaName(state.foe?.name)) return;
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
        state.foeItem = el.dataset.name;
        closeModal();
        renderFoe();
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
    syncAtkFromMember();
    renderAttacker();
    recalc();
  });

  $("foe-slot").addEventListener("click", openFoePicker);
  $("move-btn").addEventListener("click", openMovePicker);

  $("foe-detail").addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.openItem !== undefined || t.closest?.("[data-open-item]")) {
      openItemPicker();
      return;
    }
    if (t.dataset.evSet) {
      state.foeEvs = clampEvAssign(state.foeEvs, t.dataset.evSet, Number(t.dataset.evVal) || 0);
      renderFoe();
      recalc();
    }
  });

  $("foe-detail").addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.field === "ability") {
      state.foeAbility = t.value;
      recalc();
    }
    if (t.dataset.ev) {
      state.foeEvs = clampEvAssign(state.foeEvs, t.dataset.ev, Number(t.value) || 0);
      t.value = String(state.foeEvs[t.dataset.ev]);
      renderFoe();
      recalc();
    }
  });

  $("foe-detail").addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.ev) return;
    state.foeEvs = clampEvAssign(state.foeEvs, t.dataset.ev, Number(t.value) || 0);
    const stats = calcAllStatsFromMults(state.foe.baseStats, state.foeEvs, state.foeNatureMults);
    for (const k of STAT_KEYS) {
      const el = $("foe-detail").querySelector(`[data-stat="${k}"]`);
      if (el) el.textContent = String(stats[k]);
    }
    const sum = totalEv(state.foeEvs);
    const tot = $("foe-detail").querySelector(".ev-total");
    if (tot) {
      tot.textContent = `努力値合計 ${sum} / ${EV_MAX_TOTAL}`;
      tot.classList.toggle("warn", sum > EV_MAX_TOTAL);
    }
    if (state.foeCurrentHp != null) state.foeCurrentHp = Math.min(state.foeCurrentHp, stats.hp);
    recalc();
  });

  $("foe-detail").addEventListener(
    "wheel",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || !t.dataset.ev) return;
      if (document.activeElement !== t) return;
      e.preventDefault();
      const cur = Number(t.value) || 0;
      state.foeEvs = clampEvAssign(state.foeEvs, t.dataset.ev, cur + (e.deltaY < 0 ? 1 : -1));
      t.value = String(state.foeEvs[t.dataset.ev]);
      t.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { passive: false }
  );

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
  syncAtkFromMember();
  renderTeamSelect();
  setEditSide("atk");
  renderAttacker();
  renderFoe();
  updateResultsOpen();
  wire();
  recalc();
}

main();
