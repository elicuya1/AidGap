"""
AidGap - Step 11: has donor funding gone up or down? (FTS, by year)

Source: OCHA Financial Tracking Service (FTS) public API (free, no key)
  1) Worldwide: every humanitarian funding flow recorded per calendar year, grouped by donor country.
  2) For each ranked crisis: how much the United States gave in 2024 vs 2025 (money given to that
     one country alone, same rule as fetch_donors.py).

Honest limits (also shown on the page):
  * FTS only knows what donors and agencies report. Recent years fill in late, so the newest year
    is always lower than it will end up.
  * It records money for humanitarian response. It says nothing about how well money was spent,
    and it cannot show "waste". We do not claim to.

Run:   python src/fetch_donor_trend.py
Saves: data/raw/donor_trend/*.json (cache), dashboard/donortrend.js
"""
import json
import time
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "donor_trend"
OUT = ROOT / "dashboard" / "donortrend.js"
YEARS = [2022, 2023, 2024, 2025, 2026]
UA = {"User-Agent": "AidGap-portfolio-project/0.1"}
BASE = "https://api.hpc.tools/v1/public/fts/flow?year={y}&groupby=country"


def get(url: str, cache: Path):
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                d = json.loads(r.read().decode("utf-8"))
            if d.get("status") == "ok":
                cache.write_text(json.dumps(d), encoding="utf-8")
                return d
        except Exception as e:  # network hiccup: wait and retry
            print("  retry", type(e).__name__, flush=True)
        time.sleep(5 * (attempt + 1))
    return None


def singles(d: dict) -> dict:
    t = {}
    for o in d["data"]["report1"]["fundingTotals"]["objects"]:
        for x in o.get("singleFundingObjects", []):
            t[x.get("name") or "Not specified"] = t.get(x.get("name") or "Not specified", 0) + (x.get("totalFunding") or 0)
    return t


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    world = {}
    for y in YEARS:
        d = get(BASE.format(y=y), RAW / f"world_{y}.json")
        if not d:
            raise SystemExit(f"no data for {y}")
        world[y] = singles(d)
        print(y, f"${sum(world[y].values())/1e9:.1f}B recorded", flush=True)
        time.sleep(1)
    named = {y: {k: v for k, v in w.items() if k != "Not specified"} for y, w in world.items()}
    rank_base = {}
    for y in (2022, 2023, 2024, 2025):
        for k, v in named[y].items():
            rank_base[k] = rank_base.get(k, 0) + v
    top = [k for k, _ in sorted(rank_base.items(), key=lambda kv: -kv[1])[:12]]
    donors = [{"name": k, "by_year": {str(y): round(named[y].get(k, 0)) for y in YEARS}} for k in top]

    gap = pd.read_csv(ROOT / "data" / "processed" / "neglect_scores.csv")
    names = dict(zip(gap["location_code"], gap["location_name"]))
    us = {}
    for i, iso in enumerate(names, 1):
        row = {}
        for y in (2024, 2025):
            d = get(BASE.format(y=y) + f"&countryISO3={iso}", RAW / f"{y}_{iso}.json")
            if not d:
                row = None
                break
            row[str(y)] = round(singles(d).get("United States", 0))
            time.sleep(0.6)
        if row:
            us[iso] = row
        print(f"[{i}/{len(names)}] {iso}: {row}", flush=True)

    payload = {
        "generated": date.today().isoformat(), "years": YEARS, "partial_year": YEARS[-1],
        "source": "OCHA Financial Tracking Service (FTS) public API, flows grouped by donor country",
        "world_total": {str(y): round(sum(w.values())) for y, w in world.items()},
        "not_specified": {str(y): round(w.get("Not specified", 0)) for y, w in world.items()},
        "donors": donors, "us_by_crisis": us,
    }
    OUT.write_text("window.AIDGAP_TREND = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("Wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
