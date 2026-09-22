import {
  loadTeams,
  replaceTeamAt,
  getActiveSlot,
  setActiveSlot,
  applyUiMode,
} from "./team-store.js?v=20260922c";
import { $, wireUiModeToggle } from "./common.js?v=20260922c";

const state = { slot: getActiveSlot(), teams: loadTeams() };

function render() {
  state.teams = loadTeams();
  $("slot-tabs").innerHTML = state.teams
    .map(
      (t, i) =>
        `<button type="button" class="slot-tab ${i === state.slot ? "active" : ""}" data-slot="${i}">${t.name}<span class="sub">メモ</span></button>`
    )
    .join("");
  const t = state.teams[state.slot];
  $("memo-label").textContent = `${t.name} のメモ`;
  $("team-memo").value = t.memo || "";
}

function persist() {
  const t = { ...state.teams[state.slot], memo: $("team-memo").value || "" };
  replaceTeamAt(state.slot, t);
  state.teams = loadTeams();
}

applyUiMode();
wireUiModeToggle();
render();

$("slot-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-slot]");
  if (!btn) return;
  persist();
  state.slot = setActiveSlot(Number(btn.dataset.slot));
  render();
});
$("team-memo").addEventListener("blur", persist);
$("btn-save").addEventListener("click", () => {
  persist();
  $("toast-line").textContent = "保存しました";
  setTimeout(() => ($("toast-line").textContent = ""), 1200);
});
