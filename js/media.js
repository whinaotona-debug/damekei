/**
 * タイプアイコン・ポケモン/持ち物スプライト
 */
import mediaIds from "./media-ids.js?v=20260920d";

const POKE_SPRITE = "https://play.pokemonshowdown.com/sprites/dex";
const POKE_SPRITE_FALLBACK = "https://play.pokemonshowdown.com/sprites/gen5";
const ITEM_SPRITE = "https://play.pokemonshowdown.com/sprites/itemicons";

const POKE_ALIAS = {
  イッカネズミ: "mausholdfour",
  "イッカネズミ(4ひきかぞく)": "mausholdfour",
  "イッカネズミ(3びきかぞく)": "maushold",
};

const ITEM_ALIAS = {
  こだわりハチマキ: "choiceband",
  こだわりメガネ: "choicespecs",
  こだわりスカーフ: "choicescarf",
  メガストーン: "latiasite",
  なし: "",
};

export const TYPE_COLORS = {
  ノーマル: "#929da3",
  ほのお: "#ff9c54",
  みず: "#4d90d5",
  でんき: "#f3d23b",
  くさ: "#63bb5b",
  こおり: "#74cec0",
  かくとう: "#ce4069",
  どく: "#ab6ac8",
  じめん: "#d97746",
  ひこう: "#8fa8dd",
  エスパー: "#f97176",
  むし: "#90c12c",
  いわ: "#c7b78b",
  ゴースト: "#5269ac",
  ドラゴン: "#0a6dc4",
  あく: "#5a5366",
  はがね: "#5a8ea1",
  フェアリー: "#ec8fe6",
};

const TYPE_GLYPHS = {
  ノーマル:
    '<circle cx="32" cy="32" r="14" fill="none" stroke="#fff" stroke-width="6"/><circle cx="32" cy="32" r="5" fill="#fff"/>',
  ほのお:
    '<path fill="#fff" d="M32 8c2 10-8 14-8 24a12 12 0 0024 0c0-8-6-12-4-20-6 4-8 10-12-4z"/>',
  みず:
    '<path fill="#fff" d="M32 10c0 0-14 18-14 28a14 14 0 0028 0c0-10-14-28-14-28z"/>',
  でんき:
    '<path fill="#fff" d="M36 8L20 34h12l-4 22 20-30H36l4-18z"/>',
  くさ:
    '<path fill="#fff" d="M32 10c12 8 16 20 14 30-8-4-14-4-14-4s-6 0-14 4c-2-10 2-22 14-30z"/><path fill="none" stroke="#fff" stroke-width="3" d="M32 28v26"/>',
  こおり:
    '<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"><path d="M32 8v48M14 20l36 24M14 44l36-24"/><circle cx="32" cy="32" r="5" fill="#fff" stroke="none"/></g>',
  かくとう:
    '<path fill="#fff" d="M22 38c0-6 2-10 6-12v-6c0-2 2-4 4-4s4 2 4 4v4c2-1 4 0 4 3v3c2-1 4 0 4 3v12c0 6-6 10-14 10-8 0-12-5-12-12v-5z"/>',
  どく:
    '<path fill="#fff" d="M32 10c8 0 14 6 14 14 0 10-8 16-14 28-6-12-14-18-14-28 0-8 6-14 14-14zm-6 12a3 3 0 110 6 3 3 0 010-6zm12 0a3 3 0 110 6 3 3 0 010-6z"/>',
  じめん:
    '<path fill="#fff" d="M8 44l12-20 12 12 12-16 12 24H8z"/>',
  ひこう:
    '<path fill="#fff" d="M10 36c12-4 22-16 26-26 2 12 6 20 18 28-14 0-24 4-32 12-2-6-6-10-12-14z"/>',
  エスパー:
    '<path fill="#fff" d="M32 10a18 18 0 00-6 35l6 9 6-9a18 18 0 00-6-35zm0 8a10 10 0 110 20 10 10 0 010-20zm0 5a5 5 0 100 10 5 5 0 000-10z"/>',
  むし:
    '<path fill="#fff" d="M32 10c7 2 12 8 12 18v8c0 8-5 14-12 16-7-2-12-8-12-16v-8c0-10 5-16 12-18z"/>',
  いわ:
    '<path fill="#fff" d="M20 18l14-8 16 10v16l-12 12H22L12 36V24l8-6z"/>',
  ゴースト:
    '<path fill="#fff" d="M32 8c12 0 18 10 18 22v26l-6-4-6 4-6-4-6 4-6-4-6 4V30c0-12 6-22 18-22zm-7 18a4 4 0 110 8 4 4 0 010-8zm14 0a4 4 0 110 8 4 4 0 010-8z"/>',
  ドラゴン:
    '<path fill="#fff" d="M32 6l6 14 16 2-12 10 4 16-14-8-14 8 4-16L10 22l16-2 6-14z"/>',
  あく:
    '<path fill="#fff" d="M32 8c14 8 20 20 18 34-8-6-14-8-18-8s-10 2-18 8c-2-14 4-26 18-34z"/>',
  はがね:
    '<path fill="#fff" d="M32 8l20 12v24L32 56 12 44V20L32 8zm0 10l-12 7v14l12 7 12-7V25l-12-7z"/>',
  フェアリー:
    '<path fill="#fff" d="M32 8l4 14h14l-11 8 4 14-11-8-11 8 4-14-11-8h14l4-14z"/>',
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function pokeSpriteId(jaName) {
  if (!jaName) return "";
  return POKE_ALIAS[jaName] || mediaIds.pokemon?.[jaName] || "";
}

export function itemSpriteId(jaName) {
  if (!jaName || jaName === "なし") return "";
  return ITEM_ALIAS[jaName] || mediaIds.items?.[jaName] || "";
}

export function pokeSpriteUrl(jaName) {
  const id = pokeSpriteId(jaName);
  return id ? `${POKE_SPRITE}/${id}.png` : "";
}

export function pokeSpriteFallbackUrl(jaName) {
  const id = pokeSpriteId(jaName);
  return id ? `${POKE_SPRITE_FALLBACK}/${id}.png` : "";
}

export function itemSpriteUrl(jaName) {
  const id = itemSpriteId(jaName);
  return id ? `${ITEM_SPRITE}/${id}.png` : "";
}

export function typeIconHtml(type, { size = "md" } = {}) {
  if (!type) return `<span class="type-icon ghost size-${size}" aria-hidden="true"></span>`;
  const color = TYPE_COLORS[type] || "#888";
  const glyph = TYPE_GLYPHS[type] || TYPE_GLYPHS["ノーマル"];
  return `<span class="type-icon size-${size}" title="${esc(type)}" style="--type-color:${color}" role="img" aria-label="${esc(type)}"><svg viewBox="0 0 64 64" aria-hidden="true">${glyph}</svg></span>`;
}

export function typePillHtml(type) {
  if (!type) return "";
  return `<span class="type-pill-row">${typeIconHtml(type, { size: "sm" })}<span class="type-pill-label">${esc(type)}</span></span>`;
}

export function pokeImgHtml(jaName, { cls = "poke-img", size = 64 } = {}) {
  const url = pokeSpriteUrl(jaName);
  const fb = pokeSpriteFallbackUrl(jaName);
  const label = esc((jaName || "?").slice(0, 2));
  if (!url) {
    return `<span class="${cls} missing" style="width:${size}px;height:${size}px">${label}</span>`;
  }
  return `<img class="${cls}" src="${esc(url)}" width="${size}" height="${size}" alt="${esc(jaName || "")}" loading="lazy" decoding="async" data-fb="${esc(fb)}" onerror="if(this.dataset.fb&&!this.dataset.retried){this.dataset.retried=1;this.src=this.dataset.fb;}else{this.style.display='none';}" />`;
}

export function itemImgHtml(jaName, { cls = "item-img", size = 24 } = {}) {
  if (!jaName || jaName === "なし") {
    return `<span class="${cls} missing" style="width:${size}px;height:${size}px"></span>`;
  }
  const url = itemSpriteUrl(jaName);
  if (!url) {
    return `<span class="${cls} missing" style="width:${size}px;height:${size}px">?</span>`;
  }
  return `<img class="${cls}" src="${esc(url)}" width="${size}" height="${size}" alt="${esc(jaName)}" title="${esc(jaName)}" loading="lazy" decoding="async" onerror="this.style.opacity='0'" />`;
}
