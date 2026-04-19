import json
import os
from pathlib import Path

import pandas as pd
from pystatis import setup_credentials, Table

# Load .env if exists (manually to avoid dependency on python-dotenv)
ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "docs" / "data" / "population.json"

if (ROOT / ".env").exists():
    with (ROOT / ".env").open(encoding="utf-8") as f:
        for line in f:
            if "=" in line:
                key, value = line.strip().split("=", 1)
                os.environ[key] = value.strip('"').strip("'")

AGS_TO_DE = {
    "01": "DE-SH",
    "02": "DE-HH",
    "03": "DE-NI",
    "04": "DE-HB",
    "05": "DE-NW",
    "06": "DE-HE",
    "07": "DE-RP",
    "08": "DE-BW",
    "09": "DE-BY",
    "10": "DE-SL",
    "11": "DE-BE",
    "12": "DE-BB",
    "13": "DE-MV",
    "14": "DE-SN",
    "15": "DE-ST",
    "16": "DE-TH",
}


def fetch_population():
    setup_credentials("genesis")

    print("Fetching table 12411-0010...")
    table = Table(name="12411-0010")
    table.get_data()

    df = table.data

    # Columns contain German labels from the GENESIS API response.
    code_col = "Amtlicher Gemeindeschlüssel (AGS)__Code"
    pop_col = "Bevölkerungsstand__Anzahl"
    date_col = "Stichtag"

    df[date_col] = pd.to_datetime(df[date_col])
    latest_date = df[date_col].max()
    print(f"Latest data from: {latest_date.strftime('%Y-%m-%d')}")

    df_latest = df[df[date_col] == latest_date]

    population_map = {}
    for _, row in df_latest.iterrows():
        ags_code = str(row[code_col]).zfill(2)
        if ags_code in AGS_TO_DE:
            state_id = AGS_TO_DE[ags_code]
            population_map[state_id] = int(row[pop_col])

    missing_states = sorted(set(AGS_TO_DE.values()) - set(population_map))
    if missing_states:
        raise RuntimeError(f"Missing population values for: {', '.join(missing_states)}")

    OUTPUT_PATH.write_text(
        json.dumps({
            "updated": latest_date.strftime("%Y-%m-%d"),
            "data": population_map,
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Successfully saved population data to {OUTPUT_PATH}")


if __name__ == "__main__":
    fetch_population()
