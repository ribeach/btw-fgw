// Party configuration — mirrors fetch_and_plot.py PARTY_CONFIG
export const PARTY_CONFIG = {
  cdu:      { label: "CDU/CSU",   color: "#000000", block: "right" },
  spd:      { label: "SPD",       color: "#E3000F", block: "left" },
  gruene:   { label: "Grüne",     color: "#1AA037", block: "left" },
  fdp:      { label: "FDP",       color: "#FFCC00", block: "other" },
  linke:    { label: "Die Linke", color: "#BE3075", block: "left" },
  afd:      { label: "AfD",       color: "#009EE0", block: "right" },
  fw:       { label: "FW",        color: "#F7A800", block: "other" },
  bsw:      { label: "BSW",       color: "#781A2D", block: "other" },
  piraten:  { label: "Piraten",   color: "#FF820A", block: "other" },
  sonstige: { label: "Sonstige",  color: "#AAAAAA", block: "other" },
};

// Parties shown in the major parties chart (order matters for rendering)
export const MAJOR_PARTIES = ["cdu", "spd", "gruene", "fdp", "linke", "afd", "bsw"];

// Block definitions for the political blocks chart
export const BLOCKS = {
  right: { label: "Right-leaning (CDU/CSU + AfD)",      color: "#004B87" },
  left:  { label: "Left-leaning (SPD + Grüne + Linke)", color: "#D92121" },
  other: { label: "Other (FDP + BSW + Others)",          color: "#7f8c8d" },
};

// German federal election dates
export const ELECTION_DATES = [
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

// Smoothing window in days (matches Python script's "90D" rolling window)
export const SMOOTHING_WINDOW_DAYS = 90;
