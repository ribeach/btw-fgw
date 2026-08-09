import {
  COLOR_RIGHT,
  COLOR_NEUTRAL,
  COLOR_LEFT,
  COLOR_SCALE_MAX_DIFF,
  COLOR_SCALE_MAX_CHANGE,
  COLOR_SCALE_POWER,
  WEST_STATES,
  EAST_STATES,
  stateName,
} from "./state-polling-config.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Shown wherever a state's numbers come from the last election, not a poll. */
const FALLBACK_NOTE = "No current survey — showing the last state election result";

/** Discrete steps in a map legend. Odd, so one swatch lands exactly on zero. */
const LEGEND_SWATCHES = 9;

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
 * Map a value to a colour on the diverging scale.
 *
 * Negative (right bloc leads) → blue, zero → neutral slate, positive (left bloc
 * leads) → red, matching the bloc colours used on the federal page.
 *
 * @param {number} value  the value in percentage points
 * @param {number} max    the value that saturates the scale — pass the domain of
 *   the map being drawn, since the two maps measure different quantities
 */
export function diffToColor(value, max = COLOR_SCALE_MAX_DIFF) {
  if (!Number.isFinite(value)) return COLOR_NEUTRAL;
  const clamped = Math.max(-max, Math.min(max, value));
  const t = Math.pow(Math.abs(clamped) / max, COLOR_SCALE_POWER);
  return lerpColor(COLOR_NEUTRAL, clamped < 0 ? COLOR_RIGHT : COLOR_LEFT, t);
}

/** Colour-scale domain for a map, in percentage points. */
function scaleMax(valueKey) {
  return valueKey === "change" ? COLOR_SCALE_MAX_CHANGE : COLOR_SCALE_MAX_DIFF;
}

function formatDiff(v) {
  if (!Number.isFinite(v)) return "–";
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "pp";
}

/** Legend tick label: signed, and only as precise as it needs to be. */
function formatTick(v) {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${v > 0 ? "+" : "−"}${text}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "–";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(dateStr);
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatYear(dateStr) {
  return /^\d{4}/.test(dateStr ?? "") ? dateStr.slice(0, 4) : "–";
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "–";
}

/**
 * Tint class for a signed value: `pos` = the left bloc is ahead (red),
 * `neg` = the right bloc is ahead (blue). Same semantics on both maps and in
 * the table; only the palette changed.
 */
function diffClass(value) {
  if (!Number.isFinite(value)) return "";
  return value >= 0 ? "pos" : "neg";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[ch]));
}

// --- Maps ------------------------------------------------------------------

/**
 * Add the diagonal hatch used to mark states with no current survey.
 * Each inlined copy of the map needs its own pattern id — two SVGs in one
 * document cannot share one, the second definition would win for both.
 */
function injectHatchPattern(svg, patternId) {
  const defs = document.createElementNS(SVG_NS, "defs");
  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", patternId);
  pattern.setAttribute("width", "6");
  pattern.setAttribute("height", "6");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("patternTransform", "rotate(45)");

  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", "0");
  line.setAttribute("y1", "0");
  line.setAttribute("x2", "0");
  line.setAttribute("y2", "6");
  line.setAttribute("stroke", "rgba(243, 241, 236, 0.5)");
  line.setAttribute("stroke-width", "1.4");

  pattern.appendChild(line);
  defs.appendChild(pattern);
  svg.insertBefore(defs, svg.firstChild);
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
  if (!svg) {
    throw new Error("State map SVG did not contain an <svg> element");
  }
  svg.style.width = "100%";
  svg.style.height = "auto";

  // position:fixed is only relative to the viewport while no ancestor carries a
  // transform. The tooltip's markup sits inside the page's animated content, so
  // it is reparented to <body> before it is ever shown — otherwise a tooltip
  // opened during the entrance animation lands at the wrong coordinates.
  if (tooltip && tooltip.parentNode !== document.body) {
    document.body.appendChild(tooltip);
  }

  // A group, not an image: role="img" would prune the per-state children and
  // with them every label a keyboard or screen-reader user can reach.
  container.setAttribute("role", "group");
  container.setAttribute("aria-label",
    valueKey === "change"
      ? "Map: change in the left–right difference since the last state election, by state"
      : "Map: current left–right difference in percentage points, by state");

  const patternId = `hatch-${valueKey}`;
  injectHatchPattern(svg, patternId);

  const max = scaleMax(valueKey);
  const stateById = Object.fromEntries(states.map((s) => [s.id, s]));

  // Hatch overlays are drawn last so no neighbouring state paints over them.
  const hatchLayer = document.createElementNS(SVG_NS, "g");
  hatchLayer.setAttribute("class", "fallback-hatch");
  hatchLayer.setAttribute("aria-hidden", "true");
  hatchLayer.style.pointerEvents = "none";

  const hide = () => { tooltip.style.display = "none"; };

  for (const path of svg.querySelectorAll("path[id]")) {
    const state = stateById[path.id];
    // Both maps inline the same file, so the "DE-XX" ids would be duplicated
    // across the document. Nothing references them by id — the hatch overlay
    // copies the `d` attribute rather than <use href="#…"> — so the id moves to
    // a data attribute and the document keeps unique ids.
    path.dataset.stateId = path.id;
    path.removeAttribute("id");
    if (!state) continue;

    const value = state[valueKey];
    path.style.fill = diffToColor(value, max);

    // Per-state text alternative so the map carries standalone meaning for AT.
    const titleText = buildMapPathTitle(state, valueKey);
    const titleEl = document.createElementNS(SVG_NS, "title");
    titleEl.textContent = titleText;
    path.insertBefore(titleEl, path.firstChild);
    path.setAttribute("role", "img");
    path.setAttribute("aria-label", titleText);
    // Every state is a tab stop: the maps are the primary reading of this page,
    // and a pointer-only map would hide half of it from keyboard users.
    path.setAttribute("tabindex", "0");

    if (state.is_fallback) {
      path.style.strokeDasharray = "3 2";
      const overlay = document.createElementNS(SVG_NS, "path");
      overlay.setAttribute("d", path.getAttribute("d"));
      overlay.style.fill = `url(#${patternId})`;
      overlay.style.stroke = "none";
      overlay.style.pointerEvents = "none";
      hatchLayer.appendChild(overlay);
    }

    const show = () => {
      tooltip.style.display = "block";
      tooltip.innerHTML = buildTooltip(state, valueKey);
    };

    path.addEventListener("mouseenter", show);
    path.addEventListener("mouseleave", hide);
    path.addEventListener("mousemove", (e) => {
      positionTooltip(tooltip, e.clientX + 14, e.clientY + 14, e.clientX);
    });

    // Focus mirrors hover, anchored to the shape rather than to a cursor that
    // keyboard users do not have.
    path.addEventListener("focus", () => {
      show();
      const box = path.getBoundingClientRect();
      positionTooltip(tooltip, box.right + 8, box.bottom + 8, box.right);
    });
    path.addEventListener("blur", hide);
    path.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });
  }

  svg.appendChild(hatchLayer);

  const wrapper = container.closest(".map-wrapper") ?? container.parentElement;
  if (wrapper) {
    wrapper.querySelector(".map-legend")?.remove();
    wrapper.appendChild(buildLegend(valueKey, states.some((s) => s.is_fallback)));
  }
}

/**
 * Place the tooltip near (x, y) without letting it leave the viewport.
 *
 * The box is measured after its content is set — the old fixed 210×160 guess
 * clipped long state names and left a gap under short ones. `anchorX` is where
 * the pointer or shape actually is: in the right third of the window the
 * tooltip flips to the other side so it never covers what it describes.
 */
function positionTooltip(tooltip, x, y, anchorX = x) {
  const pad = 8;
  const box = tooltip.getBoundingClientRect();

  let left = x;
  if (anchorX > window.innerWidth * (2 / 3)) {
    left = anchorX - 14 - box.width;
  }
  left = Math.max(pad, Math.min(left, window.innerWidth - box.width - pad));

  const top = Math.max(pad, Math.min(y, window.innerHeight - box.height - pad));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

/**
 * Build the discrete legend for one map. Each swatch is painted by the same
 * `diffToColor` that fills the states, so the sqrt ramp the map applies is the
 * ramp the reader sees — the old shared CSS gradient was linear and therefore
 * lied about both maps at once.
 */
function buildLegend(valueKey, hasFallback) {
  const max = scaleMax(valueKey);
  const legend = document.createElement("div");
  legend.className = "map-legend";

  const swatches = document.createElement("div");
  swatches.className = "legend-swatches";
  swatches.setAttribute("aria-hidden", "true");
  for (let i = 0; i < LEGEND_SWATCHES; i++) {
    const t = (i / (LEGEND_SWATCHES - 1)) * 2 - 1;
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = diffToColor(t * max, max);
    swatches.appendChild(swatch);
  }
  legend.appendChild(swatches);

  const ticks = document.createElement("div");
  ticks.className = "legend-ticks";
  ticks.setAttribute("aria-hidden", "true");
  for (const value of [-max, -max / 2, 0, max / 2, max]) {
    const tick = document.createElement("span");
    tick.textContent = formatTick(value);
    ticks.appendChild(tick);
  }
  legend.appendChild(ticks);

  const ends = document.createElement("p");
  ends.className = "legend-ends";
  const low = document.createElement("span");
  low.className = "legend-item legend-right";
  low.textContent = valueKey === "change" ? "Shifted right ←" : "Right leads ←";
  const high = document.createElement("span");
  high.className = "legend-item legend-left";
  high.textContent = valueKey === "change" ? "→ Shifted left" : "→ Left leads";
  ends.append(low, high);
  legend.appendChild(ends);

  if (hasFallback) {
    const note = document.createElement("p");
    note.className = "legend-note";
    note.textContent = `Hatched: ${FALLBACK_NOTE.toLowerCase()}.`;
    legend.appendChild(note);
  }

  return legend;
}

/**
 * Plain-text label for a single state path (SVG <title> + aria-label).
 * Reuses formatDiff and the tooltip's direction wording, no HTML.
 */
function buildMapPathTitle(state, valueKey) {
  const value = state[valueKey];
  const label = stateName(state.id, state.name);
  const prefix = state.is_fallback ? `${FALLBACK_NOTE}. ` : "";
  if (!Number.isFinite(value)) {
    return `${prefix}${label}: no data`;
  }
  const valueStr = formatDiff(value);
  if (valueKey === "change") {
    const changeDir = value >= 0 ? "to the left" : "to the right";
    return `${prefix}${label}: shift ${changeDir} ${valueStr}`;
  }
  const direction = value >= 0 ? "Left leads" : "Right leads";
  return `${prefix}${label}: ${direction} ${valueStr}`;
}

function buildTooltip(state, valueKey) {
  const isChange = valueKey === "change";
  const value = state[valueKey];
  const valueStr = formatDiff(value);
  const direction = Number.isFinite(value) ? (value >= 0 ? "Left leads" : "Right leads") : "No data";
  const changeDir = Number.isFinite(value) ? (value >= 0 ? "To the left" : "To the right") : "No data";
  const label = escapeHtml(stateName(state.id, state.name));
  const note = state.is_fallback
    ? `<div class="tooltip-note">${escapeHtml(FALLBACK_NOTE)}</div>`
    : "";

  if (isChange) {
    return `
      ${note}
      <div class="tooltip-title">${label}</div>
      <div class="tooltip-row"><span>Change:</span><span class="${diffClass(value)}">${valueStr}</span></div>
      <div class="tooltip-row"><span>Direction:</span><span>${changeDir}</span></div>
      <div class="tooltip-row"><span>Current:</span><span>${formatDiff(state.diff)}</span></div>
      <div class="tooltip-row"><span>State election ${formatYear(state.election?.date)}:</span><span>${formatDiff(state.election?.diff)}</span></div>
    `;
  } else {
    return `
      ${note}
      <div class="tooltip-title">${label}</div>
      <div class="tooltip-row"><span>Left–Right:</span><span class="${diffClass(value)}">${valueStr}</span></div>
      <div class="tooltip-row"><span>${direction}</span></div>
      <div class="tooltip-row"><span>Left (SPD+Grüne+Linke):</span><span>${formatPercent(state.left)}</span></div>
      <div class="tooltip-row"><span>Right (CDU/CSU+AfD):</span><span>${formatPercent(state.right)}</span></div>
      <div class="tooltip-row"><span>Polled:</span><span>${formatDate(state.poll_date)}</span></div>
    `;
  }
}

// --- Summary ---------------------------------------------------------------

/**
 * Join the two-letter suffixes of a set of "DE-XX" state ids into a subtitle,
 * e.g. WEST_STATES → "BW, BY, HB, HH, HE, NI, NW, RP, SL, SH". Derives the
 * West/East segment subtitles from the single source in state-polling-config.js
 * so the map's classification and the subtitle can never drift apart.
 */
function stateAbbrevs(set) {
  return [...set].map((id) => id.slice(3)).join(", ");
}

/**
 * Render the summary segment bar.
 */
export function renderSegment(el, summary) {
  const maxName = escapeHtml(stateName(summary.max_state, summary.max_state_name));
  const minName = escapeHtml(stateName(summary.min_state, summary.min_state_name));
  const cards = [
    {
      label: "Ø All states",
      value: summary.avg_diff,
      sub: "Population-weighted average",
    },
    {
      label: "West Germany",
      value: summary.west_avg,
      sub: stateAbbrevs(WEST_STATES),
    },
    {
      label: "East Germany",
      value: summary.east_avg,
      sub: stateAbbrevs(EAST_STATES),
    },
    {
      label: "Range",
      value: null,
      sub: `${maxName}: ${formatDiff(summary.max_diff)} — ${minName}: ${formatDiff(summary.min_diff)}`,
      valueHtml: `<span class="${diffClass(summary.max_diff)}">${formatDiff(summary.max_diff)}</span> to <span class="${diffClass(summary.min_diff)}">${formatDiff(summary.min_diff)}</span>`,
    },
  ];

  el.innerHTML = cards.map((c) => `
    <div class="segment-card">
      <div class="segment-label">${escapeHtml(c.label)}</div>
      <div class="segment-value ${c.value !== null ? diffClass(c.value) : ""}">
        ${c.valueHtml ?? formatDiff(c.value)}
      </div>
      <div class="segment-sub">${c.sub}</div>
    </div>
  `).join("");
}

// --- Table -----------------------------------------------------------------

let sortKey = "diff";
let sortAsc = false;

/**
 * The live re-render callback for each table container, replaced on every
 * renderTable call. The delegated sort listener is bound once but has to reach
 * the current render, not the one that happened to be first.
 *
 * @type {WeakMap<HTMLElement, Function>}
 */
const tableRenderers = new WeakMap();

const TABLE_CAPTION =
  "Left and right bloc shares for all 16 German states, with the current " +
  "left–right difference, the last state election result, and the change " +
  "since. Use the column headers to sort.";

/**
 * Render the sortable data table.
 *
 * @param {HTMLElement} el  the scroll container the table is written into
 * @param {Array} states
 * @param {object} [refs]
 * @param {HTMLElement} [refs.footnoteEl]  paragraph under the table, for the † note
 * @param {HTMLElement} [refs.statusEl]    visually-hidden live region for sort announcements
 */
export function renderTable(el, states, { footnoteEl = null, statusEl = null } = {}) {
  const columns = [
    { key: "name", label: "State", fmt: (s) => nameCell(s) },
    { key: "left", label: "Left %", fmt: (s) => formatPercent(s.left) },
    { key: "right", label: "Right %", fmt: (s) => formatPercent(s.right) },
    { key: "diff", label: "Difference", fmt: (s) => `<span class="${diffClass(s.diff)}">${formatDiff(s.diff)}</span>` },
    { key: "election_diff", label: `State election`, fmt: (s) => `<span class="${diffClass(s.election?.diff)}">${formatDiff(s.election?.diff)}</span>` },
    { key: "change", label: "Change", fmt: (s) => `<span class="${diffClass(s.change)}">${formatDiff(s.change)}</span>` },
    { key: "poll_date", label: "Polled", fmt: (s) => formatDate(s.poll_date) },
  ];

  const hasFallback = states.some((s) => s.is_fallback);

  function nameCell(s) {
    const label = escapeHtml(stateName(s.id, s.name));
    if (!s.is_fallback) return label;
    return `${label}<sup class="fallback-mark" aria-hidden="true">†</sup>` +
      `<span class="visually-hidden"> — ${escapeHtml(FALLBACK_NOTE)}</span>`;
  }

  function getSortValue(s, key) {
    // Sort on the displayed English name so the A–Z order matches what's shown.
    if (key === "name") return stateName(s.id, s.name);
    if (key === "left") return s.left;
    if (key === "right") return s.right;
    if (key === "diff") return s.diff;
    if (key === "election_diff") return s.election?.diff;
    if (key === "change") return s.change;
    if (key === "poll_date") return s.poll_date;
    return 0;
  }

  function compareSortValues(av, bv) {
    if (typeof av === "string" || typeof bv === "string") {
      return String(av ?? "").localeCompare(String(bv ?? ""), "en");
    }
    return (av ?? 0) - (bv ?? 0);
  }

  /**
   * A horizontally scrolled region is only a tab stop when it actually scrolls.
   *
   * The same pass drives the right-edge fade mask: `is-scrollable` says there
   * is content past the edge, `is-at-end` says the reader has already reached
   * it. Gating the mask on both keeps it from dimming the last column's final
   * characters at desktop widths, where nothing is hidden in the first place.
   */
  function updateScrollAffordance() {
    const scrollable = el.scrollWidth > el.clientWidth + 1;
    if (scrollable) {
      el.setAttribute("tabindex", "0");
    } else {
      el.removeAttribute("tabindex");
    }
    el.classList.toggle("is-scrollable", scrollable);
    el.classList.toggle(
      "is-at-end",
      !scrollable || el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
    );
  }

  function doRender(announce = false) {
    // Re-rendering the whole table throws focus back to <body>; remember which
    // header the keyboard was on and put it back afterwards.
    const focusedKey = document.activeElement?.closest?.("th[data-key]")?.dataset.key ?? null;

    const sorted = [...states].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const cmp = compareSortValues(av, bv);
      return sortAsc ? cmp : -cmp;
    });

    el.innerHTML = `
      <table class="state-table">
        <caption class="visually-hidden">${TABLE_CAPTION}</caption>
        <thead>
          <tr>
            ${columns.map((c) => {
              const active = c.key === sortKey;
              const ariaSort = active ? (sortAsc ? "ascending" : "descending") : "none";
              const cls = active ? (sortAsc ? "sort-asc" : "sort-desc") : "";
              return `
              <th scope="col" data-key="${c.key}" aria-sort="${ariaSort}" class="${cls}">
                <button type="button" class="th-sort">${c.label}</button>
              </th>
            `;
            }).join("")}
          </tr>
        </thead>
        <tbody>
          ${sorted.map((s) => `
            <tr${s.is_fallback ? ' class="is-fallback"' : ""}>
              ${columns.map((c) => `<td>${c.fmt(s)}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    if (focusedKey) {
      el.querySelector(`th[data-key="${focusedKey}"] .th-sort`)?.focus();
    }

    updateScrollAffordance();

    if (announce && statusEl) {
      const label = columns.find((c) => c.key === sortKey)?.label ?? sortKey;
      statusEl.textContent = `Sorted by ${label}, ${sortAsc ? "ascending" : "descending"}`;
    }
  }

  if (footnoteEl) {
    footnoteEl.textContent = hasFallback ? `† ${FALLBACK_NOTE}.` : "";
    footnoteEl.hidden = !hasFallback;
  }

  // The delegated listener below outlives this call, so it must not close over
  // this call's doRender — a retry after a failed fetch renders a second time,
  // and the first closure still holds the first (stale) `states`.
  tableRenderers.set(el, doRender);

  // One delegated listener for the life of the page. Binding per <th> inside
  // doRender meant every sort added another generation of listeners.
  if (!el.dataset.sortBound) {
    el.dataset.sortBound = "true";
    el.addEventListener("click", (e) => {
      const th = e.target.closest?.("th[data-key]");
      if (!th || !el.contains(th)) return;
      const key = th.dataset.key;
      if (sortKey === key) {
        sortAsc = !sortAsc;
      } else {
        sortKey = key;
        sortAsc = key === "name";
      }
      tableRenderers.get(el)?.(true);
    });
    window.addEventListener("resize", updateScrollAffordance);
    el.addEventListener("scroll", updateScrollAffordance, { passive: true });
  }

  doRender();
}
