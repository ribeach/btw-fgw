// State polling page configuration

export const STATE_NAMES = {
  "DE-BW": "Baden-Württemberg",
  "DE-BY": "Bayern",
  "DE-BE": "Berlin",
  "DE-BB": "Brandenburg",
  "DE-HB": "Bremen",
  "DE-HH": "Hamburg",
  "DE-HE": "Hessen",
  "DE-MV": "Mecklenburg-Vorpommern",
  "DE-NI": "Niedersachsen",
  "DE-NW": "Nordrhein-Westfalen",
  "DE-RP": "Rheinland-Pfalz",
  "DE-SL": "Saarland",
  "DE-SN": "Sachsen",
  "DE-ST": "Sachsen-Anhalt",
  "DE-SH": "Schleswig-Holstein",
  "DE-TH": "Thüringen",
};

// Color scale range in percentage points
export const COLOR_SCALE_MAX = 45;

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
