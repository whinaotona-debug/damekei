import { applyUiMode } from "./team-store.js?v=20260920h";
import { wireUiModeToggle } from "./common.js?v=20260920h";
import { natureChartHtml } from "./charts.js?v=20260920h";

applyUiMode();
wireUiModeToggle();
document.getElementById("nature-chart-slot").innerHTML = natureChartHtml();
