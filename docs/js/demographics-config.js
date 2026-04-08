import { PARTY_CONFIG } from "./config.js";

// Parties available on the demographics page.
// "union" is a virtual party combining CDU + CSU.
export const DEMO_PARTIES = {
  union:    { label: "Union",    color: PARTY_CONFIG.cdu.color },
  spd:      { label: "SPD",      color: PARTY_CONFIG.spd.color },
  gruene:   { label: "Grüne",    color: PARTY_CONFIG.gruene.color },
  fdp:      { label: "FDP",      color: PARTY_CONFIG.fdp.color },
  afd:      { label: "AfD",      color: PARTY_CONFIG.afd.color },
  linke:    { label: "Linke",    color: PARTY_CONFIG.linke.color },
  sonstige: { label: "Sonstige", color: PARTY_CONFIG.sonstige.color },
};

export const GENDERS = {
  insgesamt: "Both",
  frauen:    "Women",
  maenner:   "Men",
};

export const AGE_BRACKETS = [
  { key: "insgesamt", label: "All ages" },
  { key: "18-24",     label: "18\u201324" },
  { key: "21-29",     label: "21\u201329" },
  { key: "25-34",     label: "25\u201334" },
  { key: "30-44",     label: "30\u201344" },
  { key: "30-59",     label: "30\u201359" },
  { key: "35-44",     label: "35\u201344" },
  { key: "45-59",     label: "45\u201359" },
  { key: "60+",       label: "60+" },
  { key: "60-69",     label: "60\u201369" },
  { key: "70+",       label: "70+" },
];

export const LINE_COLORS = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#a29bfe", "#fd79a8"];
export const MAX_SELECTIONS = 5;

export const DEFAULT_SELECTIONS = [
  { gender: "maenner",    ageBracket: "insgesamt", parties: ["spd", "gruene", "linke"] },
  { gender: "frauen",     ageBracket: "insgesamt", parties: ["spd", "gruene", "linke"] },
  { gender: "maenner",    ageBracket: "insgesamt", parties: ["union", "afd"] },
  { gender: "frauen",     ageBracket: "insgesamt", parties: ["union", "afd"] },
];
