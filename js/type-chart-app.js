import { applyUiMode } from "./team-store.js?v=20260920h";
import { wireUiModeToggle } from "./common.js?v=20260920h";
import { typeChartHtml } from "./charts.js?v=20260920h";

applyUiMode();
wireUiModeToggle();
document.getElementById("type-chart-slot").innerHTML = typeChartHtml();
