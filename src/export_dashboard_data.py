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
REF = ROOT / "data" / "reference"
OUT = ROOT / "dashboard" / "data.js"

SCENARIOS = ["baseline", "equal", "coverage", "per_person", "scale", "no_scale"]


def clean(df: pd.DataFrame) -> list[dict]:
    """DataFrame -> list of dicts, with NaN turned into None (valid JSON null)."""
    return json.loads(df.to_json(orient="records"))


def donate_links() -> dict:
    """Only links that were checked and loaded (see verify_links.py), grouped by country."""
    f = REF / "donate_links.csv"
    if not f.exists():
        return {}
    d = pd.read_csv(f)
    d = d[d["status"] == "ok"]
    out: dict = {}
    for _, r in d.iterrows():
        out.setdefault(r["location_code"], []).append(
            {"org": r["org"], "what": r["what"], "url": r["url"], "checked": r["checked"]})
    return out


def write_sources_md(src: pd.DataFrame) -> None:
    """Write SOURCES.md from data/reference/sources.csv so the two never disagree."""
    lines = ["# Data sources and resources\n",
             "_Generated from `data/reference/sources.csv` by `src/export_dashboard_data.py`. "
             "Edit the CSV, not this file._\n"]
    for status, title in [("used", "Used"), ("cited", "Cited for context"), ("planned", "Planned"),
                          ("not_yet", "Possible future sources"), ("rejected", "Considered and rejected")]:
        part = src[src["status"] == status]
        if part.empty:
            continue
        lines.append(f"\n## {title}\n")
        for _, r in part.iterrows():
            lines.append(f"- **[{r['name']}]({r['url']})** ({r['publisher']}). {r['used_for']}.  \n"
                         f"  Terms: {r['terms']}. Accessed {r['accessed']}. {r['notes']}")
    (ROOT / "SOURCES.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    scores = pd.read_csv(PROCESSED / "neglect_scores.csv")
    sens = pd.read_csv(PROCESSED / "sensitivity_ranks.csv")
    unranked = pd.read_csv(PROCESSED / "unranked_appeals.csv")
    gap = pd.read_csv(PROCESSED / "gap_table.csv")

    crises = scores[[
        "location_code", "location_name", "requirements_usd", "funding_usd",
        "unmet_usd", "people_in_need", "pin_year", "year", "funding_pct",
        "funding_per_person_usd", "neglect_score", "rank", "low_confidence",
        "coverage_pts", "per_person_pts", "scale_pts",
        "pin_source", "pin_confidence", "pin_note", "pin_url", "pin_verified", "data_note",
    ]].copy()
    for c in ("coverage_pts", "per_person_pts", "scale_pts"):
        crises[c] = crises[c].round(1)
    crises = crises.fillna({"pin_note": "", "pin_url": "", "pin_verified": "", "data_note": ""})

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
        "unranked": clean(unranked.merge(
            gap[["location_code", "funding_usd"]], on="location_code", how="left",
        )[["location_code", "location_name", "appeal_types",
           "requirements_usd", "funding_usd", "funding_pct", "note"]]),
        "donate": donate_links(),
        "sources": clean(pd.read_csv(REF / "sources.csv")),
    }
    write_sources_md(pd.read_csv(REF / "sources.csv"))

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("window.AIDGAP = " + json.dumps(payload, indent=1) + ";\n",
                   encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}  "
          f"({len(payload['crises'])} crises, {len(payload['unranked'])} unranked)")


if __name__ == "__main__":
    main()
