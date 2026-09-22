/**
 * 対戦シミュ UI（Phase 1）
 * 自分: 構築1つから3匹選出 / 相手: AIが組んだ6匹からAIが3匹選出
 */
import {
  loadTeams,
  getActiveSlot,
  setActiveSlot,
  applyUiMode,
} from "./team-store.js?v=20260922c";
import {
  $,
  loadGameData,
  wireUiModeToggle,
} from "./common.js?v=20260922c";
import { pokeImgHtml, itemImgHtml, typeIconHtml } from "./media.js?v=20260922c";
import { createBattleState, hpRatio, activeOf, livingIndices, takeEvents } from "./battle/state.js?v=20260922f";
import {
  resolveTurn,
  botChooseAction,
  forcePlayerSwitch,
  completePivotSwitch,
  completeForceSwitch,
} from "./battle/engine.js?v=20260922f";
import { generateFoeTeam, selectFoeThree } from "./battle/ai-team.js?v=20260922f";
import { onSwitchIn } from "./battle/hooks.js?v=20260922f";
import { fieldSummary, hazardsSummary } from "./battle/field.js?v=20260922f";
import { applySwitchInHazards } from "./battle/hazards.js?v=20260922f";
import {
  canMegaEvolve,
  performMegaEvolve,
  listMegaOptions,
  initMegaFlags,
} from "./battle/mega.js?v=20260922f";

const state = {
  pokemon: [],
  moves: [],
  items: [],
  learnsets: {},
  battle: null,
  myPick: new Set(),
  mineSlot: 0,
  foeTeam: [],
  foeSelect: [],
};

function pokeByName(name) {
  return state.pokemon.find((p) => p.name === name) || null;
}

function moveByName(name) {
  return state.moves.find((m) => m.name === name) || null;
}

function teams() {
  return loadTeams();
}

function filled(team) {
  return (team?.members || []).filter((m) => m.species && (m.moves || []).some(Boolean));
}

function show(id, on) {
  const el = $(id);
  if (el) el.hidden = !on;
}

function fillTeamSelect() {
  const list = teams();
  $("mine-select").innerHTML = list
    .map((t, i) => {
      const n = filled(t).length;
      return `<option value="${i}">${t.name}（技あり${n}/6）</option>`;
    })
    .join("");
  state.mineSlot = Math.min(getActiveSlot(), Math.max(0, list.length - 1));
  $("mine-select").value = String(state.mineSlot);
}

function renderSelectChips() {
  const mine = teams()[state.mineSlot];
  const members = filled(mine);
  $("select-chips").innerHTML = members
    .map((m, i) => {
      const key = String(i);
      const on = state.myPick.has(key);
      const disabled = !on && state.myPick.size >= 3;
      const poke = pokeByName(m.species);
      return `<button type="button" class="select-chip ${on ? "on" : ""} ${disabled ? "disabled" : ""}" data-key="${key}">
        <div style="display:flex;gap:8px;align-items:center">
          ${pokeImgHtml(m.species, { size: 40, dex: poke?.dex, round: true })}
          <div>
            <strong>${m.species}</strong>
            <div class="hint">${itemImgHtml(m.item, { size: 16 })} ${(m.moves || []).filter(Boolean).slice(0, 2).join(" / ")}</div>
          </div>
        </div>
      </button>`;
    })
    .join("");
  $("btn-start-battle").disabled = state.myPick.size !== 3;

  // preview foe AI team
  const box = $("foe-preview");
  if (box) {
    box.innerHTML = state.foeTeam.length
      ? `<div class="field-label">相手AI構築（6匹）</div>
         <div class="select-row">${state.foeTeam
           .map((m) => {
             const poke = pokeByName(m.species);
             return `<div class="select-chip foe-preview-chip">
               ${pokeImgHtml(m.species, { size: 36, dex: poke?.dex, round: true })}
               <div>
                 <strong>${m.species}</strong>
                 <div class="hint">${itemImgHtml(m.item, { size: 14 })} ${m.item}　${m.nature}</div>
               </div>
             </div>`;
           })
           .join("")}</div>`
      : "";
  }
}

function rebuildFoeTeam() {
  const mine = teams()[state.mineSlot];
  const avoid = (mine?.members || []).map((m) => m.species).filter(Boolean);
  state.foeTeam = generateFoeTeam({
    pokemon: state.pokemon,
    moves: state.moves,
    learnsets: state.learnsets,
    avoidSpecies: avoid,
  });
}

function partyDots(sideState, elId) {
  $(elId).innerHTML = sideState.party
    .map((b, i) => {
      const cls = b.fainted ? "out" : i === sideState.active ? "active" : "ready";
      return `<span class="party-dot ${cls}" title="${b.species}"></span>`;
    })
    .join("");
}

function animateEvents(events) {
  for (const ev of events) {
    if (ev.type === "damage") {
      const side = ev.side === "player" ? $("player-side") : $("foe-side");
      side?.classList.remove("hit");
      void side?.offsetWidth;
      side?.classList.add("hit");
    }
    if (ev.type === "move") {
      const side = ev.side === "player" ? $("player-sprite") : $("foe-sprite");
      side?.classList.remove("atk");
      void side?.offsetWidth;
      side?.classList.add("atk");
    }
    if (ev.type === "faint") {
      const side = ev.side === "player" ? $("player-sprite") : $("foe-sprite");
      side?.classList.add("faint");
    }
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

function renderFight() {
  const b = state.battle;
  if (!b) return;
  const p = activeOf(b.player);
  const f = activeOf(b.foe);

  $("player-name").textContent = p?.species || "—";
  $("foe-name").textContent = f?.species || "—";
  $("player-hp-text").textContent = p ? `${p.hp}/${p.maxHp}` : "";
  $("foe-hp-text").textContent = f ? `${f.hp}/${f.maxHp}` : "";

  const pr = hpRatio(p || { hp: 0, maxHp: 1 });
  const fr = hpRatio(f || { hp: 0, maxHp: 1 });
  $("player-hp").classList.toggle("low", pr < 0.3);
  $("foe-hp").classList.toggle("low", fr < 0.3);
  $("player-hp").querySelector("span").style.width = `${Math.max(0, pr * 100)}%`;
  $("foe-hp").querySelector("span").style.width = `${Math.max(0, fr * 100)}%`;

  $("player-status").innerHTML = p
    ? `${itemImgHtml(p.item, { size: 16 })} ${p.item}　${p.ability}${p.status !== "なし" ? `　[${p.status}]` : ""}${
        (p.substituteHP || 0) > 0 ? `　[みがわり${p.substituteHP}]` : ""
      }`
    : "";
  $("foe-status").innerHTML = f
    ? `${itemImgHtml(f.item, { size: 16 })} ${f.item}　${f.ability}${f.status !== "なし" ? `　[${f.status}]` : ""}${
        (f.substituteHP || 0) > 0 ? `　[みがわり${f.substituteHP}]` : ""
      }`
    : "";

  $("player-sprite").innerHTML = p
    ? pokeImgHtml(p.species, { size: 96, dex: p.poke?.dex, round: true })
    : "";
  $("foe-sprite").innerHTML = f
    ? pokeImgHtml(f.species, { size: 96, dex: f.poke?.dex, round: true })
    : "";
  $("player-sprite").classList.remove("faint");
  $("foe-sprite").classList.remove("faint");

  partyDots(b.player, "player-dots");
  partyDots(b.foe, "foe-dots");

  const fieldEl = $("battle-field-status");
  if (fieldEl) {
    fieldEl.innerHTML = `<div><strong>場</strong> ${escapeHtml(fieldSummary(b))}</div>
      <div><strong>自分側</strong> ${escapeHtml(hazardsSummary(b, "player"))}</div>
      <div><strong>相手側</strong> ${escapeHtml(hazardsSummary(b, "foe"))}</div>`;
  }

  $("battle-log").innerHTML = b.log.map((l) => `<div>${escapeHtml(l)}</div>`).join("");
  $("battle-log").scrollTop = $("battle-log").scrollHeight;

  const forceSwitch =
    b.pendingSwitch === "player" || b.pendingPivot?.side === "player" || b.pendingForce?.side === "player";
  let switchHint = "交代:";
  if (b.pendingSwitch === "player") switchHint = "ひんし交代必須:";
  else if (b.pendingPivot?.side === "player") switchHint = "交代技 — 出すポケモン:";
  else if (b.pendingForce?.side === "player") switchHint = "強制交代 — 出すポケモン:";

  $("move-actions").innerHTML = "";
  $("switch-actions").innerHTML = "";

  if (b.winner) {
    $("move-actions").innerHTML = `<div class="battle-result ${b.winner === "player" ? "win" : "lose"}">${
      b.winner === "player" ? "勝利！" : "敗北…"
    }</div>`;
    return;
  }

  if (!forceSwitch && p) {
    const megaBtn = canMegaEvolve(b, "player", state.pokemon)
      ? `<button type="button" class="icon-btn mega-btn" id="btn-mega">メガシンカ</button>`
      : "";
    $("move-actions").innerHTML =
      megaBtn +
      (p.moves || [])
        .map((slot) => {
          const mv = moveByName(slot.name);
          const empty = slot.pp <= 0;
          return `<button type="button" class="selector-btn compact battle-move ${empty ? "disabled" : ""}" data-move="${escapeAttr(slot.name)}" ${empty ? "disabled" : ""}>
          <div class="k">${mv ? typeIconHtml(mv.type, { size: "sm" }) : ""} ${mv?.category || ""}　PP ${slot.pp}/${slot.maxPp}</div>
          <div class="title">${slot.name}</div>
          <div class="sub">威力 ${mv?.power ?? "—"}　命中 ${mv?.accuracy ?? "—"}</div>
        </button>`;
        })
        .join("");
    $("btn-mega")?.addEventListener("click", doPlayerMega);
  }

  const alive = livingIndices(b.player).filter((i) => forceSwitch || i !== b.player.active);
  $("switch-actions").innerHTML =
    `<span class="hint">${switchHint}</span>` +
    (alive.length
      ? alive
          .map((i) => {
            const mon = b.player.party[i];
            return `<button type="button" class="select-chip" data-switch="${i}">
              ${pokeImgHtml(mon.species, { size: 28, dex: mon.poke?.dex, round: true })}
              ${mon.species}（${mon.hp}/${mon.maxHp}）
            </button>`;
          })
          .join("")
      : `<span class="hint">控えなし</span>`);
}

function startBattle() {
  const mine = teams()[state.mineSlot];
  const myMembers = filled(mine);
  const mySelect = [...state.myPick]
    .map((k) => myMembers[Number(k)])
    .filter(Boolean);

  if (mySelect.length !== 3) {
    alert("3匹選出してください");
    return;
  }
  if (state.foeTeam.length < 3) {
    rebuildFoeTeam();
  }

  let foeSelect = selectFoeThree(mySelect, state.foeTeam, pokeByName, state.moves);
  while (foeSelect.length < 3) {
    const extra = state.foeTeam.find((m) => !foeSelect.includes(m));
    if (!extra) break;
    foeSelect.push(extra);
  }
  foeSelect = foeSelect.slice(0, 3);
  state.foeSelect = foeSelect;

  state.battle = createBattleState({
    playerSelect: mySelect,
    foeSelect,
    pokeByName,
    movesDb: state.moves,
  });
  state.battle.log.push(`試合開始！ 自分: ${mySelect.map((m) => m.species).join(" / ")}`);
  state.battle.log.push(
    `相手AI選出: ${foeSelect.map((m) => `${m.species}(${m.item})`).join(" / ")}`
  );
  // 先発はターン1扱い
  const leadP = activeOf(state.battle.player);
  const leadF = activeOf(state.battle.foe);
  if (leadP) leadP._switchedInTurn = 1;
  if (leadF) leadF._switchedInTurn = 1;
  initMegaFlags(state.battle);
  applySwitchInHazards(state.battle, "player");
  applySwitchInHazards(state.battle, "foe");
  onSwitchIn(state.battle, "player");
  onSwitchIn(state.battle, "foe");

  show("setup-panel", false);
  show("select-panel", false);
  show("fight-panel", true);
  renderFight();
}

function doPlayerMega() {
  const b = state.battle;
  if (!b || b.winner) return;
  const opts = listMegaOptions(b, "player", state.pokemon);
  if (opts.length > 1) {
    const names = opts.map((p) => p.name);
    const pick = window.prompt(`メガ形態を選んでください:\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`, "1");
    const idx = Math.max(0, (Number(pick) || 1) - 1);
    performMegaEvolve(b, "player", state.pokemon, names[idx]);
  } else {
    performMegaEvolve(b, "player", state.pokemon);
  }
  onSwitchIn(b, "player");
  renderFight();
}

function maybeFoeMega() {
  const b = state.battle;
  if (!b || !canMegaEvolve(b, "foe", state.pokemon)) return;
  if (Math.random() < 0.85) {
    const atk = activeOf(b.foe);
    performMegaEvolve(b, "foe", state.pokemon, atk?.megaTarget || undefined);
    onSwitchIn(b, "foe");
  }
}

function doPlayerMove(moveName) {
  const b = state.battle;
  if (!b || b.winner || b.pendingSwitch || b.pendingPivot || b.pendingForce) return;
  maybeFoeMega();
  const foeAct = botChooseAction(b, state.moves);
  resolveTurn(b, { player: { type: "move", move: moveName }, foe: foeAct }, state.moves);
  const events = takeEvents(b);
  renderFight();
  animateEvents(events);
}

function doPlayerSwitch(index) {
  const b = state.battle;
  if (!b || b.winner) return;
  if (b.pendingPivot?.side === "player") {
    completePivotSwitch(b, index);
    const events = takeEvents(b);
    renderFight();
    animateEvents(events);
    return;
  }
  if (b.pendingForce?.side === "player") {
    completeForceSwitch(b, index);
    const events = takeEvents(b);
    renderFight();
    animateEvents(events);
    return;
  }
  if (b.pendingSwitch === "player") {
    forcePlayerSwitch(b, index);
    const events = takeEvents(b);
    renderFight();
    animateEvents(events);
    return;
  }
  const foeAct = botChooseAction(b, state.moves);
  maybeFoeMega();
  resolveTurn(b, { player: { type: "switch", index }, foe: foeAct }, state.moves);
  const events = takeEvents(b);
  renderFight();
  animateEvents(events);
}

function wire() {
  wireUiModeToggle();

  $("mine-select").addEventListener("change", () => {
    state.mineSlot = Number($("mine-select").value);
    setActiveSlot(state.mineSlot);
  });

  $("btn-start-select").addEventListener("click", () => {
    const mine = teams()[state.mineSlot];
    if (filled(mine).length < 3) {
      alert("自分の構築に、技付きポケモンが3匹以上必要です");
      return;
    }
    state.myPick = new Set();
    rebuildFoeTeam();
    if (state.foeTeam.length < 3) {
      alert("相手AI構築の生成に失敗しました。再読み込みして試してください");
      return;
    }
    show("setup-panel", false);
    show("select-panel", true);
    renderSelectChips();
  });

  $("btn-reroll-foe")?.addEventListener("click", () => {
    rebuildFoeTeam();
    renderSelectChips();
  });

  $("btn-back-setup").addEventListener("click", () => {
    show("select-panel", false);
    show("setup-panel", true);
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
    if (btn && !btn.disabled) doPlayerMove(btn.dataset.move);
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
}

async function main() {
  applyUiMode();
  const data = await loadGameData();
  Object.assign(state, data);
  fillTeamSelect();
  wire();
}

main();
