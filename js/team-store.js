/**
 * 構築ストレージ（最大3パーティ）
 */
import { emptyEvs, NATURES } from "./stats.js?v=20260920a";

export const MAX_TEAMS = 3;
export const TEAMS_KEY = "damekei-builds-v2";
export const LEGACY_TEAMS_KEY = "damekei-teams-v1";
export const ACTIVE_SLOT_KEY = "damekei-active-slot";
export const UI_MODE_KEY = "damekei-ui-mode";

export function uid() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyMember() {
  return {
    species: "",
    ability: "",
    item: "なし",
    nature: "いじっぱり",
    evs: emptyEvs(),
    moves: ["", "", "", ""],
  };
}

export function emptyTeam(name = "構築1") {
  return {
    id: uid(),
    name,
    memo: "",
    updatedAt: Date.now(),
    members: Array.from({ length: 6 }, () => emptyMember()),
  };
}

function normalizeTeam(raw, fallbackName) {
  const t = raw && typeof raw === "object" ? raw : {};
  return {
    id: t.id || uid(),
    name: (t.name || fallbackName || "構築").slice(0, 40),
    memo: typeof t.memo === "string" ? t.memo : "",
    updatedAt: t.updatedAt || Date.now(),
    members: Array.from({ length: 6 }, (_, i) => {
      const m = t.members?.[i] || emptyMember();
      return {
        species: m.species || "",
        ability: m.ability || "",
        item: m.item || "なし",
        nature: m.nature || "いじっぱり",
        evs: { ...emptyEvs(), ...(m.evs || {}) },
        moves: [0, 1, 2, 3].map((mi) => m.moves?.[mi] || ""),
      };
    }),
  };
}

function migrateFromLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_TEAMS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list) || !list.length) return null;
    return list.slice(0, MAX_TEAMS).map((t, i) => normalizeTeam(t, `構築${i + 1}`));
  } catch {
    return null;
  }
}

/** 常にちょうど3枠を返す */
export function loadTeams() {
  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    let list = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(list) || !list.length) {
      list = migrateFromLegacy();
    }
    if (!Array.isArray(list) || !list.length) {
      list = [emptyTeam("構築1"), emptyTeam("構築2"), emptyTeam("構築3")];
    }
    const out = [];
    for (let i = 0; i < MAX_TEAMS; i++) {
      out.push(normalizeTeam(list[i], `構築${i + 1}`));
    }
    return out;
  } catch {
    return [emptyTeam("構築1"), emptyTeam("構築2"), emptyTeam("構築3")];
  }
}

export function saveTeams(list) {
  const out = [];
  for (let i = 0; i < MAX_TEAMS; i++) {
    out.push(normalizeTeam(list[i], `構築${i + 1}`));
  }
  localStorage.setItem(TEAMS_KEY, JSON.stringify(out));
  return out;
}

export function getTeam(id) {
  return loadTeams().find((t) => t.id === id) || null;
}

export function upsertTeam(team) {
  const list = loadTeams();
  const i = list.findIndex((t) => t.id === team.id);
  const next = normalizeTeam({ ...team, updatedAt: Date.now() }, team.name);
  if (i >= 0) list[i] = next;
  else {
    const emptyIdx = list.findIndex((t) => !t.members.some((m) => m.species));
    if (emptyIdx >= 0) list[emptyIdx] = next;
    else list[0] = next;
  }
  return saveTeams(list)[i >= 0 ? i : 0];
}

export function replaceTeamAt(slot, team) {
  const list = loadTeams();
  const i = Math.max(0, Math.min(MAX_TEAMS - 1, slot));
  list[i] = normalizeTeam({ ...team, updatedAt: Date.now() }, team.name || `構築${i + 1}`);
  saveTeams(list);
  return list[i];
}

export function clearTeamAt(slot) {
  return replaceTeamAt(slot, emptyTeam(`構築${slot + 1}`));
}

export function getActiveSlot() {
  const n = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
  if (!Number.isFinite(n) || n < 0 || n >= MAX_TEAMS) return 0;
  return n;
}

export function setActiveSlot(slot) {
  const i = Math.max(0, Math.min(MAX_TEAMS - 1, Number(slot) || 0));
  localStorage.setItem(ACTIVE_SLOT_KEY, String(i));
  return i;
}

export function getActiveTeam() {
  return loadTeams()[getActiveSlot()];
}

export function getUiMode() {
  const m = localStorage.getItem(UI_MODE_KEY);
  return m === "ipad" ? "ipad" : "phone";
}

export function setUiMode(mode) {
  const m = mode === "ipad" ? "ipad" : "phone";
  localStorage.setItem(UI_MODE_KEY, m);
  document.documentElement.dataset.ui = m;
  return m;
}

export function applyUiMode() {
  document.documentElement.dataset.ui = getUiMode();
}

export function isMegaName(name) {
  if (!name || name === "メガニウム") return false;
  return name.startsWith("メガ");
}

export function natureNames() {
  return NATURES.map((n) => n.name);
}
