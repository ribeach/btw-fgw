import { loadPollingData, computeBlocks } from "./data.js";
import { renderPartiesChart, renderBlocksChart, renderChartTable } from "./charts.js";
import { getStatusEls, showLoading, showError, ensurePlotly } from "./shared.js";
import { renderSpectrum } from "./shell.js";

const LONG_DATE = { year: "numeric", month: "long", day: "numeric" };

/** The resize handler is bound once, even if a retry re-runs init(). */
let resizeBound = false;

/** Write the data's own span into every `.panel-title` year slot. */
function writeYearRange(data) {
  const start = data[0].date.getUTCFullYear();
  const end = data[data.length - 1].date.getUTCFullYear();
  for (const id of ["blocks-range", "parties-range"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = `${start}\u2013${end}`;
  }
}

/** Feed the masthead spectrum bar the most recent bloc split. */
function updateSpectrum(enrichedData) {
  const latest = enrichedData[enrichedData.length - 1];
  renderSpectrum(
    document.getElementById("spectrum"),
    document.getElementById("spectrum-readout"),
    {
      left: latest.left,
      other: latest.other,
      right: latest.right,
      caption: `Latest Politbarometer projection, ${latest.date.toLocaleDateString("en-GB", LONG_DATE)}`,
    }
  );
}

async function init() {
  const { statusEl, errorEl } = getStatusEls();

  try {
    showLoading(statusEl, "Loading data\u2026");
    ensurePlotly();

    const { data, updated } = await loadPollingData();
    const enrichedData = computeBlocks(data);

    const renderAll = () => ({
      blocks: renderBlocksChart("blocks-chart", enrichedData),
      parties: renderPartiesChart("parties-chart", enrichedData),
    });

    const rendered = renderAll();

    writeYearRange(data);
    updateSpectrum(enrichedData);

    // The tables are viewport-independent, so they are built once and left alone
    // by the resize path.
    renderChartTable(
      document.getElementById("blocks-data-table"),
      rendered.blocks,
      "Bloc shares in percent. Election rows are bloc sums derived from the official " +
        "second-vote results (Bundeswahlleiterin), rounded to one decimal; the latest row " +
        "is the smoothed polling average (30-day exponentially weighted)."
    );
    renderChartTable(
      document.getElementById("parties-data-table"),
      rendered.parties,
      "Party shares in percent. Election rows are the official second-vote results " +
        "(Bundeswahlleiterin); the latest row is the smoothed polling average (30-day " +
        "exponentially weighted). An em dash marks a party that did not stand or a result " +
        "that is not available."
    );

    if (!resizeBound) {
      resizeBound = true;
      let resizeTimer;
      let lastWidth = window.innerWidth;
      window.addEventListener("resize", () => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;

        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          renderAll();
        }, 250);
      });
    }

    const updatedDate = new Date(updated);
    statusEl.innerHTML = `<span>Data updated: ${updatedDate.toLocaleDateString(
      "en-GB",
      LONG_DATE
    )}</span>`;
    statusEl.classList.add("success");
  } catch (err) {
    console.error(err);
    showError(statusEl, errorEl, `Failed to load polling data: ${err.message}`, () => {
      errorEl.replaceChildren();
      errorEl.style.display = "none";
      init();
    });
  }
}

init();
