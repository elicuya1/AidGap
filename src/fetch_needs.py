"""
AidGap - Step 2: pull "people in need" (PIN) data from the HDX HAPI.

Run:  python src/fetch_needs.py
Saves: data/raw/humanitarian_needs.csv  (all rows, for exploring)
       data/processed/pin_national.csv  (one number per country per year)
"""

from pathlib import Path

import pandas as pd
import requests

from config_local import APP_IDENTIFIER

URL = "https://hapi.humdata.org/api/v2/affected-people/humanitarian-needs"
PAGE_SIZE = 10_000

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
RAW.mkdir(parents=True, exist_ok=True)
PROCESSED.mkdir(parents=True, exist_ok=True)


def fetch(filters: dict) -> pd.DataFrame:
    rows, offset = [], 0
    while True:
        params = {"app_identifier": APP_IDENTIFIER, "output_format": "json",
                  "limit": PAGE_SIZE, "offset": offset, **filters}
        resp = requests.get(URL, params=params, timeout=120)
        resp.raise_for_status()
        batch = resp.json().get("data", [])
        rows.extend(batch)
        print(f"  fetched {len(batch)} rows (offset {offset})")
        if len(batch) < PAGE_SIZE:
            return pd.DataFrame(rows)
        offset += PAGE_SIZE


def national_pin(df: pd.DataFrame) -> pd.DataFrame:
    """One 'people in need' number per country per year.

    Rules from the HAPI docs: use population_status 'INN' (in need),
    use the intersectoral sector, and never add sectors together.
    """
    d = df.copy()
    d = d[d["population_status"].astype(str).str.upper() == "INN"]
    sector = (d["sector_code"].astype(str) + " " + d["sector_name"].astype(str)).str.lower()
    d = d[sector.str.contains("intersect")]
    if "admin_level" in d.columns:
        d = d[d["admin_level"].astype(str) == "0"]  # 0 = whole country
    d["year"] = pd.to_datetime(d["reference_period_start"], errors="coerce").dt.year
    d["population"] = pd.to_numeric(d["population"], errors="coerce")

    # Rows can be split by category (age, gender...). The country total is
    # always the largest of them, so take the max - never the sum.
    out = (d.groupby(["location_code", "location_name", "year"], as_index=False)
             ["population"].max()
             .rename(columns={"population": "people_in_need"}))
    return out


def main() -> pd.DataFrame:
    print(f"Downloading humanitarian needs from {URL} ...")
    try:
        df = fetch({"population_status": "INN"})
    except requests.HTTPError as err:
        print(f"  filtered request failed ({err}); downloading everything instead")
        df = fetch({})

    df.to_csv(RAW / "humanitarian_needs.csv", index=False)
    print(f"Saved {len(df):,} raw rows")

    pin = national_pin(df)
    pin.to_csv(PROCESSED / "pin_national.csv", index=False)
    print(f"Saved national totals for {pin['location_code'].nunique()} countries")

    latest = pin.sort_values("year").groupby("location_code").tail(1)
    print("\nMost people in need (latest year per country):")
    print(latest.sort_values("people_in_need", ascending=False)
                .head(10).to_string(index=False))
    return pin


if __name__ == "__main__":
    pin = main()
