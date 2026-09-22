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
import { pokeImgHtml, itemImgHtml, typeIconHtml } from "./media.js?v=20260922d";
import { createBattleState, hpRatio, activeOf, livingIndices, takeEvents } from "./battle/state.js?v=20260922g";
import {
  resolveTurn,
  botChooseAction,
  forcePlayerSwitch,
  completePivotSwitch,
  completeForceSwitch,
} from "./battle/engine.js?v=20260922g";
import { generateFoeTeam, selectFoeThree } from "./battle/ai-team.js?v=20260922g";
import { onSwitchIn } from "./battle/hooks.js?v=20260922f";
import { fieldSummary, hazardsSummary } from "./battle/field.js?v=20260922f";
import { applySwitchInHazards } from "./battle/hazards.js?v=20260922f";
import {
  canMegaEvolve,
  listMegaOptions,
  initMegaFlags,
  demoteMegaMember,
} from "./battle/mega.js?v=20260922g";

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
  megaIntent: false,
  megaFormPick: "",
  animating: false,
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function setHpBar(sideKey, hp, maxHp) {
  const bar = $(sideKey === "player" ? "player-hp" : "foe-hp");
  const text = $(sideKey === "player" ? "player-hp-text" : "foe-hp-text");
  if (!bar) return;
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const span = bar.querySelector("span");
  if (span) span.style.width = `${pct}%`;
  bar.classList.toggle("low", pct <= 25);
  if (text) text.textContent = `${Math.max(0, hp)} / ${maxHp}`;
}

function flashAtk(sideKey) {
  const el = $(sideKey === "player" ? "player-sprite" : "foe-sprite");
  if (!el) return;
  el.classList.remove("atk");
  void el.offsetWidth;
  el.classList.add("atk");
}

function flashHit(sideKey) {
  const el = $(sideKey === "player" ? "player-side" : "foe-side");
  if (!el) return;
  el.classList.remove("hit");
  void el.offsetWidth;
  el.classList.add("hit");
}

function flashMega(sideKey, species) {
  const el = $(sideKey === "player" ? "player-sprite" : "foe-sprite");
  if (!el) return;
  el.classList.remove("mega-flash");
  void el.offsetWidth;
  el.classList.add("mega-flash");
  const nameEl = $(sideKey === "player" ? "player-name" : "foe-name");
  if (nameEl && species) nameEl.textContent = species;
  const poke = pokeByName(species);
  el.innerHTML = pokeImgHtml(species, { size: 120, dex: poke?.dex, round: true });
}

function showMoveBanner(text) {
  let ban = $("battle-move-banner");
  if (!ban) {
    ban = document.createElement("div");
    ban.id = "battle-move-banner";
    ban.className = "battle-move-banner";
    $("fight-panel")?.appendChild(ban);
  }
  ban.textContent = text;
  ban.classList.add("show");
  return ban;
}

function hideMoveBanner() {
  $("battle-move-banner")?.classList.remove("show");
}

/** 先攻→（約1秒）→後攻の順でアニメ */
async function playBattleEvents(events) {
  let moveIndex = 0;
  const hpTrack = {
    player: {
      hp: activeOf(state.battle?.player)?.hp,
      max: activeOf(state.battle?.player)?.maxHp,
    },
    foe: {
      hp: activeOf(state.battle?.foe)?.hp,
      max: activeOf(state.battle?.foe)?.maxHp,
    },
  };
  // ダメージを巻き戻して再生するため、イベントから逆算はせず
  // 最終HPは renderFight で同期。ここでは演出のみ。

  for (const ev of events) {
    if (ev.type === "mega") {
      showMoveBanner("メガシンカ！");
      flashMega(ev.side, ev.species);
      await sleep(700);
      hideMoveBanner();
    }
    if (ev.type === "move") {
      if (moveIndex > 0) await sleep(1000);
      moveIndex += 1;
      const label = moveIndex === 1 ? "先攻" : "後攻";
      showMoveBanner(`${label}　${ev.species || ""} の ${ev.move}！`);
      flashAtk(ev.side);
      await sleep(450);
    }
    if (ev.type === "damage") {
      flashHit(ev.side);
      await sleep(350);
    }
    if (ev.type === "faint") {
      const side = ev.side === "player" ? $("player-sprite") : $("foe-sprite");
      side?.classList.add("faint");
      await sleep(400);
    }
    if (ev.type === "switch") {
      await sleep(350);
    }
  }
  hideMoveBanner();
  void hpTrack;
}

async function runTurnAndAnimate(runFn) {
  if (state.animating) return;
  state.animating = true;
  document.body.classList.add("battle-busy");
  try {
    runFn();
    const events = takeEvents(state.battle);
    // ログ・コマンドは先に更新しつつ、演出を再生
    renderFight();
    await playBattleEvents(events);
    renderFight();
  } finally {
    state.animating = false;
    document.body.classList.remove("battle-busy");
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
    ? pokeImgHtml(p.species, { size: 120, dex: p.poke?.dex, round: true })
    : "";
  $("foe-sprite").innerHTML = f
    ? pokeImgHtml(f.species, { size: 120, dex: f.poke?.dex, round: true })
    : "";
  $("player-sprite").classList.remove("faint", "mega-flash", "atk");
  $("foe-sprite").classList.remove("faint", "mega-flash", "atk");

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
    state.megaIntent = false;
    $("move-actions").innerHTML = `<div class="battle-result ${b.winner === "player" ? "win" : "lose"}">${
      b.winner === "player" ? "勝利！" : "敗北…"
    }</div>`;
    return;
  }

  if (!forceSwitch && p && !state.animating) {
    const canMega = canMegaEvolve(b, "player", state.pokemon);
    if (!canMega) state.megaIntent = false;
    const megaBtn = canMega
      ? `<button type="button" class="icon-btn mega-btn ${state.megaIntent ? "on" : ""}" id="btn-mega">${
          state.megaIntent ? "メガシンカ ON（技と同時）" : "メガシンカ"
        }</button>`
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
    $("btn-mega")?.addEventListener("click", toggleMegaIntent);
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
    .map((k) => demoteMegaMember(myMembers[Number(k)], state.pokemon))
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
  foeSelect = foeSelect
    .slice(0, 3)
    .map((m) => demoteMegaMember(m, state.pokemon));
  state.foeSelect = foeSelect;

  state.battle = createBattleState({
    playerSelect: mySelect,
    foeSelect,
    pokeByName,
    movesDb: state.moves,
  });
  state.battle._pokemonList = state.pokemon;
  state.megaIntent = false;
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
  document.body.classList.add("battle-live");
  document.querySelector(".hub-app")?.classList.add("battle-live-app");
  renderFight();
}

function toggleMegaIntent() {
  const b = state.battle;
  if (!b || !canMegaEvolve(b, "player", state.pokemon)) return;
  if (!state.megaIntent) {
    const opts = listMegaOptions(b, "player", state.pokemon);
    if (opts.length > 1) {
      const names = opts.map((p) => p.name);
      const pick = window.prompt(
        `メガ形態を選んでください:\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
        "1"
      );
      const idx = Math.max(0, (Number(pick) || 1) - 1);
      state.megaFormPick = names[idx] || names[0];
    } else {
      state.megaFormPick = opts[0]?.name || "";
    }
  }
  state.megaIntent = !state.megaIntent;
  renderFight();
}

function doPlayerMove(moveName) {
  const b = state.battle;
  if (!b || b.winner || b.pendingSwitch || b.pendingPivot || b.pendingForce || state.animating) return;
  const playerAct = {
    type: "move",
    move: moveName,
    mega: !!state.megaIntent,
    megaForm: state.megaFormPick || undefined,
  };
  state.megaIntent = false;
  runTurnAndAnimate(() => {
    const foeAct = botChooseAction(b, state.moves);
    resolveTurn(b, { player: playerAct, foe: foeAct }, state.moves, state.pokemon);
  });
}

function doPlayerSwitch(index) {
  const b = state.battle;
  if (!b || b.winner || state.animating) return;
  if (b.pendingPivot?.side === "player") {
    runTurnAndAnimate(() => {
      completePivotSwitch(b, index);
    });
    return;
  }
  if (b.pendingForce?.side === "player") {
    runTurnAndAnimate(() => {
      completeForceSwitch(b, index);
    });
    return;
  }
  if (b.pendingSwitch === "player") {
    runTurnAndAnimate(() => {
      forcePlayerSwitch(b, index);
    });
    return;
  }
  state.megaIntent = false;
  runTurnAndAnimate(() => {
    const foeAct = botChooseAction(b, state.moves);
    resolveTurn(b, { player: { type: "switch", index }, foe: foeAct }, state.moves, state.pokemon);
  });
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
    state.megaIntent = false;
    document.body.classList.remove("battle-live", "battle-busy");
    document.querySelector(".hub-app")?.classList.remove("battle-live-app");
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
