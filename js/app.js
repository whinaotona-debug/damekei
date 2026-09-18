import {
  NATURES,
  NATURE_TABLE,
  NATURE_STAT_ORDER,
  NEUTRAL_NATURES,
  STAT_KEYS,
  STAT_LABELS,
  ATK_VISIBLE_STATS,
  DEF_VISIBLE_STATS,
  EV_MAX_PER,
  EV_MAX_TOTAL,
  calcAllStats,
  emptyEvs,
  emptyRanks,
  totalEv,
  clampEvAssign,
  getNature,
} from "./stats.js";
import { TYPES } from "./types.js";
import { calculateDamage } from "./damage.js";

const state = {
  pokemon: [],
  moves: [],
  items: [],
  atk: null,
  def: null,
  move: null,
  atkItem: "なし",
  defItem: "なし",
  atkEvs: emptyEvs(),
  defEvs: emptyEvs(),
  atkNature: "いじっぱり",
  defNature: "ずぶとい",
  atkAbility: "",
  defAbility: "",
  atkRanks: emptyRanks(),
  defRanks: emptyRanks(),
};

async function loadData() {
  const [pokemon, moves, items] = await Promise.all([
    fetch("./data/pokemon.json").then((r) => r.json()),
    fetch("./data/moves.json").then((r) => r.json()),
    fetch("./data/items.json").then((r) => r.json()),
  ]);
  state.pokemon = pokemon;
  state.moves = moves;
  state.items = items;
}

function $(id) {
  return document.getElementById(id);
}

function typeBadges(types) {
  return `<div class="type-badges">${types
    .map((t) => `<span class="type type-${t}">${t}</span>`)
    .join("")}</div>`;
}

function openModal(title, bodyHtml) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = bodyHtml;
  $("modal").classList.add("open");
  $("modal").setAttribute("aria-hidden", "false");
}

function closeModal() {
  $("modal").classList.remove("open");
  $("modal").setAttribute("aria-hidden", "true");
}

function natureArrow(stat, natureName) {
  const n = getNature(natureName);
  if (n.up === stat) return `<span class="arrow up" title="性格上昇">▲</span>`;
  if (n.down === stat) return `<span class="arrow down" title="性格下降">▼</span>`;
  return `<span class="arrow flat"></span>`;
}

function visibleStatsFor(side) {
  return side === "atk" ? ATK_VISIBLE_STATS : DEF_VISIBLE_STATS;
}

function renderSlot(side) {
  const poke = state[side];
  const slot = $(`${side}-slot`);
  const detail = $(`${side}-detail`);
  if (!poke) {
    slot.classList.remove("filled");
    slot.textContent = "ここにポケモン";
    detail.hidden = true;
    detail.innerHTML = "";
    return;
  }

  const evs = state[`${side}Evs`];
  const nature = state[`${side}Nature`];
  const stats = calcAllStats(poke.baseStats, evs, nature);
  const ability = state[`${side}Ability`];
  const ranks = state[`${side}Ranks`];
  const base = poke.baseStats;
  const evSum = totalEv(evs);
  const vis = visibleStatsFor(side);
  const nInfo = getNature(nature);

  slot.classList.add("filled");
  slot.innerHTML = `
    <div>
      <div class="name">${poke.name}</div>
      ${typeBadges(poke.types)}
      <div class="meta">No.${String(poke.dex).padStart(4, "0")}　${ability || "—"}</div>
    </div>
  `;

  const abilityOptions = (poke.abilities || [])
    .map((a) => `<option value="${a}" ${a === ability ? "selected" : ""}>${a}</option>`)
    .join("");

  const natureHint =
    nInfo.up && nInfo.down
      ? `<span class="nature-hint"><span class="up">▲${STAT_LABELS[nInfo.up]}</span> <span class="down">▼${STAT_LABELS[nInfo.down]}</span></span>`
      : `<span class="nature-hint">補正なし</span>`;

  const evCells = vis
    .map(
      (k) => `
    <div class="ev-cell">
      <label>${STAT_LABELS[k]}</label>
      <div class="ev-controls">
        <input type="number" inputmode="numeric" min="0" max="${EV_MAX_PER}" step="1" data-ev="${k}" value="${evs[k]}" />
        <button type="button" class="ev-btn" data-ev-set="${k}" data-ev-val="0">0</button>
        <button type="button" class="ev-btn primary32" data-ev-set="${k}" data-ev-val="32">32</button>
      </div>
    </div>`
    )
    .join("");

  const rankKeys =
    side === "atk"
      ? ["atk", "spa", "spe", "accuracy"]
      : ["def", "spd", "spe", "evasion"];
  const rankLabels = { ...STAT_LABELS, accuracy: "命中", evasion: "回避" };
  const rankCells = rankKeys
    .map(
      (k) => `
    <div class="rank-cell">
      <label>${rankLabels[k]}</label>
      <input type="number" inputmode="numeric" min="-6" max="6" step="1" data-rank="${k}" value="${ranks[k] || 0}" />
    </div>`
    )
    .join("");

  detail.hidden = false;
  detail.innerHTML = `
    <div class="base-stats-line">
      種族値 H${base.hp} A${base.atk} B${base.def} C${base.spa} D${base.spd} S${base.spe}
    </div>
    <div class="stats-inline" data-stats="${side}">
      ${vis
        .map(
          (k) => `<div class="cell">
          <span>${STAT_LABELS[k]}${natureArrow(k, nature)}</span>
          <strong data-stat="${k}">${stats[k]}</strong>
        </div>`
        )
        .join("")}
    </div>
    <div class="ctrl-row">
      <label>特性</label>
      <select data-field="ability">${abilityOptions || "<option>なし</option>"}</select>
    </div>
    ${poke.abilities?.length > 1 ? `<div class="ability-note">特性を切り替えできます</div>` : ""}
    <div class="ctrl-row nature-row">
      <label>性格</label>
      <button type="button" class="nature-btn" data-open-nature>${nature}</button>
      ${natureHint}
    </div>
    <div class="ev-row cols-${vis.length}">${evCells}</div>
    <div class="ev-total ${evSum > EV_MAX_TOTAL ? "warn" : ""}" data-ev-total>努力値合計 ${evSum} / ${EV_MAX_TOTAL}（1項最大${EV_MAX_PER}）</div>
    <div class="rank-row">${rankCells}</div>
  `;
}

function updateLiveStats(side) {
  const poke = state[side];
  if (!poke) return;
  const detail = $(`${side}-detail`);
  const nature = state[`${side}Nature`];
  const stats = calcAllStats(poke.baseStats, state[`${side}Evs`], nature);
  const vis = visibleStatsFor(side);
  for (const k of vis) {
    const el = detail.querySelector(`[data-stat="${k}"]`);
    if (el) el.textContent = String(stats[k]);
    const cell = el?.closest(".cell");
    if (cell) {
      const span = cell.querySelector("span");
      if (span) span.innerHTML = `${STAT_LABELS[k]}${natureArrow(k, nature)}`;
    }
  }
  const sum = totalEv(state[`${side}Evs`]);
  const totalEl = detail.querySelector("[data-ev-total]");
  if (totalEl) {
    totalEl.textContent = `努力値合計 ${sum} / ${EV_MAX_TOTAL}（1項最大${EV_MAX_PER}）`;
    totalEl.classList.toggle("warn", sum > EV_MAX_TOTAL);
  }
  const nBtn = detail.querySelector("[data-open-nature]");
  if (nBtn) nBtn.textContent = nature;
  const nInfo = getNature(nature);
  const hint = detail.querySelector(".nature-hint");
  if (hint) {
    hint.innerHTML =
      nInfo.up && nInfo.down
        ? `<span class="up">▲${STAT_LABELS[nInfo.up]}</span> <span class="down">▼${STAT_LABELS[nInfo.down]}</span>`
        : `補正なし`;
  }
  const slotMeta = $(`${side}-slot`).querySelector(".meta");
  if (slotMeta) {
    slotMeta.textContent = `No.${String(poke.dex).padStart(4, "0")}　${state[`${side}Ability`] || "—"}`;
  }
}

function bindDetailEvents(side) {
  const detail = $(`${side}-detail`);
  detail.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.openNature !== undefined || t.closest?.("[data-open-nature]")) {
      openNaturePicker(side);
      return;
    }
    if (t.dataset.evSet) {
      const key = t.dataset.evSet;
      const val = Number(t.dataset.evVal) || 0;
      state[`${side}Evs`] = clampEvAssign(state[`${side}Evs`], key, val);
      const input = detail.querySelector(`input[data-ev="${key}"]`);
      if (input) input.value = String(state[`${side}Evs`][key]);
      updateLiveStats(side);
      recalc();
    }
  });
  detail.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.field === "ability") {
      state[`${side}Ability`] = t.value;
      updateLiveStats(side);
      recalc();
    }
    if (t.dataset.ev) {
      let v = Number(t.value);
      if (!Number.isFinite(v)) v = 0;
      state[`${side}Evs`] = clampEvAssign(state[`${side}Evs`], t.dataset.ev, v);
      t.value = String(state[`${side}Evs`][t.dataset.ev]);
      updateLiveStats(side);
      recalc();
    }
    if (t.dataset.rank) {
      let v = Number(t.value);
      if (!Number.isFinite(v)) v = 0;
      v = Math.max(-6, Math.min(6, v));
      t.value = String(v);
      state[`${side}Ranks`][t.dataset.rank] = v;
      recalc();
    }
  });
  detail.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.dataset.ev) {
      const raw = t.value;
      if (raw === "" || raw === "-") {
        state[`${side}Evs`][t.dataset.ev] = 0;
      } else {
        let v = Number(raw);
        if (!Number.isFinite(v)) return;
        const clamped = clampEvAssign(state[`${side}Evs`], t.dataset.ev, v);
        state[`${side}Evs`] = clamped;
        // 入力中は value を強制しない（キャレット維持）。blur/change で補正
      }
      updateLiveStats(side);
      recalc();
    }
    if (t.dataset.rank) {
      const raw = t.value;
      if (raw === "" || raw === "-") {
        state[`${side}Ranks`][t.dataset.rank] = 0;
      } else {
        let v = Number(raw);
        if (!Number.isFinite(v)) return;
        state[`${side}Ranks`][t.dataset.rank] = Math.max(-6, Math.min(6, v));
      }
      recalc();
    }
  });
}

function openNaturePicker(side) {
  const current = state[`${side}Nature`];
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
    (n) =>
      `<button type="button" class="nat-cell neutral${n === current ? " selected" : ""}" data-nature="${n}">${n}</button>`
  ).join("");

  openModal(`${side === "atk" ? "攻撃" : "防御"}側の性格`, `
    <p class="nature-guide"><span class="up">赤▲ = 上昇列</span>　<span class="down">青▼ = 下降行</span></p>
    <div class="nature-table-wrap">
      <table class="nature-table">
        <thead><tr><th></th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="neutral-row"><span>無補正:</span> ${neutrals}</div>
  `);

  $("modal-body").querySelectorAll("[data-nature]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state[`${side}Nature`] = btn.dataset.nature;
      renderSlot(side);
      closeModal();
      recalc();
    });
  });
}

function selectPokemon(side, poke) {
  state[side] = poke;
  state[`${side}Ability`] = poke.abilities?.[0] || "";
  state[`${side}Evs`] = emptyEvs();
  state[`${side}Ranks`] = emptyRanks();
  if (side === "atk") state.atkNature = "いじっぱり";
  else state.defNature = "ずぶとい";
  renderSlot(side);
  closeModal();
  recalc();
}

function openPokemonPicker(side) {
  const genOf = (dex) => {
    if (dex <= 151) return 1;
    if (dex <= 251) return 2;
    if (dex <= 386) return 3;
    if (dex <= 493) return 4;
    if (dex <= 649) return 5;
    if (dex <= 721) return 6;
    if (dex <= 809) return 7;
    if (dex <= 905) return 8;
    return 9;
  };

  openModal(side === "atk" ? "攻撃側ポケモン" : "防御側ポケモン", `
    <div class="filters">
      <input type="text" id="poke-q" placeholder="名前検索" autocomplete="off" />
      <div class="row">
        <select id="poke-type">
          <option value="">タイプ（すべて）</option>
          ${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <select id="poke-gen">
          <option value="">世代（すべて）</option>
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => `<option value="${g}">第${g}世代</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="list" id="poke-list"></div>
  `);

  const renderList = () => {
    const q = ($("poke-q").value || "").trim();
    const type = $("poke-type").value;
    const gen = $("poke-gen").value;
    const list = state.pokemon.filter((p) => {
      if (q && !p.name.includes(q)) return false;
      if (type && !p.types.includes(type)) return false;
      if (gen && genOf(p.dex) !== Number(gen)) return false;
      return true;
    });
    $("poke-list").innerHTML = list
      .slice(0, 200)
      .map((p) => {
        const b = p.baseStats;
        return `
        <div class="list-item" data-id="${p.id}">
          <div class="n">${p.name}</div>
          <div class="s">No.${String(p.dex).padStart(4, "0")}　${p.types.join("/")}　
          種族 H${b.hp} A${b.atk} B${b.def} C${b.spa} D${b.spd} S${b.spe}
         　特性: ${(p.abilities || []).join(" / ") || "—"}</div>
        </div>`;
      })
      .join("");
    $("poke-list").querySelectorAll(".list-item").forEach((el) => {
      el.addEventListener("click", () => {
        const poke = state.pokemon.find((x) => x.id === el.dataset.id);
        if (poke) selectPokemon(side, poke);
      });
    });
  };

  $("poke-q").addEventListener("input", renderList);
  $("poke-type").addEventListener("change", renderList);
  $("poke-gen").addEventListener("change", renderList);
  renderList();
  $("poke-q").focus();
}

function openMovePicker() {
  const atkTypes = state.atk?.types || [];
  openModal("使う技", `
    <div class="filters">
      <input type="text" id="move-q" placeholder="技名検索" autocomplete="off" />
      <div class="row">
        <select id="move-type">
          <option value="">タイプ（すべて）</option>
          ${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <select id="move-cat">
          <option value="">分類（すべて）</option>
          <option value="物理">物理</option>
          <option value="特殊">特殊</option>
          <option value="変化">変化</option>
        </select>
      </div>
      <label class="check-inline"><input type="checkbox" id="move-stab-only" ${atkTypes.length ? "checked" : ""} ${atkTypes.length ? "" : "disabled"} /> 攻撃側タイプ一致技のみ（覚え技データ未提供のため近似）</label>
    </div>
    <div class="list" id="move-list"></div>
  `);

  const renderList = () => {
    const q = ($("move-q").value || "").trim();
    const type = $("move-type").value;
    const cat = $("move-cat").value;
    const stabOnly = $("move-stab-only")?.checked;
    let list = state.moves.filter((m) => {
      if (q && !m.name.includes(q)) return false;
      if (type && m.type !== type) return false;
      if (cat && m.category !== cat) return false;
      if (stabOnly && atkTypes.length && !atkTypes.includes(m.type)) return false;
      return true;
    });
    // 一致技を先頭に
    if (atkTypes.length && !stabOnly) {
      list = [...list].sort((a, b) => {
        const as = atkTypes.includes(a.type) ? 0 : 1;
        const bs = atkTypes.includes(b.type) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name, "ja");
      });
    }
    $("move-list").innerHTML = list
      .slice(0, 250)
      .map((m) => `
        <div class="list-item" data-name="${m.name}">
          <div class="n">${m.name}${atkTypes.includes(m.type) ? " ★" : ""}</div>
          <div class="s">${m.type} / ${m.category}　威力 ${m.power ?? "-"}　命中 ${m.accuracy ?? "-"}　PP ${m.pp}
          <br/>${(m.effect || m.target || "").slice(0, 80)}</div>
        </div>`)
      .join("");
    $("move-list").querySelectorAll(".list-item").forEach((el) => {
      el.addEventListener("click", () => {
        state.move = state.moves.find((x) => x.name === el.dataset.name);
        updateMoveBtn();
        closeModal();
        recalc();
      });
    });
  };
  $("move-q").addEventListener("input", renderList);
  $("move-type").addEventListener("change", renderList);
  $("move-cat").addEventListener("change", renderList);
  $("move-stab-only")?.addEventListener("change", renderList);
  renderList();
  $("move-q").focus();
}

function openItemPicker(side) {
  openModal(side === "atk" ? "攻撃側の持ち物" : "防御側の持ち物", `
    <div class="filters">
      <input type="text" id="item-q" placeholder="名前検索" autocomplete="off" />
      <select id="item-cat">
        <option value="">カテゴリ（すべて）</option>
        <option value="どうぐ">どうぐ</option>
        <option value="きのみ">きのみ</option>
        <option value="その他">その他</option>
      </select>
    </div>
    <div class="list" id="item-list"></div>
  `);

  const renderList = () => {
    const q = ($("item-q").value || "").trim();
    const cat = $("item-cat").value;
    const list = state.items.filter((it) => {
      if (q && !it.name.includes(q)) return false;
      if (cat && it.category !== cat) return false;
      return true;
    });
    $("item-list").innerHTML = list
      .map((it) => `
        <div class="list-item" data-name="${it.name}">
          <div class="n">${it.name}</div>
          <div class="s">${it.category}　${it.effect.slice(0, 90)}</div>
        </div>`)
      .join("");
    $("item-list").querySelectorAll(".list-item").forEach((el) => {
      el.addEventListener("click", () => {
        if (side === "atk") state.atkItem = el.dataset.name;
        else state.defItem = el.dataset.name;
        updateItemBtns();
        closeModal();
        recalc();
      });
    });
  };
  $("item-q").addEventListener("input", renderList);
  $("item-cat").addEventListener("change", renderList);
  renderList();
  $("item-q").focus();
}

function updateMoveBtn() {
  const btn = $("move-btn");
  if (!state.move) {
    btn.innerHTML = `<div class="title">技を選択</div><div class="sub">名前・タイプ・分類で検索</div>`;
    return;
  }
  const m = state.move;
  btn.innerHTML = `<div class="title">${m.name}</div>
    <div class="sub">${m.type} / ${m.category}　威力 ${m.power ?? "-"}　命中 ${m.accuracy ?? "-"}</div>`;
}

function updateItemBtns() {
  const atk = state.items.find((x) => x.name === state.atkItem);
  const def = state.items.find((x) => x.name === state.defItem);
  $("atk-item-btn").innerHTML = `<div class="title">${state.atkItem}</div><div class="sub">${(atk?.effect || "").slice(0, 60)}</div>`;
  $("def-item-btn").innerHTML = `<div class="title">${state.defItem}</div><div class="sub">${(def?.effect || "").slice(0, 60)}</div>`;
}

function recalc() {
  const box = $("result");
  if (!state.atk || !state.def || !state.move) {
    box.innerHTML = `<div class="result-sub">ポケモンと技を選ぶと計算されます</div>`;
    $("result-mini").textContent = "未計算";
    return;
  }

  const result = calculateDamage({
    attackerPoke: state.atk,
    defenderPoke: state.def,
    move: state.move,
    attackerEvs: state.atkEvs,
    defenderEvs: state.defEvs,
    attackerNature: state.atkNature,
    defenderNature: state.defNature,
    attackerAbility: state.atkAbility,
    defenderAbility: state.defAbility,
    attackerItem: state.atkItem,
    defenderItem: state.defItem,
    attackerRanks: state.atkRanks,
    defenderRanks: state.defRanks,
    attackerStatus: $("atk-status").value,
    defenderStatus: $("def-status").value,
    weather: $("weather").value,
    field: $("field").value,
    screens: {
      reflect: $("reflect").checked,
      lightScreen: $("lightScreen").checked,
      auroraVeil: $("auroraVeil").checked,
    },
    critical: $("critical").checked,
    gravity: $("gravity").checked,
    helpBoost: $("helpBoost").checked,
    stealthRock: $("stealthRock").checked,
    spikes: Number($("spikes").value),
    leechSeed: $("leechSeed").checked,
    burn: $("burnChip").checked || $("def-status").value === "やけど",
    poison: $("poisonChip").checked
      ? $("def-status").value === "もうどく"
        ? "もうどく"
        : "どく"
      : $("def-status").value === "どく" || $("def-status").value === "もうどく"
        ? $("def-status").value
        : null,
    disguiseBroken: $("disguiseBroken").checked,
    hpNotFull: $("hpNotFull").checked,
    movingLast: $("movingLast").checked,
  });

  if (result.error) {
    box.innerHTML = `<div class="result-sub">${result.error}</div>
      <details class="calc-details"><summary>計算詳細</summary><ul>${(result.details || [])
        .map((d) => `<li>${d}</li>`)
        .join("")}</ul></details>`;
    $("result-mini").textContent = result.error;
    return;
  }

  let effClass = "";
  if (result.typeMult === 0) effClass = "immune";
  else if (result.typeMult > 1) effClass = "";
  else if (result.typeMult < 1) effClass = "resist";

  const main = result.koChance != null && !result.koGuaranteed
    ? `${result.percentMin}％～${result.percentMax}％　${result.koText}`
    : `${result.percentMin}％～${result.percentMax}％　${result.koText}`;
  const sub = `${result.min}～${result.max} ダメージ / 相手HP ${result.defenderHp}${
    result.typeMult === 0 && /化け/.test(result.effectiveness || "")
      ? "（1発目は化けの皮で無効 → KOは2発目以降）"
      : ""
  }`;
  const chanceLine =
    result.koChance != null
      ? `<div class="result-sub">${
          result.koGuaranteed
            ? `${result.koHits}発で確定（100%）`
            : `${result.koHits}発で倒せる乱数: ${result.koChance}%（16通り×組み合わせ）`
        }</div>`
      : "";

  const chipHtml = (result.chip || []).length
    ? `<ul class="chip-list">${result.chip
        .map((c) => {
          const sign = c.damage < 0 ? "回復" : "ダメージ";
          return `<li>${c.name}: ${Math.abs(c.damage)} ${sign}${c.note ? `（${c.note}）` : ""}</li>`;
        })
        .join("")}</ul>`
    : "";

  box.innerHTML = `
    <div class="result-sub">${state.atk.name} の ${state.move.name} → ${state.def.name}</div>
    <div class="result-main">${main}</div>
    <div class="result-sub">${sub}</div>
    ${chanceLine}
    <div class="result-eff ${effClass}">${result.effectiveness}</div>
    ${chipHtml}
    <details class="calc-details">
      <summary>計算詳細</summary>
      <ul>${result.details.map((d) => `<li>${d}</li>`).join("")}</ul>
      <p class="result-sub">乱数一覧: ${result.rolls.join(", ")}</p>
    </details>
  `;
  $("result-mini").textContent = main;
}

function wire() {
  $("atk-slot").addEventListener("click", () => openPokemonPicker("atk"));
  $("def-slot").addEventListener("click", () => openPokemonPicker("def"));
  $("atk-slot").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openPokemonPicker("atk");
  });
  $("def-slot").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openPokemonPicker("def");
  });
  $("move-btn").addEventListener("click", openMovePicker);
  $("atk-item-btn").addEventListener("click", () => openItemPicker("atk"));
  $("def-item-btn").addEventListener("click", () => openItemPicker("def"));
  $("modal-close").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });

  bindDetailEvents("atk");
  bindDetailEvents("def");

  [
    "weather",
    "field",
    "atk-status",
    "def-status",
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
    "spikes",
    "disguiseBroken",
    "hpNotFull",
    "movingLast",
  ].forEach((id) => {
    $(id).addEventListener("change", recalc);
  });
}

async function main() {
  await loadData();
  wire();
  updateItemBtns();
  // smoke: ensure ブリジュラス abilities present
  const b = state.pokemon.find((p) => p.name === "ブリジュラス");
  console.info("[ダメ計] loaded", {
    pokemon: state.pokemon.length,
    moves: state.moves.length,
    items: state.items.length,
    burijurasu: b?.abilities,
  });
}

main().catch((err) => {
  console.error(err);
  $("result").innerHTML = `<div class="result-sub">データ読み込みに失敗しました: ${err.message}</div>`;
});
