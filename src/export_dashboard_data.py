"""
AidGap - Step 5: export data for the dashboard.

Turns the CSVs from the pipeline into one small file the web page reads:
    dashboard/data.js     (a plain JavaScript file: window.AIDGAP = {...})

Run AFTER gap_score.py, gap_score_v2.py (needs fetch_inform.py and fetch_reliefweb_api.py):
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


def country_context() -> dict:
    """One short, sourced paragraph per country (data/reference/country_context.csv)."""
    f = REF / "country_context.csv"
    if not f.exists():
        return {}
    d = pd.read_csv(f).fillna("")
    return {r["location_code"]: {"summary": r["summary"], "basis": r["basis"],
                                 "source_title": r["source_title"], "source_url": r["source_url"],
                                 "written": r["written"]} for _, r in d.iterrows()}


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
    unranked = pd.read_csv(PROCESSED / "unranked_appeals.csv")
    gap = pd.read_csv(PROCESSED / "gap_table.csv")

    v2 = pd.read_csv(PROCESSED / "neglect_scores_v2.csv")
    sens2 = pd.read_csv(PROCESSED / "sensitivity_v2.csv")
    rated = v2[v2["severity_rated"]]
    v2cols = rated[["location_code", "score_v2", "rank_v2", "gap_pts", "trend_pts", "chronic_pts", "severity_pts", "scale_pts", "displ_pts", "own_pts", "donor_pts",
                    "attention_gap_pts", "inform_severity", "reports_per_week", "funding_change", "displaced_total",
                    "displaced_share", "avg_funded_2021_25", "gdp_per_capita", "top_donor_share", "rank_v1", "score_v1"]]
    base = scores[[
        "location_code", "location_name", "requirements_usd", "funding_usd",
        "unmet_usd", "people_in_need", "pin_year", "year", "funding_pct",
        "funding_per_person_usd", "low_confidence",
        "pin_source", "pin_confidence", "pin_note", "pin_url", "pin_verified", "data_note",
    ]]
    crises = base.merge(v2cols, on="location_code", how="inner")
    crises = crises.rename(columns={"score_v2": "neglect_score", "rank_v2": "rank"})
    crises = crises.merge(sens2.rename(columns={"times_in_top10": "times_in_top"}),
                          on="location_name", how="left")
    for c in ("gap_pts", "trend_pts", "chronic_pts", "severity_pts", "scale_pts", "displ_pts", "own_pts", "donor_pts", "attention_gap_pts", "reports_per_week", "score_v1"):
        crises[c] = crises[c].round(1)
    crises = crises.sort_values("rank")
    crises = crises.fillna({"pin_note": "", "pin_url": "", "pin_verified": "", "data_note": ""})

    # Appeals that are not scored: no people-in-need figure (v1 list) plus the crises INFORM does not rate
    unrated = v2[~v2["severity_rated"]].merge(gap[["location_code", "appeal_types"]], on="location_code", how="left")
    extra = pd.DataFrame({
        "location_code": unrated["location_code"], "location_name": unrated["location_name"],
        "appeal_types": unrated["appeal_types"], "requirements_usd": unrated["requirements_usd"],
        "funding_usd": unrated["funding_usd"], "funding_pct": unrated["funding_pct"],
        "note": ["INFORM Severity does not rate this crisis, so it has no Neglect Score. Funding-only score (v1): "
                 + f"{x:.1f}" for x in unrated["score_v1"]],
    })
    unranked_all = pd.concat([unranked.merge(gap[["location_code", "funding_usd"]], on="location_code", how="left")[
        ["location_code", "location_name", "appeal_types", "requirements_usd", "funding_usd", "funding_pct", "note"]], extra],
        ignore_index=True)
    inform_release = str(int(pd.read_csv(PROCESSED / "inform_severity.csv")["release"].iloc[0]))

    payload = {
        "generated": date.today().isoformat(),
        "year": int(scores["year"].max()),
        "scenarios": SCENARIOS,
        "weights": {"gap": 14, "trend": 6, "chr": 15, "sev": 25, "scl": 8, "dis": 12, "own": 5, "don": 5, "att": 10},
        "inform_release": inform_release,
        "crises": clean(crises),
        "unranked": clean(unranked_all),
        "donate": donate_links(),
        "context": country_context(),
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
