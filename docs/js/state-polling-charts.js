import { COLOR_RIGHT, COLOR_NEUTRAL, COLOR_LEFT, COLOR_SCALE_MAX, COLOR_SCALE_POWER } from "./state-polling-config.js";

/**
 * Interpolate between two hex colors.
 * t in [0,1], returns hex string.
 */
function lerpColor(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Map a diff value to a color.
 * Negative (right leads) → red, zero → neutral slate, positive (left leads) → blue.
 */
export function diffToColor(diff) {
  const clamped = Math.max(-COLOR_SCALE_MAX, Math.min(COLOR_SCALE_MAX, diff));
  if (clamped < 0) {
    const t = Math.pow(-clamped / COLOR_SCALE_MAX, COLOR_SCALE_POWER);
    return lerpColor(COLOR_NEUTRAL, COLOR_RIGHT, t);
  } else {
    const t = Math.pow(clamped / COLOR_SCALE_MAX, COLOR_SCALE_POWER);
    return lerpColor(COLOR_NEUTRAL, COLOR_LEFT, t);
  }
}

function formatDiff(v) {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "pp";
}

function formatDate(dateStr) {
  if (!dateStr) return "–";
  try {
    return new Date(dateStr).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

/**
 * Render a single choropleth map into a container element.
 * @param {HTMLElement} container - wrapper element
 * @param {string} svgText - raw SVG markup
 * @param {Array} states - state data array
 * @param {string} valueKey - "diff" or "change"
 * @param {HTMLElement} tooltip - shared tooltip element
 */
export function renderMap(container, svgText, states, valueKey, tooltip) {
  container.innerHTML = svgText;
  const svg = container.querySelector("svg");
  svg.style.width = "100%";
  svg.style.height = "auto";

  const stateById = Object.fromEntries(states.map((s) => [s.id, s]));

  for (const path of svg.querySelectorAll("path[id]")) {
    const stateId = path.id;
    const state = stateById[stateId];
    if (!state) continue;

    const value = state[valueKey];
    path.style.fill = diffToColor(value);

    path.addEventListener("mouseenter", () => {
      tooltip.style.display = "block";
      tooltip.innerHTML = buildTooltip(state, valueKey);
    });
    path.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
    path.addEventListener("mousemove", (e) => {
      const x = e.clientX + 14;
      const y = e.clientY + 14;
      // Keep tooltip within viewport
      tooltip.style.left = `${Math.min(x, window.innerWidth - 210)}px`;
      tooltip.style.top = `${Math.min(y, window.innerHeight - 160)}px`;
    });
  }
}

function buildTooltip(state, valueKey) {
  const isChange = valueKey === "change";
  const value = state[valueKey];
  const valueStr = formatDiff(value);
  const direction = value >= 0 ? "Links führt" : "Rechts führt";
  const changeDir = value >= 0 ? "nach links" : "nach rechts";

  if (isChange) {
    return `
      <div class="tooltip-title">${state.name}</div>
      <div class="tooltip-row"><span>Veränderung:</span><span class="${value >= 0 ? "pos" : "neg"}">${valueStr}</span></div>
      <div class="tooltip-row"><span>Richtung:</span><span>${changeDir}</span></div>
      <div class="tooltip-row"><span>Aktuell:</span><span>${formatDiff(state.diff)}</span></div>
      <div class="tooltip-row"><span>Landtagswahl ${state.election.date.slice(0, 4)}:</span><span>${formatDiff(state.election.diff)}</span></div>
    `;
  } else {
    return `
      <div class="tooltip-title">${state.name}</div>
      <div class="tooltip-row"><span>Links–Rechts:</span><span class="${value >= 0 ? "pos" : "neg"}">${valueStr}</span></div>
      <div class="tooltip-row"><span>${direction}</span></div>
      <div class="tooltip-row"><span>Links (SPD+Grüne+Linke):</span><span>${state.left.toFixed(1)}%</span></div>
      <div class="tooltip-row"><span>Rechts (CDU/CSU+AfD):</span><span>${state.right.toFixed(1)}%</span></div>
      <div class="tooltip-row"><span>Umfrage vom:</span><span>${formatDate(state.poll_date)}</span></div>
    `;
  }
}

/**
 * Render the summary segment bar.
 */
export function renderSegment(el, summary) {
  const cards = [
    {
      label: "Ø Alle Bundesländer",
      value: summary.avg_diff,
      sub: "Gewichteter Schnitt",
    },
    {
      label: "Westdeutschland",
      value: summary.west_avg,
      sub: "BW, BY, HB, HH, HE, NI, NW, RP, SL, SH",
    },
    {
      label: "Ostdeutschland",
      value: summary.east_avg,
      sub: "BB, BE, MV, SN, ST, TH",
    },
    {
      label: "Spannweite",
      value: null,
      sub: `${summary.max_state_name}: ${formatDiff(summary.max_diff)} — ${summary.min_state_name}: ${formatDiff(summary.min_diff)}`,
      valueHtml: `<span class="pos">${formatDiff(summary.max_diff)}</span> bis <span class="neg">${formatDiff(summary.min_diff)}</span>`,
    },
  ];

  el.innerHTML = cards.map((c) => `
    <div class="segment-card">
      <div class="segment-label">${c.label}</div>
      <div class="segment-value ${c.value !== null ? (c.value >= 0 ? "pos" : "neg") : ""}">
        ${c.valueHtml ?? formatDiff(c.value)}
      </div>
      <div class="segment-sub">${c.sub}</div>
    </div>
  `).join("");
}

let sortKey = "diff";
let sortAsc = false;

/**
 * Render the sortable data table.
 */
export function renderTable(el, states) {
  const columns = [
    { key: "name", label: "Bundesland", fmt: (s) => s.name },
    { key: "left", label: "Links %", fmt: (s) => s.left.toFixed(1) + "%" },
    { key: "right", label: "Rechts %", fmt: (s) => s.right.toFixed(1) + "%" },
    { key: "diff", label: "Differenz", fmt: (s) => `<span class="${s.diff >= 0 ? "pos" : "neg"}">${formatDiff(s.diff)}</span>` },
    { key: "election_diff", label: `Landtagswahl`, fmt: (s) => `<span class="${s.election.diff >= 0 ? "pos" : "neg"}">${formatDiff(s.election.diff)}</span>` },
    { key: "change", label: "Veränderung", fmt: (s) => `<span class="${s.change >= 0 ? "pos" : "neg"}">${formatDiff(s.change)}</span>` },
    { key: "poll_date", label: "Umfrage vom", fmt: (s) => formatDate(s.poll_date) },
  ];

  function getSortValue(s, key) {
    if (key === "name") return s.name;
    if (key === "left") return s.left;
    if (key === "right") return s.right;
    if (key === "diff") return s.diff;
    if (key === "election_diff") return s.election.diff;
    if (key === "change") return s.change;
    if (key === "poll_date") return s.poll_date;
    return 0;
  }

  function doRender() {
    const sorted = [...states].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const cmp = typeof av === "string" ? av.localeCompare(bv, "de") : av - bv;
      return sortAsc ? cmp : -cmp;
    });

    el.innerHTML = `
      <table class="state-table">
        <thead>
          <tr>
            ${columns.map((c) => `
              <th data-key="${c.key}" class="${c.key === sortKey ? (sortAsc ? "sort-asc" : "sort-desc") : ""}">
                ${c.label}
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${sorted.map((s) => `
            <tr>
              ${columns.map((c) => `<td>${c.fmt(s)}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    el.querySelectorAll("th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (sortKey === key) {
          sortAsc = !sortAsc;
        } else {
          sortKey = key;
          sortAsc = key === "name";
        }
        doRender();
      });
    });
  }

  doRender();
}
