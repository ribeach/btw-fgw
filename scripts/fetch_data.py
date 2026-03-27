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
    "Langzeitentwicklung_-_Themen_im_Ueberblick/Politik_I/1_Projektion.xlsx"
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


def fetch_and_convert() -> None:
    content = fetch_excel()
    if content is None:
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

    output = {
        "updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data": records,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote {len(records)} records to {OUTPUT_PATH}")


if __name__ == "__main__":
    fetch_and_convert()
