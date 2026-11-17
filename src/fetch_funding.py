"""
AidGap - Step 1: pull humanitarian funding data (OCHA FTS) from the HDX HAPI.

Run this in Spyder (F5) or from a terminal:  python src/fetch_funding.py
Before running: put your app identifier in src/config_local.py (see README).
"""

from pathlib import Path

import pandas as pd
import requests

try:
    from config_local import APP_IDENTIFIER
except ImportError:
    raise SystemExit(
        "Missing src/config_local.py. Create it with one line:\n"
        'APP_IDENTIFIER = "paste-your-identifier-here"'
    )

# The docs show v1; newer deployments may be on v2. We try v2 first, then v1.
BASE_URLS = [
    "https://hapi.humdata.org/api/v2",
    "https://hapi.humdata.org/api/v1",
]
ENDPOINT = "/coordination-context/funding"
PAGE_SIZE = 10_000  # HAPI returns at most 10,000 rows per request

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)


def fetch_all(base_url: str) -> pd.DataFrame:
    """Page through the endpoint until no more rows come back."""
    rows, offset = [], 0
    while True:
        params = {
            "app_identifier": APP_IDENTIFIER,
            "output_format": "json",
            "limit": PAGE_SIZE,
            "offset": offset,
        }
        resp = requests.get(base_url + ENDPOINT, params=params, timeout=60)
        resp.raise_for_status()
        batch = resp.json().get("data", [])
        rows.extend(batch)
        print(f"  fetched {len(batch)} rows (offset {offset})")
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return pd.DataFrame(rows)


def main() -> pd.DataFrame:
    last_error = None
    for base in BASE_URLS:
        print(f"Trying {base}{ENDPOINT} ...")
        try:
            df = fetch_all(base)
            print(f"OK - using {base}")
            break
        except requests.HTTPError as err:
            print(f"  failed: {err}")
            last_error = err
    else:
        raise SystemExit(f"All API versions failed. Last error: {last_error}")

    out = RAW_DIR / "fts_funding.csv"
    df.to_csv(out, index=False)
    print(f"\nSaved {len(df):,} rows to {out}")

    # Quick first look
    print("\nColumns:", list(df.columns))
    if {"funding_pct", "appeal_name", "location_name"}.issubset(df.columns):
        df["reference_period_start"] = pd.to_datetime(
            df["reference_period_start"], errors="coerce"
        )
        # Only rows with a real funding requirement can have a "gap"
        valid = df[df["requirements_usd"].fillna(0) > 0].copy()
        valid["funding_pct"] = valid["funding_pct"].fillna(
            valid["funding_usd"].fillna(0) / valid["requirements_usd"] * 100
        )

        # Use the current year, not the max year: some records are dated
        # years into the future (e.g. multi-year plans), which would mislead us
        this_year = pd.Timestamp.today().year
        recent = valid[valid["reference_period_start"].dt.year == this_year]
        if recent.empty:
            this_year -= 1
            recent = valid[valid["reference_period_start"].dt.year == this_year]

        print(f"\nLeast-funded appeals in {this_year} ({len(recent)} appeals):")
        print(
            recent.sort_values("funding_pct")[
                ["location_name", "appeal_name", "requirements_usd",
                 "funding_usd", "funding_pct"]
            ].head(10).to_string(index=False)
        )
    return df


if __name__ == "__main__":
    funding = main()  # 'funding' stays in Spyder's Variable Explorer
