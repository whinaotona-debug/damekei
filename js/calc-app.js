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
  emptyRanks,
  totalEv,
  clampEvAssign,
  getNature,
} from "./stats.js?v=20260922a";
import { TYPES } from "./types.js?v=20260922a";
import { calculateDamage } from "./damage.js?v=20260922a";
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

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
  teams: loadTeams(),
  slot: getActiveSlot(),
  myIndex: 0,
  move: null,
  foe: null,
  foeItem: "なし",
  foeAbility: "",
  foeEvs: emptyEvs(),
  foeNature: "がんばりや",
  foeRanks: emptyRanks(),
  atkRanks: emptyRanks(),
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

function natureArrow(stat, natureName) {
  const n = getNature(natureName);
  if (n.up === stat) return `<span class="arrow up">▲</span>`;
  if (n.down === stat) return `<span class="arrow down">▼</span>`;
  return "";
}

function natureHintHtml(natureName) {
  const n = getNature(natureName);
  if (n.up && n.down) {
    return `<span class="nature-hint"><span class="up">▲${STAT_LABELS[n.up]}</span> <span class="down">▼${STAT_LABELS[n.down]}</span></span>`;
  }
  return `<span class="nature-hint">補正なし</span>`;
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
    hpNotFull: !!$("hpNotFull")?.checked,
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

function renderMyPick() {
  ensureMyIndex();
  const t = team();
  $("my-pick").innerHTML = t.members
    .map((m, i) => {
      if (!m.species) {
        return `<button type="button" class="rev-mine empty" disabled>#${i + 1} 空き</button>`;
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
  const stats = calcAllStats(poke.baseStats, evs, m.nature || "がんばりや");
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
          <div class="ov-meta muted">${m.nature || "がんばりや"}　努力 ${totalEv(evs)}/${EV_MAX_TOTAL}</div>
        </div>
      </div>
      <div class="stats-inline">
        ${STAT_KEYS.map((k) => `<div class="cell"><span>${STAT_LABELS[k]}${natureArrow(k, m.nature)}</span><strong>${stats[k]}</strong></div>`).join("")}
      </div>
      <div class="team-moves-quick">
        ${[0, 1, 2, 3]
          .map((i) => {
            const mv = moveByName(m.moves?.[i]);
            if (!mv) {
              return `<button type="button" class="move-chip empty" disabled>技${i + 1}</button>`;
            }
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
  updateMoveBtn();
}

function escAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
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
  const stats = calcAllStats(poke.baseStats, state.foeEvs, state.foeNature);
  const evSum = totalEv(state.foeEvs);
  const mega = isMegaName(poke.name);

  slot.innerHTML = `${pokeImgHtml(poke.name, { size: 48, dex: poke.dex, round: true })}
    <div><strong>${poke.name}</strong><span class="meta">${poke.types.join(" / ")}</span></div>`;
  detail.hidden = false;
  detail.innerHTML = `
    <div class="base-stats-line">種族 H${poke.baseStats.hp} A${poke.baseStats.atk} B${poke.baseStats.def} C${poke.baseStats.spa} D${poke.baseStats.spd} S${poke.baseStats.spe}</div>
    <div class="stats-inline">
      ${STAT_KEYS.map((k) => `<div class="cell"><span>${STAT_LABELS[k]}${natureArrow(k, state.foeNature)}</span><strong data-stat="${k}">${stats[k]}</strong></div>`).join("")}
    </div>
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
    <div class="ctrl-row nature-row">
      <label>性格</label>
      <button type="button" class="nature-btn" data-open-nature>${state.foeNature}</button>
      ${natureHintHtml(state.foeNature)}
    </div>
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
  const pct = minP != null && maxP != null ? `${minP}〜${maxP}%` : "—";
  const hi = Number(maxP) || 0;
  const tone = hi >= 100 ? "tone-bad" : hi >= 50 ? "tone-warn" : "tone-ok";
  const m = myMember();
  const details = (result.details || []).map((d) => `<li>${d}</li>`).join("");
  return `<div class="bulk-card ${tone} result-main">
    <div class="who">${m?.species || "?"} → ${state.foe?.name || "?"}</div>
    <div class="dmg">${pct}</div>
    <div class="meta">${itemImgHtml(m?.item, { size: 18 })} ${m?.item || "なし"}　vs　${itemImgHtml(state.foeItem, { size: 18 })} ${state.foeItem}　HP${hp}</div>
    <div class="ko">${dmgMin}〜${dmgMax}　${ko}</div>
    <ul class="result-details">${details}</ul>
  </div>`;
}

function recalc() {
  const box = $("bulk-results");
  const m = myMember();
  const atkPoke = m?.species ? pokeByName(m.species) : null;
  $("results-title").textContent = atkPoke && state.foe
    ? `${atkPoke.name} → ${state.foe.name}`
    : "ダメージ結果";

  if (!atkPoke || !state.move || !state.foe) {
    box.innerHTML = `<p class="hint">構築の1匹・技・相手を選ぶとダメージが出ます</p>`;
    $("result-mini").textContent = "未計算";
    return;
  }

  const atkItem = isMegaName(atkPoke.name) ? "メガストーン" : m.item || "なし";
  const result = calculateDamage({
    attackerPoke: atkPoke,
    defenderPoke: state.foe,
    move: state.move,
    attackerEvs: m.evs || emptyEvs(),
    defenderEvs: state.foeEvs,
    attackerNature: m.nature || "がんばりや",
    defenderNature: state.foeNature,
    attackerAbility: m.ability || atkPoke.abilities?.[0] || "",
    defenderAbility: state.foeAbility || state.foe.abilities?.[0] || "",
    attackerItem: atkItem,
    defenderItem: state.foeItem || "なし",
    attackerRanks: state.atkRanks,
    defenderRanks: state.foeRanks,
    defenderStatus: "なし",
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
        state.foeNature = "がんばりや";
        closeModal();
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

function openNaturePicker() {
  const current = state.foeNature;
  const head = NATURE_STAT_ORDER.map((k) => `<th class="up-h">▲${STAT_LABELS[k]}</th>`).join("");
  const rows = NATURE_STAT_ORDER.map((down) => {
    const cells = NATURE_STAT_ORDER.map((up) => {
      if (up === down) return `<td class="na">—</td>`;
      const name = NATURE_TABLE[down][up];
      return `<td><button type="button" class="nat-cell${name === current ? " selected" : ""}" data-nature="${name}">${name}</button></td>`;
    }).join("");
    return `<tr><th class="down-h">▼${STAT_LABELS[down]}</th>${cells}</tr>`;
  }).join("");
  const neutrals = NEUTRAL_NATURES.map(
    (n) => `<button type="button" class="nat-cell${n === current ? " selected" : ""}" data-nature="${n}">${n}</button>`
  ).join("");
  openModal(
    "相手の性格",
    `<div class="nature-table-wrap"><table class="nature-table"><tr><th></th>${head}</tr>${rows}</table></div>
    <div class="neutral-row">無補正 ${neutrals}</div>`
  );
  $("modal-body").querySelectorAll("[data-nature]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.foeNature = btn.dataset.nature;
      closeModal();
      renderFoe();
      recalc();
    });
  });
}

function wire() {
  wireModalClose();
  wireUiModeToggle();

  $("team-slot").addEventListener("change", () => {
    state.slot = setActiveSlot(Number($("team-slot").value));
    state.teams = loadTeams();
    state.move = null;
    ensureMyIndex();
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
    if (t.dataset.openNature !== undefined || t.closest?.("[data-open-nature]")) {
      openNaturePicker();
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
    const stats = calcAllStats(state.foe.baseStats, state.foeEvs, state.foeNature);
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
    "hpNotFull",
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
  renderTeamSelect();
  renderAttacker();
  renderFoe();
  wire();
  recalc();
}

main();
