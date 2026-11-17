"""
AidGap - Step 4: the Neglect Score.

One number (0-100) per crisis: higher = more neglected.
Run AFTER build_gap_table.py:
    python src/gap_score.py
Saves: data/processed/neglect_scores.csv

How it works (simple on purpose, so it can be explained in one sentence each):
  1. Coverage   - what % of the appeal is funded      (lower  -> more neglected)
  2. Per person - dollars received per person in need  (lower  -> more neglected)
  3. Scale      - how many people are in need          (higher -> more neglected)
Each is turned into a percentile (0-100) among the countries we compare,
then combined with the weights below.
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"

WEIGHTS = {"coverage": 0.4, "per_person": 0.4, "scale": 0.2}


def percentile(series: pd.Series, higher_is_worse: bool) -> pd.Series:
    """0 = least neglected in the group, 100 = most neglected."""
    return series.rank(pct=True, ascending=higher_is_worse) * 100


def main() -> pd.DataFrame:
    gap = pd.read_csv(PROCESSED / "gap_table.csv")
    # Only countries with a national plan have a fair per-person figure
    df = gap[gap["has_national_plan"]].copy()

    df["coverage_pts"] = percentile(df["funding_pct"], higher_is_worse=False)
    df["per_person_pts"] = percentile(df["funding_per_person_usd"], higher_is_worse=False)
    df["scale_pts"] = percentile(df["people_in_need"], higher_is_worse=True)

    df["neglect_score"] = (
        WEIGHTS["coverage"] * df["coverage_pts"]
        + WEIGHTS["per_person"] * df["per_person_pts"]
        + WEIGHTS["scale"] * df["scale_pts"]
    ).round(1)

    # Be honest about data quality: flag needs figures from an older year
    # (the funding is for the current year, the people-in-need figure is older,
    # so $ per person mixes two different years -> low confidence)
    df["low_confidence"] = df["pin_year"] < df["year"]
    df["data_note"] = ""
    df.loc[df["low_confidence"], "data_note"] = (
        "LOW CONFIDENCE: needs from " + df["pin_year"].astype("Int64").astype(str)
        + ", funding from " + df["year"].astype("Int64").astype(str)
    )

    df = df.sort_values("neglect_score", ascending=False)
    # Tied scores share a rank (e.g. 8, 8, 10) instead of an arbitrary order
    df["rank"] = df["neglect_score"].rank(ascending=False, method="min").astype(int)
    df.to_csv(PROCESSED / "neglect_scores.csv", index=False)

    print(f"Neglect Score for {len(df)} crises (100 = most neglected)\n")
    show = df[["rank", "location_name", "neglect_score", "funding_pct",
               "funding_per_person_usd", "people_in_need", "data_note"]]
    print(show.to_string(index=False, formatters={
        "funding_pct": "{:.1f}%".format,
        "funding_per_person_usd": "${:,.2f}".format,
        "people_in_need": "{:,.0f}".format,
    }))
    if df["low_confidence"].any():
        print("\nLOW CONFIDENCE rows use an older needs figure than the funding "
              "year; treat their rank as indicative only.")

    # Countries we could NOT score, but that have their own (non-regional) appeal.
    # They are missing a people-in-need figure, so they are shown separately
    # instead of being silently dropped. Regional response plans stay excluded.
    skipped = gap[~gap["has_national_plan"]
                  & (gap["appeal_types"] != "Regional response plan")].copy()
    skipped["note"] = "no people-in-need figure in HAPI; not scored"
    skipped = skipped.sort_values("requirements_usd", ascending=False)
    skipped[["location_name", "appeal_types", "requirements_usd", "funding_pct",
             "note"]].to_csv(PROCESSED / "unranked_appeals.csv", index=False)

    print("\nNOT RANKED (own appeal, but no people-in-need data):\n")
    print(skipped[["location_name", "appeal_types", "requirements_usd",
                   "funding_pct"]].to_string(index=False, formatters={
        "requirements_usd": "${:,.0f}".format,
        "funding_pct": "{:.1f}%".format,
    }))
    return df


if __name__ == "__main__":
    scores = main()
