import { loadStatePollingData } from "./state-polling-data.js";
import { renderMap, renderSegment, renderTable } from "./state-polling-charts.js";
import { renderSpectrum } from "./shell.js";
import { getStatusEls, showLoading, showError } from "./shared.js";

async function loadText(path, label) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to load ${label}: ${resp.status}`);
  return resp.text();
}

/** Mean of a numeric field across the states, ignoring gaps. */
function meanOf(states, key) {
  const values = states.map((s) => s[key]).filter((v) => Number.isFinite(v));
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Masthead spectrum. Deliberately the plain mean of the 16 states, not the
 * population-weighted summary the cards show: the bar reads "the average
 * state", and the caption says so.
 */
function renderStateSpectrum(states) {
  const left = meanOf(states, "left");
  const right = meanOf(states, "right");
  renderSpectrum(
    document.getElementById("spectrum"),
    document.getElementById("spectrum-readout"),
    {
      left,
      other: Math.max(0, 100 - left - right),
      right,
      caption: "Average across the 16 states",
    }
  );
}

async function init() {
  const { statusEl, errorEl } = getStatusEls();

  try {
    if (errorEl) errorEl.style.display = "none";
    showLoading(statusEl, "Loading data…");

    const [data, svgText] = await Promise.all([
      loadStatePollingData(),
      loadText("data/germany-states.svg", "state map"),
    ]);

    const tooltip = document.getElementById("map-tooltip");

    renderMap(document.getElementById("map-diff"), svgText, data.states, "diff", tooltip);
    renderMap(document.getElementById("map-change"), svgText, data.states, "change", tooltip);
    renderSegment(document.getElementById("segment-bar"), data.summary);
    renderTable(document.getElementById("table-container"), data.states, {
      footnoteEl: document.getElementById("table-footnote"),
      statusEl: document.getElementById("table-sort-status"),
    });
    renderStateSpectrum(data.states);

    const updatedDate = new Date(data.updated);
    statusEl.innerHTML = `<span>Data updated: ${updatedDate.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}</span>`;
    statusEl.classList.add("success");
  } catch (err) {
    console.error(err);
    showError(statusEl, errorEl, `Failed to load state polling data: ${err.message}`, init);
  }
}

init();
