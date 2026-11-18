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
    # When a country has its OWN plan AND a slice of a regional plan (Colombia: national
    # plan + part of the Venezuela refugee response), keep only its own plan. The
    # people-in-need figure belongs to the national plan, so adding the regional slice to
    # the funding would mix two different things (found by verify_data.py: $855M vs $620M).
    has_own = f.groupby("location_code")["appeal_type"].transform(
        lambda t: (t != "Regional response plan").any())
    f = f[~((f["appeal_type"] == "Regional response plan") & has_own)]
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


def add_manual_pin(gap: pd.DataFrame) -> pd.DataFrame:
    """Fill gaps in the HAPI people-in-need data with figures found by hand.

    The figures live in data/reference/manual_pin.csv together with their sources.
    A hand-found figure is used ONLY when:
      * HAPI has no figure for that country, and
      * the file says use_in_ranking = yes (we checked that the figure belongs to the
        same plan as the funding total, and that no source contradicts it badly).
    Everything else stays in the file as a record of what was found and why not used."""
    gap["pin_source"] = gap["people_in_need"].notna().map({True: "HAPI", False: ""})
    gap["pin_confidence"] = gap["pin_source"].map({"HAPI": "high", "": ""})
    gap["pin_note"] = ""
    gap["pin_url"] = ""
    gap["pin_verified"] = ""
    ref = ROOT / "data" / "reference" / "manual_pin.csv"
    if not ref.exists():
        return gap
    manual = pd.read_csv(ref)
    manual = manual[manual["use_in_ranking"].str.lower() == "yes"]
    for _, m in manual.iterrows():
        row = (gap["location_code"] == m["location_code"]) & gap["people_in_need"].isna()
        if not row.any():
            continue
        gap.loc[row, "people_in_need"] = m["people_in_need"]
        gap.loc[row, "pin_year"] = m["pin_year"]
        gap.loc[row, "pin_source"] = "manual"
        gap.loc[row, "pin_confidence"] = m["confidence"]
        gap.loc[row, "pin_note"] = str(m["plan_name"])
        gap.loc[row, "pin_url"] = m["source_url"]
        gap.loc[row, "pin_verified"] = m["verified_how"]
        print(f"  + hand-added people in need: {m['location_name']} = {int(m['people_in_need']):,} "
              f"({m['confidence']} confidence)")
    return gap


def main() -> pd.DataFrame:
    year = pd.Timestamp.today().year
    funding = load_funding(year)
    if funding.empty:
        year -= 1
        funding = load_funding(year)

    gap = funding.merge(load_pin(), on="location_code", how="left")
    gap = add_manual_pin(gap)
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
