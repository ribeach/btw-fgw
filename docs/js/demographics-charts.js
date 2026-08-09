// Demographics chart — the single Plotly figure on demographics.html.
//
// Chart title, source and the year range live in the page's
// <figcaption class="panel-head">, not inside Plotly: HTML text is selectable,
// translatable and readable by assistive tech, and it keeps the plot's top
// margin down to a hairline. This module therefore only draws marks, axes,
// the legend/end-labels and the "select at least one party" empty state.

import { DEMO_PARTIES, GENDERS, AGE_BRACKETS } from "./demographics-config.js";
import { computeSelectionValue, getElectionYears } from "./demographics-data.js";
import { Y_AXIS_HEADROOM, MOBILE_BREAKPOINT_PX } from "./config.js";
import {
  chartTheme,
  plotlyConfig,
  layoutEndLabels,
  buildEndLabelAnnotations,
  measureRightMargin,
} from "./shared.js";

/** Used when the container has not been laid out yet (height comes from CSS). */
const FALLBACK_CONTAINER_HEIGHT_PX = 450;

/**
 * Generate a human-readable label for a selection.
 */
function selectionLabel(sel, short = false) {
  const genderLabel = short
    ? { insgesamt: "All", frauen: "W", maenner: "M" }[sel.gender]
    : GENDERS[sel.gender];

  const bracket = AGE_BRACKETS.find((b) => b.key === sel.ageBracket);
  const ageLabel = bracket ? bracket.label : sel.ageBracket;

  const partyLabels = sel.parties.map((p) => {
    const info = DEMO_PARTIES[p];
    if (short) {
      return info ? info.label.slice(0, 3) : p.slice(0, 3);
    }
    return info ? info.label : p;
  });

  return `${genderLabel}, ${ageLabel}, ${partyLabels.join("+")}`;
}

/**
 * Plotly base layout for the demographics chart. No title and no source
 * annotation — the panel head above the plot carries both.
 */
function baseLayout(isMobile) {
  const theme = chartTheme(isMobile);
  return {
    ...theme,
    margin: isMobile
      ? { l: 40, r: 20, t: 16, b: 60 }
      : { l: 60, r: 30, t: 16, b: 50 },
    xaxis: {
      ...theme.xaxis,
      title: "",
      dtick: isMobile ? 20 : 10,
      tickangle: isMobile ? -45 : 0,
    },
    showlegend: false,
    annotations: [],
  };
}

/**
 * Full horizontal legend, shared by mobile and by the desktop "too few lines
 * to bother with end labels" case.
 */
function legendLayout(isMobile) {
  return {
    orientation: "h",
    y: isMobile ? -0.15 : -0.1,
    x: 0.5,
    xanchor: "center",
    font: { size: isMobile ? 9 : 11 },
  };
}

/**
 * Render the demographics chart with the given selections.
 */
export function renderDemographicsChart(containerId, data, selections) {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const years = getElectionYears(data);
  const traces = [];
  // Short label + colour + most recent non-null value, for the desktop
  // end-of-line labels.
  const endLabelEntries = [];

  for (const sel of selections) {
    if (!sel.parties.length) continue;

    const yValues = years.map((year) =>
      computeSelectionValue(data, sel.gender, sel.ageBracket, sel.parties, year)
    );

    const label = selectionLabel(sel, false);
    const shortLabel = selectionLabel(sel, true);

    traces.push({
      x: years,
      y: yValues,
      mode: "lines+markers",
      line: { color: sel.color, width: isMobile ? 2.0 : 2.5 },
      marker: { color: sel.color, size: isMobile ? 4 : 6 },
      name: isMobile ? shortLabel : label,
      connectgaps: false,
      hovertemplate: `${label}: %{y:.1f}%<extra></extra>`,
    });

    for (let i = yValues.length - 1; i >= 0; i--) {
      if (yValues[i] !== null) {
        endLabelEntries.push({ text: shortLabel, color: sel.color, yValue: yValues[i] });
        break;
      }
    }
  }

  if (traces.length === 0) {
    const layout = baseLayout(isMobile);
    layout.xaxis.range = [years[0] - 1, years[years.length - 1] + 1];
    layout.yaxis.range = [0, 50];
    layout.annotations = [
      {
        text: "Select at least one party",
        xref: "paper", yref: "paper", x: 0.5, y: 0.5,
        xanchor: "center", yanchor: "middle", showarrow: false,
        font: { size: isMobile ? 13 : 16, color: "rgba(255,255,255,0.55)" },
      },
    ];
    Plotly.react(containerId, [], layout, plotlyConfig(isMobile));
    return;
  }

  const layout = baseLayout(isMobile);

  // Set y-axis range based on data
  const allY = traces.flatMap((t) => t.y.filter((v) => v !== null));
  const maxVal = allY.length ? Math.max(...allY) : 50;
  const yMax = Math.min(maxVal + Y_AXIS_HEADROOM, 100);
  layout.yaxis.range = [0, yMax];
  layout.xaxis.range = [years[0] - 1, years[years.length - 1] + 1];

  // End labels are a desktop-only convenience: too cramped on mobile, and not
  // worth the gutter when fewer than two lines actually have data to label.
  const useEndLabels = !isMobile && endLabelEntries.length >= 2;

  if (useEndLabels) {
    const container = document.getElementById(containerId);
    const containerHeight = (container && container.clientHeight) || FALLBACK_CONTAINER_HEIGHT_PX;
    layout.margin = { ...layout.margin, r: measureRightMargin(endLabelEntries) };
    const plotHeightPx = Math.max(80, containerHeight - layout.margin.t - layout.margin.b);
    const pxPerUnit = yMax > 0 ? plotHeightPx / yMax : 0;

    const laid = layoutEndLabels(endLabelEntries, { plotHeightPx, yMax });
    layout.showlegend = false;
    layout.annotations = buildEndLabelAnnotations(laid, { pxPerUnit });
  } else {
    layout.showlegend = true;
    layout.legend = legendLayout(isMobile);
  }

  Plotly.react(containerId, traces, layout, plotlyConfig(isMobile));
}

// --- "View the numbers" ------------------------------------------------------

/**
 * Fill the data-table container with the tabular equivalent of the chart:
 * one row per election year, one column per active (non-empty) selection.
 * Rebuilt on every render alongside the chart, so the two can never drift.
 *
 * @param {string} containerId  id of the wrapping element the <table> is mounted into
 * @param {object} data         parsed demographics.json
 * @param {object[]} selections current selection state
 */
export function renderDemographicsTable(containerId, data, selections) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const active = selections.filter((sel) => sel.parties.length > 0);
  if (!active.length) {
    container.replaceChildren();
    return;
  }

  const years = getElectionYears(data);
  const table = document.createElement("table");

  const caption = document.createElement("caption");
  caption.className = "visually-hidden";
  caption.textContent =
    "Second-vote share in percent for each configured line, at every federal election since 1953.";

  const headRow = document.createElement("tr");
  const yearHeadTh = document.createElement("th");
  yearHeadTh.scope = "col";
  yearHeadTh.textContent = "Year";
  headRow.appendChild(yearHeadTh);
  for (const sel of active) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = selectionLabel(sel, true);
    th.style.color = sel.color;
    headRow.appendChild(th);
  }
  const thead = document.createElement("thead");
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");
  for (const year of years) {
    const row = document.createElement("tr");
    const yearTh = document.createElement("th");
    yearTh.scope = "row";
    yearTh.className = "tnum";
    yearTh.textContent = String(year);
    row.appendChild(yearTh);

    for (const sel of active) {
      const value = computeSelectionValue(data, sel.gender, sel.ageBracket, sel.parties, year);
      const td = document.createElement("td");
      td.className = "tnum";
      td.textContent = value === null ? "–" : `${value.toFixed(1)}%`;
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }

  table.replaceChildren(caption, thead, tbody);
  container.replaceChildren(table);
}
