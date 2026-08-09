// Federal polling charts — the two Plotly figures on index.html.
//
// Chart titles, sources and notes live in the page's <figcaption class="panel-head">,
// not inside Plotly: HTML text is selectable, translatable and readable by
// assistive tech, and it keeps the plot's top margin down to a hairline.
// This module therefore only draws marks, axes, the legend and the labels that
// have to sit in plot coordinates.

import {
  PARTY_CONFIG,
  MAJOR_PARTIES,
  BLOCKS,
  ELECTION_DATES,
  ELECTION_RESULTS,
  Y_AXIS_HEADROOM,
  MOBILE_BREAKPOINT_PX,
} from "./config.js";
import { computeRollingAverage } from "./data.js";
import {
  CHART_FONT,
  chartTheme,
  plotlyConfig,
  layoutEndLabels,
  buildEndLabelAnnotations,
  measureRightMargin,
  ensurePlotly,
} from "./shared.js";

// Election rules and their year labels are chrome, not data: bone ink, dotted
// so they read as event references and can never be mistaken for the solid
// hairline grid. The opacity is folded into the colour so the shape needs no
// `opacity` of its own (a shape-level opacity also fades the crosshair spike
// drawn over it). Keep this alpha below SPIKE_COLOR's (shared.js): the
// interactive crosshair must always read above the static rules.
const MARKER_LINE_COLOR = "rgba(243, 241, 236, 0.32)";
const MARKER_LABEL_COLOR = "rgba(243, 241, 236, 0.55)";


/** Used when the container has not been laid out yet (height comes from CSS). */
const FALLBACK_CONTAINER_HEIGHT_PX = 450;

/** Minimum vertical gap between two end-of-line labels, in pixels. */
const END_LABEL_GAP_PX = 14;

/** Vertical drop of the election-year labels below the x-axis, in pixels. */
const ELECTION_LABEL_SHIFT_PX = -20;

/**
 * Room reserved under the axis for the tick row (rotated -45° on mobile) plus,
 * on desktop, the election-year labels. The horizontal legend starts
 * immediately below it.
 */
const underAxisPx = (isMobile) => (isMobile ? 52 : 44);

/**
 * Per-container state the legend-sync handler reads, refreshed on every render.
 *
 * The handler is bound once per chart div (Plotly.react keeps the node, so
 * re-binding would stack generations), but everything it needs — the entries,
 * the election markers, the current plot geometry — changes on resize. Keeping
 * it here rather than in the handler's closure means a click after a resize
 * still recomputes against the layout actually on screen.
 *
 * @type {WeakMap<HTMLElement, {entries: object[], base: object[], rebuild: Function}>}
 */
const endLabelSync = new WeakMap();

/**
 * Vertical rules at every federal election, plus the year labels.
 *
 * The rules sit `layer: "below"` so the trend lines always cross in front of
 * them, and the labels hang *under* the x-axis rather than crowding the top of
 * the plot where the lines actually are.
 */
function buildElectionMarkers(isMobile) {
  const shapes = ELECTION_DATES.map((dateStr) => ({
    type: "line",
    layer: "below",
    x0: dateStr,
    x1: dateStr,
    y0: 0,
    y1: 1,
    yref: "paper",
    line: { color: MARKER_LINE_COLOR, width: 1, dash: "dot" },
  }));

  // Rules stay for every election; labels are desktop-only — at phone widths
  // even a thinned-out set collides with itself and the rotated tick row.
  const annotations = isMobile
    ? []
    : ELECTION_DATES.map((dateStr) => ({
        x: dateStr,
        y: 0,
        yref: "paper",
        yanchor: "top",
        yshift: ELECTION_LABEL_SHIFT_PX,
        xanchor: "center",
        text: dateStr.slice(0, 4),
        showarrow: false,
        font: { family: CHART_FONT, size: 10, color: MARKER_LABEL_COLOR },
      }));

  return { shapes, annotations };
}

/**
 * Layout shared by both figures. No title and no source annotation — the panel
 * head above the plot carries both.
 */
function baseLayout(isMobile, margin, legendY) {
  const theme = chartTheme(isMobile);
  return {
    ...theme,
    margin,
    xaxis: {
      ...theme.xaxis,
      dtick: isMobile ? "M48" : "M24",
      tickformat: "%Y",
      tickangle: isMobile ? -45 : 0,
    },
    // The legend is the primary key on both viewports; end-of-line labels are a
    // desktop-only convenience on top of it, never the only way to read a line.
    showlegend: true,
    legend: {
      orientation: "h",
      x: 0,
      xanchor: "left",
      y: legendY,
      yanchor: "top",
      bgcolor: "rgba(0,0,0,0)",
      font: { family: CHART_FONT, size: isMobile ? 10 : 11 },
    },
    annotations: [],
  };
}

/**
 * Build the layout, place the markers and end labels, then render.
 * Identical tail for both charts.
 *
 * @param {object} spec
 * @param {string} spec.containerId
 * @param {object[]} spec.traces            Plotly traces
 * @param {Date[]} spec.dates
 * @param {{text: string, color: string, yValue: number}[]} spec.endLabelEntries
 *   short labels (config `.short`) for the right-hand gutter
 * @param {number} spec.maxVal              largest value in the underlying data
 */
function finalizeChart({ containerId, traces, dates, endLabelEntries, maxVal }) {
  const Plotly = ensurePlotly();
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const container = document.getElementById(containerId);

  // The right gutter is measured from the labels that will go in it, so a long
  // one widens the margin instead of getting clipped by a hardcoded value.
  const margin = isMobile
    ? { l: 44, r: 16, t: 16, b: 140 }
    : { l: 60, r: measureRightMargin(endLabelEntries), t: 16, b: 92 };

  const containerHeight = (container && container.clientHeight) || FALLBACK_CONTAINER_HEIGHT_PX;
  // The plotting area is the container minus the two vertical margins: this is
  // the pixel height the label engine needs to keep gaps in real pixels.
  const plotHeightPx = Math.max(120, containerHeight - margin.t - margin.b);
  const axisTop = maxVal + Y_AXIS_HEADROOM;
  const pxPerUnit = axisTop > 0 ? plotHeightPx / axisTop : 0;

  const layout = baseLayout(isMobile, margin, -(underAxisPx(isMobile) / plotHeightPx));
  layout.yaxis.range = [0, axisTop];
  layout.xaxis.range = [dates[0], dates[dates.length - 1]];

  const markers = buildElectionMarkers(isMobile);
  layout.shapes = markers.shapes;

  // No right-hand gutter on mobile, so no end labels there — the legend carries it.
  const endLabelsFor = (entries) =>
    !isMobile && entries.length
      ? buildEndLabelAnnotations(
          layoutEndLabels(entries, {
            plotHeightPx,
            yMax: axisTop,
            minGapPx: END_LABEL_GAP_PX,
          }),
          { pxPerUnit }
        )
      : [];

  layout.annotations = [...markers.annotations, ...endLabelsFor(endLabelEntries)];

  Plotly.react(containerId, traces, layout, plotlyConfig()).then((gd) => {
    if (!gd) return;
    endLabelSync.set(gd, {
      // Index-aligned with `traces`: both are pushed in the same loop pass.
      entries: endLabelEntries,
      base: markers.annotations,
      rebuild: endLabelsFor,
    });

    // Hiding a series from the legend must take its gutter label and leader
    // with it, or the plot keeps labelling a line that is no longer drawn.
    // relayout only writes annotations, so it emits plotly_relayout and can
    // never re-enter this handler.
    if (gd.dataset.endLabelSync) return;
    gd.dataset.endLabelSync = "true";
    gd.on("plotly_restyle", () => {
      const state = endLabelSync.get(gd);
      if (!state) return;
      const visible = state.entries.filter(
        (_, i) => gd.data?.[i]?.visible !== "legendonly"
      );
      Plotly.relayout(gd, { annotations: [...state.base, ...state.rebuild(visible)] });
    });
  });
}

/**
 * Render the major-parties chart.
 *
 * @returns {{dates: Date[], series: {key: string, label: string, short: string,
 *   color: string, values: number[]}[]}} the smoothed series, for the data table
 */
export function renderPartiesChart(containerId, data) {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const dates = data.map((d) => d.date);
  const traces = [];
  const series = [];
  const endLabelEntries = [];

  for (const partyKey of MAJOR_PARTIES) {
    const info = PARTY_CONFIG[partyKey];
    const values = data.map((d) => d[partyKey] || 0);
    if (values.every((v) => v === 0)) continue;

    const smoothed = computeRollingAverage(dates, values);
    const color = info.lineColor || info.color;

    traces.push({
      x: dates,
      y: smoothed,
      mode: "lines",
      line: { color, width: isMobile ? 2.0 : 2.5 },
      name: info.label,
      hovertemplate: `${info.label}: %{y:.1f}%<extra></extra>`,
    });
    series.push({ key: partyKey, label: info.label, short: info.short, color, values: smoothed });
    endLabelEntries.push({
      text: info.short,
      color,
      yValue: smoothed[smoothed.length - 1],
    });
  }

  const maxVal = Math.max(
    ...data.map((d) => Math.max(...MAJOR_PARTIES.map((p) => d[p] || 0)))
  );

  finalizeChart({ containerId, traces, dates, endLabelEntries, maxVal });
  return { dates, series };
}

/**
 * Render the political-blocs chart.
 *
 * @returns {{dates: Date[], series: {key: string, label: string, short: string,
 *   color: string, values: number[]}[]}} the smoothed series, for the data table
 */
export function renderBlocksChart(containerId, data) {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const dates = data.map((d) => d.date);
  const traces = [];
  const series = [];
  const endLabelEntries = [];

  for (const [blockKey, blockInfo] of Object.entries(BLOCKS)) {
    const values = data.map((d) => d[blockKey] || 0);
    const smoothed = computeRollingAverage(dates, values);
    // The config label is line-broken for a vertical legend; a horizontal one
    // (and a hover row) wants it on one line.
    const label = blockInfo.label.replace(/<br>/g, " ");

    traces.push({
      x: dates,
      y: smoothed,
      mode: "lines",
      line: { color: blockInfo.color, width: isMobile ? 2.0 : 2.5 },
      fill: "tozeroy",
      fillcolor: blockInfo.color + "14",
      name: label,
      hovertemplate: `${label}: %{y:.1f}%<extra></extra>`,
    });
    series.push({
      key: blockKey,
      label,
      short: blockInfo.short,
      color: blockInfo.color,
      values: smoothed,
    });
    endLabelEntries.push({
      text: blockInfo.short,
      color: blockInfo.color,
      yValue: smoothed[smoothed.length - 1],
    });
  }

  const maxVal = Math.max(
    ...data.map((d) => Math.max(...Object.keys(BLOCKS).map((b) => d[b] || 0)))
  );

  finalizeChart({ containerId, traces, dates, endLabelEntries, maxVal });
  return { dates, series };
}

// --- "View the numbers" ------------------------------------------------------

/** Index of the last reading on or before `timestamp`; -1 when there is none. */
function indexAtOrBefore(dates, timestamp) {
  let found = -1;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i].getTime() > timestamp) break;
    found = i;
  }
  return found;
}

const shortDate = (date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function cell(tag, scope, text, className) {
  const el = document.createElement(tag);
  if (scope) el.scope = scope;
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Official share for one table column at one election, or null when there is
 * nothing official to show — the date has no ELECTION_RESULTS entry yet, or
 * the party did not stand. Party columns are a direct ELECTION_RESULTS lookup
 * at stored precision. Bloc columns sum their member parties (membership from
 * PARTY_CONFIG.block, matching computeBlocks), each named bloc rounded to the
 * table's one decimal — summing one-decimal components manufactures false
 * precision (1990's left would print 40.95) — and "other" is the remainder to
 * 100 of the ROUNDED named blocs, so unlisted small parties are never dropped
 * and every bloc row sums to exactly 100.
 */
function electionValue(key, dateStr) {
  const results = ELECTION_RESULTS[dateStr];
  if (!results) return null;
  if (key in BLOCKS) {
    const round1 = (value) => Math.round(value * 10) / 10;
    const blocTotal = (block) =>
      round1(
        Object.entries(results).reduce(
          (sum, [party, share]) => (PARTY_CONFIG[party]?.block === block ? sum + share : sum),
          0
        )
      );
    const named = Object.keys(BLOCKS).filter((block) => block !== "other");
    if (key === "other") return round1(named.reduce((rest, block) => rest - blocTotal(block), 100));
    return blocTotal(key);
  }
  return Number.isFinite(results[key]) ? results[key] : null;
}

/**
 * Table number formatting. Non-finite (party did not stand, or no official
 * result for the date) → em dash. Exact values keep a genuine second decimal:
 * BSW's 4.98% in 2025 must not round up to a "5.0" that would imply the
 * five-percent threshold was reached. Pass `exact = false` for smoothed poll
 * readings, which stay at the one decimal the rest of the page uses.
 */
function formatShare(value, exact = true) {
  if (!Number.isFinite(value)) return "—";
  if (!exact) return value.toFixed(1);
  return Math.round(value * 100) % 10 === 0 ? value.toFixed(1) : value.toFixed(2);
}

/**
 * Fill a <table> with the tabular counterpart of a chart: one row per federal
 * election plus the latest reading, one column per series. Election rows carry
 * the official second-vote result (ELECTION_RESULTS) — not a poll reading —
 * while the latest row repeats the smoothed numbers the lines are drawn from.
 *
 * @param {HTMLTableElement|null} table
 * @param {{dates: Date[], series: object[]}} chart  a render function's return value
 * @param {string} captionText  visually-hidden caption; per-table, because the
 *   parties and blocs tables derive their election rows differently
 */
export function renderChartTable(table, { dates, series } = {}, captionText) {
  if (!table || !Array.isArray(dates) || !dates.length || !series || !series.length) return;

  const rows = [];
  for (const dateStr of ELECTION_DATES) {
    const index = indexAtOrBefore(dates, Date.parse(`${dateStr}T00:00:00Z`));
    if (index < 0) continue;
    rows.push({ label: `${dateStr.slice(0, 4)} election`, index, dateStr });
  }
  // The latest smoothed reading always gets its own row — even when the series
  // ends on (or before) an election day, the official result and the poll
  // average are different numbers and both belong in the table.
  const latestIndex = dates.length - 1;
  rows.push({ label: `Latest · ${shortDate(dates[latestIndex])}`, index: latestIndex });

  const caption = document.createElement("caption");
  caption.className = "visually-hidden";
  caption.textContent = captionText || "";

  const headRow = document.createElement("tr");
  headRow.appendChild(cell("th", "col", "Reading"));
  for (const s of series) headRow.appendChild(cell("th", "col", s.short));
  const thead = document.createElement("thead");
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.appendChild(cell("th", "row", row.label));
    for (const s of series) {
      // Election rows show the stored official result (two decimals preserved
      // where significant); the latest row is a smoothed poll estimate.
      const text = row.dateStr
        ? formatShare(electionValue(s.key, row.dateStr))
        : formatShare(s.values[row.index], false);
      tr.appendChild(cell("td", null, text, "tnum"));
    }
    tbody.appendChild(tr);
  }

  table.replaceChildren(caption, thead, tbody);
}
