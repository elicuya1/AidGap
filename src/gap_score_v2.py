"""
AidGap - Step 17: Neglect Score v2 (runs NEXT TO v1; v1 and the page are unchanged until we switch).

What is different from v1 (gap_score.py), and why:
  * v1 turned every measure into a RANK (percentile), so a crisis could move just because another
    country joined the list, and a 3 % funded crisis looked only a few steps from a 20 % one.
    v2 scores the real VALUES on FIXED scales (0 to 100), so a score means the same thing every year.
  * v1 counted "funding is low" twice (% funded and dollars per person, which are correlated) and
    "dollars per person" mostly reflected how big the appeal was asked to be. v2 has ONE funding
    component: the share of the appeal that is NOT funded.
  * v1 ignored how severe a crisis is. v2 adds INFORM Severity (EU JRC + ACAPS, 1 to 10).
  * Attention: how few reports aid organisations publish about the crisis (ReliefWeb, last 90 days).

    Neglect v2 = 0.35 x Funding gap + 0.35 x Severity + 0.15 x Scale + 0.15 x Attention gap

  Funding gap   = 100 - % of the appeal funded (0 % funded = 100, fully funded = 0)
  Severity      = (INFORM Severity - 1) / 9 x 100
  Scale         = log10 of people in need, fixed range 100,000 (0) to 50 million (100)
  Attention gap = 100 - log10 of reports a week, fixed range 1 a week (0 attention) to 60 a week (100)
  A crisis INFORM does not rate (flash appeals / disasters) is NOT given a v2 score (without severity it would be biased
  upwards); it is listed separately with its funding-only v1 score.

Run AFTER build_gap_table.py, gap_score.py, fetch_inform.py and fetch_reliefweb_api.py:
    python src/gap_score_v2.py
Saves: data/processed/neglect_scores_v2.csv, data/processed/sensitivity_v2.csv
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
RW = ROOT / "data" / "raw" / "reliefweb"
W = {"gap": 0.35, "sev": 0.35, "scale": 0.15, "att": 0.15}
PIN_LO, PIN_HI = 1e5, 5e7
ATT_LO, ATT_HI = 1.0, 60.0

SCENARIOS = {                      # same idea as sensitivity.py: does the top of the list survive other weightings?
    "chosen (35/35/15/15)": W,
    "funding-heavy": {"gap": 0.55, "sev": 0.25, "scale": 0.10, "att": 0.10},
    "severity-heavy": {"gap": 0.25, "sev": 0.55, "scale": 0.10, "att": 0.10},
    "no attention": {"gap": 0.40, "sev": 0.40, "scale": 0.20, "att": 0.0},
    "no scale": {"gap": 0.40, "sev": 0.40, "scale": 0.0, "att": 0.20},
    "equal": {"gap": 0.25, "sev": 0.25, "scale": 0.25, "att": 0.25},
}


def scale01(x, lo, hi):
    return np.clip((np.log10(x) - math.log10(lo)) / (math.log10(hi) - math.log10(lo)), 0, 1) * 100


def combine(df: pd.DataFrame, w: dict) -> pd.Series:
    parts = {"gap": df["gap_pts"], "sev": df["severity_pts"], "scale": df["scale_pts"], "att": df["attention_gap_pts"]}
    num = sum(w[k] * parts[k].fillna(0) for k in parts)
    den = sum(w[k] * parts[k].notna() for k in parts)      # leave out a missing part and rescale the rest
    return (num / den).round(1)


def main() -> pd.DataFrame:
    v1 = pd.read_csv(PROC / "neglect_scores.csv")
    sev = pd.read_csv(PROC / "inform_severity.csv").set_index("iso3")
    meta = json.loads((RW / "_meta.json").read_text(encoding="utf-8"))
    days = meta["window_days"]
    per_week = {f.stem: len(json.loads(f.read_text(encoding="utf-8"))) / days * 7
                for f in RW.glob("*.json") if not f.stem.startswith("_")}

    df = v1[["location_code", "location_name", "people_in_need", "funding_pct", "requirements_usd",
             "funding_usd", "rank", "neglect_score", "low_confidence", "pin_confidence"]].copy()
    df = df.rename(columns={"rank": "rank_v1", "neglect_score": "score_v1"})
    df["gap_pts"] = (100 - df["funding_pct"]).clip(0, 100)
    df["inform_severity"] = df["location_code"].map(sev["severity"])
    df["severity_pts"] = ((df["inform_severity"] - 1) / 9 * 100).clip(0, 100)
    df["scale_pts"] = scale01(df["people_in_need"], PIN_LO, PIN_HI)
    df["reports_per_week"] = df["location_code"].map(per_week)
    df["attention_gap_pts"] = 100 - scale01(df["reports_per_week"].clip(lower=ATT_LO), ATT_LO, ATT_HI)
    df["severity_rated"] = df["severity_pts"].notna()
    # Only crises INFORM rates are scored: without severity the score would lean on the funding gap and
    # attention alone and push unrated (mostly small, disaster) crises to the top. They are listed separately.
    rated = df[df["severity_rated"]].copy()
    rated["score_v2"] = combine(rated, W)
    rated = rated.sort_values("score_v2", ascending=False)
    rated["rank_v2"] = rated["score_v2"].rank(ascending=False, method="min").astype(int)
    rated["rank_change"] = rated["rank_v1"] - rated["rank_v2"]       # positive = moves UP the neglect list in v2
    unrated = df[~df["severity_rated"]].copy()
    df = pd.concat([rated, unrated], ignore_index=True)
    sens_base = rated.reset_index(drop=True)
    df.round(2).to_csv(PROC / "neglect_scores_v2.csv", index=False)

    # sensitivity: rank of each crisis under every weighting
    ranks = pd.DataFrame({n: combine(sens_base, w).rank(ascending=False, method="min") for n, w in SCENARIOS.items()})
    sens = pd.DataFrame({"location_name": sens_base["location_name"], "best_rank": ranks.min(axis=1).astype(int),
                         "worst_rank": ranks.max(axis=1).astype(int),
                         "times_in_top5": (ranks <= 5).sum(axis=1), "times_in_top10": (ranks <= 10).sum(axis=1)})
    sens.to_csv(PROC / "sensitivity_v2.csv", index=False)

    show = rated[["rank_v2", "location_name", "score_v2", "rank_v1", "rank_change", "funding_pct", "inform_severity",
               "people_in_need", "reports_per_week"]].merge(sens[["location_name", "best_rank", "worst_rank"]], on="location_name")
    print("NEGLECT SCORE v2 (100 = most neglected); rank_change > 0 means higher up the list than in v1\n")
    print(show.to_string(index=False, formatters={"funding_pct": "{:.0f}%".format, "people_in_need": "{:,.0f}".format,
                                                  "reports_per_week": "{:.1f}".format, "inform_severity": "{:.1f}".format}))
    print("\nTop 5 in every weighting:", ", ".join(sens[sens.times_in_top5 == len(SCENARIOS)]["location_name"]) or "none")
    print("Not rated by INFORM (listed separately, no v2 score):", ", ".join(unrated["location_name"]))
    return df


if __name__ == "__main__":
    main()
