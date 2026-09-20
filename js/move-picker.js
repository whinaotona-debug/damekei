/**
 * 技ピッカー: タイプ順＋物理/特殊/変化フィルタ
 */
import { TYPES } from "./types.js?v=20260920g";
import { $, textMatchesQuery, openModal, closeModal } from "./common.js?v=20260920g";
import { typeIconHtml } from "./media.js?v=20260920g";

const TYPE_ORDER = new Map(TYPES.map((t, i) => [t, i]));

export function sortMovesByType(moves) {
  return [...moves].sort((a, b) => {
    const ta = TYPE_ORDER.get(a.type) ?? 99;
    const tb = TYPE_ORDER.get(b.type) ?? 99;
    if (ta !== tb) return ta - tb;
    if (a.category !== b.category) return String(a.category).localeCompare(b.category, "ja");
    return a.name.localeCompare(b.name, "ja");
  });
}

export function openMovePickerList({ moves, learnsets, species, onPick, allowStatus = true, title = "技" }) {
  const allowed = species && learnsets?.[species]?.length ? learnsets[species] : null;
  openModal(
    title,
    `<div class="list-filters">
      <input type="search" id="q" placeholder="名前検索" />
      <select id="move-type"><option value="">タイプ全部</option>${TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
      <select id="move-cat">
        <option value="">分類全部</option>
        <option value="物理">物理</option>
        <option value="特殊">特殊</option>
        ${allowStatus ? `<option value="変化">変化</option>` : ""}
      </select>
    </div>
    <p class="hint" id="move-filter-hint"></p>
    <div id="list"></div>`
  );

  const render = () => {
    const q = $("q").value;
    const typ = $("move-type").value;
    const cat = $("move-cat").value;
    let list = moves.slice();
    if (allowed) list = list.filter((mv) => allowed.includes(mv.name));
    if (!allowStatus) list = list.filter((mv) => mv.category !== "変化");
    if (typ) list = list.filter((mv) => mv.type === typ);
    if (cat) list = list.filter((mv) => mv.category === cat);
    list = list.filter((mv) => textMatchesQuery(mv.name, q));
    list = sortMovesByType(list);
    const hint = [typ || null, cat || null].filter(Boolean).join("の");
    $("move-filter-hint").textContent = hint
      ? `${hint}技　${list.length}件（タイプ順）`
      : `タイプ順　${list.length}件`;
    $("list").innerHTML =
      (allowStatus ? `<button type="button" class="list-item" data-name=""><div>（なし）</div></button>` : "") +
      list
        .slice(0, 120)
        .map(
          (mv) => `<button type="button" class="list-item" data-name="${mv.name}">
          <div style="display:flex;align-items:center;gap:8px">${typeIconHtml(mv.type, { size: "md" })}
          <div><div>${mv.name}</div><div class="s">${mv.category}　威力 ${mv.power ?? "—"}　命中 ${mv.accuracy ?? "—"}</div></div></div>
        </button>`
        )
        .join("");
    $("list").querySelectorAll("[data-name]").forEach((el) => {
      el.addEventListener("click", () => {
        const name = el.dataset.name;
        closeModal();
        onPick(name ? moves.find((m) => m.name === name) || null : null);
      });
    });
  };

  $("q").addEventListener("input", render);
  $("move-type").addEventListener("change", render);
  $("move-cat").addEventListener("change", render);
  render();
}
