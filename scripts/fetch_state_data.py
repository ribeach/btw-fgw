"""Fetch dawum.de state polling data and compute left vs right difference per Bundesland."""

from __future__ import annotations

import datetime
import json
import math
import sys
from pathlib import Path

import httpx

NEWEST_SURVEYS_URL = "https://api.dawum.de/newest_surveys.json"
LAST_UPDATE_URL = "https://api.dawum.de/last_update.txt"

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / "state-polling.json"
LAST_UPDATE_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / "state-polling.last_update.txt"
POPULATION_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / "population.json"
ELECTION_RESULTS_PATH = Path(__file__).resolve().parent / "state_election_results.json"

# dawum Parliament IDs for the 16 Bundesländer (0 = Bundestag, 17 = EU, skip those)
STATE_PARLIAMENT_IDS = {
    "1": "DE-BW",
    "2": "DE-BY",
    "3": "DE-BE",
    "4": "DE-BB",
    "5": "DE-HB",
    "6": "DE-HH",
    "7": "DE-HE",
    "8": "DE-MV",
    "9": "DE-NI",
    "10": "DE-NW",
    "11": "DE-RP",
    "12": "DE-SL",
    "13": "DE-SN",
    "14": "DE-ST",
    "15": "DE-SH",
    "16": "DE-TH",
}

# dawum party IDs
LEFT_PARTY_IDS = {"2", "4", "5"}      # SPD, Grüne, Linke
RIGHT_PARTY_IDS = {"1", "7", "101", "102"}  # CDU/CSU, AfD, CDU, CSU

# dawum party IDs we knowingly leave OUT of the left/right split (everything that
# is neither LEFT nor RIGHT). Sourced from the https://api.dawum.de Parties
# catalog: 0 Sonstige, 3 FDP, 6 Piraten, 8 Freie Wähler, 9 NPD, 10 SSW,
# 11 Bayernpartei, 12 ÖDP, 13 Die PARTEI, 14 BVB/FW, 15 Tierschutzpartei,
# 16 BD, 17 Familie, 18 Volt, 21 bunt.saar, 22 BfTh, 23 BSW, 24 Plus Brandenburg,
# 25 WerteUnion. A Results party ID outside LEFT/RIGHT/NEUTRAL is a newly-
# introduced party we have not triaged -> warn instead of silently dropping it.
KNOWN_NEUTRAL_PARTY_IDS = {
    "0", "3", "6", "8", "9", "10", "11", "12", "13", "14",
    "15", "16", "17", "18", "21", "22", "23", "24", "25",
}

# West and East state IDs for summary averages.
# Keep in sync with WEST_STATES/EAST_STATES in docs/js/state-polling-config.js.
WEST_STATES = {"DE-BW", "DE-BY", "DE-HB", "DE-HH", "DE-HE", "DE-NI", "DE-NW", "DE-RP", "DE-SL", "DE-SH"}
EAST_STATES = {"DE-BB", "DE-BE", "DE-MV", "DE-SN", "DE-ST", "DE-TH"}

# Party IDs already reported via a WARN, so each unknown ID is logged once.
_warned_party_ids: set[str] = set()


def _guard_write(count: int, prior_count: int | None, output_path: Path, label: str) -> None:
    """Refuse to overwrite good data with an empty / suspiciously shrunken result."""
    if count == 0:
        print(f"ERROR: refusing to write {output_path}: {label} count is 0", file=sys.stderr)
        sys.exit(1)
    if prior_count is not None and count < prior_count * 0.9:
        print(
            f"ERROR: refusing to write {output_path}: {label} shrank "
            f"(was {prior_count}, now {count}); aborting",
            file=sys.stderr,
        )
        sys.exit(1)


def check_last_update(client: httpx.Client) -> str | None:
    """Fetch the last-update timestamp from dawum. Returns None if unchanged."""
    try:
        resp = client.get(LAST_UPDATE_URL, timeout=10.0)
        resp.raise_for_status()
        remote_ts = resp.text.strip()
    except Exception as e:
        print(f"Warning: could not fetch last_update.txt: {e}")
        return "unknown"

    if LAST_UPDATE_PATH.exists():
        local_ts = LAST_UPDATE_PATH.read_text().strip()
        if local_ts == remote_ts:
            print(f"Data unchanged (last_update={remote_ts}), skipping.")
            return None

    return remote_ts


def compute_weighted_diff(surveys: list[dict]) -> tuple[float, float, float, str]:
    """
    Weighted average of left/right across multiple institute surveys.
    Weight = sqrt(surveyed_persons) * 0.5^(age_days/30)
    Returns (left, right, diff, most_recent_date).
    """
    today = datetime.date.today()
    total_weight = 0.0
    weighted_left = 0.0
    weighted_right = 0.0
    latest_date = ""

    for s in surveys:
        date_str = s.get("Date", "")
        if not date_str:
            print(f"WARN: survey {s.get('Survey_ID', '?')} missing Date; skipping", file=sys.stderr)
            continue
        if date_str > latest_date:
            latest_date = date_str

        try:
            age_days = (today - datetime.date.fromisoformat(date_str)).days
        except ValueError:
            age_days = 30

        if "Surveyed_Persons" not in s:
            print(
                f"WARN: survey {s.get('Survey_ID', '?')} missing Surveyed_Persons; using 1000",
                file=sys.stderr,
            )
            n = 1000.0
        else:
            try:
                n = float(s["Surveyed_Persons"])
            except (TypeError, ValueError):
                print(
                    f"WARN: survey {s.get('Survey_ID', '?')} non-numeric Surveyed_Persons "
                    f"{s['Surveyed_Persons']!r}; using 1000",
                    file=sys.stderr,
                )
                n = 1000.0

        weight = math.sqrt(max(n, 1)) * (0.5 ** (age_days / 30))

        results = s.get("Results", {})
        for pid in results:
            if (
                pid not in LEFT_PARTY_IDS
                and pid not in RIGHT_PARTY_IDS
                and pid not in KNOWN_NEUTRAL_PARTY_IDS
                and pid not in _warned_party_ids
            ):
                print(
                    f"WARN: unknown dawum party ID {pid} in survey results "
                    f"(not in left/right/neutral whitelist)",
                    file=sys.stderr,
                )
                _warned_party_ids.add(pid)

        left = sum(float(results.get(pid, 0)) for pid in LEFT_PARTY_IDS)
        right = sum(float(results.get(pid, 0)) for pid in RIGHT_PARTY_IDS)

        weighted_left += weight * left
        weighted_right += weight * right
        total_weight += weight

    if total_weight == 0:
        return 0.0, 0.0, 0.0, latest_date

    avg_left = weighted_left / total_weight
    avg_right = weighted_right / total_weight
    return round(avg_left, 1), round(avg_right, 1), round(avg_left - avg_right, 1), latest_date


def fetch_and_convert() -> None:
    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        remote_ts = check_last_update(client)
        if remote_ts is None:
            return

        print(f"Fetching {NEWEST_SURVEYS_URL}...")
        try:
            resp = client.get(NEWEST_SURVEYS_URL)
            resp.raise_for_status()
            api_data = resp.json()
        except Exception as e:
            print(f"ERROR: could not fetch/parse {NEWEST_SURVEYS_URL}: {e}", file=sys.stderr)
            sys.exit(1)

    surveys_by_parliament: dict[str, list[dict]] = {}
    for survey in api_data.get("Surveys", {}).values():
        pid = str(survey.get("Parliament_ID", ""))
        if pid in STATE_PARLIAMENT_IDS:
            surveys_by_parliament.setdefault(pid, []).append(survey)

    election_data = json.loads(ELECTION_RESULTS_PATH.read_text())["states"]

    states = []
    for pid, state_id in STATE_PARLIAMENT_IDS.items():
        surveys = surveys_by_parliament.get(pid, [])
        election = election_data.get(state_id, {})

        election_date = election.get("date", "")
        if not election_date:
            print(
                f"WARN: {state_id} has no election_date; recency filter disabled "
                f"(all surveys kept)",
                file=sys.stderr,
            )
        # Filter out surveys that are older than or equal to the last election
        surveys = [s for s in surveys if s.get("Date", "") > election_date]

        if surveys:
            left, right, diff, poll_date = compute_weighted_diff(surveys)
            is_fallback = False
        else:
            # Fallback: use election result
            left = round(election.get("left", 0.0), 1)
            right = round(election.get("right", 0.0), 1)
            diff = round(left - right, 1)
            poll_date = election_date
            is_fallback = True

        election_diff = round(election.get("left", 0.0) - election.get("right", 0.0), 1)
        change = round(diff - election_diff, 1)

        parliaments = api_data.get("Parliaments") or {}
        name = election.get("name") or (parliaments.get(pid) or {}).get("Shortcut", state_id)

        states.append({
            "id": state_id,
            "name": name,
            "left": left,
            "right": right,
            "diff": diff,
            "poll_date": poll_date,
            "election": {
                "date": election.get("date", ""),
                "left": round(election.get("left", 0.0), 1),
                "right": round(election.get("right", 0.0), 1),
                "diff": election_diff,
            },
            "change": change,
            "is_fallback": is_fallback,
        })

    # Summary stats weighted by population
    pop_data = {}
    if POPULATION_PATH.exists():
        pop_data = json.loads(POPULATION_PATH.read_text()).get("data", {})

    def weighted_avg(state_list):
        total_pop = sum(pop_data.get(s["id"], 1.0) for s in state_list)
        if total_pop == 0:
            return 0.0
        weighted_sum = sum(s["diff"] * pop_data.get(s["id"], 1.0) for s in state_list)
        return round(weighted_sum / total_pop, 1)

    west_states_list = [s for s in states if s["id"] in WEST_STATES]
    east_states_list = [s for s in states if s["id"] in EAST_STATES]

    max_state = max(states, key=lambda s: s["diff"])
    min_state = min(states, key=lambda s: s["diff"])

    summary = {
        "avg_diff": weighted_avg(states),
        "west_avg": weighted_avg(west_states_list),
        "east_avg": weighted_avg(east_states_list),
        "max_state": max_state["id"],
        "max_state_name": max_state["name"],
        "max_diff": max_state["diff"],
        "min_state": min_state["id"],
        "min_state_name": min_state["name"],
        "min_diff": min_state["diff"],
    }

    output = {
        "updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "dawum.de (ODC-ODbL)",
        "summary": summary,
        "states": states,
    }

    # Write-guard: must be exactly 16 states, non-empty, and not a sudden shrink.
    if len(states) != len(STATE_PARLIAMENT_IDS):
        print(
            f"ERROR: refusing to write {OUTPUT_PATH}: expected "
            f"{len(STATE_PARLIAMENT_IDS)} states, got {len(states)}",
            file=sys.stderr,
        )
        sys.exit(1)
    prior_count = None
    if OUTPUT_PATH.exists():
        prior_count = len(json.loads(OUTPUT_PATH.read_text()).get("states", [])) or None
    _guard_write(len(states), prior_count, OUTPUT_PATH, "states")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(states)} states to {OUTPUT_PATH}")

    LAST_UPDATE_PATH.write_text(remote_ts, encoding="utf-8")
    print(f"Cached last_update: {remote_ts}")


if __name__ == "__main__":
    fetch_and_convert()
