# German Federal Election Polling Trends

An interactive dashboard showing German federal election polling data (Politbarometer) from [Forschungsgruppe Wahlen](https://www.forschungsgruppe.de).

**Live Website:** [https://ribeach.github.io/btw-fgw/](https://ribeach.github.io/btw-fgw/)

## Charts

- **Major Parties** — smoothed polling trends for CDU/CSU, SPD, Grüne, FDP, Die Linke, AfD, and BSW
- **Political Blocks** — aggregated right-leaning, left-leaning, and other blocks

Charts are interactive: hover for exact values, zoom and pan to explore the data.

## How It Works

The site is a static HTML/CSS/JS app hosted on GitHub Pages — no framework, no build step.

A daily [GitHub Action](.github/workflows/update-data.yml) fetches the latest Excel workbook from Forschungsgruppe Wahlen, converts it to JSON, and commits the result. The website loads this JSON and renders the charts client-side using [Plotly.js](https://plotly.com/javascript/).

## Local Development

Refresh the data and start a local server:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 scripts/fetch_data.py
python3 -m http.server -d docs
```

Then open http://localhost:8000.

## License

See [LICENSE](LICENSE).
