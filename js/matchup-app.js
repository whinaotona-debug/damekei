import { emptyEvs, emptyRanks } from "./stats.js?v=20260919e";
import { calculateDamage } from "./damage.js?v=20260919e";
import {
  loadTeams,
  getTeam,
  loadActiveIds,
  saveActiveIds,
  getNote,
  saveNote,
  damekeiQuery,
} from "./team-store.js?v=20260922c";

const state = {
  pokemon: [],
  moves: [],
  learnsets: {},
};

const $ = (id) => document.getElementById(id);

async function loadData() {
  const [pokemon, moves, learnsets] = await Promise.all([
    fetch("./data/pokemon.json").then((r) => r.json()),
    fetch("./data/moves.json").then((r) => r.json()),
    fetch("./data/learnsets.json").then((r) => r.json()),
  ]);
  state.pokemon = pokemon;
  state.moves = moves;
  state.learnsets = learnsets;
}

function pokeByName(name) {
  return state.pokemon.find((p) => p.name === name) || null;
}
function moveByName(name) {
  return state.moves.find((m) => m.name === name) || null;
}

function filledMembers(team) {
  return (team?.members || []).filter((m) => m.species);
}

function bestHit(atkMember, defMember) {
  const atk = pokeByName(atkMember.species);
  const def = pokeByName(defMember.species);
  if (!atk || !def) return null;

  let best = null;
  for (const moveName of atkMember.moves || []) {
    if (!moveName) continue;
    const move = moveByName(moveName);
    if (!move || move.category === "変化") continue;
    const result = calculateDamage({
      attackerPoke: atk,
      defenderPoke: def,
      move,
      attackerEvs: atkMember.evs || emptyEvs(),
      defenderEvs: defMember.evs || emptyEvs(),
      attackerNature: atkMember.nature || "がんばりや",
      defenderNature: defMember.nature || "がんばりや",
      attackerAbility: atkMember.ability || atk.abilities?.[0] || "",
      defenderAbility: defMember.ability || def.abilities?.[0] || "",
      attackerItem: atkMember.item || "なし",
      defenderItem: defMember.item || "なし",
      attackerRanks: emptyRanks(),
      defenderRanks: emptyRanks(),
      weather: "なし",
      field: "なし",
      screens: {},
      hpNotFull: false,
    });
    if (result.error) continue;
    const score = (result.percentMax || 0) * 1000 - (result.koHits || 99);
    if (!best || score > best.score) {
      best = { move, result, score };
    }
  }
  return best;
}

function toneFor(result) {
  if (!result) return "tone-empty";
  if (result.koText === "倒せない") return "tone-bad";
  if (result.koGuaranteed && result.koHits <= 2) return "tone-good";
  if (result.koHits && result.koHits <= 3) return "tone-ok";
  if ((result.percentMax || 0) >= 50) return "tone-ok";
  return "tone-bad";
}

function fillSelects() {
  const teams = loadTeams();
  const act = loadActiveIds();
  const opts =
    teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join("") ||
    `<option value="">（パーティなし — 先に作成）</option>`;
  $("mine-select").innerHTML = opts;
  $("foe-select").innerHTML = opts;
  if (act.mine && getTeam(act.mine)) $("mine-select").value = act.mine;
  if (act.foe && getTeam(act.foe)) $("foe-select").value = act.foe;
  else if (teams[1]) $("foe-select").value = teams[1].id;
  else if (teams[0]) $("foe-select").value = teams[0].id;
}

function renderMatrix() {
  const mine = getTeam($("mine-select").value);
  const foe = getTeam($("foe-select").value);
  saveActiveIds(mine?.id || null, foe?.id || null);

  const myMembers = filledMembers(mine);
  const foeMembers = filledMembers(foe);
  const thead = $("matrix").querySelector("thead");
  const tbody = $("matrix").querySelector("tbody");

  if (!myMembers.length || !foeMembers.length) {
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td class="tone-empty">両方のパーティにポケモンを入れてください（<a href="./team.html">パーティ編集</a>）</td></tr>`;
    $("notes").value = "";
    return;
  }

  thead.innerHTML = `<tr>
    <th class="corner">攻＼防</th>
    ${foeMembers.map((m) => `<th>${m.species}</th>`).join("")}
  </tr>`;

  tbody.innerHTML = myMembers
    .map((atkM) => {
      const cells = foeMembers
        .map((defM) => {
          const hit = bestHit(atkM, defM);
          if (!hit) {
            return `<td class="tone-empty">技なし</td>`;
          }
          const { move, result } = hit;
          const q = damekeiQuery({
            atk: atkM.species,
            def: defM.species,
            move: move.name,
            atkItem: atkM.item,
            defItem: defM.item,
            atkNature: atkM.nature,
            defNature: defM.nature,
            atkAbility: atkM.ability,
            defAbility: defM.ability,
            atkEvs: atkM.evs,
            defEvs: defM.evs,
          });
          return `<td class="${toneFor(result)}">
            <a class="cell-link" href="./index.html?${q}" title="ダメ計で開く">
              <div class="cell-move">${move.name}</div>
              <div class="cell-pct">${result.percentMin}〜${result.percentMax}%</div>
              <div class="cell-ko">${result.koText}</div>
            </a>
          </td>`;
        })
        .join("");
      return `<tr><th class="row-head">${atkM.species}</th>${cells}</tr>`;
    })
    .join("");

  $("notes").value = getNote(mine.id, foe.id);
}

function main() {
  loadData().then(() => {
    fillSelects();
    renderMatrix();
    $("mine-select").addEventListener("change", renderMatrix);
    $("foe-select").addEventListener("change", renderMatrix);
    $("btn-calc").addEventListener("click", renderMatrix);
    $("btn-save-note").addEventListener("click", () => {
      const mine = $("mine-select").value;
      const foe = $("foe-select").value;
      if (!mine || !foe) return;
      saveNote(mine, foe, $("notes").value);
      alert("メモを保存しました");
    });
  });
}

main();
