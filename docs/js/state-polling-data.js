/**
 * Load and parse state polling data from the committed JSON file.
 */
import { fetchJson } from "./shared.js";

export async function loadStatePollingData() {
  return fetchJson("data/state-polling.json");
}
