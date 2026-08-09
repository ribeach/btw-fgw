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

// EWMA halflife in days: a poll from 30 days ago gets half the weight of today's
export const SMOOTHING_HALFLIFE_DAYS = 30;

// Headroom in percentage points added above the max value for the chart y-axis
export const Y_AXIS_HEADROOM = 5;

// Mobile layout breakpoint in px (keep in sync with the CSS @media queries in style.css)
export const MOBILE_BREAKPOINT_PX = 768;
