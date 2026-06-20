"""
Extract demographic election data from the official Bundeswahlleiterin CSV.

Parses "Übersicht 9: Zweitstimmen nach Geschlecht und Altersgruppen seit 1953"
from the labeled CSV time series published by Die Bundeswahlleiterin and writes
docs/data/demographics.json.

Source landing page (scraped for the CSV href, so the opaque dam/jcr UUID is
never hardcoded):
https://www.bundeswahlleiterin.de/bundestagswahlen/2025/ergebnisse/repraesentative-wahlstatistik.html

The discovered download is the file whose basename is `btw_rws_zwst-1953.csv`
(currently served from a `.../dam/jcr/<uuid>/btw_rws_zwst-1953.csv` path). This
labeled CSV replaces the previous pdfplumber positional-column parser: columns
are now keyed on their header labels, so an upstream reflow can no longer
silently misalign parties.

License: Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0).
"""

import csv
import io
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import httpx

LANDING_URL = (
    "https://www.bundeswahlleiterin.de/bundestagswahlen/2025/ergebnisse/"
    "repraesentative-wahlstatistik.html"
)
CSV_BASENAME = "btw_rws_zwst-1953.csv"

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "docs" / "data" / "demographics.json"

# JSON key order for every value object (unchanged from the committed file).
PARTIES = ["spd", "cdu", "gruene", "fdp", "afd", "csu", "linke", "sonstige"]

# CSV party header label -> JSON key.
PARTY_LABEL_TO_KEY = {
    "SPD": "spd",
    "CDU": "cdu",
    "GRÜNE": "gruene",
    "FDP": "fdp",
    "AfD": "afd",
    "CSU": "csu",
    "PDS/Die Linke": "linke",
    "Sonstige": "sonstige",
}

# CSV "Geschlecht" token -> JSON gender bucket. `m|d|o` is the post-2021 male
# bucket (Männer incl. divers / ohne Geschlechtseintrag) and MUST map to maenner
# or the 2021/2025 male rows would be dropped.
GENDER_MAP = {
    "Summe": "insgesamt",
    "m": "maenner",
    "m|d|o": "maenner",
    "w": "frauen",
}

# Cells that mean "no value" -> JSON null (not 0).
NULL_TOKENS = {"", "–", "-", "—", ".", "...", "…"}

# Years where the CSU result was reported inside CDU ("In CDU enthalten").
CSU_IN_CDU_YEARS = {1953, 1957}

# Header labels that must be present (besides the age column, matched by prefix).
REQUIRED_LABELS = ["Bundestagswahl", "Geschlecht", *PARTY_LABEL_TO_KEY.keys()]


def discover_csv_url(client: httpx.Client) -> str:
    """Find the Übersicht-9 CSV URL by scraping the landing page."""
    print(f"Discovering CSV link from {LANDING_URL}...")
    resp = client.get(LANDING_URL)
    resp.raise_for_status()

    hrefs = re.findall(r'href="([^"]+\.csv)"', resp.text, flags=re.IGNORECASE)
    matches = [h for h in hrefs if h.rsplit("/", 1)[-1].lower() == CSV_BASENAME]
    if not matches:
        raise RuntimeError(
            f"No {CSV_BASENAME} link found on {LANDING_URL}. All .csv hrefs: {hrefs}"
        )

    url = urljoin(LANDING_URL, matches[0])
    print(f"Resolved CSV URL: {url}")
    return url


def fetch_csv() -> str:
    """Download the CSV and return its text (BOM stripped)."""
    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        csv_url = discover_csv_url(client)
        print(f"Fetching {csv_url}...")
        resp = client.get(csv_url)
        resp.raise_for_status()

    # The file is UTF-8 with a BOM; decode so csv.reader sees clean text.
    return resp.content.decode("utf-8-sig")


def normalize_age(token: str) -> str | None:
    """Normalize an Altersgruppe cell to an existing bracket key, or None."""
    token = token.strip()
    if token in ("Summe", "Insgesamt", "Zusammen"):
        return "insgesamt"
    m = re.match(r"^>=\s*(\d+)$", token)
    if m:
        return f"{m.group(1)}+"
    m = re.match(r"^(\d+)\s+und\s+mehr$", token)
    if m:
        return f"{m.group(1)}+"
    m = re.match(r"^(\d+)\s*[-–]\s*(\d+)$", token)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return None


def parse_cell(cell: str, ctx: str) -> float | None:
    """Parse a German-decimal value cell; empty/dash placeholders -> None."""
    cell = cell.strip()
    if cell in NULL_TOKENS:
        return None
    try:
        return float(cell.replace(",", "."))
    except ValueError:
        print(f"WARN: {ctx}: unparseable value {cell!r}; treating as null", file=sys.stderr)
        return None


def parse_demographics(text: str) -> dict[str, dict]:
    """Parse the CSV text into {gender: {year: {bracket: {party: value}}}}."""
    rows = [
        row
        for row in csv.reader(io.StringIO(text), delimiter=";")
        if row and not row[0].lstrip("﻿").startswith("#")
    ]
    if not rows:
        raise RuntimeError("CSV contained no data rows (only comments/blank lines).")

    header = [cell.strip() for cell in rows[0]]
    label_to_idx = {label: idx for idx, label in enumerate(header)}

    missing = [label for label in REQUIRED_LABELS if label not in label_to_idx]
    if missing:
        raise RuntimeError(
            f"CSV header is missing expected label(s) {missing}. Actual header: {header}"
        )

    age_idx = next((i for i, label in enumerate(header) if label.startswith("Altersgruppe")), None)
    if age_idx is None:
        raise RuntimeError(f"CSV header has no 'Altersgruppe' column. Actual header: {header}")

    result: dict[str, dict] = {"insgesamt": {}, "frauen": {}, "maenner": {}}

    for row in rows[1:]:
        try:
            year = int(row[label_to_idx["Bundestagswahl"]].strip())
        except (ValueError, IndexError):
            print(f"WARN: skipping row with non-numeric Bundestagswahl: {row}", file=sys.stderr)
            continue

        gender_token = row[label_to_idx["Geschlecht"]].strip()
        gender = GENDER_MAP.get(gender_token)
        if gender is None:
            print(f"WARN: {year}: unrecognized Geschlecht {gender_token!r}; skipping row", file=sys.stderr)
            continue

        age_key = normalize_age(row[age_idx])
        if age_key is None:
            print(f"WARN: {year}/{gender}: unrecognized Altersgruppe {row[age_idx]!r}; skipping row", file=sys.stderr)
            continue

        value_row = {
            key: parse_cell(row[label_to_idx[label]], f"{year}/{gender}/{age_key}/{key}")
            for label, key in PARTY_LABEL_TO_KEY.items()
        }
        # CSU was reported inside CDU for these years; force null regardless of cell.
        if year in CSU_IN_CDU_YEARS:
            value_row["csu"] = None

        result[gender].setdefault(str(year), {})[age_key] = value_row

    return result


def _prior_row_count() -> int | None:
    """Total (gender, year, bracket) rows in the committed file, or None."""
    if not OUTPUT_PATH.exists():
        return None
    committed = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    return sum(
        len(brackets)
        for gender in committed.get("genders", {}).values()
        for brackets in gender.get("elections", {}).values()
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


def extract_demographics() -> None:
    text = fetch_csv()
    result = parse_demographics(text)

    populated_genders = [g for g in result if result[g]]
    if len(populated_genders) < 3:
        raise RuntimeError(
            f"Expected 3 gender buckets, got {len(populated_genders)}: {populated_genders}"
        )

    all_years = {year for gender in result.values() for year in gender}
    if len(all_years) < 18:
        raise RuntimeError(
            f"Expected at least 18 election years, got {len(all_years)}: {sorted(all_years)}"
        )

    total_rows = sum(len(brackets) for gender in result.values() for brackets in gender.values())
    _guard_write(total_rows, _prior_row_count(), OUTPUT_PATH, "demographics rows")

    output = {
        "source": (
            "© Die Bundeswahlleiterin / Statistisches Bundesamt (Destatis) 2025 — "
            "Heft 4, Übersicht 9 (Zweitstimmen nach Geschlecht und Altersgruppen seit 1953)"
        ),
        "license": "dl-de/by-2-0",
        "parties": PARTIES,
        "genders": {
            "insgesamt": {"label": "Both", "elections": result["insgesamt"]},
            "frauen": {"label": "Women", "elections": result["frauen"]},
            "maenner": {"label": "Men", "elections": result["maenner"]},
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")

    # Print summary
    for gender, data in result.items():
        years = sorted(data.keys())
        print(f"{gender}: {len(years)} elections")
        for y in years:
            print(f"  {y}: {list(data[y].keys())}")


if __name__ == "__main__":
    extract_demographics()
