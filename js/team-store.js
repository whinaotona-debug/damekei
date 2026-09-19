/**
 * Shared team storage for ダメ計 tools (Champions).
 */
import { emptyEvs, NATURES } from "./stats.js?v=20260919e";

export const TEAMS_KEY = "damekei-teams-v1";
export const NOTES_KEY = "damekei-matchup-notes-v1";
export const ACTIVE_KEY = "damekei-active-teams-v1";

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

export function emptyTeam(name = "新しいパーティ") {
  return {
    id: uid(),
    name,
    updatedAt: Date.now(),
    members: Array.from({ length: 6 }, () => emptyMember()),
  };
}

export function loadTeams() {
  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveTeams(list) {
  localStorage.setItem(TEAMS_KEY, JSON.stringify(list));
}

export function upsertTeam(team) {
  const list = loadTeams();
  const i = list.findIndex((t) => t.id === team.id);
  const next = { ...team, updatedAt: Date.now() };
  if (i >= 0) list[i] = next;
  else list.unshift(next);
  saveTeams(list);
  return next;
}

export function deleteTeam(id) {
  saveTeams(loadTeams().filter((t) => t.id !== id));
}

export function getTeam(id) {
  return loadTeams().find((t) => t.id === id) || null;
}

export function loadActiveIds() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : { mine: null, foe: null };
  } catch {
    return { mine: null, foe: null };
  }
}

export function saveActiveIds(mine, foe) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify({ mine, foe }));
}

export function loadNotes() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveNote(mineId, foeId, text) {
  const all = loadNotes();
  all[`${mineId}__${foeId}`] = { text, updatedAt: Date.now() };
  localStorage.setItem(NOTES_KEY, JSON.stringify(all));
}

export function getNote(mineId, foeId) {
  return loadNotes()[`${mineId}__${foeId}`]?.text || "";
}

export function isMegaName(name) {
  if (!name || name === "メガニウム") return false;
  return name.startsWith("メガ");
}

export function natureNames() {
  return NATURES.map((n) => n.name);
}

/** Build query for index.html damage calc deep link */
export function damekeiQuery({ atk, def, move, atkItem, defItem, atkNature, defNature, atkAbility, defAbility, atkEvs, defEvs }) {
  const p = new URLSearchParams();
  if (atk) p.set("atk", atk);
  if (def) p.set("def", def);
  if (move) p.set("move", move);
  if (atkItem) p.set("atkItem", atkItem);
  if (defItem) p.set("defItem", defItem);
  if (atkNature) p.set("atkNature", atkNature);
  if (defNature) p.set("defNature", defNature);
  if (atkAbility) p.set("atkAbility", atkAbility);
  if (defAbility) p.set("defAbility", defAbility);
  if (atkEvs) p.set("atkEvs", JSON.stringify(atkEvs));
  if (defEvs) p.set("defEvs", JSON.stringify(defEvs));
  return p.toString();
}
