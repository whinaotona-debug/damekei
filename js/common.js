/** 共通ユーティリティ */
export function $(id) {
  return document.getElementById(id);
}

export function toKatakana(str) {
  return String(str || "").replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

export function normalizeForSearch(str) {
  return toKatakana(str)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[゛゜ﾞﾟ\s　]/g, "");
}

export function textMatchesQuery(text, query) {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return normalizeForSearch(text).includes(q);
}

export function openModal(title, html) {
  const modal = $("modal");
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = html;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

export function closeModal() {
  const modal = $("modal");
  modal.classList.remove("open");
  modal.classList.remove("overview-modal");
  modal.setAttribute("aria-hidden", "true");
}

export async function loadGameData() {
  const [pokemon, moves, items, learnsets] = await Promise.all([
    fetch("./data/pokemon.json").then((r) => r.json()),
    fetch("./data/moves.json").then((r) => r.json()),
    fetch("./data/items.json").then((r) => r.json()),
    fetch("./data/learnsets.json").then((r) => r.json()),
  ]);
  return { pokemon, moves, items, learnsets };
}

export function wireModalClose() {
  $("modal-close")?.addEventListener("click", closeModal);
  $("modal")?.addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });
}

export function wireUiModeToggle() {
  // 旧トグル互換: 画面幅に自動追従（二重登録防止）
  if (window.__damekeiUiWired) {
    const mode = window.matchMedia("(min-width: 768px)").matches ? "ipad" : "phone";
    document.documentElement.dataset.ui = mode;
    return;
  }
  window.__damekeiUiWired = true;
  const root = document.documentElement;
  const apply = () => {
    const mode = window.matchMedia("(min-width: 768px)").matches ? "ipad" : "phone";
    root.dataset.ui = mode;
  };
  apply();
  let timer = 0;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 80);
  };
  window.addEventListener("resize", onChange);
  try {
    window.matchMedia("(min-width: 768px)").addEventListener("change", onChange);
  } catch {
    /* older browsers */
  }
}

export function wireAppNav() {
  // no-op placeholder if needed later
}
