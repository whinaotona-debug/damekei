/**
 * 構築共有コード（数字のみ）
 * 別端末で入力 → 同じ構築を取り込んで再編集
 */
import { NATURES, STAT_KEYS, emptyEvs } from "./stats.js?v=20260920m";
import { emptyMember, uid } from "./team-store.js?v=20260920m";

const VERSION = 1;

function u8(n) {
  return Math.max(0, Math.min(255, Number(n) || 0));
}

function writeU16(arr, n) {
  const v = Math.max(0, Math.min(65535, Number(n) || 0));
  arr.push(v & 0xff, (v >> 8) & 0xff);
}

function readU16(bytes, i) {
  return bytes[i] | (bytes[i + 1] << 8);
}

function crc8(bytes) {
  let c = 0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) {
      c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    }
  }
  return c;
}

function encodeUtf8(str, maxLen) {
  const s = String(str || "").slice(0, maxLen);
  const bin = new TextEncoder().encode(s);
  return Array.from(bin);
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder().decode(Uint8Array.from(bytes));
  } catch {
    return "";
  }
}

function indexOfName(list, name, key = "name") {
  if (!name) return -1;
  return list.findIndex((x) => (key ? x[key] : x) === name);
}

function natureIndex(name) {
  const i = NATURES.findIndex((n) => n.name === name);
  return i >= 0 ? i : 0;
}

/** bytes → 数字文字列 */
export function bytesToDigits(bytes) {
  if (!bytes.length) return "0";
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n.toString(10);
}

/** 数字文字列 → bytes（桁数からバイト長を推定するため lengthHint を使う） */
export function digitsToBytes(digitStr, lengthHint) {
  const d = String(digitStr || "").replace(/\D/g, "");
  if (!d) throw new Error("コードが空です");
  let n = BigInt(d);
  const out = [];
  const len = lengthHint || Math.ceil(d.length * Math.log(10) / Math.log(256));
  for (let i = 0; i < len; i++) {
    out.push(Number(n & 0xffn));
    n >>= 8n;
  }
  out.reverse();
  // trim leading zeros that were padding — keep at least lengthHint if provided
  if (!lengthHint) {
    while (out.length > 1 && out[0] === 0) out.shift();
  }
  return out;
}

/**
 * 固定長パック: 先頭に総バイト長を入れ、復元を確実にする
 */
function packTeam(team, catalogs) {
  const { pokemon, moves, items } = catalogs;
  const bytes = [VERSION];

  const nameBytes = encodeUtf8(team.name || "", 40);
  bytes.push(u8(nameBytes.length));
  bytes.push(...nameBytes);

  const memoBytes = encodeUtf8(team.memo || "", 200);
  writeU16(bytes, memoBytes.length);
  bytes.push(...memoBytes);

  const members = team.members || [];
  for (let i = 0; i < 6; i++) {
    const m = members[i] || emptyMember();
    if (!m.species) {
      writeU16(bytes, 0xffff);
      continue;
    }
    const si = indexOfName(pokemon, m.species);
    if (si < 0) throw new Error(`未対応ポケモン: ${m.species}`);
    writeU16(bytes, si);

    const poke = pokemon[si];
    const abs = poke.abilities || [];
    let ai = abs.indexOf(m.ability);
    if (ai < 0) ai = 0;
    bytes.push(u8(ai));

    const ii = m.item && m.item !== "なし" ? indexOfName(items, m.item) : -1;
    writeU16(bytes, ii >= 0 ? ii : 0xffff);

    bytes.push(u8(natureIndex(m.nature)));

    const evs = m.evs || emptyEvs();
    for (const k of STAT_KEYS) bytes.push(u8(evs[k] || 0));

    for (let mi = 0; mi < 4; mi++) {
      const mv = m.moves?.[mi] || "";
      const mvi = mv ? indexOfName(moves, mv) : -1;
      writeU16(bytes, mvi >= 0 ? mvi : 0xffff);
    }
  }

  bytes.push(crc8(bytes));
  // 先頭に長さ（2byte）を付与して復元を安定化
  const body = bytes;
  const framed = [];
  writeU16(framed, body.length);
  framed.push(...body);
  return framed;
}

function unpackTeam(framed, catalogs) {
  const { pokemon, moves, items } = catalogs;
  if (framed.length < 4) throw new Error("コードが短すぎます");
  const bodyLen = readU16(framed, 0);
  const body = framed.slice(2, 2 + bodyLen);
  if (body.length !== bodyLen) throw new Error("コードが途切れています");
  const expect = body[body.length - 1];
  const payload = body.slice(0, -1);
  if (crc8(payload) !== expect) throw new Error("チェックサム不一致（入力ミスの可能性）");

  let i = 0;
  const ver = body[i++];
  if (ver !== VERSION) throw new Error(`未対応バージョン: ${ver}`);

  const nameLen = body[i++];
  const name = decodeUtf8(body.slice(i, i + nameLen));
  i += nameLen;

  const memoLen = readU16(body, i);
  i += 2;
  const memo = decodeUtf8(body.slice(i, i + memoLen));
  i += memoLen;

  const members = [];
  for (let slot = 0; slot < 6; slot++) {
    if (i + 2 > body.length) throw new Error("データ破損");
    const si = readU16(body, i);
    i += 2;
    if (si === 0xffff) {
      members.push(emptyMember());
      continue;
    }
    const poke = pokemon[si];
    if (!poke) throw new Error("ポケモン番号が不正です");
    const ai = body[i++];
    const itemIdx = readU16(body, i);
    i += 2;
    const nat = body[i++];
    const evs = emptyEvs();
    for (const k of STAT_KEYS) evs[k] = u8(body[i++]);
    const moveNames = [];
    for (let mi = 0; mi < 4; mi++) {
      const mvi = readU16(body, i);
      i += 2;
      moveNames.push(mvi === 0xffff ? "" : moves[mvi]?.name || "");
    }
    members.push({
      species: poke.name,
      ability: poke.abilities?.[ai] || poke.abilities?.[0] || "",
      item: itemIdx === 0xffff ? "なし" : items[itemIdx]?.name || "なし",
      nature: NATURES[nat]?.name || "がんばりや",
      evs,
      moves: moveNames,
    });
  }

  return {
    id: uid(),
    name: name || "取り込み構築",
    memo,
    updatedAt: Date.now(),
    members,
  };
}

/** 見やすい4桁区切り */
export function formatTeamCode(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  const parts = [];
  for (let i = 0; i < d.length; i += 4) parts.push(d.slice(i, i + 4));
  return parts.join("-");
}

export function normalizeTeamCodeInput(text) {
  return String(text || "").replace(/\D/g, "");
}

/**
 * @returns {string} 区切り付き数字コード
 */
export function encodeTeamCode(team, catalogs) {
  const framed = packTeam(team, catalogs);
  const digits = bytesToDigits(framed);
  // 桁数を末尾に付けてバイト長復元を安定化（8桁ゼロ埋め）
  const withLen = digits + String(framed.length).padStart(3, "0");
  return formatTeamCode(withLen);
}

/**
 * @returns {object} team
 */
export function decodeTeamCode(codeText, catalogs) {
  const all = normalizeTeamCodeInput(codeText);
  if (all.length < 4) throw new Error("コードが短すぎます");
  const lenStr = all.slice(-3);
  const digits = all.slice(0, -3);
  const byteLen = Number(lenStr);
  if (!Number.isFinite(byteLen) || byteLen < 4 || byteLen > 2000) {
    throw new Error("コード形式が不正です");
  }
  const framed = digitsToBytes(digits, byteLen);
  // BigInt 変換で先頭0が落ちる場合があるので長さ合わせ
  while (framed.length < byteLen) framed.unshift(0);
  if (framed.length > byteLen) framed.splice(0, framed.length - byteLen);
  return unpackTeam(framed, catalogs);
}
