"""
Extract demographic election data from Bundeswahlleiterin Heft 4 PDF.

Parses "Übersicht 9: Zweitstimmen nach Geschlecht und Altersgruppen seit 1953"
from pages 15-23 of the Bundeswahlleiterin Heft 4 PDF
and outputs docs/data/demographics.json.

Source Publication Page:
https://www.bundeswahlleiterin.de/bundestagswahlen/2025/publikationen.html

PDF URL:
https://www.bundeswahlleiterin.de/dam/jcr/63623bc5-20fc-449f-a032-7ecd508f04ad/btw25_heft4.pdf
"""

import io
import json
import re
from pathlib import Path

import httpx
import pdfplumber

PDF_URL = "https://www.bundeswahlleiterin.de/dam/jcr/63623bc5-20fc-449f-a032-7ecd508f04ad/btw25_heft4.pdf"
OUTPUT_PATH = Path(__file__).parent.parent / "docs" / "data" / "demographics.json"

PARTY_COLUMNS = ["spd", "cdu", "gruene", "fdp", "afd", "csu", "linke", "sonstige"]

# Known age bracket patterns (regex) and their normalized keys
AGE_PATTERNS = [
    (r"^Insgesamt\b", "insgesamt"),
    (r"^Zusammen\b", "insgesamt"),
    (r"^18\s*[–\-]\s*24\b", "18-24"),
    (r"^21\s*[–\-]\s*29\b", "21-29"),
    (r"^25\s*[–\-]\s*34\b", "25-34"),
    (r"^30\s*[–\-]\s*44\b", "30-44"),
    (r"^30\s*[–\-]\s*59\b", "30-59"),
    (r"^35\s*[–\-]\s*44\b", "35-44"),
    (r"^45\s*[–\-]\s*59\b", "45-59"),
    (r"^60\s+und\s+mehr\b", "60+"),
    (r"^60\s*[–\-]\s*69\b", "60-69"),
    (r"^70\s+und\s+mehr\b", "70+"),
]

# Years where CSU was included in CDU ("In CDU enthalten")
CSU_IN_CDU_YEARS = {1953, 1957}


def match_age_bracket(text):
    """Try to match an age bracket at the start of text. Returns (key, remainder) or None."""
    for pattern, key in AGE_PATTERNS:
        m = re.match(pattern, text)
        if m:
            remainder = text[m.end():].strip()
            return key, remainder
    return None


def parse_values(text, year):
    """Parse the value portion of a line into 8 party values.

    Handles:
    - Numbers with comma decimal (e.g., "29,9")
    - Dashes for missing values ("–", "-")
    - CSU placeholder text for 1953/1957 ("In", "CDU", "ent-", "halten")
    """
    # For CSU_IN_CDU years, the CSU column contains text like "In", "CDU", "ent-", "halten"
    # These are interleaved with actual values. We need to filter them out and insert null at CSU position.

    tokens = text.split()
    csu_placeholders = {"In", "CDU", "ent-", "halten"}

    values = []
    for t in tokens:
        t = t.strip()
        if not t:
            continue
        if t in csu_placeholders and year in CSU_IN_CDU_YEARS:
            continue  # Skip CSU placeholder text
        if t in ("–", "-", "—"):
            values.append(None)
        else:
            try:
                values.append(float(t.replace(",", ".")))
            except ValueError:
                continue  # Skip unparseable tokens

    # For CSU_IN_CDU years, we get 7 values (CSU column was text, filtered out)
    # Insert null at position 5 (CSU column index)
    if year in CSU_IN_CDU_YEARS and len(values) == 7:
        values.insert(5, None)

    return values


def extract_demographics():
    print(f"Downloading {PDF_URL}...")
    response = httpx.get(PDF_URL, follow_redirects=True)
    response.raise_for_status()
    pdf_file = io.BytesIO(response.content)

    pdf = pdfplumber.open(pdf_file)

    result = {
        "insgesamt": {},
        "frauen": {},
        "maenner": {},
    }

    current_gender = None
    current_year = None

    for page_idx in range(14, 23):  # Pages 15-23 (0-indexed)
        page = pdf.pages[page_idx]
        text = page.extract_text()
        if not text:
            continue

        lines = text.split("\n")
        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Skip header/footer/footnote lines
            if any(line.startswith(s) for s in [
                "Übersicht 9:", "Bundestags-", "SPD", "wahl",
                "Informationen der", "Bundestagswahl",
                "1 Bis", "2 1953",
            ]):
                continue
            if line == "davon:":
                continue

            # Detect gender section
            if line in ("Insgesamt", "noch: Insgesamt"):
                current_gender = "insgesamt"
                continue
            if line in ("Frauen", "noch: Frauen"):
                current_gender = "frauen"
                continue
            if line in ("Männer", "noch: Männer"):
                current_gender = "maenner"
                continue

            if current_gender is None:
                continue

            # Check if line starts with an election year
            remaining = line
            year_match = re.match(r"^(\d{4})²?\s+", remaining)
            if year_match:
                current_year = int(year_match.group(1))
                remaining = remaining[year_match.end():]

            if current_year is None:
                continue

            # Try to match an age bracket
            bracket_match = match_age_bracket(remaining)
            if bracket_match is None:
                continue

            age_key, value_text = bracket_match

            # Parse the numeric values
            values = parse_values(value_text, current_year)

            if len(values) != 8:
                print(f"  WARN: {current_gender}/{current_year}/{age_key}: "
                      f"expected 8 values, got {len(values)} from: {value_text!r}")
                continue

            row = dict(zip(PARTY_COLUMNS, values))

            # Ensure CSU is null for years where it was in CDU
            if current_year in CSU_IN_CDU_YEARS:
                row["csu"] = None

            year_str = str(current_year)
            if year_str not in result[current_gender]:
                result[current_gender][year_str] = {}
            result[current_gender][year_str][age_key] = row

    pdf.close()

    # Build output
    output = {
        "source": "Bundeswahlleiterin, Heft 4 (BTW 2025)",
        "parties": PARTY_COLUMNS,
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
        brackets_per_year = {y: len(data[y]) for y in years}
        print(f"{gender}: {len(years)} elections")
        for y in years:
            print(f"  {y}: {list(data[y].keys())}")


if __name__ == "__main__":
    extract_demographics()
