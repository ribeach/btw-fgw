"""Fetch dawum.de state polling data and compute left vs right difference per Bundesland."""

from __future__ import annotations

import datetime
import json
import math
from pathlib import Path

import httpx

NEWEST_SURVEYS_URL = "https://api.dawum.de/newest_surveys.json"
LAST_UPDATE_URL = "https://api.dawum.de/last_update.txt"

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / "state-polling.json"
LAST_UPDATE_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / "state-polling.last_update.txt"
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

# West and East state IDs for summary averages
WEST_STATES = {"DE-BW", "DE-BY", "DE-HB", "DE-HH", "DE-HE", "DE-NI", "DE-NW", "DE-RP", "DE-SL", "DE-SH"}
EAST_STATES = {"DE-BB", "DE-BE", "DE-MV", "DE-SN", "DE-ST", "DE-TH"}


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
        date_str = s["Date"]
        if date_str > latest_date:
            latest_date = date_str

        try:
            age_days = (today - datetime.date.fromisoformat(date_str)).days
        except ValueError:
            age_days = 30

        try:
            n = float(s.get("Surveyed_Persons", 1000))
        except (TypeError, ValueError):
            n = 1000.0

        weight = math.sqrt(max(n, 1)) * (0.5 ** (age_days / 30))

        results = s.get("Results", {})
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
        resp = client.get(NEWEST_SURVEYS_URL)
        resp.raise_for_status()
        api_data = resp.json()

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
        # Filter out surveys that are older than or equal to the last election
        surveys = [s for s in surveys if s.get("Date", "") > election_date]

        if surveys:
            left, right, diff, poll_date = compute_weighted_diff(surveys)
        else:
            # Fallback: use election result
            left = round(election.get("left", 0.0), 1)
            right = round(election.get("right", 0.0), 1)
            diff = round(left - right, 1)
            poll_date = election_date

        election_diff = round(election.get("left", 0.0) - election.get("right", 0.0), 1)
        change = round(diff - election_diff, 1)

        states.append({
            "id": state_id,
            "name": election.get("name", api_data["Parliaments"][pid]["Shortcut"]),
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
        })

    # Summary stats
    all_diffs = [s["diff"] for s in states]
    west_diffs = [s["diff"] for s in states if s["id"] in WEST_STATES]
    east_diffs = [s["diff"] for s in states if s["id"] in EAST_STATES]

    max_state = max(states, key=lambda s: s["diff"])
    min_state = min(states, key=lambda s: s["diff"])

    summary = {
        "avg_diff": round(sum(all_diffs) / len(all_diffs), 1),
        "west_avg": round(sum(west_diffs) / len(west_diffs), 1) if west_diffs else 0.0,
        "east_avg": round(sum(east_diffs) / len(east_diffs), 1) if east_diffs else 0.0,
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

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(states)} states to {OUTPUT_PATH}")

    LAST_UPDATE_PATH.write_text(remote_ts, encoding="utf-8")
    print(f"Cached last_update: {remote_ts}")


if __name__ == "__main__":
    fetch_and_convert()
