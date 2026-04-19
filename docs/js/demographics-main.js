import { loadDemographicsData } from "./demographics-data.js";
import { renderDemographicsChart } from "./demographics-charts.js";
import {
  DEMO_PARTIES,
  GENDERS,
  AGE_BRACKETS,
  LINE_COLORS,
  MAX_SELECTIONS,
  DEFAULT_SELECTIONS,
} from "./demographics-config.js";

let demoData = null;
let selections = [];
let nextId = 0;

// --- URL state helpers ---

function serializeSelections(sels) {
  const validKeys = new Set(Object.keys(DEMO_PARTIES));
  const params = new URLSearchParams();
  for (const sel of sels) {
    const parties = sel.parties.filter((p) => validKeys.has(p));
    if (!parties.length) continue;
    params.append("s", `${sel.gender}.${sel.ageBracket}.${parties.join(",")}`);
  }
  if (!params.has("s")) return null;
  // Check if this matches DEFAULT_SELECTIONS exactly so the default URL stays clean
  const defaults = DEFAULT_SELECTIONS.filter((d) => d.parties.length > 0);
  const entries = [...params.getAll("s")];
  if (entries.length === defaults.length) {
    const matchesDefault = defaults.every((d, i) => {
      const expected = `${d.gender}.${d.ageBracket}.${d.parties.join(",")}`;
      return entries[i] === expected;
    });
    if (matchesDefault) return null;
  }
  return params;
}

function parseSelectionsFromURL() {
  const raw = new URLSearchParams(window.location.search).getAll("s");
  if (!raw.length) return null;
  const validGenders = new Set(Object.keys(GENDERS));
  const validAges = new Set(AGE_BRACKETS.map((b) => b.key));
  const validParties = new Set(Object.keys(DEMO_PARTIES));
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
      const pill = document.createElement("span");
      pill.className = "party-pill";
      pill.style.setProperty("--pill-color", partyInfo.color);

      if (sel.parties.includes(partyKey)) {
        pill.classList.add("checked");
      }

      const dot = document.createElement("span");
      dot.className = "pill-dot";
      pill.appendChild(dot);
      pill.appendChild(document.createTextNode(partyInfo.label));

      pill.addEventListener("click", () => {
        const idx = sel.parties.indexOf(partyKey);
        if (idx >= 0) {
          sel.parties.splice(idx, 1);
          pill.classList.remove("checked");
        } else {
          sel.parties.push(partyKey);
          pill.classList.add("checked");
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
    }
  }, 100);
}

// --- Initialization ---

async function init() {
  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const addBtn = document.getElementById("add-selection");

  try {
    statusEl.innerHTML = '<div class="spinner"></div> <span>Loading data\u2026</span>';

    demoData = await loadDemographicsData();

    // Initialize selections from URL or defaults
    const fromURL = parseSelectionsFromURL();
    for (const def of fromURL ?? DEFAULT_SELECTIONS) {
      selections.push(createSelection(def));
    }

    updateURL();
    renderSelections();
    renderDemographicsChart("demographics-chart", demoData, selections);

    // Resize handler
    let lastWidth = window.innerWidth;
    window.addEventListener("resize", () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      scheduleRender();
    });

    // Add button
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

    statusEl.innerHTML = "<span>Representative election statistics (1953\u20132025)</span>";
    statusEl.classList.add("success");
  } catch (err) {
    console.error(err);
    statusEl.textContent = "";
    errorEl.textContent = `Failed to load demographics data: ${err.message}`;
    errorEl.style.display = "block";
  }
}

init();
