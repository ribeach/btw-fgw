import os
import json
import pandas as pd
from pystatis import setup_credentials, Table

# Load .env if exists (manually to avoid dependency on python-dotenv)
if os.path.exists(".env"):
    with open(".env") as f:
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
    try:
        setup_credentials("genesis")
    except Exception as e:
        print(f"Error setting up credentials: {e}")

    try:
        print("Fetching table 12411-0010...")
        t = Table(name="12411-0010") 
        t.get_data()
        
        df = t.data
        
        # Ensure column names are as expected (they might contain spaces/special chars)
        # Columns found: ['Stichtag', 'Amtlicher Gemeindeschlüssel (AGS)__Code', 'Amtlicher Gemeindeschlüssel (AGS)', 'Bevölkerungsstand__Anzahl']
        
        code_col = 'Amtlicher Gemeindeschlüssel (AGS)__Code'
        pop_col = 'Bevölkerungsstand__Anzahl'
        date_col = 'Stichtag'
        
        # Sort by date and get the latest
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
        
        # Save to docs/data/population.json
        output_path = "docs/data/population.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump({
                "updated": latest_date.strftime("%Y-%m-%d"),
                "data": population_map
            }, f, indent=2, ensure_ascii=False)
            
        print(f"Successfully saved population data to {output_path}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_population()
