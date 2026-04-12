import { loadStatePollingData } from "./state-polling-data.js";
import { renderMap, renderSegment, renderTable } from "./state-polling-charts.js";

async function init() {
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  try {
    statusEl.innerHTML = '<div class="spinner"></div> <span>Loading data…</span>';

    const [data, svgText] = await Promise.all([
      loadStatePollingData(),
      fetch("data/germany-states.svg").then((r) => r.text()),
    ]);

    const tooltip = document.getElementById("map-tooltip");

    renderMap(document.getElementById("map-diff"), svgText, data.states, "diff", tooltip);
    renderMap(document.getElementById("map-change"), svgText, data.states, "change", tooltip);
    renderSegment(document.getElementById("segment-bar"), data.summary);
    renderTable(document.getElementById("table-container"), data.states);

    const updatedDate = new Date(data.updated);
    statusEl.innerHTML = `<span>Daten aktualisiert: ${updatedDate.toLocaleDateString("de-DE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}</span>`;
    statusEl.classList.add("success");
  } catch (err) {
    console.error(err);
    statusEl.textContent = "";
    errorEl.textContent = `Failed to load state polling data: ${err.message}`;
    errorEl.style.display = "block";
  }
}

init();
