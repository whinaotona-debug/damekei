import {
  NATURES,
  STAT_KEYS,
  STAT_LABELS,
  EV_MAX_PER,
  EV_MAX_TOTAL,
  calcAllStats,
  emptyEvs,
  totalEv,
  clampEvAssign,
} from "./stats.js?v=20260919e";
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
} from "./team-store.js?v=20260919e";

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
      <section class="member-card" data-i="${i}">
        <div class="member-head">
          <span class="slot-no">#${i + 1}</span>
          <button type="button" class="selector-btn compact" data-pick-poke="${i}">
            <div class="title">${m.species || "ポケモンを選択"}</div>
            <div class="sub">${poke ? poke.types.join(" / ") : "—"}</div>
          </button>
        </div>
        ${
          poke
            ? `
        <div class="member-meta">
          <label>特性
            <select data-ability="${i}">
              ${abs.map((a) => `<option value="${a}" ${a === m.ability ? "selected" : ""}>${a}</option>`).join("")}
            </select>
          </label>
          <label>性格
            <select data-nature="${i}">
              ${NATURES.map((n) => `<option value="${n.name}" ${n.name === m.nature ? "selected" : ""}>${n.name}</option>`).join("")}
            </select>
          </label>
          <button type="button" class="selector-btn compact" data-pick-item="${i}" ${mega ? "disabled" : ""}>
            <div class="k">持ち物</div>
            <div class="title">${m.item || "なし"}${mega ? " 🔒" : ""}</div>
          </button>
        </div>
        <div class="ev-mini">
          ${STAT_KEYS.map(
            (k) => `
            <label>${STAT_LABELS[k]}
              <input type="number" min="0" max="${EV_MAX_PER}" data-ev="${i}" data-stat="${k}" value="${m.evs?.[k] || 0}" />
              <span class="stat-v">${stats?.[k] ?? "-"}</span>
            </label>`
          ).join("")}
          <div class="ev-sum ${evSum > EV_MAX_TOTAL ? "warn" : ""}">合計 ${evSum}/${EV_MAX_TOTAL}</div>
        </div>
        <div class="move-slots">
          ${[0, 1, 2, 3]
            .map(
              (mi) => `
            <button type="button" class="selector-btn compact" data-pick-move="${i}" data-mi="${mi}">
              <div class="k">技${mi + 1}</div>
              <div class="title">${m.moves?.[mi] || "未設定"}</div>
            </button>`
            )
            .join("")}
        </div>
        <button type="button" class="icon-btn danger" data-clear="${i}">枠を空に</button>
        `
            : `<p class="hint">ポケモンを選んでください</p>`
        }
      </section>`;
    })
    .join("");
}

function openPokePicker(idx) {
  openModal("ポケモン", `
    <div class="filters">
      <input type="text" id="q" placeholder="名前検索（ひらがな可）" autocomplete="off" />
    </div>
    <div class="list" id="list"></div>
  `);
  const render = () => {
    const q = ($("q").value || "").trim();
    const list = state.pokemon.filter((p) => textMatchesQuery(p.name, q)).slice(0, 200);
    $("list").innerHTML = list
      .map(
        (p) => `
      <div class="list-item" data-name="${p.name}">
        <div class="n">${p.name}</div>
        <div class="s">${p.types.join("/")}　H${p.baseStats.hp} A${p.baseStats.atk} B${p.baseStats.def} C${p.baseStats.spa} D${p.baseStats.spd} S${p.baseStats.spe}</div>
      </div>`
      )
      .join("");
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
  if (isMegaName(m.species)) return;
  openModal("持ち物", `
    <div class="filters"><input type="text" id="q" placeholder="検索" autocomplete="off" /></div>
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
        .slice(0, 200)
        .map(
          (it) => `
      <div class="list-item" data-name="${it.name}">
        <div class="n">${it.name}</div>
        <div class="s">${(it.effect || "").slice(0, 80)}</div>
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
  const allowed = new Set(learnable(m.species));
  openModal(`技${mi + 1}`, `
    <div class="filters"><input type="text" id="q" placeholder="技名検索" autocomplete="off" /></div>
    <div class="ability-note">覚え技 ${allowed.size} 件</div>
    <div class="list" id="list"></div>
  `);
  const render = () => {
    const q = ($("q").value || "").trim();
    let list = state.moves.filter((mv) => allowed.has(mv.name) && textMatchesQuery(mv.name, q));
    list = list.filter((mv) => mv.category !== "変化" || true).slice(0, 300);
    $("list").innerHTML =
      `<div class="list-item" data-name=""><div class="n">（未設定）</div></div>` +
      list
        .map(
          (mv) => `
      <div class="list-item" data-name="${mv.name}">
        <div class="n">${mv.name}</div>
        <div class="s">${mv.type} / ${mv.category}　威力 ${mv.power ?? "-"}</div>
      </div>`
        )
        .join("");
    $("list").querySelectorAll(".list-item").forEach((el) => {
      el.addEventListener("click", () => {
        m.moves[mi] = el.dataset.name || "";
        closeModal();
        renderMembers();
      });
    });
  };
  $("q").addEventListener("input", render);
  render();
  $("q").focus();
}

function wireGrid() {
  $("member-grid").addEventListener("click", (e) => {
    const t = e.target.closest("[data-pick-poke],[data-pick-item],[data-pick-move],[data-clear]");
    if (!t) return;
    if (t.dataset.pickPoke != null) openPokePicker(Number(t.dataset.pickPoke));
    if (t.dataset.pickItem != null) openItemPicker(Number(t.dataset.pickItem));
    if (t.dataset.pickMove != null) openMovePicker(Number(t.dataset.pickMove), Number(t.dataset.mi));
    if (t.dataset.clear != null) {
      state.team.members[Number(t.dataset.clear)] = emptyMember();
      renderMembers();
    }
  });
  $("member-grid").addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.ability != null) {
      state.team.members[Number(t.dataset.ability)].ability = t.value;
    }
    if (t.dataset.nature != null) {
      state.team.members[Number(t.dataset.nature)].nature = t.value;
      renderMembers();
    }
  });
  $("member-grid").addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || t.dataset.ev == null) return;
    const i = Number(t.dataset.ev);
    const stat = t.dataset.stat;
    const m = state.team.members[i];
    m.evs = clampEvAssign(m.evs || emptyEvs(), stat, Number(t.value) || 0);
    renderMembers();
  });
}

function saveCurrent(silent = false) {
  state.team.name = ($("team-name").value || "").trim() || "無題パーティ";
  state.team.members.forEach(syncMegaItem);
  state.team = upsertTeam(state.team);
  refreshTeamSelect();
  const act = loadActiveIds();
  if (!act.mine) saveActiveIds(state.team.id, act.foe);
  if (!silent) alert("保存しました");
}

function main() {
  loadData().then(() => {
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
    $("btn-save").addEventListener("click", saveCurrent);
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
      const act = loadActiveIds();
      saveActiveIds(state.team.id, act.foe);
      location.href = "./matchup.html";
    });
    $("modal-close").addEventListener("click", closeModal);
    $("modal").addEventListener("click", (e) => {
      if (e.target === $("modal")) closeModal();
    });
  });
}

main();
