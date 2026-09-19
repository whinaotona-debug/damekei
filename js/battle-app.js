import {
  loadTeams,
  getTeam,
  loadActiveIds,
  saveActiveIds,
} from "./team-store.js?v=20260919e";
import { createBattleState, hpRatio, activeOf, livingIndices } from "./battle/state.js?v=20260919e";
import { resolveTurn, botChooseAction, botSelectThree } from "./battle/engine.js?v=20260919e";

const state = {
  pokemon: [],
  moves: [],
  battle: null,
  myPick: new Set(),
  foeSelect: [],
};

const $ = (id) => document.getElementById(id);

async function loadData() {
  const [pokemon, moves] = await Promise.all([
    fetch("./data/pokemon.json").then((r) => r.json()),
    fetch("./data/moves.json").then((r) => r.json()),
  ]);
  state.pokemon = pokemon;
  state.moves = moves;
}

function pokeByName(name) {
  return state.pokemon.find((p) => p.name === name) || null;
}

function filled(team) {
  return (team?.members || []).filter((m) => m.species && (m.moves || []).some(Boolean));
}

function fillTeamSelects() {
  const teams = loadTeams();
  const act = loadActiveIds();
  const opts = teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
  $("mine-select").innerHTML = opts || `<option value="">なし</option>`;
  $("foe-select").innerHTML = opts || `<option value="">なし</option>`;
  if (act.mine && getTeam(act.mine)) $("mine-select").value = act.mine;
  if (act.foe && getTeam(act.foe)) $("foe-select").value = act.foe;
}

function show(id, on) {
  $(id).hidden = !on;
}

function renderSelectChips() {
  const mine = getTeam($("mine-select").value);
  const members = filled(mine);
  $("select-chips").innerHTML = members
    .map((m, i) => {
      const key = `${m.species}#${i}`;
      const on = state.myPick.has(key);
      const disabled = !on && state.myPick.size >= 3;
      return `<button type="button" class="select-chip ${on ? "on" : ""} ${disabled ? "disabled" : ""}" data-key="${key}" data-i="${i}">
        <strong>${m.species}</strong><br/><span class="hint">${(m.moves || []).filter(Boolean).join(" / ")}</span>
      </button>`;
    })
    .join("");
  $("btn-start-battle").disabled = state.myPick.size !== 3;
}

function startBattle() {
  const mine = getTeam($("mine-select").value);
  const foe = getTeam($("foe-select").value);
  const myMembers = filled(mine);
  const foeMembers = filled(foe);
  const mySelect = [...state.myPick].map((k) => {
    const i = Number(k.split("#").pop());
    return myMembers[i];
  });
  state.foeSelect = botSelectThree(myMembers, foeMembers, pokeByName, state.moves);
  if (state.foeSelect.length < 1) {
    alert("相手パーティに技付きポケモンがいません");
    return;
  }
  while (state.foeSelect.length < 3 && foeMembers.length > state.foeSelect.length) {
    const extra = foeMembers.find((m) => !state.foeSelect.includes(m));
    if (!extra) break;
    state.foeSelect.push(extra);
  }

  state.battle = createBattleState({
    playerTeam: mine,
    foeTeam: foe,
    playerSelect: mySelect,
    foeSelect: state.foeSelect.slice(0, 3),
    pokeByName,
  });
  state.battle.log.push(
    `試合開始！ 相手の選出: ${state.foeSelect
      .slice(0, 3)
      .map((m) => m.species)
      .join(" / ")}`
  );
  show("setup-panel", false);
  show("select-panel", false);
  show("fight-panel", true);
  renderFight();
}

function renderFight() {
  const b = state.battle;
  if (!b) return;
  const p = activeOf(b.player);
  const f = activeOf(b.foe);
  $("player-name").textContent = p?.species || "—";
  $("foe-name").textContent = f?.species || "—";
  $("player-hp-text").textContent = p ? `HP ${p.hp}/${p.maxHp}` : "";
  $("foe-hp-text").textContent = f ? `HP ${f.hp}/${f.maxHp}` : "";
  const pr = hpRatio(p || { hp: 0, maxHp: 1 });
  const fr = hpRatio(f || { hp: 0, maxHp: 1 });
  $("player-hp").classList.toggle("low", pr < 0.3);
  $("foe-hp").classList.toggle("low", fr < 0.3);
  $("player-hp").querySelector("span").style.width = `${Math.max(0, pr * 100)}%`;
  $("foe-hp").querySelector("span").style.width = `${Math.max(0, fr * 100)}%`;
  $("player-status").textContent = p ? `特性 ${p.ability} / ${p.item} / ${p.status}` : "";
  $("foe-status").textContent = f ? `特性 ${f.ability} / ${f.item} / ${f.status}` : "";

  $("battle-log").innerHTML = b.log.map((l) => `<div>${l}</div>`).join("");
  $("battle-log").scrollTop = $("battle-log").scrollHeight;

  const forceSwitch = b.pendingSwitch === "player";
  $("move-actions").innerHTML = "";
  $("switch-actions").innerHTML = "";

  if (b.winner) {
    $("move-actions").innerHTML = `<div class="hint">${b.winner === "player" ? "勝利！" : "敗北…"}</div>`;
    return;
  }

  if (!forceSwitch && p) {
    $("move-actions").innerHTML = (p.moves || [])
      .map(
        (m) =>
          `<button type="button" class="selector-btn compact" data-move="${m}"><div class="title">${m}</div></button>`
      )
      .join("");
  }

  const alive = livingIndices(b.player).filter((i) => i !== b.player.active || forceSwitch);
  $("switch-actions").innerHTML =
    `<span class="hint">${forceSwitch ? "交代必須:" : "交代:"}</span>` +
    alive
      .map((i) => {
        const mon = b.player.party[i];
        return `<button type="button" class="select-chip" data-switch="${i}">${mon.species} (${mon.hp}/${mon.maxHp})</button>`;
      })
      .join("");
}

function doPlayerMove(moveName) {
  const b = state.battle;
  if (!b || b.winner || b.pendingSwitch) return;
  const foeAct = botChooseAction(b, state.moves);
  resolveTurn(b, { player: { type: "move", move: moveName }, foe: foeAct }, state.moves);
  renderFight();
}

function doPlayerSwitch(index) {
  const b = state.battle;
  if (!b || b.winner) return;
  if (b.pendingSwitch === "player") {
    b.player.active = index;
    b.pendingSwitch = null;
    b.log.push(`自分は ${activeOf(b.player).species} を出した`);
    renderFight();
    return;
  }
  const foeAct = botChooseAction(b, state.moves);
  resolveTurn(b, { player: { type: "switch", index }, foe: foeAct }, state.moves);
  renderFight();
}

function main() {
  loadData().then(() => {
    fillTeamSelects();
    $("btn-start-select").addEventListener("click", () => {
      const mine = getTeam($("mine-select").value);
      const foe = getTeam($("foe-select").value);
      if (!filled(mine).length || !filled(foe).length) {
        alert("両方のパーティに、技付きポケモンを入れてください");
        return;
      }
      saveActiveIds(mine.id, foe.id);
      state.myPick = new Set();
      show("select-panel", true);
      renderSelectChips();
    });
    $("select-chips").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-key]");
      if (!btn || btn.classList.contains("disabled")) return;
      const key = btn.dataset.key;
      if (state.myPick.has(key)) state.myPick.delete(key);
      else if (state.myPick.size < 3) state.myPick.add(key);
      renderSelectChips();
    });
    $("btn-start-battle").addEventListener("click", startBattle);
    $("move-actions").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-move]");
      if (btn) doPlayerMove(btn.dataset.move);
    });
    $("switch-actions").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-switch]");
      if (btn) doPlayerSwitch(Number(btn.dataset.switch));
    });
    $("btn-reset").addEventListener("click", () => {
      state.battle = null;
      state.myPick = new Set();
      show("fight-panel", false);
      show("select-panel", false);
      show("setup-panel", true);
    });
  });
}

main();
