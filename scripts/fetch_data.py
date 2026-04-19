"""Fetch the Forschungsgruppe Wahlen Excel file and convert to JSON for the website."""

from __future__ import annotations

import datetime
import io
import json
from enum import StrEnum
from pathlib import Path

import httpx
import pandas as pd

EXCEL_URL = (
    "https://www.forschungsgruppe.de/Umfragen/Politbarometer/"
    "Langzeitentwicklung_-_Themen_im_Ueberblick/Politik_I/1_Projektion_1.xlsx"
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


def fetch_excel() -> bytes | None:
    """Fetch the Excel file, skipping download if unchanged (HTTP 304)."""
    headers = {}
    if ETAG_PATH.exists():
        headers["If-None-Match"] = ETAG_PATH.read_text().strip()

    print(f"Fetching {EXCEL_URL}...")
    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        resp = client.get(EXCEL_URL, headers=headers)

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

    df = pd.read_excel(
        io.BytesIO(content),
        sheet_name="Tabelle1",
        header=None,
        skiprows=9,
    )

    # Column 0 is empty, column 1 is date, columns 2-10 are parties
    df = df.iloc[:, 1:11]
    header_row = ["date"] + list(EXCEL_COLUMNS.keys())
    df.columns = header_row
    df = df.rename(columns=EXCEL_COLUMNS)
    df["date"] = pd.to_datetime(df["date"])
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
