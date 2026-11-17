"""
AidGap - Step 5: export data for the dashboard.

Turns the CSVs from the pipeline into one small file the web page reads:
    dashboard/data.js     (a plain JavaScript file: window.AIDGAP = {...})

Run AFTER gap_score.py and sensitivity.py:
    python src/export_dashboard_data.py

Then open dashboard/index.html in your browser (double-click it).
"""

import json
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "dashboard" / "data.js"

SCENARIOS = ["baseline", "equal", "coverage", "per_person", "scale", "no_scale"]


def clean(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> list of dicts, with NaN turned into None (valid JSON null)."""
    return json.loads(df.to_json(orient="records"))


def main() -> None:
    scores = pd.read_csv(PROCESSED / "neglect_scores.csv")
    sens = pd.read_csv(PROCESSED / "sensitivity_ranks.csv")
    unranked = pd.read_csv(PROCESSED / "unranked_appeals.csv")

    crises = scores[[
        "location_code", "location_name", "requirements_usd", "funding_usd",
        "unmet_usd", "people_in_need", "pin_year", "year", "funding_pct",
        "funding_per_person_usd", "neglect_score", "rank", "low_confidence",
    ]].copy()

    # Rank range under the 6 weightings (how stable is each country's rank?)
    sens = sens.rename(columns={"location_name": "name"})
    crises = crises.merge(
        sens[["name", "best_rank", "worst_rank", "times_in_top"]],
        left_on="location_name", right_on="name", how="left",
    ).drop(columns="name")

    payload = {
        "generated": date.today().isoformat(),
        "year": int(scores["year"].max()),
        "scenarios": SCENARIOS,
        "crises": clean(crises),
        "unranked": clean(unranked[["location_name", "appeal_types",
                                    "requirements_usd", "funding_pct"]]),
    }

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("window.AIDGAP = " + json.dumps(payload, indent=1) + ";\n",
                   encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}  "
          f"({len(payload['crises'])} crises, {len(payload['unranked'])} unranked)")


if __name__ == "__main__":
    main()
