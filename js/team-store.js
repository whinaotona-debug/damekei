/**
 * 構築ストレージ（最大12パーティ、最低1）
 */
import { emptyEvs, NATURES } from "./stats.js?v=20260920k";

export const MAX_TEAMS = 12;
export const MIN_TEAMS = 1;
export const TEAMS_KEY = "damekei-builds-v2";
export const LEGACY_TEAMS_KEY = "damekei-teams-v1";
/** 過去バージョンで使っていた可能性のあるキー */
export const LEGACY_TEAM_KEYS = [
  "damekei-teams-v1",
  "damekei-builds-v1",
  "damekei-teams",
  "damekei-builds",
];
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

function teamFillCount(list) {
  if (!Array.isArray(list)) return 0;
  return list.reduce(
    (n, t) => n + (t?.members || []).filter((m) => m?.species).length,
    0
  );
}

function parseTeamList(raw) {
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || !list.length) return null;
    return list.slice(0, MAX_TEAMS).map((t, i) => normalizeTeam(t, `構築${i + 1}`));
  } catch {
    return null;
  }
}

/** localStorage 内の旧キー／バックアップから、中身がある構築を探す */
export function findLegacyTeams() {
  const candidates = [];
  const seen = new Set();

  const consider = (key, list) => {
    if (!list || !teamFillCount(list)) return;
    const sig = JSON.stringify(list.map((t) => t.members?.map((m) => m.species)));
    if (seen.has(sig)) return;
    seen.add(sig);
    candidates.push({ key, list, fill: teamFillCount(list) });
  };

  for (const key of LEGACY_TEAM_KEYS) {
    consider(key, parseTeamList(localStorage.getItem(key)));
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.includes("damekei")) continue;
      if (key === TEAMS_KEY) continue;
      if (LEGACY_TEAM_KEYS.includes(key)) continue;
      consider(key, parseTeamList(localStorage.getItem(key)));
    }
  } catch {
    /* ignore */
  }

  candidates.sort((a, b) => b.fill - a.fill);
  return candidates;
}

function migrateFromLegacy() {
  const found = findLegacyTeams();
  return found[0]?.list || null;
}

function clampTeamList(list) {
  const src = Array.isArray(list) ? list : [];
  const out = src.slice(0, MAX_TEAMS).map((t, i) => normalizeTeam(t, `構築${i + 1}`));
  if (!out.length) out.push(emptyTeam("構築1"));
  return out;
}

/** 保存済みの構築一覧を返す（1〜12） */
export function loadTeams() {
  try {
    let current = parseTeamList(localStorage.getItem(TEAMS_KEY));
    const currentFill = teamFillCount(current);

    if (!currentFill) {
      const legacy = migrateFromLegacy();
      if (legacy && teamFillCount(legacy)) {
        const saved = clampTeamList(legacy);
        localStorage.setItem(TEAMS_KEY, JSON.stringify(saved));
        return saved;
      }
    }

    if (!current || !current.length) {
      current = [emptyTeam("構築1"), emptyTeam("構築2"), emptyTeam("構築3")];
    }
    return clampTeamList(current);
  } catch {
    return [emptyTeam("構築1"), emptyTeam("構築2"), emptyTeam("構築3")];
  }
}

/**
 * 旧データを強制的に上書き復元する。
 * @returns {{ ok: boolean, fill: number, key?: string, message: string }}
 */
export function restoreLegacyTeams({ force = false } = {}) {
  const current = parseTeamList(localStorage.getItem(TEAMS_KEY));
  const currentFill = teamFillCount(current);
  const found = findLegacyTeams();
  if (!found.length) {
    return {
      ok: false,
      fill: 0,
      message:
        "この端末・このサイト内に旧データが見つかりません。別のURL（file:// や別ドメイン）で保存していた場合は、そちらの保存領域は別物です。",
    };
  }
  const best = found[0];
  if (!force && currentFill > best.fill) {
    return {
      ok: false,
      fill: currentFill,
      key: best.key,
      message: `今の構築の方が充実しています（今${currentFill}匹 / 旧${best.fill}匹）。上書きする場合は強制復元してください。`,
    };
  }
  const saved = clampTeamList(best.list);
  localStorage.setItem(TEAMS_KEY, JSON.stringify(saved));
  return {
    ok: true,
    fill: best.fill,
    key: best.key,
    message: `旧データ（${best.key}）から ${best.fill} 匹分を復元しました。`,
  };
}

export function saveTeams(list) {
  const out = clampTeamList(list);
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
  if (i >= 0) {
    list[i] = next;
    return saveTeams(list)[i];
  }
  if (list.length < MAX_TEAMS) {
    list.push(next);
    return saveTeams(list)[list.length - 1];
  }
  const emptyIdx = list.findIndex((t) => !t.members.some((m) => m.species));
  if (emptyIdx >= 0) list[emptyIdx] = next;
  else list[0] = next;
  return saveTeams(list)[emptyIdx >= 0 ? emptyIdx : 0];
}

export function replaceTeamAt(slot, team) {
  const list = loadTeams();
  const i = Math.max(0, Math.min(list.length - 1, slot));
  list[i] = normalizeTeam({ ...team, updatedAt: Date.now() }, team.name || `構築${i + 1}`);
  saveTeams(list);
  return list[i];
}

export function clearTeamAt(slot) {
  return replaceTeamAt(slot, emptyTeam(`構築${slot + 1}`));
}

export function addTeam(name) {
  const list = loadTeams();
  if (list.length >= MAX_TEAMS) {
    return { ok: false, list, message: `構築は最大${MAX_TEAMS}までです` };
  }
  list.push(emptyTeam(name || `構築${list.length + 1}`));
  const saved = saveTeams(list);
  return { ok: true, list: saved, slot: saved.length - 1 };
}

export function removeTeamAt(slot) {
  const list = loadTeams();
  if (list.length <= MIN_TEAMS) {
    return { ok: false, list, message: "構築は最低1つ必要です" };
  }
  const i = Math.max(0, Math.min(list.length - 1, Number(slot) || 0));
  list.splice(i, 1);
  const saved = saveTeams(list);
  const active = getActiveSlot();
  if (active >= saved.length) setActiveSlot(saved.length - 1);
  else if (active > i) setActiveSlot(active - 1);
  return { ok: true, list: saved, slot: Math.min(i, saved.length - 1) };
}

export function getActiveSlot() {
  const list = loadTeams();
  const n = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
  if (!Number.isFinite(n) || n < 0 || n >= list.length) return 0;
  return n;
}

export function setActiveSlot(slot) {
  const list = loadTeams();
  const i = Math.max(0, Math.min(list.length - 1, Number(slot) || 0));
  localStorage.setItem(ACTIVE_SLOT_KEY, String(i));
  return i;
}

export function getActiveTeam() {
  return loadTeams()[getActiveSlot()];
}

export function detectUiMode() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "phone";
  }
  return window.matchMedia("(min-width: 768px)").matches ? "ipad" : "phone";
}

export function getUiMode() {
  return detectUiMode();
}

export function applyUiMode() {
  const mode = detectUiMode();
  document.documentElement.setAttribute("data-ui", mode);
  return mode;
}

export function isMegaName(name) {
  return !!(name && String(name).startsWith("メガ") && name !== "メガニウム");
}

export { NATURES };
