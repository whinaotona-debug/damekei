/**
 * ホーム用: タイプ相性表・性格表 HTML
 */
import { TYPES, typeEffectiveness } from "./types.js?v=20260920g";
import { NATURE_TABLE, NATURE_STAT_ORDER, NEUTRAL_NATURES, STAT_LABELS } from "./stats.js?v=20260920g";
import { typeIconHtml } from "./media.js?v=20260920g";

function multClass(m) {
  if (m === 0) return "x0";
  if (m >= 2) return "x2";
  if (m < 1) return "xhalf";
  return "x1";
}

function multLabel(m) {
  if (m === 0) return "×0";
  if (m === 2) return "×2";
  if (m === 0.5) return "½";
  return "";
}

export function typeChartHtml() {
  const head = TYPES.map((t) => `<th title="${t}">${typeIconHtml(t, { size: "sm" })}</th>`).join("");
  const rows = TYPES.map((atk) => {
    const cells = TYPES.map((def) => {
      const m = typeEffectiveness(atk, [def]);
      return `<td class="${multClass(m)}">${multLabel(m)}</td>`;
    }).join("");
    return `<tr><th class="row-h">${typeIconHtml(atk, { size: "sm" })}</th>${cells}</tr>`;
  }).join("");
  return `
  <div class="chart-block">
    <h3>タイプ相性表</h3>
    <p class="hint">縦＝技タイプ　横＝防御タイプ　空欄＝等倍</p>
    <div class="chart-scroll">
      <table class="type-chart">
        <tr><th></th>${head}</tr>
        ${rows}
      </table>
    </div>
  </div>`;
}

export function natureChartHtml() {
  const head = NATURE_STAT_ORDER.map((k) => `<th class="up-h">▲${STAT_LABELS[k]}</th>`).join("");
  const rows = NATURE_STAT_ORDER.map((down) => {
    const cells = NATURE_STAT_ORDER.map((up) => {
      if (up === down) return `<td class="na">—</td>`;
      return `<td>${NATURE_TABLE[down][up]}</td>`;
    }).join("");
    return `<tr><th class="down-h">▼${STAT_LABELS[down]}</th>${cells}</tr>`;
  }).join("");
  const neutrals = NEUTRAL_NATURES.join("　");
  return `
  <div class="chart-block">
    <h3>性格表</h3>
    <p class="hint">縦＝下がる　横＝上がる</p>
    <div class="chart-scroll">
      <table class="nature-table home-nature">
        <tr><th></th>${head}</tr>
        ${rows}
      </table>
    </div>
    <p class="hint">無補正: ${neutrals}</p>
  </div>`;
}
