import { PARTY_CONFIG, SMOOTHING_WINDOW_DAYS } from "./config.js";

const MS_PER_DAY = 86400000;

/**
 * Load polling data from the committed JSON file.
 * Returns { data: [{date: Date, cdu: number, ...}, ...], updated: string }
 */
export async function loadPollingData() {
  const resp = await fetch("https://github.com/ribeach/btw-fgw/releases/download/latest-data/polling.json");
  if (!resp.ok) throw new Error(`Failed to load data: ${resp.status}`);
  const json = await resp.json();
  const data = json.data.map((row) => ({
    ...row,
    date: new Date(row.date),
  }));
  return { data, updated: json.updated };
}

/**
 * Compute a time-based rolling average (matching pandas rolling("90D")).
 * Uses a backward-looking window of `windowDays` days from each data point.
 */
export function computeRollingAverage(dates, values, windowDays = SMOOTHING_WINDOW_DAYS) {
  const windowMs = windowDays * MS_PER_DAY;
  const result = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const currentMs = dates[i].getTime();
    const windowStart = currentMs - windowMs;
    let sum = 0;
    let count = 0;
    for (let j = i; j >= 0; j--) {
      if (dates[j].getTime() < windowStart) break;
      sum += values[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : 0;
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
