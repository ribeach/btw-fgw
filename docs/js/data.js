import { PARTY_CONFIG, SMOOTHING_HALFLIFE_DAYS } from "./config.js";

const MS_PER_DAY = 86400000;
const LN2 = Math.LN2;

/**
 * Load polling data from the committed JSON file.
 * Returns { data: [{date: Date, cdu: number, ...}, ...], updated: string }
 */
export async function loadPollingData() {
  const resp = await fetch("data/polling.json");
  if (!resp.ok) throw new Error(`Failed to load data: ${resp.status}`);
  const json = await resp.json();
  const data = json.data.map((row) => ({
    ...row,
    date: new Date(row.date),
  }));
  return { data, updated: json.updated };
}

/**
 * Compute an exponentially weighted moving average (EWMA).
 * Recent polls carry more weight; a poll from `halflifeDays` ago gets half
 * the weight of today's. α = 1 - exp(-ln(2) * Δt / halflife).
 */
export function computeRollingAverage(dates, values, halflifeDays = SMOOTHING_HALFLIFE_DAYS) {
  const result = new Array(values.length);
  result[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    const dtDays = (dates[i].getTime() - dates[i - 1].getTime()) / MS_PER_DAY;
    const alpha = 1 - Math.exp(-LN2 * dtDays / halflifeDays);
    result[i] = alpha * values[i] + (1 - alpha) * result[i - 1];
  }
  return result;
}

/**
 * Compute block aggregates (right, left, other) for each data point.
 * Returns the data array with added block properties.
 */
export function computeBlocks(data) {
  const blockMembers = {};
  for (const [party, info] of Object.entries(PARTY_CONFIG)) {
    if (!blockMembers[info.block]) blockMembers[info.block] = [];
    blockMembers[info.block].push(party);
  }

  return data.map((row) => {
    const extended = { ...row };
    for (const [block, members] of Object.entries(blockMembers)) {
      extended[block] = members.reduce((sum, party) => sum + (row[party] || 0), 0);
    }
    return extended;
  });
}
