/**
 * Load and parse state polling data from the committed JSON file.
 */
export async function loadStatePollingData() {
  const resp = await fetch("data/state-polling.json");
  if (!resp.ok) throw new Error(`Failed to load state polling data: ${resp.status}`);
  return resp.json();
}
