"""Fetch the Forschungsgruppe Wahlen Excel file and convert to JSON for the website."""

from __future__ import annotations

import datetime
import io
import json
import os
import re
import sys
from enum import StrEnum
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
import pandas as pd

# Page that lists the Sonntagsfrage / Projektion Excel download. The exact
# filename on disk has been renamed multiple times upstream
# (e.g. 1_Projektion.xlsx <-> 1_Projektion_1.xlsx), so we discover the link
# from this index page rather than hardcoding it.
INDEX_URL = (
    "https://www.forschungsgruppe.de/Umfragen/Politbarometer/"
    "Langzeitentwicklung_-_Themen_im_Ueberblick/Politik_I/"
)

# The discovered/redirected workbook download must stay on this host.
ALLOWED_HOST_SUFFIX = "forschungsgruppe.de"


class Party(StrEnum):
    CDU = "cdu"
    SPD = "spd"
    GRUENE = "gruene"
    FDP = "fdp"
    LINKE = "linke"
    AFD = "afd"
    FW = "fw"
    BSW = "bsw"
    PIRATEN = "piraten"
    SONSTIGE = "sonstige"


# Mapping from Excel column headers to Party enum values
EXCEL_COLUMNS: dict[str, str] = {
    "CDU/CSU": Party.CDU.value,
    "SPD": Party.SPD.value,
    "Grüne": Party.GRUENE.value,
    "FDP": Party.FDP.value,
    "Linke": Party.LINKE.value,
    "Piraten": Party.PIRATEN.value,
    "AfD": Party.AFD.value,
    "FW": Party.FW.value,
    "BSW": Party.BSW.value,
}

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / "polling.json"
PRE_POLLING_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / "pre-polling.json"


def _assert_allowed_host(host: str | None, context: str) -> None:
    """Raise unless `host` is forschungsgruppe.de or a subdomain of it."""
    if not host or not (host == ALLOWED_HOST_SUFFIX or host.endswith("." + ALLOWED_HOST_SUFFIX)):
        raise RuntimeError(
            f"{context}: refusing host {host!r}; expected {ALLOWED_HOST_SUFFIX} or a subdomain"
        )


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


def discover_excel_url(client: httpx.Client) -> str:
    """Find the Projektion Excel URL by scraping the index page."""
    print(f"Discovering Excel link from {INDEX_URL}...")
    resp = client.get(INDEX_URL)
    resp.raise_for_status()

    hrefs = re.findall(r'href="([^"]+\.xlsx)"', resp.text, flags=re.IGNORECASE)
    projektion = [h for h in hrefs if "projektion" in h.lower()]
    if not projektion:
        raise RuntimeError(
            f"No Projektion .xlsx link found on {INDEX_URL}. "
            f"All .xlsx hrefs: {hrefs}"
        )

    def score(href: str) -> tuple[int, int]:
        basename = href.rsplit("/", 1)[-1]
        starts_with_one = basename.startswith("1_")
        # Prefer basenames that start with "1_" (matches the historical
        # 1_Projektion*.xlsx pattern), then prefer the shortest basename.
        return (0 if starts_with_one else 1, len(basename))

    best = min(projektion, key=score)
    url = urljoin(INDEX_URL, best)
    _assert_allowed_host(urlparse(url).hostname, "discover_excel_url")
    print(f"Resolved Excel URL: {url}")
    return url


def fetch_excel() -> bytes:
    """Download the Projektion workbook and return its bytes."""
    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        excel_url = discover_excel_url(client)
        print(f"Fetching {excel_url}...")
        resp = client.get(excel_url)

    # Pin the final (post-redirect) host before trusting the bytes.
    _assert_allowed_host(resp.url.host, "fetch_excel")
    resp.raise_for_status()
    return resp.content


def load_pre_polling_records(cutoff_date: str | None = None) -> list[dict[str, object]]:
    """Load archive rows that predate the fetched polling series."""
    if not PRE_POLLING_PATH.exists():
        return []

    content = json.loads(PRE_POLLING_PATH.read_text(encoding="utf-8"))
    records = content.get("data", [])
    if cutoff_date is not None:
        records = [record for record in records if record["date"] < cutoff_date]

    return sorted(records, key=lambda record: record["date"])


def merge_pre_polling_records(records: list[dict[str, object]]) -> list[dict[str, object]]:
    pre_polling_records = load_pre_polling_records()
    if not pre_polling_records:
        return records

    pre_polling_dates = {record["date"] for record in pre_polling_records}
    current_records = [
        record
        for record in records
        if record["date"] not in pre_polling_dates
        and record["date"] > pre_polling_records[-1]["date"]
    ]
    dropped = len(records) - len(current_records)
    print(
        f"INFO: pre-polling merge dropped {dropped} fetched row(s) <= "
        f"{pre_polling_records[-1]['date']} or overlapping archive dates",
        file=sys.stderr,
    )
    cutoff_date = current_records[0]["date"] if current_records else None
    return load_pre_polling_records(cutoff_date) + current_records


def load_existing_records() -> list[dict[str, object]]:
    if not OUTPUT_PATH.exists():
        return []

    content = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    return content.get("data", [])


def write_output(records: list[dict[str, object]]) -> None:
    _guard_write(len(records), len(load_existing_records()) or None, OUTPUT_PATH, "polling rows")

    output = {
        "updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Forschungsgruppe Wahlen Politbarometer / GESIS ZA2391",
        "license": "https://www.gesis.org/en/institute/data-usage-terms",
        "data": records,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote {len(records)} records to {OUTPUT_PATH}")


def locate_and_label_data(content: bytes) -> pd.DataFrame:
    """Find the header row in the workbook and return a labeled data frame.

    Tolerates upstream sheet renames, leading-row shifts, and reordered party
    columns. The header row is identified by the first row (across all sheets,
    scanning the first 30 rows of each) that contains both "CDU/CSU" and "SPD"
    cells. Party columns are matched against EXCEL_COLUMNS by case-insensitive,
    whitespace-trimmed header text. The leftmost remaining non-empty column is
    treated as the date column.
    """
    sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None)

    def normalize(value: object) -> str:
        return str(value).strip().casefold() if pd.notna(value) else ""

    expected = {key.casefold(): mapped for key, mapped in EXCEL_COLUMNS.items()}

    for sheet_name, sheet in sheets.items():
        scan_limit = min(30, len(sheet))
        for header_idx in range(scan_limit):
            header = [normalize(v) for v in sheet.iloc[header_idx].tolist()]
            if "cdu/csu" in header and "spd" in header:
                column_map: dict[int, str] = {}
                for col_idx, label in enumerate(header):
                    if label in expected:
                        column_map[col_idx] = expected[label]
                if not column_map:
                    continue

                data = sheet.iloc[header_idx + 1 :].reset_index(drop=True)
                party_cols = sorted(column_map.keys())
                date_col = next(
                    (
                        idx
                        for idx in range(len(header))
                        if idx not in column_map and data.iloc[:, idx].notna().any()
                    ),
                    None,
                )
                if date_col is None:
                    continue

                selected = data.iloc[:, [date_col, *party_cols]].copy()
                selected.columns = ["date"] + [column_map[c] for c in party_cols]
                return selected

    sheet_summaries = {
        name: sheet.head(3).to_dict(orient="records") for name, sheet in sheets.items()
    }
    raise RuntimeError(
        "Could not locate header row with 'CDU/CSU' and 'SPD' in any sheet. "
        f"First rows by sheet: {sheet_summaries}"
    )


def crosscheck_against_dawum(latest_record: dict[str, object]) -> None:
    """Opt-in, READ-ONLY sanity check of the latest FGW row against dawum.

    Gated behind FGW_CROSSCHECK=1 so it never runs in the daily Action. dawum is
    NEVER a source here — this only warns on disagreement and never mutates
    `records` or the exit code (consistent with the "do not migrate federal
    polling to dawum" guardrail).
    """
    # dawum Institute_ID 6 = Forschungsgruppe Wahlen; Parliament_ID 0 = Bundestag.
    FGW_INSTITUTE_ID = "6"
    BUNDESTAG_ID = "0"
    # Keyed by casefolded dawum Party "Shortcut" (e.g. "Grüne", "Linke",
    # "Freie Wähler") so the lookup is robust to upstream casing changes.
    SHORTCUT_TO_KEY = {
        "cdu/csu": "cdu", "spd": "spd", "grüne": "gruene", "fdp": "fdp",
        "linke": "linke", "afd": "afd", "bsw": "bsw", "freie wähler": "fw",
    }
    TOLERANCE = 1.5

    try:
        with httpx.Client(follow_redirects=True, timeout=30.0) as client:
            resp = client.get("https://api.dawum.de/newest_surveys.json")
            resp.raise_for_status()
            api = resp.json()

        parties = api.get("Parties", {})
        key_by_pid = {
            pid: SHORTCUT_TO_KEY[meta.get("Shortcut", "").casefold()]
            for pid, meta in parties.items()
            if meta.get("Shortcut", "").casefold() in SHORTCUT_TO_KEY
        }

        fgw_surveys = [
            s for s in api.get("Surveys", {}).values()
            if str(s.get("Institute_ID", "")) == FGW_INSTITUTE_ID
            and str(s.get("Parliament_ID", "")) == BUNDESTAG_ID
        ]
        if not fgw_surveys:
            print("INFO: dawum has no FGW Bundestag survey to cross-check against", file=sys.stderr)
            return

        latest = max(fgw_surveys, key=lambda s: s.get("Date", ""))
        results = latest.get("Results", {})

        disagreements = []
        for pid, value in results.items():
            key = key_by_pid.get(pid)
            if key is None or key not in latest_record:
                continue
            try:
                dawum_val = float(value)
            except (TypeError, ValueError):
                continue
            fgw_val = float(latest_record[key])
            if abs(dawum_val - fgw_val) > TOLERANCE:
                disagreements.append(f"{key}: FGW={fgw_val} vs dawum={dawum_val}")

        if disagreements:
            print(
                f"WARN: FGW Excel latest row ({latest_record.get('date')}) disagrees with "
                f"dawum FGW ({latest.get('Date')}) beyond {TOLERANCE}pp: "
                + "; ".join(disagreements),
                file=sys.stderr,
            )
        else:
            print(
                f"INFO: FGW Excel latest row agrees with dawum FGW (within {TOLERANCE}pp)",
                file=sys.stderr,
            )
    except Exception as exc:  # read-only check: never fail the pipeline
        print(f"WARN: dawum cross-check skipped ({exc})", file=sys.stderr)


def fetch_and_convert() -> None:
    content = fetch_excel()

    df = locate_and_label_data(content)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    df = df.set_index("date").sort_index()

    # Fill missing party values with 0
    for party in Party:
        if party.value not in df.columns:
            df[party.value] = 0.0          # absent column == legitimately 0

    known = [p.value for p in Party if p != Party.SONSTIGE]
    present_known = [c for c in known if c in df.columns]

    # Coerce party columns to numeric: blank cells become NaN and stray text is
    # rejected (not silently kept), giving float dtype so the downstream
    # fillna(0)/sum stay numeric (and avoid pandas object-dtype downcast churn).
    for col in known:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Warn when a PRESENT party column is blank *within its active span* — i.e.
    # the party has a real value both before and after this row, so the blank is
    # a genuine gap whose value is silently treated as 0 and absorbed into
    # Sonstige. Leading blanks (party not yet founded) and trailing blanks
    # (party faded out) are structural, not anomalies, so they are NOT flagged;
    # the FGW workbook keeps those party columns present-but-empty for hundreds
    # of historical rows, and warning on each would bury any real signal.
    # Summarized per party to keep the output readable; the numeric result is
    # unchanged (blanks are still filled with 0 below).
    for col in present_known:
        series = df[col]
        first_seen, last_seen = series.first_valid_index(), series.last_valid_index()
        if first_seen is None:
            continue  # entirely blank -> behaves like an absent column
        gap_dates = [
            d for d in series.index
            if first_seen < d < last_seen and pd.isna(series[d])
        ]
        if gap_dates:
            sample = ", ".join(str(d.date()) for d in gap_dates[:3])
            print(
                f"WARN: present party column '{col}' was blank (treated as 0) in "
                f"{len(gap_dates)} row(s) within its active span; e.g. {sample}",
                file=sys.stderr,
            )

    raw_sum = df[known].fillna(0.0).sum(axis=1)
    over = df.index[raw_sum > 100.5]
    for d in over:
        print(
            f"WARN: {d.date()} known parties sum to {raw_sum[d]:.1f} (>100); Sonstige clamped to 0",
            file=sys.stderr,
        )

    df = df.fillna(0.0)
    # Compute Sonstige as remainder
    df[Party.SONSTIGE.value] = (100 - df[known].sum(axis=1)).clip(lower=0)

    # Convert to JSON-serializable format
    records = []
    for date, row in df.iterrows():
        record = {"date": date.strftime("%Y-%m-%d")}
        for party in Party:
            record[party.value] = round(float(row[party.value]), 1)
        records.append(record)

    records = merge_pre_polling_records(records)

    if os.environ.get("FGW_CROSSCHECK") == "1" and records:
        crosscheck_against_dawum(records[-1])

    if records == load_existing_records():
        print("Polling data unchanged vs committed polling.json, skipping write.")
        return

    write_output(records)


if __name__ == "__main__":
    fetch_and_convert()
