import { loadDemographicsData, getElectionYears } from "./demographics-data.js";
import { renderDemographicsChart, renderDemographicsTable } from "./demographics-charts.js";
import {
  DEMO_PARTIES,
  GENDERS,
  AGE_BRACKETS,
  LINE_COLORS,
  MAX_SELECTIONS,
  DEFAULT_SELECTIONS,
} from "./demographics-config.js";
import { getStatusEls, showLoading, showError, ensurePlotly } from "./shared.js";
import { renderSpectrum } from "./shell.js";

let demoData = null;
let selections = [];
let nextId = 0;

/** The add/resize listeners are bound once, even if a retry re-runs init(). */
let listenersBound = false;

const PARTY_ORDER = Object.keys(DEMO_PARTIES);
const sortParties = (arr) => [...arr].sort((a, b) => PARTY_ORDER.indexOf(a) - PARTY_ORDER.indexOf(b));

// --- URL state helpers ---

function serializeSelections(sels) {
  const validKeys = new Set(Object.keys(DEMO_PARTIES));
  const params = new URLSearchParams();
  for (const sel of sels) {
    const parties = sortParties(sel.parties.filter((p) => validKeys.has(p)));
    if (!parties.length) continue;
    params.append("s", `${sel.gender}.${sel.ageBracket}.${parties.join(",")}`);
  }
  if (!params.has("s")) return null;
  // Check if this matches DEFAULT_SELECTIONS exactly so the default URL stays clean
  const defaults = DEFAULT_SELECTIONS.filter((d) => d.parties.length > 0);
  const entries = [...params.getAll("s")];
  if (entries.length === defaults.length) {
    const matchesDefault = defaults.every((d, i) => {
      const expected = `${d.gender}.${d.ageBracket}.${sortParties(d.parties).join(",")}`;
      return entries[i] === expected;
    });
    if (matchesDefault) return null;
  }
  return params;
}

/** Every gender key actually present in the loaded dataset. */
function validGendersFromData(data) {
  return new Set(Object.keys(data.genders || {}));
}

/** Every age-bracket key that appears under any election, for any gender. */
function validAgeBracketsFromData(data) {
  const set = new Set();
  for (const genderData of Object.values(data.genders || {})) {
    for (const electionData of Object.values(genderData.elections || {})) {
      for (const bracket of Object.keys(electionData)) set.add(bracket);
    }
  }
  return set;
}

/** The raw party fields the dataset actually carries per bracket (cdu, spd, ...). */
function dataPartyFields(data) {
  for (const genderData of Object.values(data.genders || {})) {
    for (const electionData of Object.values(genderData.elections || {})) {
      for (const bracketData of Object.values(electionData)) {
        return new Set(Object.keys(bracketData));
      }
    }
  }
  return new Set();
}

/**
 * Parse `?s=` selections from the URL, validated against the loaded dataset
 * rather than just the static config lists — an unknown gender, age bracket
 * or party (or a whole selection with nothing left after filtering) is
 * dropped rather than trusted. Callers fall back to DEFAULT_SELECTIONS when
 * nothing valid survives (this returns null in that case).
 */
function parseSelectionsFromURL(data) {
  const raw = new URLSearchParams(window.location.search).getAll("s");
  if (!raw.length) return null;

  const validGenders = validGendersFromData(data);
  const validAges = validAgeBracketsFromData(data);
  const fields = dataPartyFields(data);
  const validParties = new Set(
    Object.keys(DEMO_PARTIES).filter((p) => (p === "union" ? fields.has("cdu") : fields.has(p)))
  );

  const result = [];
  for (const entry of raw) {
    if (result.length >= MAX_SELECTIONS) break;
    const dotIdx1 = entry.indexOf(".");
    const dotIdx2 = entry.indexOf(".", dotIdx1 + 1);
    if (dotIdx1 < 0 || dotIdx2 < 0) continue;
    const gender = entry.slice(0, dotIdx1);
    const ageBracket = entry.slice(dotIdx1 + 1, dotIdx2);
    const partiesRaw = entry.slice(dotIdx2 + 1).split(",");
    if (!validGenders.has(gender) || !validAges.has(ageBracket)) continue;
    const parties = [...new Set(partiesRaw.filter((p) => validParties.has(p)))];
    if (!parties.length) continue;
    result.push({ gender, ageBracket, parties });
  }
  return result.length ? result : null;
}

function updateURL() {
  try {
    const params = serializeSelections(selections);
    if (params === null) {
      history.replaceState(null, "", window.location.pathname);
    } else {
      history.replaceState(null, "", "?" + params.toString());
    }
  } catch (_) {}
}

// Track which colors are in use so removals don't reshuffle
function getNextColor() {
  const usedColors = new Set(selections.map((s) => s.color));
  for (const c of LINE_COLORS) {
    if (!usedColors.has(c)) return c;
  }
  return LINE_COLORS[0];
}

function createSelection(opts) {
  return {
    id: nextId++,
    gender: opts.gender || "insgesamt",
    ageBracket: opts.ageBracket || "insgesamt",
    parties: [...(opts.parties || [])],
    color: opts.color || getNextColor(),
  };
}

// --- UI Rendering ---

function renderSelections() {
  const listEl = document.getElementById("selections-list");
  const addBtn = document.getElementById("add-selection");

  listEl.innerHTML = "";

  for (const sel of selections) {
    const card = document.createElement("div");
    card.className = "selection-card";
    card.style.setProperty("--card-color", sel.color);

    // Controls row: gender + age dropdowns
    const controls = document.createElement("div");
    controls.className = "card-controls";

    const genderSelect = document.createElement("select");
    genderSelect.setAttribute("aria-label", "Gender");
    for (const [key, label] of Object.entries(GENDERS)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = label;
      if (key === sel.gender) opt.selected = true;
      genderSelect.appendChild(opt);
    }
    genderSelect.addEventListener("change", () => {
      sel.gender = genderSelect.value;
      scheduleRender();
    });

    const ageSelect = document.createElement("select");
    ageSelect.setAttribute("aria-label", "Age bracket");
    for (const bracket of AGE_BRACKETS) {
      const opt = document.createElement("option");
      opt.value = bracket.key;
      opt.textContent = bracket.label;
      if (bracket.key === sel.ageBracket) opt.selected = true;
      ageSelect.appendChild(opt);
    }
    ageSelect.addEventListener("change", () => {
      sel.ageBracket = ageSelect.value;
      scheduleRender();
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-remove";
    removeBtn.innerHTML = "&times;";
    removeBtn.title = "Remove line";
    removeBtn.setAttribute("aria-label", "Remove this selection");
    removeBtn.disabled = selections.length <= 1;
    removeBtn.addEventListener("click", () => {
      selections = selections.filter((s) => s.id !== sel.id);
      renderSelections();
      scheduleRender();
    });

    controls.appendChild(genderSelect);
    controls.appendChild(ageSelect);
    controls.appendChild(removeBtn);

    // Party pills
    const pillsContainer = document.createElement("div");
    pillsContainer.className = "party-pills";

    for (const [partyKey, partyInfo] of Object.entries(DEMO_PARTIES)) {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "party-pill";
      pill.setAttribute("role", "checkbox");
      pill.style.setProperty("--pill-color", partyInfo.color);

      const isChecked = sel.parties.includes(partyKey);
      pill.setAttribute("aria-checked", String(isChecked));
      pill.setAttribute("aria-label", partyInfo.label);
      if (isChecked) pill.classList.add("checked");

      const dot = document.createElement("span");
      dot.className = partyKey === "union" ? "pill-dot pill-dot--union" : "pill-dot";
      pill.appendChild(dot);
      pill.appendChild(document.createTextNode(partyInfo.label));

      pill.addEventListener("click", () => {
        const idx = sel.parties.indexOf(partyKey);
        if (idx >= 0) {
          sel.parties.splice(idx, 1);
          pill.classList.remove("checked");
          pill.setAttribute("aria-checked", "false");
        } else {
          sel.parties.push(partyKey);
          pill.classList.add("checked");
          pill.setAttribute("aria-checked", "true");
        }
        scheduleRender();
      });

      pillsContainer.appendChild(pill);
    }

    card.appendChild(controls);
    card.appendChild(pillsContainer);
    listEl.appendChild(card);
  }

  addBtn.disabled = selections.length >= MAX_SELECTIONS;
}

// --- Chart Rendering with Debounce ---

let renderTimer = null;
function scheduleRender() {
  updateURL();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    if (demoData) {
      renderDemographicsChart("demographics-chart", demoData, selections);
      renderDemographicsTable("demographics-table-wrap", demoData, selections);
    }
  }, 100);
}

/**
 * Feed the masthead spectrum bar the 2025 second-vote split for all voters
 * (gender "insgesamt", age bracket "insgesamt"), independent of whatever
 * lines the reader has configured. Silently skipped if 2025 or any of the
 * six parties it needs is missing from the dataset \u2014 the bar stays hidden
 * rather than showing a partial or misleading split.
 */
function renderNationalSpectrum(data) {
  const bracket = data.genders?.insgesamt?.elections?.["2025"]?.insgesamt;
  if (!bracket) return;

  const needed = ["spd", "gruene", "linke", "cdu", "csu", "afd"];
  if (needed.some((key) => bracket[key] == null)) return;

  const left = bracket.spd + bracket.gruene + bracket.linke;
  const right = bracket.cdu + bracket.csu + bracket.afd;
  const other = 100 - left - right;

  renderSpectrum(
    document.getElementById("spectrum"),
    document.getElementById("spectrum-readout"),
    { left, other, right, caption: "Bundestagswahl 2025 second votes, all voters" }
  );
}

// --- Initialization ---

async function init() {
  const { statusEl, errorEl } = getStatusEls();

  // Idempotent: a retry after a failed load must not duplicate lines.
  selections = [];
  nextId = 0;

  try {
    ensurePlotly();
    showLoading(statusEl, "Loading data\u2026");

    demoData = await loadDemographicsData();
    if (!getElectionYears(demoData).length) throw new Error("Demographics dataset is empty");

    // Initialize selections from URL or defaults, validated against the data
    const fromURL = parseSelectionsFromURL(demoData);
    for (const def of fromURL ?? DEFAULT_SELECTIONS) {
      selections.push(createSelection(def));
    }

    updateURL();
    renderSelections();
    renderDemographicsChart("demographics-chart", demoData, selections);
    renderDemographicsTable("demographics-table-wrap", demoData, selections);
    renderNationalSpectrum(demoData);

    if (!listenersBound) {
      listenersBound = true;
      const addBtn = document.getElementById("add-selection");

      let lastWidth = window.innerWidth;
      window.addEventListener("resize", () => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        scheduleRender();
      });

      addBtn.addEventListener("click", () => {
        if (selections.length >= MAX_SELECTIONS) return;
        selections.push(createSelection({
          gender: "insgesamt",
          ageBracket: "insgesamt",
          parties: ["union"],
        }));
        renderSelections();
        scheduleRender();
      });
    }

    statusEl.innerHTML = "<span>Representative election statistics (1953\u20132025)</span>";
    statusEl.classList.add("success");
  } catch (err) {
    console.error(err);
    showError(statusEl, errorEl, `Failed to load demographics data: ${err.message}`, () => {
      errorEl.replaceChildren();
      errorEl.style.display = "none";
      init();
    });
  }
}

init();
