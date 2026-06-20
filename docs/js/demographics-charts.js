import { DEMO_PARTIES, GENDERS, AGE_BRACKETS } from "./demographics-config.js";
import { computeSelectionValue, getElectionYears } from "./demographics-data.js";
import { Y_AXIS_HEADROOM, MOBILE_BREAKPOINT_PX } from "./config.js";
import { CHART_FONT, chartTheme, plotlyConfig } from "./shared.js";

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
 * Plotly base layout for the demographics chart.
 */
function baseLayout(isMobile) {
  const theme = chartTheme(isMobile);
  return {
    title: {
      text: isMobile
        ? "Voting by Demographics<br>(1953\u20132025)"
        : "Voting Patterns by Gender & Age (1953\u20132025)",
      font: {
        size: isMobile ? 14 : 20,
        family: CHART_FONT,
        color: "#f8fafc",
      },
      x: 0.02,
      xanchor: "left",
      y: isMobile ? 0.98 : 0.95,
      yanchor: "top",
    },
    ...theme,
    margin: isMobile
      ? { l: 40, r: 20, t: 70, b: 60 }
      : { l: 60, r: 30, t: 60, b: 50 },
    xaxis: {
      ...theme.xaxis,
      title: "",
      dtick: isMobile ? 20 : 10,
      tickangle: isMobile ? -45 : 0,
    },
    showlegend: true,
    legend: {
      orientation: "h",
      y: isMobile ? -0.15 : -0.1,
      x: 0.5,
      xanchor: "center",
      font: { size: isMobile ? 9 : 11 },
    },
    annotations: [
      {
        text: "Source: Bundeswahlleiterin, Heft 4",
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
 * Render the demographics chart with the given selections.
 */
export function renderDemographicsChart(containerId, data, selections) {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const years = getElectionYears(data);
  const traces = [];

  for (const sel of selections) {
    if (!sel.parties.length) continue;

    const yValues = years.map((year) =>
      computeSelectionValue(data, sel.gender, sel.ageBracket, sel.parties, year)
    );

    const label = selectionLabel(sel, isMobile);

    traces.push({
      x: years,
      y: yValues,
      mode: "lines+markers",
      line: { color: sel.color, width: isMobile ? 2.0 : 2.5 },
      marker: { color: sel.color, size: isMobile ? 4 : 6 },
      name: label,
      connectgaps: false,
      hovertemplate: `${label}: %{y:.1f}%<extra></extra>`,
    });
  }

  if (traces.length === 0) {
    const layout = baseLayout(isMobile);
    layout.xaxis.range = [years[0] - 1, years[years.length - 1] + 1];
    layout.yaxis.range = [0, 50];
    layout.annotations = [
      ...layout.annotations,
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
  layout.yaxis.range = [0, Math.min(maxVal + Y_AXIS_HEADROOM, 100)];
  layout.xaxis.range = [years[0] - 1, years[years.length - 1] + 1];

  Plotly.react(containerId, traces, layout, plotlyConfig(isMobile));
}
