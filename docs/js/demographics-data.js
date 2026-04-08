/**
 * Load demographics JSON and compute selection values.
 */

export async function loadDemographicsData() {
  const resp = await fetch("data/demographics.json");
  if (!resp.ok) throw new Error(`Failed to load data: ${resp.status}`);
  return resp.json();
}

/**
 * Compute the y-value for a selection at a given election year.
 *
 * Sums the selected parties' percentages for the given gender and age bracket.
 * - Missing age bracket for a year -> null (line gap)
 * - Missing party within an existing row -> 0 (party didn't exist yet)
 * - Union = CDU + CSU; if both null -> null; if only CSU null (1953-57) -> CDU value
 */
export function computeSelectionValue(data, gender, ageBracket, parties, year) {
  const genderData = data.genders[gender];
  if (!genderData) return null;

  const electionData = genderData.elections[String(year)];
  if (!electionData) return null;

  const bracketData = electionData[ageBracket];
  if (!bracketData) return null;

  let sum = 0;
  let anyValid = false;

  for (const party of parties) {
    if (party === "union") {
      const cdu = bracketData.cdu;
      const csu = bracketData.csu;
      if (cdu !== null && cdu !== undefined) { sum += cdu; anyValid = true; }
      if (csu !== null && csu !== undefined) { sum += csu; anyValid = true; }
      // If both null, this party contributes nothing and anyValid stays false
      // (unless other parties are also selected)
    } else {
      const val = bracketData[party];
      if (val !== null && val !== undefined) {
        sum += val;
        anyValid = true;
      }
      // Missing party (null) -> treat as 0, don't block anyValid from other parties
    }
  }

  return anyValid ? Math.round(sum * 10) / 10 : null;
}

/**
 * Get all election years present in the data.
 */
export function getElectionYears(data) {
  const years = new Set();
  for (const genderData of Object.values(data.genders)) {
    for (const year of Object.keys(genderData.elections)) {
      years.add(parseInt(year));
    }
  }
  return [...years].sort((a, b) => a - b);
}
