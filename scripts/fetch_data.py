"""Fetch the Forschungsgruppe Wahlen Excel file and convert to JSON for the website."""

from __future__ import annotations

import datetime
import io
import json
import re
from enum import StrEnum
from pathlib import Path
from urllib.parse import urljoin

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
ETAG_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / ".etag"
PRE_POLLING_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / "pre-polling.json"


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
    print(f"Resolved Excel URL: {url}")
    return url


def fetch_excel() -> bytes | None:
    """Fetch the Excel file, skipping download if unchanged (HTTP 304)."""
    headers = {}
    if ETAG_PATH.exists():
        headers["If-None-Match"] = ETAG_PATH.read_text().strip()

    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        excel_url = discover_excel_url(client)
        print(f"Fetching {excel_url}...")
        resp = client.get(excel_url, headers=headers)

    if resp.status_code == 304:
        print("File unchanged (304 Not Modified), skipping.")
        return None

    resp.raise_for_status()

    etag = resp.headers.get("etag")
    if etag:
        ETAG_PATH.parent.mkdir(parents=True, exist_ok=True)
        ETAG_PATH.write_text(etag)

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
    cutoff_date = current_records[0]["date"] if current_records else None
    return load_pre_polling_records(cutoff_date) + current_records


def load_existing_records() -> list[dict[str, object]]:
    if not OUTPUT_PATH.exists():
        return []

    content = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    return content.get("data", [])


def write_output(records: list[dict[str, object]]) -> None:
    output = {
        "updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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


def fetch_and_convert() -> None:
    content = fetch_excel()
    if content is None:
        existing_records = load_existing_records()
        records = merge_pre_polling_records(existing_records)
        if records:
            if records == existing_records:
                print("Existing polling data already includes pre-polling records, skipping.")
                return
            write_output(records)
        return

    df = locate_and_label_data(content)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"])
    df = df.set_index("date").sort_index()

    # Fill missing party values with 0
    for party in Party:
        if party.value not in df.columns:
            df[party.value] = 0.0
    df = df.fillna(0.0)

    # Compute Sonstige as remainder
    known = [p.value for p in Party if p != Party.SONSTIGE]
    df[Party.SONSTIGE.value] = (100 - df[known].sum(axis=1)).clip(lower=0)

    # Convert to JSON-serializable format
    records = []
    for date, row in df.iterrows():
        record = {"date": date.strftime("%Y-%m-%d")}
        for party in Party:
            record[party.value] = round(float(row[party.value]), 1)
        records.append(record)

    write_output(merge_pre_polling_records(records))


if __name__ == "__main__":
    fetch_and_convert()
