import { applyUiMode } from "./team-store.js?v=20260920g";
import { wireUiModeToggle } from "./common.js?v=20260920g";
import { typeChartHtml, natureChartHtml } from "./charts.js?v=20260920g";

applyUiMode();
wireUiModeToggle();
document.getElementById("type-chart-slot").innerHTML = typeChartHtml();
document.getElementById("nature-chart-slot").innerHTML = natureChartHtml();
