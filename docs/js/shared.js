// Shared frontend helpers — single source for chart theming, Plotly config,
// JSON fetching, and the status/spinner/error UX used across all three pages.

// Chart typeface, shared by every Plotly layout.
export const CHART_FONT = "Inter, system-ui, -apple-system, sans-serif";

/**
 * Common Plotly layout theme shared by the federal and demographics charts.
 * Page-specific layouts spread this and override only their own bits
 * (title, margins, xaxis dtick/tickformat/title, legend, source annotation).
 */
export function chartTheme(isMobile) {
  return {
    font: { family: CHART_FONT, color: "#f8fafc", size: isMobile ? 10 : 12 },
    plot_bgcolor: "rgba(0,0,0,0)",
    paper_bgcolor: "rgba(0,0,0,0)",
    hoverlabel: {
      bgcolor: "rgba(15, 23, 42, 0.9)",
      bordercolor: "rgba(255, 255, 255, 0.1)",
      font: { color: "#f8fafc", size: isMobile ? 10 : 13 },
    },
    hovermode: "x unified",
    xaxis: {
      gridcolor: "rgba(255,255,255,0.06)",
      showline: false,
      zeroline: false,
    },
    yaxis: {
      ticksuffix: "%",
      gridcolor: "rgba(255,255,255,0.06)",
      showline: false,
      zeroline: false,
      rangemode: "tozero",
    },
  };
}

/**
 * Common Plotly config object shared by every chart mount.
 */
export function plotlyConfig(isMobile) {
  return {
    responsive: true,
    displayModeBar: !isMobile,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
  };
}

/**
 * Fetch and parse a JSON file. Single home for the fetch + ok-check + parse
 * pattern used by every data loader.
 */
export async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
  return resp.json();
}

/**
 * Grab the shared #status / #error elements present on every page.
 */
export function getStatusEls() {
  return {
    statusEl: document.getElementById("status"),
    errorEl: document.getElementById("error"),
  };
}

/**
 * Show the loading spinner with a label inside the status box.
 */
export function showLoading(statusEl, label = "Loading…") {
  statusEl.innerHTML = `<div class="spinner"></div> <span>${label}</span>`;
}

/**
 * Clear the status box and reveal the error banner with a message.
 */
export function showError(statusEl, errorEl, message) {
  statusEl.textContent = "";
  errorEl.textContent = message;
  errorEl.style.display = "block";
}
