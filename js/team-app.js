import {
  NATURES,
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
} from "./stats.js?v=20260919h";
import { TYPES } from "./types.js?v=20260919h";
import {
  emptyTeam,
  emptyMember,
  loadTeams,
  upsertTeam,
  deleteTeam,
  getTeam,
  loadActiveIds,
  saveActiveIds,
  isMegaName,
} from "./team-store.js?v=20260919h";

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
  team: emptyTeam(),
};

const $ = (id) => document.getElementById(id);

function toKatakana(str) {
  return String(str || "").replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}
function normalizeForSearch(str) {
  return toKatakana(str).normalize("NFKC").toLowerCase();
}
function textMatchesQuery(text, q) {
  if (!q) return true;
  return normalizeForSearch(text).includes(normalizeForSearch(q));
}

function openModal(title, html) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = html;
  $("modal").classList.add("open");
  $("modal").setAttribute("aria-hidden", "false");
}
function closeModal() {
  $("modal").classList.remove("open");
  $("modal").setAttribute("aria-hidden", "true");
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

function pokeByName(name) {
  return state.pokemon.find((p) => p.name === name) || null;
}
function moveByName(name) {
  return state.moves.find((m) => m.name === name) || null;
}
function learnable(name) {
  return state.learnsets[name] || [];
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

function refreshTeamSelect() {
  const sel = $("team-select");
  const teams = loadTeams();
  sel.innerHTML =
    `<option value="">（未保存の編集中）</option>` +
    teams
      .map((t) => `<option value="${t.id}" ${t.id === state.team.id ? "selected" : ""}>${t.name}</option>`)
      .join("");
}

function syncMegaItem(m) {
  if (isMegaName(m.species)) m.item = "メガストーン";
  else if (m.item === "メガストーン") m.item = "なし";
}

function moveSlotHtml(moveName, slotLabel) {
  const mv = moveByName(moveName);
  if (!mv) {
    return `
      <div class="k">${slotLabel}</div>
      <div class="title move-empty">＋ 技を選ぶ</div>
      <div class="sub">タップして覚え技から選択</div>`;
  }
  return `
    <div class="k">${slotLabel}</div>
    <div class="title">${mv.name}</div>
    <div class="sub"><span class="type-pill type-${mv.type}">${mv.type}</span> ${mv.category}　威力 ${mv.power ?? "—"}　命中 ${mv.accuracy ?? "—"}</div>`;
}

function renderMembers() {
  $("team-name").value = state.team.name || "";
  const grid = $("member-grid");
  grid.innerHTML = state.team.members
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
          <button type="button" class="selector-btn compact poke-pick" data-pick-poke="${i}">
            <div class="title">${m.species || "＋ ポケモンを選ぶ"}</div>
            <div class="sub">${poke ? `${poke.types.join(" / ")}　種族 H${poke.baseStats.hp} A${poke.baseStats.atk} B${poke.baseStats.def} C${poke.baseStats.spa} D${poke.baseStats.spd} S${poke.baseStats.spe}` : "ここをタップ"}</div>
          </button>
        </div>
        ${
          poke
            ? `
        <div class="member-row">
          <label class="field">特性
            <select data-ability="${i}">
              ${abs.map((a) => `<option value="${a}" ${a === m.ability ? "selected" : ""}>${a}</option>`).join("")}
            </select>
          </label>
          <div class="field">
            <span class="field-label">性格</span>
            <button type="button" class="nature-btn" data-open-nature="${i}">${m.nature}</button>
            ${natureHintHtml(m.nature)}
          </div>
        </div>
        <button type="button" class="selector-btn compact item-pick" data-pick-item="${i}">
          <div class="k">持ち物${mega ? "（メガ固定）" : ""}</div>
          <div class="title">${m.item || "なし"}${mega ? " 🔒" : ""}</div>
        </button>

        <div class="ev-block">
          <div class="ev-block-head">
            <strong>努力値</strong>
            <span class="ev-sum ${evSum > EV_MAX_TOTAL ? "warn" : ""}" data-ev-sum="${i}">合計 ${evSum} / ${EV_MAX_TOTAL}（1項目最大${EV_MAX_PER}）</span>
          </div>
          <div class="ev-list">
            ${STAT_KEYS.map(
              (k) => `
              <div class="ev-line">
                <div class="ev-line-name">${STAT_LABELS[k]}${natureArrow(k, m.nature)}</div>
                <input class="ev-num" type="number" inputmode="numeric" min="0" max="${EV_MAX_PER}" step="1" data-ev="${i}" data-stat="${k}" value="${m.evs?.[k] || 0}" aria-label="${STAT_LABELS[k]}努力値" />
                <div class="ev-line-controls">
                  <button type="button" class="ev-btn" data-ev-set="${i}" data-stat="${k}" data-ev-val="0" title="努力値を0に">0</button>
                  <button type="button" class="ev-btn primary32" data-ev-set="${i}" data-stat="${k}" data-ev-val="32" title="努力値32">32</button>
                </div>
                <div class="ev-line-stat">実数 <strong data-stat-v="${i}" data-stat="${k}">${stats[k]}</strong></div>
              </div>`
            ).join("")}
          </div>
          <div class="ev-presets">
            <span class="ev-preset-label">よく使う配分:</span>
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="as">AS（攻撃+素早）</button>
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="cs">CS（特攻+素早）</button>
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="hb">HB（HP+防御）</button>
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="hd">HD（HP+特防）</button>
            <button type="button" class="ev-btn" data-ev-preset="${i}" data-preset="clear">全部消す</button>
          </div>
        </div>

        <div class="move-block">
          <strong>技構成</strong>
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
        </div>
        <button type="button" class="icon-btn danger" data-clear="${i}">この枠を空にする</button>
        `
            : `<p class="hint big-hint">上のボタンからポケモンを選ぶと、性格・努力値・技を設定できます</p>`
        }
      </section>`;
    })
    .join("");
}

/** Update EV displays without destroying inputs (keeps focus). */
function refreshEvDisplay(i) {
  const m = state.team.members[i];
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
  const m = state.team.members[i];
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
  renderMembers();
}

function openNaturePicker(idx) {
  const m = state.team.members[idx];
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
    (n) =>
      `<button type="button" class="nat-cell neutral${n === current ? " selected" : ""}" data-nature="${n}">${n}</button>`
  ).join("");

  openModal(`#${idx + 1} の性格`, `
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
      m.nature = btn.dataset.nature;
      closeModal();
      renderMembers();
    });
  });
}

function openPokePicker(idx) {
  openModal("ポケモンを選ぶ", `
    <div class="filters">
      <input type="text" id="q" placeholder="名前検索（ひらがな可）　例: かいりゅー" autocomplete="off" />
    </div>
    <div class="list" id="list"></div>
  `);
  const render = () => {
    const q = ($("q").value || "").trim();
    const list = state.pokemon.filter((p) => textMatchesQuery(p.name, q)).slice(0, 250);
    $("list").innerHTML = list.length
      ? list
          .map(
            (p) => `
      <div class="list-item" data-name="${p.name}">
        <div class="n">${p.name}</div>
        <div class="s">${p.types.join("/")}　H${p.baseStats.hp} A${p.baseStats.atk} B${p.baseStats.def} C${p.baseStats.spa} D${p.baseStats.spd} S${p.baseStats.spe}</div>
      </div>`
          )
          .join("")
      : `<div class="history-empty">見つかりません</div>`;
    $("list").querySelectorAll(".list-item").forEach((el) => {
      el.addEventListener("click", () => {
        const poke = pokeByName(el.dataset.name);
        const m = state.team.members[idx];
        m.species = poke.name;
        m.ability = poke.abilities?.[0] || "";
        m.nature = "いじっぱり";
        m.evs = emptyEvs();
        m.moves = ["", "", "", ""];
        syncMegaItem(m);
        closeModal();
        renderMembers();
      });
    });
  };
  $("q").addEventListener("input", render);
  render();
  $("q").focus();
}

function openItemPicker(idx) {
  const m = state.team.members[idx];
  if (isMegaName(m.species)) {
    openModal("持ち物", `<div class="history-empty">メガポケモンはメガストーン固定です</div>`);
    return;
  }
  openModal("持ち物", `
    <div class="filters"><input type="text" id="q" placeholder="名前検索（ひらがな可）" autocomplete="off" /></div>
    <div class="list" id="list"></div>
  `);
  const render = () => {
    const q = ($("q").value || "").trim();
    const list = state.items.filter(
      (it) => it.name !== "メガストーン" && textMatchesQuery(it.name, q)
    );
    $("list").innerHTML =
      `<div class="list-item" data-name="なし"><div class="n">なし</div></div>` +
      list
        .slice(0, 250)
        .map(
          (it) => `
      <div class="list-item" data-name="${it.name}">
        <div class="n">${it.name}</div>
        <div class="s">${(it.effect || "").slice(0, 90)}</div>
      </div>`
        )
        .join("");
    $("list").querySelectorAll(".list-item").forEach((el) => {
      el.addEventListener("click", () => {
        m.item = el.dataset.name;
        closeModal();
        renderMembers();
      });
    });
  };
  $("q").addEventListener("input", render);
  render();
  $("q").focus();
}

function openMovePicker(idx, mi) {
  const m = state.team.members[idx];
  const poke = pokeByName(m.species);
  const types = poke?.types || [];
  const allowed = new Set(learnable(m.species));
  openModal(`${m.species} — 技${mi + 1}`, `
    <div class="filters">
      <input type="text" id="q" placeholder="技名検索（ひらがな可）" autocomplete="off" />
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
      <label class="check-inline"><input type="checkbox" id="stab-only" /> タイプ一致のみ</label>
      <div class="ability-note">覚え技 ${allowed.size} 件　★=タイプ一致</div>
    </div>
    <div class="list" id="list"></div>
  `);
  const render = () => {
    const q = ($("q").value || "").trim();
    const type = $("move-type").value;
    const cat = $("move-cat").value;
    const stabOnly = $("stab-only")?.checked;
    let list = state.moves.filter((mv) => {
      if (!allowed.has(mv.name)) return false;
      if (q && !textMatchesQuery(mv.name, q)) return false;
      if (type && mv.type !== type) return false;
      if (cat && mv.category !== cat) return false;
      if (stabOnly && types.length && !types.includes(mv.type)) return false;
      return true;
    });
    list.sort((a, b) => {
      const as = types.includes(a.type) ? 0 : 1;
      const bs = types.includes(b.type) ? 0 : 1;
      const ac = a.category === "変化" ? 1 : 0;
      const bc = b.category === "変化" ? 1 : 0;
      return as - bs || ac - bc || (b.power || 0) - (a.power || 0) || a.name.localeCompare(b.name, "ja");
    });
    $("list").innerHTML =
      `<div class="list-item" data-name=""><div class="n">（この枠を空にする）</div></div>` +
      (list.length
        ? list
            .slice(0, 400)
            .map((mv) => {
              const stab = types.includes(mv.type);
              return `
          <div class="list-item" data-name="${mv.name}">
            <div class="n">${mv.name}${stab ? " ★" : ""}</div>
            <div class="s"><span class="type-pill type-${mv.type}">${mv.type}</span> ${mv.category}　威力 ${mv.power ?? "—"}　命中 ${mv.accuracy ?? "—"}　PP ${mv.pp ?? "—"}</div>
          </div>`;
            })
            .join("")
        : `<div class="history-empty">条件に合う覚え技がありません</div>`);
    $("list").querySelectorAll(".list-item").forEach((el) => {
      el.addEventListener("click", () => {
        m.moves[mi] = el.dataset.name || "";
        closeModal();
        renderMembers();
      });
    });
  };
  $("q").addEventListener("input", render);
  $("move-type").addEventListener("change", render);
  $("move-cat").addEventListener("change", render);
  $("stab-only")?.addEventListener("change", render);
  render();
  $("q").focus();
}

function wireGrid() {
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
      state.team.members[Number(t.dataset.clear)] = emptyMember();
      renderMembers();
    }
    if (t.dataset.evSet != null) {
      const i = Number(t.dataset.evSet);
      const stat = t.dataset.stat;
      const val = Number(t.dataset.evVal) || 0;
      const m = state.team.members[i];
      m.evs = clampEvAssign(m.evs || emptyEvs(), stat, val);
      refreshEvDisplay(i);
    }
    if (t.dataset.evPreset != null) {
      applyEvPreset(Number(t.dataset.evPreset), t.dataset.preset);
    }
  });
  $("member-grid").addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.ability != null) {
      state.team.members[Number(t.dataset.ability)].ability = t.value;
    }
  });
  $("member-grid").addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || t.dataset.ev == null) return;
    const i = Number(t.dataset.ev);
    const stat = t.dataset.stat;
    const m = state.team.members[i];
    m.evs = clampEvAssign(m.evs || emptyEvs(), stat, Number(t.value) || 0);
    // keep typed value if clamp changed it
    if (Number(t.value) !== (m.evs[stat] || 0)) t.value = String(m.evs[stat] || 0);
    refreshEvDisplay(i);
  });
}

function saveCurrent(silent = false) {
  state.team.name = ($("team-name").value || "").trim() || "無題パーティ";
  state.team.members.forEach(syncMegaItem);
  state.team = upsertTeam(state.team);
  refreshTeamSelect();
  const act = loadActiveIds();
  if (!act.mine) saveActiveIds(state.team.id, act.foe);
  if (!silent) {
    const tip = document.createElement("div");
    tip.className = "toast";
    tip.textContent = "保存しました";
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 1400);
  }
}

function main() {
  loadData()
    .then(() => {
      const teams = loadTeams();
      const act = loadActiveIds();
      if (act.mine && getTeam(act.mine)) state.team = structuredClone(getTeam(act.mine));
      else if (teams[0]) state.team = structuredClone(teams[0]);
      else state.team = emptyTeam("マイパーティ");

      refreshTeamSelect();
      renderMembers();
      wireGrid();

      $("team-select").addEventListener("change", () => {
        const id = $("team-select").value;
        if (!id) return;
        const t = getTeam(id);
        if (t) {
          state.team = structuredClone(t);
          renderMembers();
        }
      });
      $("btn-new").addEventListener("click", () => {
        state.team = emptyTeam();
        refreshTeamSelect();
        renderMembers();
      });
      $("btn-save").addEventListener("click", () => saveCurrent(false));
      $("btn-delete").addEventListener("click", () => {
        if (!state.team.id || !getTeam(state.team.id)) {
          state.team = emptyTeam();
          renderMembers();
          return;
        }
        if (!confirm(`「${state.team.name}」を削除しますか？`)) return;
        deleteTeam(state.team.id);
        state.team = loadTeams()[0] ? structuredClone(loadTeams()[0]) : emptyTeam();
        refreshTeamSelect();
        renderMembers();
      });
      $("btn-to-matchup").addEventListener("click", () => {
        saveCurrent(true);
        const act2 = loadActiveIds();
        saveActiveIds(state.team.id, act2.foe);
        location.href = "./matchup.html";
      });
      $("modal-close").addEventListener("click", closeModal);
      $("modal").addEventListener("click", (e) => {
        if (e.target === $("modal")) closeModal();
      });
    })
    .catch((err) => {
      console.error(err);
      $("member-grid").innerHTML = `<div class="history-empty">読み込み失敗: ${err.message}</div>`;
    });
}

main();
