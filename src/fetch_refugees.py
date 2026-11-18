"""
AidGap - Step 12: countries that host refugees (the 17 countries with only a regional refugee plan).

Why a separate step: these countries have no national plan, so there is no "people in need" figure
and they cannot be scored fairly next to the 28 ranked crises. Instead we count the people the
UN refugee agency (UNHCR) records as hosted there and compare that with the appeal money.

Sources (both free, no key):
  * UNHCR Refugee Data Finder API  https://api.unhcr.org/population/v1/population/
      refugees + asylum-seekers + "others in need of international protection" (this last group is
      where most Venezuelans abroad are counted) living in each host country at the end of the year.
  * Appeal requirements and funding: data/processed/gap_table.csv (OCHA FTS via HDX HAPI).

Honest limits (also shown on the page):
  * UNHCR counts people, the plan counts a target group that can be different (it may also include
    host communities). "$ per person hosted" is therefore a rough comparison, not a score.
  * Iran's 2026 plan is a short flash plan (March to May 2026).

Run:   python src/fetch_refugees.py
Saves: data/raw/unhcr/<ISO3>.json (cache), dashboard/refugees.js
"""
import json
import time
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "unhcr"
OUT = ROOT / "dashboard" / "refugees.js"
YEAR = 2025
API = "https://api.unhcr.org/population/v1/population/?year={y}&coa={iso}&coo_all=true&limit=1000"
# UNHCR uses its own three-letter codes for a few countries (ISO code -> UNHCR code)
UNHCR_CODE = {"CRI": "COS", "URY": "URU", "PRY": "PAR", "TTO": "TRT"}
UA = {"User-Agent": "AidGap-portfolio-project/0.1"}


def num(v) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0          # UNHCR uses "-" for "no data"


def get(iso: str):
    f = RAW / f"{iso}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(API.format(y=YEAR, iso=UNHCR_CODE.get(iso, iso)), headers=UA), timeout=60) as r:
                d = json.loads(r.read().decode("utf-8"))
            if "items" in d:
                f.write_text(json.dumps(d), encoding="utf-8")
                return d
        except Exception as e:
            print("  retry", iso, type(e).__name__, flush=True)
        time.sleep(4 * (attempt + 1))
    return None


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    g = pd.read_csv(ROOT / "data" / "processed" / "gap_table.csv")
    n = pd.read_csv(ROOT / "data" / "processed" / "neglect_scores.csv")
    hosts = g[~g["location_code"].isin(n["location_code"])]
    out = []
    for _, r in hosts.iterrows():
        iso = r["location_code"]
        d = get(iso)
        if not d:
            print(iso, "no data"); continue
        ref = asy = oip = 0
        origins = {}
        for i in d["items"]:
            a, b, c = num(i.get("refugees")), num(i.get("asylum_seekers")), num(i.get("oip"))
            ref += a; asy += b; oip += c
            origins[i.get("coo_name") or "Unknown"] = origins.get(i.get("coo_name") or "Unknown", 0) + a + b + c
        total = ref + asy + oip
        top = sorted(origins.items(), key=lambda kv: -kv[1])[:3]
        out.append({
            "code": iso, "name": r["location_name"], "plan": r["appeal_types"],
            "requirements_usd": round(float(r["requirements_usd"])), "funding_usd": round(float(r["funding_usd"])),
            "funding_pct": round(float(r["funding_pct"]), 1),
            "refugees": ref, "asylum_seekers": asy, "oip": oip, "hosted": total,
            "origins": [{"name": k, "n": v} for k, v in top if v > 0],
        })
        print(f"{iso}: {total:,} hosted, ${r['funding_usd']/1e6:,.0f}M of ${r['requirements_usd']/1e6:,.0f}M", flush=True)
        time.sleep(0.5)
    payload = {"generated": date.today().isoformat(), "unhcr_year": YEAR, "year": int(g["year"].max()),
               "source": "UNHCR Refugee Data Finder (population statistics) and OCHA FTS", "hosts": out}
    OUT.write_text("window.AIDGAP_HOSTS = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("Wrote", OUT.relative_to(ROOT), len(out), "countries")


if __name__ == "__main__":
    main()
