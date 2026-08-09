// State polling page configuration

import { BLOC_COLORS } from "./config.js";

// English display names for the 16 Bundesländer, keyed by the "DE-XX" ids used
// in docs/data/state-polling.json and in the map SVG's path ids. The German
// `name` in that JSON comes from scripts/state_election_results.json and is
// copied through by the daily pipeline; those stay German to match the official
// election records, and display language is handled here instead.
// Names with no established English exonym are kept as-is.
export const STATE_NAMES = {
  "DE-BW": "Baden-Württemberg",
  "DE-BY": "Bavaria",
  "DE-BE": "Berlin",
  "DE-BB": "Brandenburg",
  "DE-HB": "Bremen",
  "DE-HH": "Hamburg",
  "DE-HE": "Hesse",
  "DE-MV": "Mecklenburg-Vorpommern",
  "DE-NI": "Lower Saxony",
  "DE-NW": "North Rhine-Westphalia",
  "DE-RP": "Rhineland-Palatinate",
  "DE-SL": "Saarland",
  "DE-SN": "Saxony",
  "DE-ST": "Saxony-Anhalt",
  "DE-SH": "Schleswig-Holstein",
  "DE-TH": "Thuringia",
};

/**
 * English display name for a state id, falling back to the name shipped in the
 * data (German) if an unknown id ever shows up.
 */
export function stateName(id, fallback = "") {
  return STATE_NAMES[id] ?? fallback ?? "";
}

// Diverging map scale. The endpoints are the site-wide bloc colours, so red
// means the left bloc (SPD + Grüne + Linke) and blue the right bloc
// (CDU/CSU + AfD) on every page — the maps used to run the other way round,
// which read as an inverted result to anyone arriving from the federal charts.
export const COLOR_LEFT = BLOC_COLORS.left;
export const COLOR_RIGHT = BLOC_COLORS.right;
export const COLOR_NEUTRAL = BLOC_COLORS.neutral;

// Scale range in percentage points, per map. The two maps measure different
// quantities — a raw left−right gap runs far wider than a shift since the last
// election — so they get their own domains and their own legends rather than
// sharing one scale that would flatten the change map to near-neutral.
export const COLOR_SCALE_MAX_DIFF = 45;
export const COLOR_SCALE_MAX_CHANGE = 25;

// Power exponent for color scale (0.5 = sqrt gives more contrast to smaller values; 1 = linear)
export const COLOR_SCALE_POWER = 0.5;

// West/East classification (matches fetch_state_data.py)
export const WEST_STATES = new Set([
  "DE-BW", "DE-BY", "DE-HB", "DE-HH", "DE-HE", "DE-NI", "DE-NW", "DE-RP", "DE-SL", "DE-SH",
]);
export const EAST_STATES = new Set([
  "DE-BB", "DE-BE", "DE-MV", "DE-SN", "DE-ST", "DE-TH",
]);
