// Shared frontend helpers — single source for chart theming, Plotly config,
// JSON fetching, the end-of-line label engine, and the status/error UX used
// across all three pages.

// --- Design tokens ---------------------------------------------------------
// Read once at module scope so the charts inherit the same palette as the
// chrome. Modules are deferred, so the stylesheet in <head> has already parsed
// by the time this runs; the fallbacks cover a missing or blocked stylesheet.

const ROOT_STYLE = getComputedStyle(document.documentElement);

function token(name, fallback) {
  const value = ROOT_STYLE.getPropertyValue(name).trim();
  return value || fallback;
}

/** Chart typeface, shared by every Plotly layout. */
export const CHART_FONT = token("--font-ui", "'Inter', system-ui, sans-serif");

const BONE = token("--bone", "#F3F1EC");
const BONE_DIM = token("--bone-dim", "#A2A9B8");
const SURFACE = token("--surface", "#121826");
const RULE = token("--rule", "#232B3B");

/** The crosshair that tracks the cursor across a chart. */
const SPIKE_COLOR = "rgba(243, 241, 236, 0.28)";

/**
 * Common Plotly layout theme shared by the federal and demographics charts.
 * Page-specific layouts spread this and override only their own bits
 * (title, margins, xaxis dtick/tickformat/title, legend, source annotation).
 */
export function chartTheme(isMobile) {
  return {
    font: { family: CHART_FONT, color: BONE, size: isMobile ? 10 : 12 },
    plot_bgcolor: "rgba(0,0,0,0)",
    paper_bgcolor: "rgba(0,0,0,0)",
    hoverlabel: {
      bgcolor: SURFACE,
      bordercolor: RULE,
      font: { family: CHART_FONT, color: BONE, size: isMobile ? 10 : 13 },
      align: "left",
    },
    hovermode: "x unified",
    // Keep the unified hover reading the whole column, not the nearest point.
    hoverdistance: 40,
    spikedistance: -1,
    xaxis: {
      gridcolor: RULE,
      showline: false,
      zeroline: false,
      tickfont: { color: BONE_DIM },
      showspikes: true,
      spikemode: "across",
      spikesnap: "cursor",
      spikethickness: 1,
      spikedash: "solid",
      spikecolor: SPIKE_COLOR,
    },
    yaxis: {
      ticksuffix: "%",
      gridcolor: RULE,
      showline: false,
      zeroline: false,
      rangemode: "tozero",
      tickfont: { color: BONE_DIM },
    },
  };
}

/**
 * Common Plotly config object shared by every chart mount.
 * The mode bar stays out of the way until the pointer enters the plot.
 */
export function plotlyConfig() {
  return {
    responsive: true,
    displayModeBar: "hover",
    displaylogo: false,
    modeBarButtonsToRemove: [
      "lasso2d",
      "select2d",
      "autoScale2d",
      "zoomIn2d",
      "zoomOut2d",
      "toggleSpikelines",
      "hoverClosestCartesian",
      "hoverCompareCartesian",
    ],
  };
}

// --- End-of-line labels ----------------------------------------------------

/**
 * Place end-of-line labels so they never collide, working in pixels.
 *
 * Pixels rather than data units is the whole point: a 14px gap is 14px whether
 * the y-axis spans 5 points or 50, so the same call reads correctly on a tall
 * desktop plot and a short mobile one.
 *
 * Labels are sorted top-down (highest value first), cascaded downwards so each
 * consecutive pair is at least `minGapPx` apart, then pulled back up if the
 * cascade overflowed the plot, and finally clamped to the plot box.
 *
 * @param {{text: string, color: string, yValue: number}[]} entries
 * @param {object} opts
 * @param {number} opts.plotHeightPx  height of the plotting area, in pixels
 * @param {number} opts.yMax          data value at the top of the y-axis
 * @param {number} [opts.minGapPx=14] minimum vertical gap between two labels
 * @returns {{text: string, color: string, yValue: number, yPx: number, yPxData: number}[]}
 *   the input objects plus `yPx` (final label position, pixels from plot top)
 *   and `yPxData` (where the data point itself sits, pixels from plot top).
 */
export function layoutEndLabels(entries, { plotHeightPx, yMax, minGapPx = 14 }) {
  const scale = yMax > 0 ? plotHeightPx / yMax : 0;
  const laid = [...entries]
    .sort((a, b) => b.yValue - a.yValue)
    .map((entry) => {
      const yPxData = plotHeightPx - entry.yValue * scale;
      return { ...entry, yPxData, yPx: yPxData };
    });

  // Cascade downwards from the top label.
  for (let i = 1; i < laid.length; i++) {
    const floor = laid[i - 1].yPx + minGapPx;
    if (laid[i].yPx < floor) laid[i].yPx = floor;
  }

  // If that pushed the stack off the bottom, walk back up.
  for (let i = laid.length - 1; i >= 0; i--) {
    if (laid[i].yPx > plotHeightPx) laid[i].yPx = plotHeightPx;
    if (i > 0) {
      const ceiling = laid[i].yPx - minGapPx;
      if (laid[i - 1].yPx > ceiling) laid[i - 1].yPx = ceiling;
    }
  }

  for (const entry of laid) {
    entry.yPx = Math.min(Math.max(entry.yPx, 0), plotHeightPx);
  }

  return laid;
}

/** Hex colour → rgba() string at the given alpha. Passes non-hex through. */
function withAlpha(color, alpha) {
  const hex = /^#([0-9a-f]{6})$/i.exec(String(color));
  if (!hex) return color;
  const int = parseInt(hex[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

/**
 * Turn `layoutEndLabels` output into Plotly annotation objects.
 *
 * The annotation is anchored to the data point and its arrow tail is offset in
 * PIXELS (`ay`), which is why the layout pass works in pixels too — the old
 * data-unit `ay` maths drifted as soon as the y-range changed.
 *
 * @param {ReturnType<typeof layoutEndLabels>} laid
 * @param {{pxPerUnit: number}} opts  pixels per y-axis unit, used to locate the
 *   data point when an entry carries no `yPxData` (top label anchors the run).
 * @returns {object[]} Plotly annotations
 */
export function buildEndLabelAnnotations(laid, { pxPerUnit }) {
  if (!laid.length) return [];

  const anchorPx = Number.isFinite(laid[0].yPxData) ? laid[0].yPxData : laid[0].yPx;
  const anchorValue = laid[0].yValue;

  return laid.map((entry) => {
    const dataPx = Number.isFinite(entry.yPxData)
      ? entry.yPxData
      : anchorPx + (anchorValue - entry.yValue) * pxPerUnit;

    return {
      xref: "paper",
      x: 1,
      xanchor: "left",
      xshift: 6,
      y: entry.yValue,
      ax: 28,
      ay: entry.yPx - dataPx,
      text: entry.text,
      showarrow: true,
      font: { family: CHART_FONT, size: 11, weight: 700, color: entry.color },
      arrowwidth: 1,
      arrowhead: 0,
      arrowcolor: withAlpha(entry.color, 0.4),
      align: "left",
    };
  });
}

/**
 * Right-hand plot margin wide enough for the longest end label.
 *
 * @param {{text: string}[]} entries
 * @returns {number} margin in pixels, between 90 and 200
 */
export function measureRightMargin(entries) {
  const maxTextChars = entries.reduce(
    (longest, entry) => Math.max(longest, String(entry.text ?? "").length),
    0
  );
  return Math.min(200, Math.max(90, 46 + maxTextChars * 6.9));
}

// --- Loading / error UX ----------------------------------------------------

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
 * Show the loading spinner with a label inside the status stamp.
 */
export function showLoading(statusEl, label = "Loading…") {
  if (!statusEl) return;
  statusEl.innerHTML = `<span class="spinner"></span> <span>${label}</span>`;
}

/**
 * Clear the status stamp and reveal the error banner.
 *
 * @param {HTMLElement|null} statusEl
 * @param {HTMLElement} errorEl
 * @param {string} message   what went wrong, in the interface's voice
 * @param {Function} [onRetry]  when given, renders a "Try again" button
 */
export function showError(statusEl, errorEl, message, onRetry) {
  if (statusEl) {
    // The `:empty` rule hides the stamp, so clearing it removes the chrome too.
    statusEl.textContent = "";
    statusEl.classList.remove("success");
  }
  if (!errorEl) return;

  const text = document.createElement("p");
  text.textContent = message;
  errorEl.replaceChildren(text);

  if (typeof onRetry === "function") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "btn-retry";
    retry.textContent = "Try again";
    retry.addEventListener("click", onRetry);
    errorEl.appendChild(retry);
  }

  errorEl.style.display = "block";
}

/**
 * Assert the self-hosted Plotly bundle actually loaded, so a missing script
 * surfaces as a readable message instead of a bare ReferenceError.
 *
 * @returns {object} the global Plotly
 */
export function ensurePlotly() {
  if (typeof Plotly === "undefined") {
    throw new Error("The charting library failed to load. Reload the page to try again.");
  }
  return Plotly;
}
