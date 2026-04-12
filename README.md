# German Election & Polling Dashboard

An interactive dashboard providing insights into German federal and state elections, including polling trends, historical demographics, and regional distributions.

**Live Website:** [https://ribeach.github.io/btw-fgw/](https://ribeach.github.io/btw-fgw/)

## Features

- **Federal Polling Trends** — Interactive charts showing smoothed polling data from *Forschungsgruppe Wahlen / Politbarometer* for major parties and political blocks.
- **State Polling Map** — A regional view of Germany showing the "left-vs-right" polling balance in each Bundesland, based on recent state-level surveys from *dawum.de*.
- **Historical Demographics** — Long-term analysis of Bundestag election voting patterns by age and gender (1953–present), based on *Bundeswahlleiterin Heft 4*.

All charts are interactive: hover for exact values, zoom and pan to explore the data.

## How It Works

The site is a static HTML/CSS/JS application hosted on GitHub Pages with no frontend build step.

### Data Pipelines
- **Federal Polling:** A daily GitHub Action fetches the latest Excel workbook from Forschungsgruppe Wahlen, converts it to JSON, and commits it to the repository.
- **State Polling:** The same action fetches data from the Dawum API, computes weighted averages for each state, and updates the local JSON data.
- **Demographics:** Historical data is extracted from official PDF publications using a one-off Python script and stored as JSON.

The website loads these JSON files and renders charts client-side using **Plotly.js** and custom SVG manipulations.

## Local Development

To set up the environment and run a local server:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Optional: Refresh data (requires Python 3.11+)
python3 scripts/fetch_data.py
python3 scripts/fetch_state_data.py

# Start local server
python3 -m http.server -d docs
```

Then open [http://localhost:8000](http://localhost:8000).

## Privacy & GDPR Compliance

This dashboard is fully EU GDPR compliant. The application does not use any tracking scripts (such as Google Analytics), does not set any cookies, and self-hosts all necessary assets (fonts and JS libraries). When you visit the site, your browser only connects to GitHub Pages to serve the static assets.

## License

**Software:** The source code of this repository is provided under the [MIT License](LICENSE).

**Data:** This project fetches and renders data from various sources. The raw and processed data in the `docs/data/` folder is **not** covered by the MIT License:
- **Federal Polling:** Property of *Forschungsgruppe Wahlen*.
- **State Polling:** Sourced via *dawum.de*.
- **Demographics:** Sourced from *Die Bundeswahlleiterin*.

Please consult the respective policies of these providers before reusing the datasets.
