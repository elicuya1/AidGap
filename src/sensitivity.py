"""
AidGap - Sensitivity analysis for the Neglect Score.

The score weights (40/40/20) are a choice. This script re-scores every crisis
under several different weightings and shows how much the ranking moves.
Countries that stay near the top in ALL scenarios are robustly neglected.

Run AFTER build_gap_table.py:
    python src/sensitivity.py
Saves: data/processed/sensitivity_ranks.csv
"""

from pathlib import Path

import pandas as pd

from gap_score import PROCESSED, percentile

# name -> (coverage, per_person, scale)
SCENARIOS = {
    "baseline":     (0.40, 0.40, 0.20),
    "equal":        (1 / 3, 1 / 3, 1 / 3),
    "coverage":     (0.60, 0.20, 0.20),
    "per_person":   (0.20, 0.60, 0.20),
    "scale":        (0.20, 0.20, 0.60),
    "no_scale":     (0.50, 0.50, 0.00),
}
TOP_N = 5


def main() -> pd.DataFrame:
    gap = pd.read_csv(PROCESSED / "gap_table.csv")
    df = gap[gap["has_national_plan"]].copy()

    cov = percentile(df["funding_pct"], higher_is_worse=False)
    per = percentile(df["funding_per_person_usd"], higher_is_worse=False)
    scl = percentile(df["people_in_need"], higher_is_worse=True)

    out = df[["location_name"]].copy()
    out["low_confidence"] = df["pin_year"] < df["year"]
    for name, (wc, wp, ws) in SCENARIOS.items():
        score = wc * cov + wp * per + ws * scl
        out[name] = score.rank(ascending=False, method="min").astype(int)

    names = list(SCENARIOS)
    out["best_rank"] = out[names].min(axis=1)
    out["worst_rank"] = out[names].max(axis=1)
    out["times_in_top"] = (out[names] <= TOP_N).sum(axis=1)
    out = out.sort_values(["times_in_top", "best_rank"], ascending=[False, True])
    out.to_csv(PROCESSED / "sensitivity_ranks.csv", index=False)

    print(f"Rank of each crisis under {len(names)} weightings (1 = most neglected)")
    print("Weights = (coverage, per person, scale)\n")
    for name, w in SCENARIOS.items():
        print(f"  {name:<11} {w[0]:.2f} / {w[1]:.2f} / {w[2]:.2f}")
    print()
    show = out[out["best_rank"] <= 10].copy()  # only crises that ever reach the top 10
    show["location_name"] += show["low_confidence"].map({True: " *", False: ""})
    print(show.drop(columns="low_confidence").to_string(index=False))
    print(f"\n'times_in_top' = in how many of the {len(names)} scenarios the crisis "
          f"is in the top {TOP_N}.   * = low-confidence needs data")

    stable = out[out["times_in_top"] == len(names)]["location_name"].tolist()
    print(f"\nTop {TOP_N} in EVERY scenario: {', '.join(stable) if stable else 'none'}")
    return out


if __name__ == "__main__":
    main()
