import { loadPollingData, computeBlocks } from "./data.js";
import { renderPartiesChart, renderBlocksChart } from "./charts.js";

async function init() {
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");

  try {
    statusEl.textContent = "Loading data\u2026";
    const { data, updated } = await loadPollingData();
    const enrichedData = computeBlocks(data);

    renderPartiesChart("parties-chart", enrichedData);
    renderBlocksChart("blocks-chart", enrichedData);

    const updatedDate = new Date(updated);
    statusEl.textContent = `Data updated: ${updatedDate.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`;
    statusEl.classList.add("success");
  } catch (err) {
    console.error(err);
    statusEl.textContent = "";
    errorEl.textContent = `Failed to load polling data: ${err.message}`;
    errorEl.style.display = "block";
  }
}

init();
