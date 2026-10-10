/**
 * チャンピオンズ構築スクショ取り込み（ステータス画面 + 能力画面の2枚）
 * OCR → 図鑑・技・持ち物辞書で最長一致
 */
import { emptyEvs, NATURES } from "./stats.js?v=20260922i";
import { emptyMember } from "./team-store.js?v=20260922k";

const STAT_LABELS_JA = [
  ["hp", "HP"],
  ["atk", "こうげき"],
  ["def", "ぼうぎょ"],
  ["spa", "とくこう"],
  ["spd", "とくほう"],
  ["spe", "すばやさ"],
];

function normalizeText(s) {
  return String(s || "")
    .normalize("NFKC")
    .replace(/[〜～－—–]/g, "-")
    .replace(/[▲△]/g, "↑")
    .replace(/[▼▽]/g, "↓")
    .replace(/\s+/g, "");
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c);
    }
  }
  return dp[m][n];
}

function buildDict(names) {
  return [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
}

function findAllMatches(text, dict, { minLen = 2, fuzzyMax = 1 } = {}) {
  const hits = [];
  const used = new Array(text.length).fill(false);
  for (const name of dict) {
    if (name.length < minLen) continue;
    let from = 0;
    while (from <= text.length - name.length) {
      const idx = text.indexOf(name, from);
      if (idx < 0) break;
      let overlap = false;
      for (let k = idx; k < idx + name.length; k++) {
        if (used[k]) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        for (let k = idx; k < idx + name.length; k++) used[k] = true;
        hits.push({ name, index: idx, end: idx + name.length, score: 1 });
      }
      from = idx + 1;
    }
  }
  // 短い誤認識向けに未使用帯でファジー（長い名前のみ）
  if (fuzzyMax > 0) {
    for (const name of dict) {
      if (name.length < 4) continue;
      const win = name.length;
      for (let i = 0; i <= text.length - win; i++) {
        let blocked = false;
        for (let k = i; k < i + win; k++) {
          if (used[k]) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        const slice = text.slice(i, i + win);
        const d = levenshtein(slice, name);
        if (d > 0 && d <= fuzzyMax) {
          for (let k = i; k < i + win; k++) used[k] = true;
          hits.push({ name, index: i, end: i + win, score: 1 - d / win });
        }
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index || b.name.length - a.name.length);
}

function natureFromArrows(upStat, downStat) {
  if (!upStat && !downStat) {
    return NATURES.find((n) => !n.up && !n.down)?.name || "がんばりや";
  }
  const hit = NATURES.find((n) => n.up === upStat && n.down === downStat);
  if (hit) return hit.name;
  if (upStat && !downStat) {
    return NATURES.find((n) => n.up === upStat)?.name || "がんばりや";
  }
  if (!upStat && downStat) {
    return NATURES.find((n) => n.down === downStat)?.name || "がんばりや";
  }
  return "がんばりや";
}

function parseEvsNear(block) {
  const evs = emptyEvs();
  for (const [key, label] of STAT_LABELS_JA) {
    const re = new RegExp(`${label}[^0-9]{0,12}(\\d{1,3})`, "i");
    const m = block.match(re);
    if (!m) continue;
    // 実数値のあとに努力値0-32が続くパターンが多い
    const nums = [...block.matchAll(new RegExp(`${label}[^0-9]{0,20}((?:\\d{1,3}[^0-9]{0,8}){1,3})`, "i"))][0];
    let ev = null;
    if (nums) {
      const candidates = [...nums[1].matchAll(/\d{1,3}/g)].map((x) => Number(x[0]));
      // 最後の小さい数が努力値、大きいのは実数値
      const small = candidates.filter((n) => n <= 32);
      if (small.length) ev = small[small.length - 1];
      else if (candidates.length >= 2) ev = Math.min(32, candidates[candidates.length - 1]);
    }
    if (ev == null && m) {
      const n = Number(m[1]);
      if (n <= 32) ev = n;
    }
    if (ev != null) evs[key] = Math.max(0, Math.min(32, ev));
  }
  // ラベル欠落時: ブロック内の 0-32 を出現順に拾う（最終手段）
  const sum = Object.values(evs).reduce((a, b) => a + b, 0);
  if (sum === 0) {
    const smalls = [...block.matchAll(/(?:^|[^0-9])([0-9]|[12][0-9]|3[0-2])(?![0-9])/g)].map((x) =>
      Number(x[1])
    );
    const keys = ["hp", "atk", "def", "spa", "spd", "spe"];
    for (let i = 0; i < Math.min(6, smalls.length); i++) evs[keys[i]] = smalls[i];
  }
  return evs;
}

function parseNatureArrows(block) {
  let up = null;
  let down = null;
  for (const [key, label] of STAT_LABELS_JA) {
    if (key === "hp") continue;
    const around = block.match(new RegExp(`${label}.{0,6}([↑↓])|([↑↓]).{0,6}${label}`));
    if (!around) continue;
    const mark = around[1] || around[2];
    if (mark === "↑") up = key;
    if (mark === "↓") down = key;
  }
  return natureFromArrows(up, down);
}

function segmentBySpecies(text, speciesHits) {
  const segs = [];
  for (let i = 0; i < speciesHits.length; i++) {
    const cur = speciesHits[i];
    const next = speciesHits[i + 1];
    segs.push({
      species: cur.name,
      index: cur.index,
      block: text.slice(cur.index, next ? next.index : text.length),
    });
  }
  return segs;
}

function pickFromSegment(block, dict, exclude = new Set()) {
  const hits = findAllMatches(block, dict.filter((n) => !exclude.has(n)), { fuzzyMax: 1 });
  return hits[0]?.name || "";
}

function parseMovesBlock(block, catalogs, species) {
  const poke = catalogs.pokemon.find((p) => p.name === species);
  const abilityDict = buildDict(poke?.abilities || catalogs.abilities);
  const itemDict = buildDict(["なし", "メガストーン", ...catalogs.items.map((i) => i.name)]);
  const moveDict = buildDict(catalogs.moves.map((m) => m.name));

  // 能力名の直後〜技より前
  const ability = pickFromSegment(block.slice(0, Math.min(block.length, 80)), abilityDict) || poke?.abilities?.[0] || "";
  let item = pickFromSegment(block, itemDict);
  if (!item) item = "なし";
  if (item.includes("ナイト") || /メガストーン|サイト/.test(item)) {
    // メガ石表記ゆれ
    if (catalogs.items.some((i) => i.name === item)) {
      /* keep */
    } else if (/ナイト$/.test(item) || item.includes("メガ")) {
      item = item;
    }
  }

  const moveHits = findAllMatches(block, moveDict, { fuzzyMax: 1 });
  // 名前自身や重複を除き先頭4
  const moves = [];
  const seen = new Set();
  for (const h of moveHits) {
    if (h.name === species) continue;
    if (seen.has(h.name)) continue;
    seen.add(h.name);
    moves.push(h.name);
    if (moves.length >= 4) break;
  }
  while (moves.length < 4) moves.push("");
  return { ability, item, moves };
}

async function loadTesseract() {
  if (window.Tesseract?.createWorker) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("OCRライブラリの読み込みに失敗しました"));
    document.head.appendChild(s);
  });
  return window.Tesseract;
}

async function ocrImage(fileOrUrl, onProgress) {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker("jpn", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress || 0);
    },
  });
  try {
    const { data } = await worker.recognize(fileOrUrl);
    return normalizeText(data.text || "");
  } finally {
    await worker.terminate();
  }
}

/**
 * @param {{ statsFile: File|Blob|string, movesFile: File|Blob|string, catalogs: { pokemon, moves, items }, onProgress?: (msg:string, p?:number)=>void }} opts
 */
export async function importTeamFromScreenshots(opts) {
  const { statsFile, movesFile, catalogs, onProgress } = opts;
  const abilities = [
    ...new Set(catalogs.pokemon.flatMap((p) => p.abilities || [])),
  ];
  const cat = { ...catalogs, abilities };
  const speciesDict = buildDict(catalogs.pokemon.map((p) => p.name));

  onProgress?.("ステータス画面を読み取り中…", 0);
  const statsText = await ocrImage(statsFile, (p) => onProgress?.("ステータス画面を読み取り中…", p));
  onProgress?.("能力画面を読み取り中…", 0);
  const movesText = await ocrImage(movesFile, (p) => onProgress?.("能力画面を読み取り中…", p));

  const statsHits = findAllMatches(statsText, speciesDict, { fuzzyMax: 1 }).slice(0, 6);
  const movesHits = findAllMatches(movesText, speciesDict, { fuzzyMax: 1 }).slice(0, 6);

  // 能力画面の並びを正とする（名前が揃っていることが多い）
  const orderNames = [];
  const seen = new Set();
  for (const h of [...movesHits, ...statsHits]) {
    if (seen.has(h.name)) continue;
    seen.add(h.name);
    orderNames.push(h.name);
    if (orderNames.length >= 6) break;
  }

  const statsSegs = segmentBySpecies(statsText, statsHits);
  const movesSegs = segmentBySpecies(movesText, movesHits);
  const statsByName = new Map(statsSegs.map((s) => [s.species, s.block]));
  const movesByName = new Map(movesSegs.map((s) => [s.species, s.block]));

  const members = Array.from({ length: 6 }, () => emptyMember());
  const report = [];

  for (let i = 0; i < orderNames.length && i < 6; i++) {
    const species = orderNames[i];
    const m = emptyMember();
    m.species = species;
    const sBlock = statsByName.get(species) || "";
    const mvBlock = movesByName.get(species) || "";
    m.evs = parseEvsNear(sBlock);
    m.nature = parseNatureArrows(sBlock);
    // 性格と努力値の整合: 上昇ステに努力値がある場合はそのまま
    const parsed = parseMovesBlock(mvBlock || movesText, cat, species);
    m.ability = parsed.ability;
    m.item = parsed.item || "なし";
    m.moves = parsed.moves;
    // メガ石名をそのまま保持（育成画面でメガストーンに正規化される場合あり）
    members[i] = m;
    report.push({
      species,
      nature: m.nature,
      evs: { ...m.evs },
      ability: m.ability,
      item: m.item,
      moves: [...m.moves],
      conf: {
        stats: !!sBlock,
        moves: !!mvBlock,
      },
    });
  }

  // 能力側にだけいる／ステータス側にだけいる名前の補完
  if (orderNames.length < 6) {
    for (const h of statsHits) {
      if (orderNames.includes(h.name)) continue;
      const i = orderNames.length;
      if (i >= 6) break;
      orderNames.push(h.name);
      const m = emptyMember();
      m.species = h.name;
      m.evs = parseEvsNear(statsByName.get(h.name) || "");
      m.nature = parseNatureArrows(statsByName.get(h.name) || "");
      members[i] = m;
      report.push({ species: h.name, note: "ステータスのみ検出" });
    }
  }

  return {
    members,
    report,
    debug: {
      statsText: statsText.slice(0, 2000),
      movesText: movesText.slice(0, 2000),
    },
  };
}

/** 取り込み結果をレビュー用HTMLに */
export function importPreviewHtml(report) {
  if (!report?.length) return `<p class="hint">ポケモンを検出できませんでした。明るいスクショで再試行してください。</p>`;
  return `<div class="import-preview">${report
    .map((r, i) => {
      const ev = r.evs
        ? `H${r.evs.hp} A${r.evs.atk} B${r.evs.def} C${r.evs.spa} D${r.evs.spd} S${r.evs.spe}`
        : "—";
      const moves = (r.moves || []).filter(Boolean).join(" / ") || "技なし";
      return `<article class="import-card">
        <strong>#${i + 1} ${r.species || "？"}</strong>
        <div>${r.nature || "—"}　${ev}</div>
        <div>${r.ability || "—"}　/　${r.item || "なし"}</div>
        <div class="s">${moves}</div>
      </article>`;
    })
    .join("")}</div>`;
}
