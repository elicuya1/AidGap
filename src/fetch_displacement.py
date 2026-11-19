"""
AidGap - Step 18: how many people are displaced FROM each crisis country, and what share of its population.

Sources (both free, no key):
  * UNHCR Refugee Data Finder API (https://api.unhcr.org/population/v1/): for each country of ORIGIN, the people
    displaced abroad (refugees + asylum-seekers + others in need of international protection) and the people
    displaced inside the country (IDPs), end of 2025.
  * World Bank indicator SP.POP.TOTL: total population (latest year), to turn the count into a share, and
    NY.GDP.PCAP.CD: GDP per person in current US dollars (latest year), a rough sign of a country's own resources.

Honest limits (shown on the page):
  * UNHCR does not count Palestinian refugees registered with UNRWA, so Palestine's figure is not comparable;
    it is left out (the score then rests on its other measures).
  * UNHCR counts depend on what governments and agencies report; some IDP figures are old.
  * UNHCR uses its own country codes, so we map them from the official list (/countries).

Run:   python src/fetch_displacement.py
Saves: data/raw/unhcr_origin/<ISO3>.json (cache), data/processed/displacement.csv
"""
import json
import time
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "unhcr_origin"
OUT = ROOT / "data" / "processed" / "displacement.csv"
YEAR = 2025
UA = {"User-Agent": "AidGap-portfolio-project/0.1"}
NOT_COMPARABLE = {"PSE"}          # Palestinians registered with UNRWA are not in UNHCR's figures


def get(url: str):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90))


def num(v) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    codes = {i["iso"]: i["code"] for i in get("https://api.unhcr.org/population/v1/countries/?limit=400")["items"] if i.get("iso")}
    iso_list = list(pd.read_csv(ROOT / "data" / "processed" / "neglect_scores.csv")["location_code"])
    pop = {}
    wb = get("https://api.worldbank.org/v2/country/" + ";".join(iso_list) + "/indicator/SP.POP.TOTL?mrnev=1&format=json&per_page=100")
    for r in wb[1]:
        if r.get("value"):
            pop[r["countryiso3code"]] = (r["value"], r["date"])
    gdp = {}
    g = get("https://api.worldbank.org/v2/country/" + ";".join(iso_list) + "/indicator/NY.GDP.PCAP.CD?mrnev=1&format=json&per_page=100")
    for r in g[1]:
        if r.get("value"):
            gdp[r["countryiso3code"]] = (r["value"], r["date"])
    rows = []
    for iso in iso_list:
        f = RAW / f"{iso}.json"
        if f.exists():
            d = json.loads(f.read_text(encoding="utf-8"))
        else:
            d = get(f"https://api.unhcr.org/population/v1/population/?year={YEAR}&coo={codes.get(iso, iso)}&coa_all=true&limit=1000")
            f.write_text(json.dumps(d), encoding="utf-8")
            time.sleep(0.6)
        it = d.get("items", [])
        abroad = sum(num(i["refugees"]) + num(i["asylum_seekers"]) + num(i["oip"]) for i in it)
        idps = sum(num(i["idps"]) for i in it)
        p = pop.get(iso)
        comparable = iso not in NOT_COMPARABLE and len(it) > 0
        rows.append({"iso3": iso, "displaced_abroad": abroad, "idps": idps, "displaced_total": abroad + idps,
                     "population": p[0] if p else None, "population_year": p[1] if p else None,
                     "displaced_share": round((abroad + idps) / p[0], 4) if (p and comparable) else None,
                     "comparable": comparable,
                     "gdp_per_capita": round(gdp[iso][0]) if iso in gdp else None, "gdp_year": gdp[iso][1] if iso in gdp else None})
        print(f"{iso}: abroad {abroad:,} + inside {idps:,}" + (f" = {rows[-1]['displaced_share']:.1%} of population" if rows[-1]["displaced_share"] is not None else " (not comparable / no data)"), flush=True)
    pd.DataFrame(rows).to_csv(OUT, index=False)
    print("Wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
