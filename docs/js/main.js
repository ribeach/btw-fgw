import { loadPollingData, computeBlocks } from "./data.js";
import { renderPartiesChart, renderBlocksChart } from "./charts.js";
import { getStatusEls, showLoading, showError } from "./shared.js";

async function init() {
  const { statusEl, errorEl } = getStatusEls();

  try {
    showLoading(statusEl, "Loading data\u2026");
    const { data, updated } = await loadPollingData();
    const enrichedData = computeBlocks(data);

    const renderAll = () => {
      renderPartiesChart("parties-chart", enrichedData);
      renderBlocksChart("blocks-chart", enrichedData);
    };

    renderAll();

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

    const updatedDate = new Date(updated);
    statusEl.innerHTML = `<span>Data updated: ${updatedDate.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}</span>`;
    statusEl.classList.add("success");
  } catch (err) {
    console.error(err);
    showError(statusEl, errorEl, `Failed to load polling data: ${err.message}`);
  }
}

init();
