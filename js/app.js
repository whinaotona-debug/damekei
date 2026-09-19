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
  applyRank,
  emptyEvs,
  emptyRanks,
  totalEv,
  clampEvAssign,
  getNature,
} from "./stats.js?v=20260919e";
import { TYPES } from "./types.js?v=20260919e";
import { calculateDamage } from "./damage.js?v=20260919e";

const HISTORY_KEY = "damekei-history-v1";
const HISTORY_MAX = 40;

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
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
  lastHistoryFingerprint: "",
};

/** メガニウム本体は除外。メガメガニウムやメガリザードンX等は true */
function isMegaPokemon(poke) {
  const n = poke?.name || "";
  if (!n || n === "メガニウム") return false;
  return n.startsWith("メガ");
}

function learnableMovesFor(poke) {
  if (!poke) return null;
  const list = state.learnsets[poke.name];
  if (!list || !list.length) return null;
  return list;
}

function syncItemForSide(side) {
  const poke = state[side];
  const key = side === "atk" ? "atkItem" : "defItem";
  if (isMegaPokemon(poke)) state[key] = "メガストーン";
  else if (state[key] === "メガストーン") state[key] = "なし";
}

function clearMoveIfNotLearnable() {
  if (!state.move || !state.atk) return;
  const allowed = learnableMovesFor(state.atk);
  if (allowed && !allowed.includes(state.move.name)) {
    state.move = null;
    updateMoveBtn();
  }
}

/** ひらがな↔カタカナを揃えて部分一致（「りざーどん」→リザードン） */
function toKatakana(str) {
  return String(str || "").replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

function normalizeForSearch(str) {
  return toKatakana(str)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[゛゜ﾞﾟ\s　]/g, "");
}

function textMatchesQuery(text, query) {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return normalizeForSearch(text).includes(q);
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
}

function pushHistoryEntry(entry) {
  const list = loadHistory().filter((h) => h.fingerprint !== entry.fingerprint);
  list.unshift(entry);
  saveHistory(list);
}

function formatHistoryTime(ts) {
  try {
    return new Date(ts).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function openHistoryModal() {
  const list = loadHistory();
  openModal(
    "計算履歴",
    `
    <div class="history-toolbar">
      <button type="button" class="icon-btn" id="history-clear" ${list.length ? "" : "disabled"}>すべて削除</button>
      <span class="hint">最新 ${HISTORY_MAX} 件まで保存（この端末）</span>
    </div>
    <div class="list" id="history-list">
      ${
        list.length === 0
          ? `<div class="history-empty">まだ履歴がありません。<br/>計算すると自動で残ります。</div>`
          : list
              .map(
                (h, i) => `
        <div class="list-item history-item" data-idx="${i}">
          <div class="n">${h.atkName} の ${h.moveName} → ${h.defName}</div>
          <div class="s">${h.summary}${h.critSummary ? `　／　急所 ${h.critSummary}` : ""}<br/>${formatHistoryTime(h.ts)}</div>
        </div>`
              )
              .join("")
      }
    </div>
  `
  );

  $("history-clear")?.addEventListener("click", () => {
    if (!list.length) return;
    if (!confirm("計算履歴をすべて削除しますか？")) return;
    saveHistory([]);
    state.lastHistoryFingerprint = "";
    openHistoryModal();
  });

  $("history-list")?.querySelectorAll(".history-item").forEach((el) => {
    el.addEventListener("click", () => {
      const item = list[Number(el.dataset.idx)];
      if (!item) return;
      openModal(
        "履歴詳細",
        `
        <div class="result-sub">${item.atkName} の ${item.moveName} → ${item.defName}</div>
        <div class="result-main" style="font-size:1.1rem;margin:6px 0">${item.summary}</div>
        ${
          item.critSummary
            ? `<div class="result-sub">急所: ${item.critSummary}</div>`
            : ""
        }
        <div class="result-sub" style="margin-top:8px">${formatHistoryTime(item.ts)}</div>
        <div class="history-toolbar" style="margin-top:12px">
          <button type="button" class="icon-btn" id="history-back">一覧へ戻る</button>
          <button type="button" class="icon-btn" id="history-delete-one">この件を削除</button>
        </div>
      `
      );
      $("history-back")?.addEventListener("click", openHistoryModal);
      $("history-delete-one")?.addEventListener("click", () => {
        saveHistory(loadHistory().filter((h) => h.fingerprint !== item.fingerprint));
        openHistoryModal();
      });
    });
  });
}

async function loadData() {
  const [pokemon, moves, items, learnsets] = await Promise.all([
    fetch("./data/pokemon.json").then((r) => r.json()),
    fetch("./data/moves.json").then((r) => r.json()),
    fetch("./data/items.json").then((r) => r.json()),
    fetch("./data/learnsets.json").then((r) => r.json()),
  ]);
  state.pokemon = pokemon;
  state.moves = moves;
  state.items = items;
  state.learnsets = learnsets;
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

function swapSides() {
  const pairs = [
    ["atk", "def"],
    ["atkItem", "defItem"],
    ["atkEvs", "defEvs"],
    ["atkNature", "defNature"],
    ["atkAbility", "defAbility"],
    ["atkRanks", "defRanks"],
  ];
  for (const [a, b] of pairs) {
    const tmp = state[a];
    state[a] = state[b];
    state[b] = tmp;
  }
  // 異常状態も入れ替え
  const atkSt = $("atk-status");
  const defSt = $("def-status");
  if (atkSt && defSt) {
    const t = atkSt.value;
    atkSt.value = defSt.value;
    defSt.value = t;
  }
  syncItemForSide("atk");
  syncItemForSide("def");
  clearMoveIfNotLearnable();
  renderSlot("atk");
  renderSlot("def");
  updateItemBtns();
  updateMoveBtn();
  recalc();
}

function selectPokemon(side, poke) {
  state[side] = poke;
  state[`${side}Ability`] = poke.abilities?.[0] || "";
  state[`${side}Evs`] = emptyEvs();
  state[`${side}Ranks`] = emptyRanks();
  if (side === "atk") state.atkNature = "いじっぱり";
  else state.defNature = "ずぶとい";
  syncItemForSide(side);
  if (side === "atk") clearMoveIfNotLearnable();
  renderSlot(side);
  updateItemBtns();
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
      <input type="text" id="poke-q" placeholder="名前検索（ひらがな可）" autocomplete="off" />
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
      if (q && !textMatchesQuery(p.name, q)) return false;
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
  if (!state.atk) {
    openModal("使う技", `<div class="history-empty">先に攻撃側のポケモンを選んでください</div>`);
    return;
  }
  const atkTypes = state.atk?.types || [];
  const learnable = learnableMovesFor(state.atk);
  const learnableSet = learnable ? new Set(learnable) : null;
  openModal("使う技", `
    <div class="filters">
      <input type="text" id="move-q" placeholder="技名検索（ひらがな可）" autocomplete="off" />
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
      <label class="check-inline"><input type="checkbox" id="move-stab-only" ${atkTypes.length ? "" : "disabled"} /> 攻撃側タイプ一致技のみ</label>
      <div class="ability-note">${
        learnableSet
          ? `${state.atk.name} の覚え技 ${learnableSet.size} 件（Champions覚え技）`
          : "覚え技データなし → 全技から選択"
      }</div>
    </div>
    <div class="list" id="move-list"></div>
  `);

  const renderList = () => {
    const q = ($("move-q").value || "").trim();
    const type = $("move-type").value;
    const cat = $("move-cat").value;
    const stabOnly = $("move-stab-only")?.checked;
    let list = state.moves.filter((m) => {
      if (learnableSet && !learnableSet.has(m.name)) return false;
      if (q && !textMatchesQuery(m.name, q)) return false;
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
    $("move-list").innerHTML = list.length
      ? list
          .slice(0, 300)
          .map(
            (m) => `
        <div class="list-item" data-name="${m.name}">
          <div class="n">${m.name}${atkTypes.includes(m.type) ? " ★" : ""}</div>
          <div class="s">${m.type} / ${m.category}　威力 ${m.power ?? "-"}　命中 ${m.accuracy ?? "-"}　PP ${m.pp}
          <br/>${(m.effect || m.target || "").slice(0, 80)}</div>
        </div>`
          )
          .join("")
      : `<div class="history-empty">条件に合う覚え技がありません</div>`;
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
  const poke = state[side];
  if (isMegaPokemon(poke)) {
    state[side === "atk" ? "atkItem" : "defItem"] = "メガストーン";
    updateItemBtns();
    openModal(side === "atk" ? "攻撃側の持ち物" : "防御側の持ち物", `
      <div class="history-empty">
        ${poke.name} はメガシンカ済みのため<br/>
        持ち物は <strong>メガストーン</strong> 固定です<br/>
        <span style="font-size:0.85em;opacity:.8">（選択・変更できません）</span>
      </div>
    `);
    return;
  }
  openModal(side === "atk" ? "攻撃側の持ち物" : "防御側の持ち物", `
    <div class="filters">
      <input type="text" id="item-q" placeholder="名前検索（ひらがな可）" autocomplete="off" />
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
      if (it.name === "メガストーン") return false;
      if (q && !textMatchesQuery(it.name, q)) return false;
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
        if (isMegaPokemon(state[side])) {
          state[side === "atk" ? "atkItem" : "defItem"] = "メガストーン";
          updateItemBtns();
          closeModal();
          recalc();
          return;
        }
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
    const n = learnableMovesFor(state.atk)?.length;
    btn.innerHTML = `<div class="title">技を選択</div><div class="sub">${
      state.atk
        ? n != null
          ? `覚え技 ${n} 件から選択`
          : "名前・タイプ・分類で検索"
        : "先に攻撃側ポケモンを選択"
    }</div>`;
    return;
  }
  const m = state.move;
  btn.innerHTML = `<div class="title">${m.name}</div>
    <div class="sub">${m.type} / ${m.category}　威力 ${m.power ?? "-"}　命中 ${m.accuracy ?? "-"}</div>`;
}

function sideSpeedInfo(side) {
  const poke = state[side];
  if (!poke) return null;
  const stats = calcAllStats(poke.baseStats, state[`${side}Evs`], state[`${side}Nature`]);
  const rank = state[`${side}Ranks`]?.spe || 0;
  let spe = applyRank(stats.spe, rank);
  const item = state[side === "atk" ? "atkItem" : "defItem"] || "なし";
  const status = $(side === "atk" ? "atk-status" : "def-status")?.value || "なし";
  const ability = state[`${side}Ability`] || "";
  const mods = [];
  if (item === "こだわりスカーフ") {
    spe = Math.floor(spe * 1.5);
    mods.push("スカーフ×1.5");
  }
  if (status === "まひ" && ability !== "じゅうなん") {
    spe = Math.floor(spe * 0.5);
    mods.push("まひ×0.5");
  }
  if (ability === "かるわざ" && (item === "なし" || !item)) {
    spe = Math.floor(spe * 2);
    mods.push("かるわざ×2");
  }
  return {
    name: poke.name,
    raw: stats.spe,
    rank,
    spe,
    mods,
    item,
    scarfSpe: Math.floor(applyRank(stats.spe, rank) * 1.5),
  };
}

function movePriorityHint(move) {
  if (!move) return null;
  const text = `${move.effect || ""} ${move.target || ""}`;
  const m = text.match(/優先度\s*\+?\s*(-?\d+)/);
  return m ? Number(m[1]) : 0;
}

function updateSpeedPanel() {
  const el = $("speed-body");
  if (!el) return;
  const atk = sideSpeedInfo("atk");
  const def = sideSpeedInfo("def");
  if (!atk || !def) {
    el.textContent = "攻撃・防御を選ぶと表示";
    return;
  }

  let verdict;
  if (atk.spe > def.spe) verdict = `攻撃側が先攻（+${atk.spe - def.spe}）`;
  else if (atk.spe < def.spe) verdict = `防御側が先攻（防御が +${def.spe - atk.spe}）`;
  else verdict = "同速（乱数で先攻）";

  const scarfNote =
    atk.item === "こだわりスカーフ"
      ? ""
      : atk.scarfSpe > def.spe
        ? `攻がスカーフなら ${atk.scarfSpe} で先攻`
        : atk.scarfSpe === def.spe
          ? `攻がスカーフなら ${atk.scarfSpe} で同速`
          : `攻がスカーフでも ${atk.scarfSpe} ＜ 防 ${def.spe}`;

  const defScarfed = Math.floor(
    applyRank(
      calcAllStats(state.def.baseStats, state.defEvs, state.defNature).spe,
      state.defRanks?.spe || 0
    ) * 1.5
  );
  const defScarfNote =
    def.item === "こだわりスカーフ"
      ? ""
      : defScarfed > atk.spe
        ? `防がスカーフなら ${defScarfed} で防御先攻`
        : defScarfed === atk.spe
          ? `防がスカーフなら ${defScarfed} で同速`
          : `防がスカーフでも ${defScarfed} ＜ 攻 ${atk.spe}`;

  const pri = movePriorityHint(state.move);
  el.innerHTML = `
    <div class="speed-row">
      <span>攻 ${atk.name}</span>
      <strong>${atk.spe}</strong>
      <span class="speed-mods">${atk.raw}${atk.rank ? ` ランク${atk.rank > 0 ? "+" : ""}${atk.rank}` : ""}${
        atk.mods.length ? ` / ${atk.mods.join(" ")}` : ""
      }</span>
    </div>
    <div class="speed-row">
      <span>防 ${def.name}</span>
      <strong>${def.spe}</strong>
      <span class="speed-mods">${def.raw}${def.rank ? ` ランク${def.rank > 0 ? "+" : ""}${def.rank}` : ""}${
        def.mods.length ? ` / ${def.mods.join(" ")}` : ""
      }</span>
    </div>
    <div class="speed-verdict">${verdict}</div>
    ${scarfNote ? `<div class="speed-whatif">${scarfNote}</div>` : ""}
    ${defScarfNote ? `<div class="speed-whatif">${defScarfNote}</div>` : ""}
    ${
      state.move
        ? `<div class="speed-whatif">選択技の優先度: ${pri > 0 ? "+" : ""}${pri}（同優先度なら素早さ順）</div>`
        : ""
    }
  `;
}

function updateItemBtns() {
  const atkMega = isMegaPokemon(state.atk);
  const defMega = isMegaPokemon(state.def);
  if (atkMega) state.atkItem = "メガストーン";
  if (defMega) state.defItem = "メガストーン";
  const atk = state.items.find((x) => x.name === state.atkItem);
  const def = state.items.find((x) => x.name === state.defItem);
  const atkBtn = $("atk-item-btn");
  const defBtn = $("def-item-btn");
  atkBtn.classList.toggle("locked", atkMega);
  defBtn.classList.toggle("locked", defMega);
  atkBtn.setAttribute("aria-disabled", atkMega ? "true" : "false");
  defBtn.setAttribute("aria-disabled", defMega ? "true" : "false");
  atkBtn.innerHTML = `<div class="title">${state.atkItem}${atkMega ? " 🔒" : ""}</div><div class="sub">${
    atkMega ? "メガシンカ固定・変更不可" : (atk?.effect || "").slice(0, 60)
  }</div>`;
  defBtn.innerHTML = `<div class="title">${state.defItem}${defMega ? " 🔒" : ""}</div><div class="sub">${
    defMega ? "メガシンカ固定・変更不可" : (def?.effect || "").slice(0, 60)
  }</div>`;
}

function recalc() {
  const box = $("result");
  if (!box) return;
  try {
    if (isMegaPokemon(state.atk)) state.atkItem = "メガストーン";
    if (isMegaPokemon(state.def)) state.defItem = "メガストーン";
    updateSpeedPanel();
    if (!state.atk || !state.def || !state.move) {
      box.innerHTML = `<div class="result-sub">ポケモンと技を選ぶと計算されます</div>`;
      if ($("result-mini")) $("result-mini").textContent = "未計算";
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
      attackerItem: state.atkItem || "なし",
      defenderItem: state.defItem || "なし",
      attackerRanks: state.atkRanks,
      defenderRanks: state.defRanks,
      attackerStatus: $("atk-status")?.value || "なし",
      defenderStatus: $("def-status")?.value || "なし",
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
      burn: !!$("burnChip")?.checked || $("def-status")?.value === "やけど",
      poison: $("poisonChip")?.checked
        ? $("def-status")?.value === "もうどく"
          ? "もうどく"
          : "どく"
        : $("def-status")?.value === "どく" || $("def-status")?.value === "もうどく"
          ? $("def-status").value
          : null,
      disguiseBroken: false,
      hpNotFull: !!$("hpNotFull")?.checked,
      movingLast: !!$("movingLast")?.checked,
    });

    if (result.error) {
      box.innerHTML = `<div class="result-sub">${result.error}</div>
      <details class="calc-details"><summary>計算詳細</summary><ul>${(result.details || [])
        .map((d) => `<li>${d}</li>`)
        .join("")}</ul></details>`;
      if ($("result-mini")) $("result-mini").textContent = result.error;
      return;
    }

    let effClass = "";
    if (result.typeMult === 0) effClass = "immune";
    else if (result.typeMult > 1) effClass = "";
    else if (result.typeMult < 1) effClass = "resist";

    function rowHtml(pack, tone) {
      if (!pack) return "";
      const healNote =
        pack.healPerTurn > 0
          ? `<span class="result-heal">${pack.label} ${pack.healPerTurn} 回復</span>`
          : `<span class="result-heal">${pack.label}</span>`;
      const barPct = Math.min(100, pack.percentMax);
      const barMin = Math.min(100, pack.percentMin);
      const koClass =
        pack.koText === "倒せない"
          ? "ko-fail"
          : pack.koGuaranteed
            ? "ko-sure"
            : "ko-rand";
      return `
      <div class="dmg-row ${tone}">
        <div class="dmg-row-main">
          <span class="dmg-pct">${pack.percentMin} ~ ${pack.percentMax}%</span>
          <span class="dmg-abs">(${pack.min} ~ ${pack.max})</span>
          <span class="dmg-ko ${koClass}">${pack.koText}</span>
        </div>
        <div class="dmg-bar" aria-hidden="true">
          <i style="left:0;width:${barPct}%"></i>
          <b style="left:0;width:${barMin}%"></b>
        </div>
        ${healNote}
      </div>`;
    }

    const normal = result.normal;
    const crit = result.critical;
    const primary =
      result.critical && $("critical")?.checked ? result.critical : result.normal || result;
    const main = `${primary.percentMin}％～${primary.percentMax}％　${primary.koText}`;
    const dualRows =
      normal || crit
        ? `<div class="dmg-rows">${rowHtml(normal, "tone-normal")}${rowHtml(crit, "tone-crit")}</div>`
        : `<div class="result-main">${main}</div>
         <div class="result-sub">${primary.min}～${primary.max} ダメージ / 相手HP ${result.defenderHp}</div>`;

    const staminaNote = result.staminaKoNote
      ? `<div class="result-sub">${result.staminaKoNote}</div>`
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
    ${dualRows}
    ${staminaNote}
    <div class="result-eff ${effClass}">${result.effectiveness}</div>
    ${chipHtml}
    <details class="calc-details">
      <summary>計算詳細</summary>
      <ul>${(result.details || []).map((d) => `<li>${d}</li>`).join("")}</ul>
      <p class="result-sub">乱数一覧: ${(primary.rolls || result.rolls || []).join(", ")}</p>
    </details>
  `;
    if ($("result-mini")) $("result-mini").textContent = main;

    const fingerprint = [
      state.atk.name,
      state.def.name,
      state.move.name,
      main,
      crit?.koText || "",
      crit ? `${crit.percentMin}-${crit.percentMax}` : "",
    ].join("|");
    if (fingerprint !== state.lastHistoryFingerprint) {
      state.lastHistoryFingerprint = fingerprint;
      try {
        pushHistoryEntry({
          fingerprint,
          ts: Date.now(),
          atkName: state.atk.name,
          defName: state.def.name,
          moveName: state.move.name,
          summary: main,
          critSummary: crit
            ? `${crit.percentMin}％～${crit.percentMax}％ ${crit.koText}`
            : "",
        });
      } catch (histErr) {
        console.warn("[ダメ計] history save failed", histErr);
      }
    }
  } catch (err) {
    console.error("[ダメ計] recalc failed", err);
    box.innerHTML = `<div class="result-sub">計算エラー: ${err.message}</div>`;
    if ($("result-mini")) $("result-mini").textContent = "エラー";
  }
}

function wire() {
  const on = (id, event, handler) => {
    const el = $(id);
    if (!el) {
      console.warn(`[ダメ計] missing #${id}, skip ${event}`);
      return;
    }
    el.addEventListener(event, handler);
  };

  on("atk-slot", "click", () => openPokemonPicker("atk"));
  on("def-slot", "click", () => openPokemonPicker("def"));
  on("atk-slot", "keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openPokemonPicker("atk");
  });
  on("def-slot", "keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openPokemonPicker("def");
  });
  on("move-btn", "click", openMovePicker);
  on("atk-item-btn", "click", () => openItemPicker("atk"));
  on("def-item-btn", "click", () => openItemPicker("def"));
  on("swap-btn", "click", swapSides);
  on("history-btn", "click", openHistoryModal);
  on("modal-close", "click", closeModal);
  on("modal", "click", (e) => {
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
    "hpNotFull",
    "movingLast",
  ].forEach((id) => on(id, "change", recalc));
}

async function main() {
  await loadData();
  wire();
  applyQueryParams();
  updateItemBtns();
  updateMoveBtn();
  // smoke: ensure ブリジュラス abilities present
  const b = state.pokemon.find((p) => p.name === "ブリジュラス");
  console.info("[ダメ計] loaded", {
    pokemon: state.pokemon.length,
    moves: state.moves.length,
    items: state.items.length,
    learnsets: Object.keys(state.learnsets).length,
    burijurasu: b?.abilities,
  });
  recalc();
}

function applyQueryParams() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return;
  const atkName = q.get("atk");
  const defName = q.get("def");
  const moveName = q.get("move");
  if (atkName) {
    const poke = state.pokemon.find((p) => p.name === atkName);
    if (poke) {
      state.atk = poke;
      state.atkAbility = q.get("atkAbility") || poke.abilities?.[0] || "";
      state.atkNature = q.get("atkNature") || "いじっぱり";
      state.atkItem = q.get("atkItem") || "なし";
      try {
        state.atkEvs = { ...emptyEvs(), ...JSON.parse(q.get("atkEvs") || "{}") };
      } catch {
        state.atkEvs = emptyEvs();
      }
      state.atkRanks = emptyRanks();
      renderSlot("atk");
    }
  }
  if (defName) {
    const poke = state.pokemon.find((p) => p.name === defName);
    if (poke) {
      state.def = poke;
      state.defAbility = q.get("defAbility") || poke.abilities?.[0] || "";
      state.defNature = q.get("defNature") || "ずぶとい";
      state.defItem = q.get("defItem") || "なし";
      try {
        state.defEvs = { ...emptyEvs(), ...JSON.parse(q.get("defEvs") || "{}") };
      } catch {
        state.defEvs = emptyEvs();
      }
      state.defRanks = emptyRanks();
      renderSlot("def");
    }
  }
  if (moveName) {
    state.move = state.moves.find((m) => m.name === moveName) || null;
  }
  syncItemForSide("atk");
  syncItemForSide("def");
}

main().catch((err) => {
  console.error(err);
  $("result").innerHTML = `<div class="result-sub">データ読み込みに失敗しました: ${err.message}</div>`;
});
