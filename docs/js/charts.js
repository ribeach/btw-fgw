import {
  PARTY_CONFIG,
  MAJOR_PARTIES,
  BLOCKS,
  ELECTION_DATES,
  Y_AXIS_HEADROOM,
  MOBILE_BREAKPOINT_PX,
} from "./config.js";
import { computeRollingAverage } from "./data.js";
import { CHART_FONT, chartTheme, plotlyConfig } from "./shared.js";

/**
 * Compute label positions with overlap avoidance.
 * Port of the Python add_end_labels algorithm.
 */
function computeLabelPositions(labels, minGap = 1.5) {
  // Sort by y value descending
  const sorted = [...labels].sort((a, b) => b.yValue - a.yValue);
  const placed = [];
  return sorted.map((item) => {
    let yPos = item.yValue;
    for (const py of placed) {
      if (Math.abs(yPos - py) < minGap) {
        yPos = item.yValue < py ? py - minGap : py + minGap;
      }
    }
    placed.push(yPos);
    return { ...item, yPos };
  });
}

/**
 * Build election date shapes (vertical dashed lines) and annotations (year labels).
 */
function buildElectionMarkers(yMax) {
  const shapes = ELECTION_DATES.map((dateStr) => ({
    type: "line",
    x0: dateStr,
    x1: dateStr,
    y0: 0,
    y1: 1,
    yref: "paper",
    line: { color: "gray", width: 0.8, dash: "dash" },
    opacity: 0.4,
  }));

  const annotations = ELECTION_DATES.map((dateStr) => ({
    x: dateStr,
    y: 1,
    yref: "paper",
    text: dateStr.slice(0, 4),
    showarrow: false,
    font: { size: 8, color: "rgba(255,255,255,0.5)" },
    opacity: 0.7,
    yanchor: "top",
    xanchor: "center",
  }));

  return { shapes, annotations };
}

/**
 * Build end-of-line label annotations from positioned labels.
 */
function buildEndLabels(labels, lastDate) {
  const positioned = computeLabelPositions(labels);
  return positioned.map((item) => ({
    x: lastDate,
    y: item.yValue,
    ax: 40,
    ay: (item.yPos - item.yValue) * -4,
    text: `<b>${item.text}</b>`,
    font: { color: item.color, size: 10 },
    showarrow: true,
    arrowcolor: item.color,
    arrowwidth: 1,
    arrowhead: 0,
    xanchor: "left",
    xshift: 10,
  }));
}

/**
 * Common layout settings shared between both charts.
 */
function baseLayout(title, isMobile) {
  const theme = chartTheme(isMobile);
  return {
    title: {
      text: title,
      font: { size: isMobile ? 14 : 20, family: CHART_FONT, color: "#f8fafc" },
      x: 0.02,
      xanchor: "left",
      y: isMobile ? 0.98 : 0.95,
      yanchor: "top"
    },
    ...theme,
    margin: isMobile ? { l: 40, r: 20, t: 70, b: 140 } : { l: 60, r: 140, t: 60, b: 50 },
    xaxis: {
      ...theme.xaxis,
      dtick: isMobile ? "M48" : "M24",
      tickformat: "%Y",
      tickangle: isMobile ? -45 : 0,
    },
    showlegend: isMobile,
    legend: isMobile ? {
      orientation: "h",
      y: -0.3,
      x: 0.5,
      xanchor: "center",
      itemwidth: 30,
      font: { size: 10 }
    } : undefined,
    annotations: [
      {
        text: "Source: Forschungsgruppe Wahlen",
        xref: "paper",
        yref: "paper",
        x: 1,
        y: isMobile ? 1.05 : 1.06,
        showarrow: false,
        font: { size: isMobile ? 8 : 9, color: "rgba(255,255,255,0.4)" },
        xanchor: "right",
      },
    ],
  };
}

/**
 * Shared chart finalization: build the layout, set axis ranges + election
 * markers + desktop end-labels, then render. Identical tail for both charts.
 */
function finalizeChart(containerId, traces, dates, endLabels, titleText, maxVal, isMobile) {
  const layout = baseLayout(titleText, isMobile);
  layout.yaxis.range = [0, maxVal + Y_AXIS_HEADROOM];
  layout.xaxis.range = [dates[0], dates[dates.length - 1]];

  const markers = buildElectionMarkers(maxVal + Y_AXIS_HEADROOM);
  layout.shapes = markers.shapes;
  layout.annotations = [
    ...layout.annotations,
    ...markers.annotations,
  ];

  if (!isMobile) {
    layout.annotations.push(...buildEndLabels(endLabels, dates[dates.length - 1]));
  }

  Plotly.react(containerId, traces, layout, plotlyConfig(isMobile));
}

export function renderPartiesChart(containerId, data) {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const dates = data.map((d) => d.date);
  const traces = [];
  const endLabels = [];

  for (const partyKey of MAJOR_PARTIES) {
    const info = PARTY_CONFIG[partyKey];
    const values = data.map((d) => d[partyKey] || 0);
    if (values.every((v) => v === 0)) continue;

    const smoothed = computeRollingAverage(dates, values);
    traces.push({
      x: dates,
      y: smoothed,
      mode: "lines",
      line: { color: info.lineColor || info.color, width: isMobile ? 2.0 : 2.5 },
      name: info.label,
      hovertemplate: `${info.label}: %{y:.1f}%<extra></extra>`,
    });
    endLabels.push({
      yValue: smoothed[smoothed.length - 1],
      text: info.label,
      color: info.lineColor || info.color,
    });
  }

  const startYear = dates[0].getUTCFullYear();
  const year = dates[dates.length - 1].getUTCFullYear();
  const titleText = isMobile
    ? `Major Parties<br>(${startYear}\u2013${year})`
    : `Major German Parties Polling (${startYear}\u2013${year})`;

  const maxVal = Math.max(...data.map((d) =>
    Math.max(...MAJOR_PARTIES.map((p) => d[p] || 0))
  ));

  finalizeChart(containerId, traces, dates, endLabels, titleText, maxVal, isMobile);
}

export function renderBlocksChart(containerId, data) {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const dates = data.map((d) => d.date);
  const traces = [];
  const endLabels = [];

  for (const [blockKey, blockInfo] of Object.entries(BLOCKS)) {
    const values = data.map((d) => d[blockKey] || 0);
    const smoothed = computeRollingAverage(dates, values);

    traces.push({
      x: dates,
      y: smoothed,
      mode: "lines",
      line: { color: blockInfo.color, width: isMobile ? 2.0 : 2.5 },
      fill: "tozeroy",
      fillcolor: blockInfo.color + "14",
      name: blockInfo.label,
      hovertemplate: `${blockInfo.label}: %{y:.1f}%<extra></extra>`,
    });
    endLabels.push({
      yValue: smoothed[smoothed.length - 1],
      text: blockInfo.label,
      color: blockInfo.color,
    });
  }

  const startYear = dates[0].getUTCFullYear();
  const year = dates[dates.length - 1].getUTCFullYear();
  const titleText = isMobile
    ? `Political Blocks<br>(${startYear}\u2013${year})`
    : `Political Spectrum in Germany (${startYear}\u2013${year}) \u2014 Blocks`;

  const maxVal = Math.max(...data.map((d) =>
    Math.max(...Object.keys(BLOCKS).map((b) => d[b] || 0))
  ));

  finalizeChart(containerId, traces, dates, endLabels, titleText, maxVal, isMobile);
}
