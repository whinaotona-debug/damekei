import { applyUiMode } from "./team-store.js?v=20260922c";
import { wireUiModeToggle } from "./common.js?v=20260922c";
import { natureChartHtml } from "./charts.js?v=20260920h";

applyUiMode();
wireUiModeToggle();
document.getElementById("nature-chart-slot").innerHTML = natureChartHtml();
