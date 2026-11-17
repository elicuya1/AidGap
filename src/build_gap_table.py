"""
AidGap - Step 3: join funding + people in need into one table per crisis.

Run AFTER fetch_funding.py and fetch_needs.py:
    python src/build_gap_table.py
Saves: data/processed/gap_table.csv
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"


def load_funding(year: int) -> pd.DataFrame:
    f = pd.read_csv(RAW / "fts_funding.csv")
    f["year"] = pd.to_datetime(f["reference_period_start"], errors="coerce").dt.year
    f = f[(f["year"] == year) & (f["requirements_usd"].fillna(0) > 0)]
    # A country can have several appeals in a year (response plan, flash appeal...)
    return (f.groupby(["location_code", "location_name"], as_index=False)
              .agg(appeals=("appeal_code", "nunique"),
                   appeal_types=("appeal_type", lambda t: ", ".join(sorted(t.dropna().astype(str).unique()))),
                   requirements_usd=("requirements_usd", "sum"),
                   funding_usd=("funding_usd", "sum")))


def load_pin() -> pd.DataFrame:
    p = pd.read_csv(PROCESSED / "pin_national.csv")
    # Latest available year per country (needs data is often a year behind)
    latest = p.sort_values("year").groupby("location_code").tail(1)
    return latest.rename(columns={"year": "pin_year"})[
        ["location_code", "people_in_need", "pin_year"]]


def main() -> pd.DataFrame:
    year = pd.Timestamp.today().year
    funding = load_funding(year)
    if funding.empty:
        year -= 1
        funding = load_funding(year)

    gap = funding.merge(load_pin(), on="location_code", how="left")
    gap["funding_usd"] = gap["funding_usd"].fillna(0)
    gap["funding_pct"] = gap["funding_usd"] / gap["requirements_usd"] * 100
    gap["unmet_usd"] = (gap["requirements_usd"] - gap["funding_usd"]).clip(lower=0)
    gap["funding_per_person_usd"] = gap["funding_usd"] / gap["people_in_need"]
    gap["year"] = year
    # Countries with a people-in-need figure have their own national response
    # plan. The rest are mostly part of REGIONAL plans (e.g. refugee hosting
    # countries), where funding is often reported for the region as a whole,
    # so their per-country "% funded" is unreliable. Keep them separate.
    gap["has_national_plan"] = gap["people_in_need"].notna()

    gap.to_csv(PROCESSED / "gap_table.csv", index=False)
    print(f"Saved gap table: {len(gap)} countries with appeals in {year}")
    missing = gap["people_in_need"].isna().sum()
    if missing:
        print(f"  ({missing} have no people-in-need figure yet)")

    print("\nAppeal types found:")
    print(pd.read_csv(RAW / "fts_funding.csv")["appeal_type"].value_counts().to_string())

    national = gap[gap["has_national_plan"]]
    regional = gap[~gap["has_national_plan"]]
    print(f"\n{len(national)} countries with a national plan, "
          f"{len(regional)} only in regional/other plans")

    cols = ["location_name", "pin_year", "people_in_need", "requirements_usd",
            "funding_usd", "funding_pct", "funding_per_person_usd"]
    fmt = {"pin_year": "{:.0f}".format,
           "people_in_need": "{:,.0f}".format,
           "requirements_usd": "${:,.0f}".format,
           "funding_usd": "${:,.0f}".format,
           "funding_pct": "{:.1f}%".format,
           "funding_per_person_usd": "${:,.2f}".format}

    print(f"\nLowest % of appeal funded - national plans only ({year}):")
    print(national.sort_values("funding_pct")[cols].head(10)
             .to_string(index=False, formatters=fmt, na_rep="-"))

    print(f"\nLeast money per person in need ({year}):")
    print(national.sort_values("funding_per_person_usd")[cols].head(10)
             .to_string(index=False, formatters=fmt, na_rep="-"))
    return gap


if __name__ == "__main__":
    gap = main()
