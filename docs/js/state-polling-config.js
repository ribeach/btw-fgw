// State polling page configuration

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

// Color scale range in percentage points
export const COLOR_SCALE_MAX = 45;

// Power exponent for color scale (0.5 = sqrt gives more contrast to smaller values; 1 = linear)
export const COLOR_SCALE_POWER = 0.5;

// Diverging color scale: negative diff → red (right leads), positive → blue (left leads)
export const COLOR_RIGHT = "#b91c1c"; // red-700
export const COLOR_NEUTRAL = "#475569"; // slate-600
export const COLOR_LEFT = "#1d4ed8";  // blue-700

// West/East classification (matches fetch_state_data.py)
export const WEST_STATES = new Set([
  "DE-BW", "DE-BY", "DE-HB", "DE-HH", "DE-HE", "DE-NI", "DE-NW", "DE-RP", "DE-SL", "DE-SH",
]);
export const EAST_STATES = new Set([
  "DE-BB", "DE-BE", "DE-MV", "DE-SN", "DE-ST", "DE-TH",
]);
