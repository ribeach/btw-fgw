import { PARTY_CONFIG, MAJOR_PARTIES, BLOCKS, ELECTION_DATES, SMOOTHING_WINDOW_DAYS } from "./config.js";
import { computeRollingAverage } from "./data.js";

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
    font: { size: 7, color: "gray" },
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
function baseLayout(title) {
  const year = new Date().getFullYear();
  return {
    title: {
      text: title,
      font: { size: 20, family: "system-ui, -apple-system, sans-serif" },
      x: 0.02,
      xanchor: "left",
    },
    font: { family: "system-ui, -apple-system, sans-serif" },
    plot_bgcolor: "#fafafa",
    paper_bgcolor: "#ffffff",
    margin: { l: 60, r: 140, t: 60, b: 50 },
    xaxis: {
      dtick: "M24",
      tickformat: "%Y",
      gridcolor: "rgba(0,0,0,0.08)",
      showline: false,
      zeroline: false,
    },
    yaxis: {
      ticksuffix: "%",
      gridcolor: "rgba(0,0,0,0.08)",
      showline: false,
      zeroline: false,
      rangemode: "tozero",
    },
    showlegend: false,
    hovermode: "x unified",
    annotations: [
      {
        text: "Source: Forschungsgruppe Wahlen",
        xref: "paper",
        yref: "paper",
        x: 1,
        y: 1.06,
        showarrow: false,
        font: { size: 9, color: "gray" },
        xanchor: "right",
      },
    ],
  };
}

const PLOTLY_CONFIG = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ["lasso2d", "select2d"],
};

/**
 * Render the major parties trend chart.
 */
export function renderPartiesChart(containerId, data) {
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
      line: { color: info.color, width: 2.5 },
      name: info.label,
      hovertemplate: `${info.label}: %{y:.1f}%<extra></extra>`,
    });
    endLabels.push({
      yValue: smoothed[smoothed.length - 1],
      text: info.label,
      color: info.color,
    });
  }

  const year = new Date().getFullYear();
  const layout = baseLayout(`Major German Parties Polling (1991\u2013${year})`);

  const maxVal = Math.max(...data.map((d) =>
    Math.max(...MAJOR_PARTIES.map((p) => d[p] || 0))
  ));
  layout.yaxis.range = [0, maxVal + 5];
  layout.xaxis.range = [dates[0], dates[dates.length - 1]];

  const markers = buildElectionMarkers(maxVal + 5);
  layout.shapes = markers.shapes;
  layout.annotations = [
    ...layout.annotations,
    ...markers.annotations,
    ...buildEndLabels(endLabels, dates[dates.length - 1]),
  ];

  Plotly.newPlot(containerId, traces, layout, PLOTLY_CONFIG);
}

/**
 * Render the political blocks trend chart.
 */
export function renderBlocksChart(containerId, data) {
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
      line: { color: blockInfo.color, width: 2.5 },
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

  const year = new Date().getFullYear();
  const layout = baseLayout(`Political Spectrum in Germany (1991\u2013${year}) \u2014 Blocks`);

  const maxVal = Math.max(...data.map((d) =>
    Math.max(...Object.keys(BLOCKS).map((b) => d[b] || 0))
  ));
  layout.yaxis.range = [0, maxVal + 5];
  layout.xaxis.range = [dates[0], dates[dates.length - 1]];

  const markers = buildElectionMarkers(maxVal + 5);
  layout.shapes = markers.shapes;
  layout.annotations = [
    ...layout.annotations,
    ...markers.annotations,
    ...buildEndLabels(endLabels, dates[dates.length - 1]),
  ];

  Plotly.newPlot(containerId, traces, layout, PLOTLY_CONFIG);
}
