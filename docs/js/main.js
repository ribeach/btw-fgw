import { loadPollingData, computeBlocks } from "./data.js";
import { renderPartiesChart, renderBlocksChart } from "./charts.js";

async function init() {
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  try {
    statusEl.innerHTML = '<div class="spinner"></div> <span>Loading data\u2026</span>';
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
    statusEl.textContent = "";
    errorEl.textContent = `Failed to load polling data: ${err.message}`;
    errorEl.style.display = "block";
  }
}

init();
