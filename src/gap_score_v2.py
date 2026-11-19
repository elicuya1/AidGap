"""
AidGap - Step 17: Neglect Score v2 (revised 2026-11-19: now six measures in four groups).

What is different from v1 (gap_score.py), and why:
  * v1 turned every measure into a RANK (percentile), so a crisis could move just because another country
    joined the list. v2 scores real VALUES on FIXED scales (0 to 100): a score means the same thing next year.
  * v1 counted "funding is low" twice and "dollars per person" mostly reflected how big an appeal was asked to
    be, so v2 drops dollars per person from the score (it is still shown on the page).
  * v1 ignored how severe a crisis is and how many people are displaced. v2 adds both, plus attention.

FOUR GROUPS, SIX MEASURES (weights add to 100 %; the reasons are written next to each):

  1. FUNDING  30 %   the core of "neglect": money against the stated need
        gap    20 %  100 - % of the appeal funded                       (OCHA FTS)
        trend  10 %  funding FELL from 2024 to 2025: -50 % or worse = 100, flat or rising = 0 (OCHA FTS flows)
  2. SEVERITY 30 %   how bad the crisis is, so a mild crisis cannot top the list because it is cheap to fund
        INFORM Severity, 1 to 10 rescaled to 0 to 100                  (EU JRC + ACAPS, analysts' judgement)
  3. PEOPLE   25 %   how many people are affected
        scale  10 %  log of people in need, fixed range 100,000 (0) to 50 million (100)   (HDX HAPI / OCHA)
        displ  15 %  people displaced from the country (abroad + inside) as a share of its population,
                     fixed range 0 % (0) to 30 % (100)                  (UNHCR, World Bank)
  4. ATTENTION 15 %  how little the aid sector publishes about it (the weakest measure, so the lowest weight)
        attention    100 - log of reports a week, fixed range 1 a week (0 attention) to 60 a week (100)   (ReliefWeb)

  A measure that does not exist for a country (e.g. displacement for Palestine, whose refugees UNHCR does not
  count) is left out for that country and the other weights are scaled up to 100 %.
  A crisis INFORM does not rate (flash appeals / disasters) is NOT given a score (without severity it was pushed
  to the top unfairly); it is listed separately with its funding-only v1 score.

  These weights are a judgement, not a measurement. The same ranking is re-run under six other weightings
  (sensitivity_v2.csv) so the page can say which results survive.

Run AFTER build_gap_table.py, gap_score.py, fetch_inform.py, fetch_reliefweb_api.py, fetch_displacement.py
and fetch_donor_trend.py:
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
TREND = ROOT / "data" / "raw" / "donor_trend"
W = {"gap": 0.20, "trend": 0.10, "sev": 0.30, "scale": 0.10, "displ": 0.15, "att": 0.15}
PIN_LO, PIN_HI = 1e5, 5e7
ATT_LO, ATT_HI = 1.0, 60.0
DISPL_HI = 0.30
TREND_FALL = 0.50           # a 50 % fall (or worse) in funding = full points

SCENARIOS = {
    "chosen (30/30/25/15)": W,
    "equal groups (25 each)": {"gap": 0.125, "trend": 0.125, "sev": 0.25, "scale": 0.125, "displ": 0.125, "att": 0.25},
    "funding-heavy": {"gap": 0.30, "trend": 0.15, "sev": 0.20, "scale": 0.05, "displ": 0.15, "att": 0.15},
    "severity-heavy": {"gap": 0.15, "trend": 0.05, "sev": 0.50, "scale": 0.10, "displ": 0.10, "att": 0.10},
    "no attention": {**W, "att": 0.0},
    "earlier v2 (funding gap, severity, scale, attention only)": {"gap": 0.35, "trend": 0.0, "sev": 0.35, "scale": 0.15, "displ": 0.0, "att": 0.15},
}
PARTS = {"gap": "gap_pts", "trend": "trend_pts", "sev": "severity_pts", "scale": "scale_pts", "displ": "displ_pts", "att": "attention_gap_pts"}


def scale01(x, lo, hi):
    return np.clip((np.log10(x) - math.log10(lo)) / (math.log10(hi) - math.log10(lo)), 0, 1) * 100


def combine(df: pd.DataFrame, w: dict) -> pd.Series:
    num = sum(w[k] * df[c].fillna(0) for k, c in PARTS.items())
    den = sum(w[k] * df[c].notna() for k, c in PARTS.items())     # leave out a missing part and rescale the rest
    return (num / den).round(1)


def funding_totals(iso: str, year: int):
    """All funding recorded to the country in a calendar year (money given to this country alone), from the cached FTS files."""
    f = TREND / f"{year}_{iso}.json"
    if not f.exists():
        return None
    d = json.loads(f.read_text(encoding="utf-8"))
    return sum((x.get("totalFunding") or 0) for o in d["data"]["report1"]["fundingTotals"]["objects"]
               for x in o.get("singleFundingObjects", []))


def main() -> pd.DataFrame:
    v1 = pd.read_csv(PROC / "neglect_scores.csv")
    sev = pd.read_csv(PROC / "inform_severity.csv").set_index("iso3")
    disp = pd.read_csv(PROC / "displacement.csv").set_index("iso3")
    meta = json.loads((RW / "_meta.json").read_text(encoding="utf-8"))
    days = meta["window_days"]
    per_week = {f.stem: len(json.loads(f.read_text(encoding="utf-8"))) / days * 7
                for f in RW.glob("*.json") if not f.stem.startswith("_")}

    df = v1[["location_code", "location_name", "people_in_need", "funding_pct", "requirements_usd",
             "funding_usd", "rank", "neglect_score", "low_confidence", "pin_confidence"]].copy()
    df = df.rename(columns={"rank": "rank_v1", "neglect_score": "score_v1"})
    df["gap_pts"] = (100 - df["funding_pct"]).clip(0, 100)
    f24 = df["location_code"].map(lambda c: funding_totals(c, 2024))
    f25 = df["location_code"].map(lambda c: funding_totals(c, 2025))
    df["funding_2024"], df["funding_2025"] = f24, f25
    df["funding_change"] = ((f25 - f24) / f24).where(f24 > 0)
    df["trend_pts"] = (-df["funding_change"] / TREND_FALL * 100).clip(0, 100)
    df["inform_severity"] = df["location_code"].map(sev["severity"])
    df["severity_pts"] = ((df["inform_severity"] - 1) / 9 * 100).clip(0, 100)
    df["scale_pts"] = scale01(df["people_in_need"], PIN_LO, PIN_HI)
    df["displaced_total"] = df["location_code"].map(disp["displaced_total"])
    df["displaced_share"] = df["location_code"].map(disp["displaced_share"])
    df["displ_pts"] = (df["displaced_share"] / DISPL_HI * 100).clip(0, 100)
    df["reports_per_week"] = df["location_code"].map(per_week)
    df["attention_gap_pts"] = 100 - scale01(df["reports_per_week"].clip(lower=ATT_LO), ATT_LO, ATT_HI)
    df["severity_rated"] = df["severity_pts"].notna()

    rated = df[df["severity_rated"]].copy()
    rated["score_v2"] = combine(rated, W)
    rated = rated.sort_values("score_v2", ascending=False)
    rated["rank_v2"] = rated["score_v2"].rank(ascending=False, method="min").astype(int)
    rated["rank_change"] = rated["rank_v1"] - rated["rank_v2"]       # positive = moves UP the neglect list in v2
    unrated = df[~df["severity_rated"]].copy()
    df = pd.concat([rated, unrated], ignore_index=True)
    sens_base = rated.reset_index(drop=True)
    df.round(4).to_csv(PROC / "neglect_scores_v2.csv", index=False)

    ranks = pd.DataFrame({n: combine(sens_base, w).rank(ascending=False, method="min") for n, w in SCENARIOS.items()})
    sens = pd.DataFrame({"location_name": sens_base["location_name"], "best_rank": ranks.min(axis=1).astype(int),
                         "worst_rank": ranks.max(axis=1).astype(int),
                         "times_in_top5": (ranks <= 5).sum(axis=1), "times_in_top10": (ranks <= 10).sum(axis=1)})
    sens.to_csv(PROC / "sensitivity_v2.csv", index=False)

    show = rated[["rank_v2", "location_name", "score_v2", "rank_v1", "rank_change", "funding_pct", "funding_change",
                  "inform_severity", "displaced_share", "reports_per_week"]].merge(sens[["location_name", "best_rank", "worst_rank"]], on="location_name")
    print("NEGLECT SCORE v2 (100 = most neglected); rank_change > 0 means higher up the list than in v1\n")
    print(show.to_string(index=False, formatters={"funding_pct": "{:.0f}%".format, "funding_change": lambda v: "n/a" if pd.isna(v) else f"{v:+.0%}",
                                                  "reports_per_week": "{:.1f}".format, "inform_severity": "{:.1f}".format,
                                                  "displaced_share": lambda v: "n/a" if pd.isna(v) else f"{v:.1%}"}))
    print("\nTop 5 in every weighting:", ", ".join(sens[sens.times_in_top5 == len(SCENARIOS)]["location_name"]) or "none")
    print("Top 10 in every weighting:", ", ".join(sens[sens.times_in_top10 == len(SCENARIOS)]["location_name"]) or "none")
    print("Not rated by INFORM (listed separately, no v2 score):", ", ".join(unrated["location_name"]))
    return df


if __name__ == "__main__":
    main()
