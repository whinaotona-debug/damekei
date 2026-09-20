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
} from "./stats.js?v=20260920h";
import { TYPES } from "./types.js?v=20260920h";
import { calculateDamage } from "./damage.js?v=20260920h";
import {
  loadTeams,
  getActiveSlot,
  setActiveSlot,
  applyUiMode,
  isMegaName,
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
import { typeIconHtml } from "./media.js?v=20260920h";
import { openMovePickerList } from "./move-picker.js?v=20260920h";

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
  teams: loadTeams(),
  slot: getActiveSlot(),
  atk: null,
  move: null,
  atkItem: "なし",
  atkEvs: emptyEvs(),
  atkNature: "いじっぱり",
  atkAbility: "",
  atkRanks: emptyRanks(),
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

function syncMega() {
  if (isMegaName(state.atk?.name)) state.atkItem = "メガストーン";
  else if (state.atkItem === "メガストーン") state.atkItem = "なし";
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

function renderTeamSelect() {
  state.teams = loadTeams();
  $("team-slot").innerHTML = state.teams
    .map((t, i) => {
      const n = t.members.filter((m) => m.species).length;
      return `<option value="${i}" ${i === state.slot ? "selected" : ""}>${t.name}（${n}/6）</option>`;
    })
    .join("");
}

function renderAttacker() {
  syncMega();
  const poke = state.atk;
  const mega = isMegaName(poke?.name);
  const slot = $("atk-slot");
  const detail = $("atk-detail");

  if (!poke) {
    slot.textContent = "＋ 攻撃ポケモンを選ぶ";
    detail.hidden = true;
    detail.innerHTML = "";
    updateMoveBtn();
    updateItemBtn();
    recalc();
    return;
  }

  const stats = calcAllStats(poke.baseStats, state.atkEvs, state.atkNature);
  const evSum = totalEv(state.atkEvs);
  const abs = poke.abilities || [];
  if (!state.atkAbility || !abs.includes(state.atkAbility)) state.atkAbility = abs[0] || "";

  slot.innerHTML = `<strong>${poke.name}</strong><span class="meta">${poke.types.join(" / ")}</span>`;
  detail.hidden = false;
  detail.innerHTML = `
    <div class="base-stats-line">種族 H${poke.baseStats.hp} A${poke.baseStats.atk} B${poke.baseStats.def} C${poke.baseStats.spa} D${poke.baseStats.spd} S${poke.baseStats.spe}</div>
    <div class="stats-inline">
      ${STAT_KEYS.map((k) => `<div class="cell"><span>${STAT_LABELS[k]}${natureArrow(k, state.atkNature)}</span><strong data-stat="${k}">${stats[k]}</strong></div>`).join("")}
    </div>
    <div class="ctrl-row">
      <label>特性</label>
      <select data-field="ability">${abs.map((a) => `<option value="${a}" ${a === state.atkAbility ? "selected" : ""}>${a}</option>`).join("")}</select>
    </div>
    <div class="ctrl-row nature-row">
      <label>性格</label>
      <button type="button" class="nature-btn" data-open-nature>${state.atkNature}</button>
      ${natureHintHtml(state.atkNature)}
    </div>
    <div class="ev-row cols-3">
      ${STAT_KEYS.map(
        (k) => `
        <div class="ev-cell">
          <label>${STAT_LABELS[k]}</label>
          <div class="ev-controls">
            <input type="number" inputmode="numeric" min="0" max="${EV_MAX_PER}" step="1" data-ev="${k}" value="${state.atkEvs[k] || 0}" />
            <button type="button" class="ev-btn" data-ev-set="${k}" data-ev-val="0">0</button>
            <button type="button" class="ev-btn primary32" data-ev-set="${k}" data-ev-val="32">32</button>
          </div>
        </div>`
      ).join("")}
    </div>
    <div class="ev-total ${evSum > EV_MAX_TOTAL ? "warn" : ""}">努力値合計 ${evSum} / ${EV_MAX_TOTAL}</div>
  `;
  updateMoveBtn();
  updateItemBtn();
  recalc();
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

function updateItemBtn() {
  const mega = isMegaName(state.atk?.name);
  const btn = $("atk-item-btn");
  btn.classList.toggle("locked", mega);
  const it = state.items.find((x) => x.name === state.atkItem);
  btn.innerHTML = `<div class="k">攻撃持ち物</div><div class="title">${state.atkItem}${mega ? " 🔒" : ""}</div><div class="sub">${mega ? "メガ固定" : (it?.effect || "").slice(0, 50)}</div>`;
}

function formatBulkCard(member, idx, result) {
  if (!member.species) {
    return `<div class="bulk-card empty"><div class="who">#${idx + 1} 空き</div></div>`;
  }
  if (result?.error) {
    return `<div class="bulk-card">
      <div class="who">#${idx + 1} ${member.species}</div>
      <div class="dmg">—</div>
      <div class="meta">${member.item || "なし"}　${member.nature}　${member.ability || ""}</div>
      <div class="ko">${result.error}</div>
    </div>`;
  }
  const pack = result.critical && fieldOpts().critical ? result.critical : result.normal || result;
  const minP = pack.percentMin ?? result.percentMin;
  const maxP = pack.percentMax ?? result.percentMax;
  const dmgMin = pack.min ?? result.min;
  const dmgMax = pack.max ?? result.max;
  const ko = pack.koText || result.koText || "";
  const hp = result.defenderHp ?? "—";
  const pct =
    minP != null && maxP != null ? `${minP}〜${maxP}%` : "—";
  const hi = Number(maxP) || 0;
  const tone = hi >= 100 ? "tone-bad" : hi >= 50 ? "tone-warn" : "tone-ok";
  return `<div class="bulk-card ${tone}">
    <div class="who">#${idx + 1} ${member.species}</div>
    <div class="dmg">${pct}</div>
    <div class="meta">${member.item || "なし"}　${member.nature}　${member.ability || ""}　HP${hp}</div>
    <div class="ko">${dmgMin}〜${dmgMax}　${ko}</div>
  </div>`;
}

function recalc() {
  const box = $("bulk-results");
  const team = state.teams[state.slot];
  $("results-title").textContent = `対 ${team?.name || "構築"}（6匹まとめて）`;

  if (!state.atk || !state.move) {
    box.innerHTML = `<p class="hint">攻撃側のポケモンと技を選ぶと、構築の全員分がここに出ます</p>`;
    $("result-mini").textContent = "未計算";
    return;
  }

  const field = fieldOpts();
  const cards = [];
  let summary = [];

  for (let i = 0; i < 6; i++) {
    const m = team.members[i];
    if (!m.species) {
      cards.push(formatBulkCard(m, i, null));
      continue;
    }
    const defPoke = pokeByName(m.species);
    if (!defPoke) {
      cards.push(formatBulkCard(m, i, { error: "データなし" }));
      continue;
    }
    const result = calculateDamage({
      attackerPoke: state.atk,
      defenderPoke: defPoke,
      move: state.move,
      attackerEvs: state.atkEvs,
      defenderEvs: m.evs || emptyEvs(),
      attackerNature: state.atkNature,
      defenderNature: m.nature || "がんばりや",
      attackerAbility: state.atkAbility,
      defenderAbility: m.ability || defPoke.abilities?.[0] || "",
      attackerItem: state.atkItem || "なし",
      defenderItem: m.item || "なし",
      attackerRanks: state.atkRanks,
      defenderRanks: emptyRanks(),
      defenderStatus: "なし",
      ...field,
    });

    cards.push(formatBulkCard(m, i, result));
    if (!result.error) {
      const pack = result.critical && field.critical ? result.critical : result.normal || result;
      const maxP = pack.percentMax ?? result.percentMax;
      if (maxP != null) summary.push(`${m.species.slice(0, 4)}${Math.round(Number(maxP))}%`);
    }
  }

  box.innerHTML = cards.join("");
  $("result-mini").textContent = summary.slice(0, 3).join(" ") || "計算済";
}

function openPokePicker() {
  openModal(
    "攻撃ポケモン",
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
        <div>${p.name}</div>
        <div class="s">${p.types.join("/")}</div>
      </button>`
      )
      .join("");
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        state.atk = pokeByName(el.dataset.name);
        state.atkAbility = state.atk.abilities?.[0] || "";
        state.move = null;
        syncMega();
        closeModal();
        renderAttacker();
      });
    });
  };
  $("q").addEventListener("input", render);
  $("poke-type").addEventListener("change", render);
  render();
}

function openMovePicker() {
  if (!state.atk) return;
  openMovePickerList({
    title: "技",
    moves: state.moves,
    learnsets: state.learnsets,
    species: state.atk.name,
    allowStatus: false,
    onPick: (mv) => {
      state.move = mv;
      updateMoveBtn();
      recalc();
    },
  });
}

function openItemPicker() {
  if (isMegaName(state.atk?.name)) return;
  openModal("持ち物", `<div class="list-filters"><input type="search" id="q" /></div><div id="list"></div>`);
  const render = () => {
    const q = $("q").value;
    $("list").innerHTML = [{ name: "なし", effect: "" }, ...state.items]
      .filter((it) => textMatchesQuery(it.name, q))
      .slice(0, 100)
      .map((it) => `<button type="button" class="list-item" data-name="${it.name}"><div>${it.name}</div><div class="s">${(it.effect || "").slice(0, 60)}</div></button>`)
      .join("");
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        state.atkItem = el.dataset.name;
        closeModal();
        updateItemBtn();
        recalc();
      });
    });
  };
  $("q").addEventListener("input", render);
  render();
}

function openNaturePicker() {
  const current = state.atkNature;
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
    "性格",
    `<div class="nature-table-wrap"><table class="nature-table"><tr><th></th>${head}</tr>${rows}</table></div>
    <div class="neutral-row">無補正 ${neutrals}</div>`
  );
  $("modal-body").querySelectorAll("[data-nature]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.atkNature = btn.dataset.nature;
      closeModal();
      renderAttacker();
    });
  });
}

function wire() {
  wireModalClose();
  wireUiModeToggle();

  $("team-slot").addEventListener("change", () => {
    state.slot = setActiveSlot(Number($("team-slot").value));
    state.teams = loadTeams();
    recalc();
  });

  $("atk-slot").addEventListener("click", openPokePicker);
  $("move-btn").addEventListener("click", openMovePicker);
  $("atk-item-btn").addEventListener("click", openItemPicker);

  $("atk-detail").addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.openNature !== undefined || t.closest?.("[data-open-nature]")) {
      openNaturePicker();
      return;
    }
    if (t.dataset.evSet) {
      state.atkEvs = clampEvAssign(state.atkEvs, t.dataset.evSet, Number(t.dataset.evVal) || 0);
      renderAttacker();
    }
  });

  $("atk-detail").addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.field === "ability") {
      state.atkAbility = t.value;
      recalc();
    }
    if (t.dataset.ev) {
      state.atkEvs = clampEvAssign(state.atkEvs, t.dataset.ev, Number(t.value) || 0);
      t.value = String(state.atkEvs[t.dataset.ev]);
      renderAttacker();
    }
  });

  $("atk-detail").addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.dataset.ev) return;
    state.atkEvs = clampEvAssign(state.atkEvs, t.dataset.ev, Number(t.value) || 0);
    const stats = calcAllStats(state.atk.baseStats, state.atkEvs, state.atkNature);
    for (const k of STAT_KEYS) {
      const el = $("atk-detail").querySelector(`[data-stat="${k}"]`);
      if (el) el.textContent = String(stats[k]);
    }
    const sum = totalEv(state.atkEvs);
    const tot = $("atk-detail").querySelector(".ev-total");
    if (tot) {
      tot.textContent = `努力値合計 ${sum} / ${EV_MAX_TOTAL}`;
      tot.classList.toggle("warn", sum > EV_MAX_TOTAL);
    }
    recalc();
  });

  $("atk-detail").addEventListener(
    "wheel",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || !t.dataset.ev) return;
      if (document.activeElement !== t) return;
      e.preventDefault();
      const cur = Number(t.value) || 0;
      state.atkEvs = clampEvAssign(state.atkEvs, t.dataset.ev, cur + (e.deltaY < 0 ? 1 : -1));
      t.value = String(state.atkEvs[t.dataset.ev]);
      t.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { passive: false }
  );

  ["weather", "field", "atk-status", "spikes", "critical", "reflect", "lightScreen", "auroraVeil", "stealthRock", "leechSeed", "burnChip", "poisonChip", "gravity", "helpBoost", "hpNotFull", "movingLast"].forEach((id) => {
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
  renderTeamSelect();
  renderAttacker();
  wire();
}

main();
