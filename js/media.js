/**
 * タイプアイコン・ポケモン/持ち物スプライト
 */
import mediaIds from "./media-ids.js?v=20260920h";

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

/** 白シルエット（わかりやすい簡易イラスト） viewBox 0 0 64 64 */
const TYPE_GLYPHS = {
  ノーマル:
    '<circle cx="32" cy="32" r="16" fill="none" stroke="#fff" stroke-width="7"/><circle cx="32" cy="32" r="6" fill="#fff"/>',
  ほのお:
    '<path fill="#fff" d="M33 6c1 11-10 15-9 28 0 9 7 16 16 16 10 0 16-8 16-17 0-9-5-14-5-22-7 5-10 12-18-5z"/>',
  みず:
    '<path fill="#fff" d="M32 8C32 8 14 30 14 40a18 18 0 0036 0C50 30 32 8 32 8z"/>',
  でんき:
    '<path fill="#fff" d="M38 4L18 34h14L24 60l28-36H38l6-20z"/>',
  くさ:
    '<path fill="#fff" d="M32 6c14 10 18 24 16 36-10-6-16-6-16-6s-6 0-16 6c-2-12 2-26 16-36z"/><rect x="29" y="30" width="6" height="28" rx="2" fill="#fff"/>',
  こおり:
    '<g stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"><path d="M32 6v52M10 19l44 26M10 45l44-26"/><path d="M22 12l10 6 10-6M22 52l10-6 10 6"/></g><circle cx="32" cy="32" r="5" fill="#fff"/>',
  かくとう:
    '<path fill="#fff" d="M20 40c0-8 3-13 8-15V16c0-3 2-5 5-5s5 2 5 5v7c3-2 5-1 5 3v4c3-1 5 0 5 4v14c0 8-7 13-16 13-9 0-12-6-12-14v-7z"/>',
  どく:
    '<path fill="#fff" d="M32 8c10 0 18 8 18 18 0 12-10 20-18 34C24 46 14 38 14 26 14 16 22 8 32 8z"/><circle cx="25" cy="26" r="4" fill="#5a2a7a"/><circle cx="39" cy="26" r="4" fill="#5a2a7a"/>',
  じめん:
    '<path fill="#fff" d="M6 46l10-8 8 4 10-14 10 10 8-6 10 14H6z"/><circle cx="22" cy="28" r="3" fill="#fff"/><circle cx="40" cy="22" r="2.5" fill="#fff"/><circle cx="48" cy="30" r="2" fill="#fff"/>',
  ひこう:
    '<path fill="#fff" d="M8 38c14-2 26-18 30-30 4 14 10 24 22 30-16 2-28 8-38 18-2-8-6-14-14-18z"/>',
  エスパー:
    '<path fill="#fff" d="M32 6a20 20 0 00-8 39l8 13 8-13a20 20 0 00-8-39zm0 10a10 10 0 110 20 10 10 0 010-20z"/><circle cx="32" cy="26" r="4" fill="#ce4069"/>',
  むし:
    '<ellipse cx="32" cy="34" rx="16" ry="20" fill="#fff"/><circle cx="26" cy="20" r="5" fill="#fff"/><circle cx="38" cy="20" r="5" fill="#fff"/><path d="M16 18l-8-8M48 18l8-8" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  いわ:
    '<path fill="#fff" d="M16 20l18-10 20 12v18l-14 14H20L10 40V26l6-6z"/>',
  ゴースト:
    '<path fill="#fff" d="M32 6c14 0 22 12 22 26v28l-7-5-7 5-8-5-8 5-7-5-7 5V32C10 18 18 6 32 6z"/><circle cx="24" cy="30" r="4" fill="#2a3560"/><circle cx="40" cy="30" r="4" fill="#2a3560"/>',
  ドラゴン:
    '<path fill="#fff" d="M32 4l8 10 14-2-2 14 12 8-12 6 4 14-14-6-10 12-8-14-14 2 6-12L4 22l14-2L32 4z"/>',
  あく:
    '<path fill="#fff" d="M32 6c16 10 22 24 20 40-10-8-16-10-20-10s-10 2-20 10C10 30 16 16 32 6z"/><path d="M22 36c2 6 6 8 10 8s8-2 10-8" fill="none" stroke="#2a2430" stroke-width="3"/>',
  はがね:
    '<path fill="#fff" d="M32 6l22 13v26L32 58 10 45V19L32 6zm0 12L18 27v18l14 8 14-8V27L32 18z"/>',
  フェアリー:
    '<path fill="#fff" d="M32 8c6 10 18 12 24 8-2 10-8 16-14 20 8 2 14 10 14 18-10-2-18-8-24-16-6 8-14 14-24 16 0-8 6-16 14-18C16 32 10 26 8 16c6 4 18 2 24-8z"/>',
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

/** Champions専用など、CDNに無いスプライト */
const LOCAL_SPRITE_BY_ID = {
  "raichu-mega-x": "./sprites/pokemon/raichu-mega-x.png",
  "raichu-mega-y": "./sprites/pokemon/raichu-mega-y.png",
  "absol-mega-z": "./sprites/pokemon/absol-mega-z.png",
  "garchomp-mega-z": "./sprites/pokemon/garchomp-mega-z.png",
  "lucario-mega-z": "./sprites/pokemon/lucario-mega-z.png",
};

export function itemSpriteId(jaName) {
  if (!jaName || jaName === "なし") return "";
  return ITEM_ALIAS[jaName] || mediaIds.items?.[jaName] || "";
}

/** Showdown id → pokesprite 風ハイフン名 */
function toHyphenSpriteId(id) {
  let s = String(id || "");
  if (s.includes("-")) return s;
  s = s.replace(/megaz$/, "-mega-z").replace(/megax$/, "-mega-x").replace(/megay$/, "-mega-y").replace(/mega$/, "-mega");
  s = s
    .replace(/alola$/, "-alola")
    .replace(/galar$/, "-galar")
    .replace(/hisui$/, "-hisui")
    .replace(/wash$/, "-wash")
    .replace(/heat$/, "-heat")
    .replace(/mow$/, "-mow")
    .replace(/fan$/, "-fan")
    .replace(/frost$/, "-frost");
  return s;
}

function isMegaJa(jaName) {
  return !!(jaName && jaName.startsWith("メガ") && jaName !== "メガニウム");
}

/** 複数CDNを順に試す（メガは図鑑番号フォールバックしない＝通常姿にならない） */
export function pokeSpriteUrls(jaName, dex) {
  const id = pokeSpriteId(jaName);
  const mega = isMegaJa(jaName);
  const urls = [];
  const hy = id ? toHyphenSpriteId(id) : "";
  const local = (id && LOCAL_SPRITE_BY_ID[id]) || (hy && LOCAL_SPRITE_BY_ID[hy]);
  if (local) urls.push(local);
  if (id) {
    const showdownIds = hy && hy !== id ? [hy, id] : [id];
    for (const sid of showdownIds) {
      urls.push(`https://play.pokemonshowdown.com/sprites/home-centered/${sid}.png`);
      urls.push(`https://play.pokemonshowdown.com/sprites/dex/${sid}.png`);
      urls.push(`https://play.pokemonshowdown.com/sprites/gen5/${sid}.png`);
    }
    if (hy) {
      urls.push(`https://raw.githubusercontent.com/msikma/pokesprite/master/pokemon-gen8/regular/${hy}.png`);
      if (mega) urls.push(`https://play.pokemonshowdown.com/sprites/ani/${hy}.gif`);
    }
  }
  if (!mega && dex && Number(dex) > 0) {
    const n = Number(dex);
    urls.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`);
    urls.push(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${n}.png`);
  }
  return [...new Set(urls)];
}

export function itemSpriteUrl(jaName) {
  const id = itemSpriteId(jaName);
  return id ? `${ITEM_SPRITE}/${id}.png` : "";
}

export function typeIconHtml(type, { size = "md" } = {}) {
  if (!type) {
    return `<span class="type-icon ghost size-${size}" aria-hidden="true"></span>`;
  }
  const color = TYPE_COLORS[type] || "#888";
  const glyph = TYPE_GLYPHS[type] || TYPE_GLYPHS["ノーマル"];
  // インラインサイズでCSS未読込でも丸＋絵が出るようにする
  const px = size === "sm" ? 22 : size === "lg" ? 36 : 28;
  return `<span class="type-icon size-${size}" title="${esc(type)}" role="img" aria-label="${esc(type)}" style="--type-color:${color};width:${px}px;height:${px}px;background:${color};border-radius:50%;display:inline-grid;place-items:center;flex:0 0 auto;box-shadow:0 0 0 1px rgba(0,0,0,.35),inset 0 1px 2px rgba(255,255,255,.35)"><svg viewBox="0 0 64 64" width="${Math.round(px * 0.72)}" height="${Math.round(px * 0.72)}" aria-hidden="true" style="display:block">${glyph}</svg></span>`;
}

export function typePillHtml(type) {
  if (!type) return "";
  return `<span class="type-pill-row">${typeIconHtml(type, { size: "sm" })}<span class="type-pill-label">${esc(type)}</span></span>`;
}

export function pokeImgHtml(jaName, { cls = "poke-img", size = 64, dex = 0, round = false } = {}) {
  const urls = pokeSpriteUrls(jaName, dex);
  const label = esc((jaName || "?").slice(0, 2));
  const roundCls = round ? " round" : "";
  if (!urls.length) {
    return `<span class="${cls} missing${roundCls}" style="width:${size}px;height:${size}px">${label}</span>`;
  }
  const dataUrls = esc(JSON.stringify(urls));
  return `<img class="${cls}${roundCls}" src="${esc(urls[0])}" width="${size}" height="${size}" alt="${esc(jaName || "")}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-urls="${dataUrls}" data-i="0" data-label="${label}" onerror="(function(el){var u=[];try{u=JSON.parse(el.getAttribute('data-urls')||'[]')}catch(e){}var i=(+el.dataset.i||0)+1;if(i<u.length){el.dataset.i=i;el.src=u[i];}else{var s=document.createElement('span');s.className=el.className+' missing';s.style.width=el.width+'px';s.style.height=el.height+'px';s.textContent=el.dataset.label||'?';el.replaceWith(s);}})(this)" />`;
}

export function itemImgHtml(jaName, { cls = "item-img", size = 24 } = {}) {
  if (!jaName || jaName === "なし") {
    return `<span class="${cls} missing" style="width:${size}px;height:${size}px"></span>`;
  }
  const url = itemSpriteUrl(jaName);
  if (!url) {
    return `<span class="${cls} missing" style="width:${size}px;height:${size}px">?</span>`;
  }
  return `<img class="${cls}" src="${esc(url)}" width="${size}" height="${size}" alt="${esc(jaName)}" title="${esc(jaName)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.opacity='0'" />`;
}
