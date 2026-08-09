// Party configuration — labels, colors, and political-block membership (frontend source of truth)
//
// `color` is the party's official colour and is semantic: never re-hue it.
// `lineColor` is a render-only escape hatch for parties whose official colour is
// unreadable as a stroke on the dark chrome (cdu's black, bsw's near-black
// maroon). Charts prefer `lineColor` when present; swatches and pills stay on
// `color`.
// `short` is a ≤8-character label for cramped contexts (end-of-line labels,
// table headers, the mobile legend).
export const PARTY_CONFIG = {
  cdu:      { label: "CDU/CSU",   short: "CDU/CSU",  color: "#000000", lineColor: "#cbd5e1", block: "right" },
  spd:      { label: "SPD",       short: "SPD",      color: "#E3000F", block: "left" },
  gruene:   { label: "Grüne",     short: "Grüne",    color: "#1AA037", block: "left" },
  fdp:      { label: "FDP",       short: "FDP",      color: "#FFCC00", block: "other" },
  linke:    { label: "Die Linke", short: "Linke",    color: "#BE3075", block: "left" },
  afd:      { label: "AfD",       short: "AfD",      color: "#009EE0", block: "right" },
  fw:       { label: "FW",        short: "FW",       color: "#F7A800", block: "other" },
  bsw:      { label: "BSW",       short: "BSW",      color: "#781A2D", lineColor: "#b06a5a", block: "other" },
  piraten:  { label: "Piraten",   short: "Piraten",  color: "#FF820A", block: "other" },
  sonstige: { label: "Sonstige",  short: "Sonstige", color: "#AAAAAA", block: "other" },
};

// Parties shown in the major parties chart (order matters for rendering)
export const MAJOR_PARTIES = ["cdu", "spd", "gruene", "fdp", "linke", "afd", "bsw"];

// The three-way bloc scale. This is the only hue outside PARTY_CONFIG that the
// chrome is allowed to show — the masthead spectrum bar reads straight from it.
export const BLOC_COLORS = {
  left: "#D92121",
  right: "#004B87",
  neutral: "#3A4356",
};

// Block definitions for the political blocks chart
export const BLOCKS = {
  right: { label: "Right-leaning<br>(CDU/CSU + AfD)",      short: "Right", color: BLOC_COLORS.right },
  left:  { label: "Left-leaning<br>(SPD + Grüne + Linke)", short: "Left",  color: BLOC_COLORS.left },
  other: { label: "Other<br>(FDP + BSW + Others)",         short: "Other", color: BLOC_COLORS.neutral },
};

// German federal election dates
export const ELECTION_DATES = [
  "1980-10-05",
  "1983-03-06",
  "1987-01-25",
  "1990-12-02",
  "1994-10-16",
  "1998-09-27",
  "2002-09-22",
  "2005-09-18",
  "2009-09-27",
  "2013-09-22",
  "2017-09-24",
  "2021-09-26",
  "2025-02-23",
];

// Official final second-vote (Zweitstimmen) shares in percent at each federal
// election, from the Bundeswahlleiterin (per-year result pages and
// btw_ab49_gesamt, table 6). Keys match PARTY_CONFIG; only parties a table
// column can display are listed — the blocs' "other" is a remainder, so
// unlisted small parties are never dropped, and an absent key renders as an
// em dash ("did not stand"). `cdu` is CDU/CSU combined, computed from the
// official absolute vote counts, so in 1994, 2017 and 2025 it differs by 0.1
// from the sum of the two rounded component shares — that is correct, not a
// typo. `linke` is the PDS / Die Linke lineage.
export const ELECTION_RESULTS = {
  "1980-10-05": { cdu: 44.5, spd: 42.9, gruene: 1.5, fdp: 10.6 },
  "1983-03-06": { cdu: 48.8, spd: 38.2, gruene: 5.6, fdp: 7.0 },
  "1987-01-25": { cdu: 44.3, spd: 37.0, gruene: 8.3, fdp: 9.1 },
  // 1990 gruene combines Grüne (West, 3.849) + Bündnis 90/Grüne (East, 1.204)
  // = 5.053. Two decimals on purpose: one-decimal rounding is ambiguous here —
  // the rounded components suggest 5.0 while the correctly rounded combined
  // share is 5.1.
  "1990-12-02": { cdu: 43.8, spd: 33.5, gruene: 5.05, fdp: 11.0, linke: 2.4 },
  "1994-10-16": { cdu: 41.4, spd: 36.4, gruene: 7.3, fdp: 6.9, linke: 4.4 },
  "1998-09-27": { cdu: 35.1, spd: 40.9, gruene: 6.7, fdp: 6.2, linke: 5.1 },
  "2002-09-22": { cdu: 38.5, spd: 38.5, gruene: 8.6, fdp: 7.4, linke: 4.0 },
  "2005-09-18": { cdu: 35.2, spd: 34.2, gruene: 8.1, fdp: 9.8, linke: 8.7 },
  "2009-09-27": { cdu: 33.8, spd: 23.0, gruene: 10.7, fdp: 14.6, linke: 11.9 },
  "2013-09-22": { cdu: 41.5, spd: 25.7, gruene: 8.4, fdp: 4.8, linke: 8.6, afd: 4.7 },
  "2017-09-24": { cdu: 32.9, spd: 20.5, gruene: 8.9, fdp: 10.7, linke: 9.2, afd: 12.6 },
  // 2021 is the re-determined final result after the February 2024 Berlin
  // partial repeat (Grüne 14.7, FDP 11.4, AfD 10.4); most summaries still show
  // the originally published 14.8 / 11.5 / 10.3.
  "2021-09-26": { cdu: 24.1, spd: 25.7, gruene: 14.7, fdp: 11.4, linke: 4.9, afd: 10.4 },
  // 2025 bsw is officially 4.981 (revised up from a preliminary 4.972) — just
  // under the five-percent threshold, so it must never render rounded to 5.0.
  "2025-02-23": { cdu: 28.5, spd: 16.4, gruene: 11.6, fdp: 4.3, linke: 8.8, afd: 20.8, bsw: 4.98 },
};

// EWMA halflife in days: a poll from 30 days ago gets half the weight of today's
export const SMOOTHING_HALFLIFE_DAYS = 30;

// Headroom in percentage points added above the max value for the chart y-axis
export const Y_AXIS_HEADROOM = 5;

// Mobile layout breakpoint in px (keep in sync with the CSS @media queries in style.css)
export const MOBILE_BREAKPOINT_PX = 768;
