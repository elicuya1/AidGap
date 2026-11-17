"""
AidGap - Step 10: who pays for each crisis (donor countries -> recipient crisis).

Source: OCHA Financial Tracking Service (FTS) public API
        https://api.hpc.tools/v1/public/fts/flow   (free, no key)
We ask for ALL funding flows reaching each country in the current year, grouped by the
country the money comes from. This is wider than the appeal totals in the main
pipeline: it also includes money given outside the formal appeal, so the two numbers
will not match exactly. "Not specified" means FTS has no donor country for that money
(often pooled funds, private donors or un-itemised contributions).

Run:   python src/fetch_donors.py
Saves: data/raw/donors/<ISO3>.json   (cache, one file per country)
       dashboard/donors.js            (what the web page reads)
"""

import json
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "donors"
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "dashboard" / "donors.js"
API = "https://api.hpc.tools/v1/public/fts/flow?year={year}&countryISO3={iso}&groupby=country"
TOP_PER_COUNTRY = 8


def fetch(iso: str, year: int):
    f = RAW / f"{iso}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    req = urllib.request.Request(API.format(year=year, iso=iso),
                                 headers={"User-Agent": "AidGap-portfolio-project/0.1"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read().decode("utf-8"))
            if data.get("status") == "ok":
                f.write_text(json.dumps(data), encoding="utf-8")
                return data
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            print(f"    {iso}: {type(e).__name__}, retrying", flush=True)
        time.sleep(5 * (attempt + 1))
    return None


def donors_of(data: dict) -> tuple[dict[str, float], float]:
    """(donor name -> USD, shared USD).

    Only money given to THIS country alone ("single" flows) is counted per donor.
    Money given to several countries at once ("shared" flows) is returned separately:
    the API reports it in full for every country it touches, so adding it per country
    would double-count (it made Japan look like the top donor to Argentina)."""
    totals: dict[str, float] = {}
    shared = 0.0
    for obj in data["data"]["report1"]["fundingTotals"]["objects"]:
        for x in obj.get("singleFundingObjects", []):
            name = x.get("name") or "Not specified"
            totals[name] = totals.get(name, 0) + (x.get("totalFunding") or 0)
        for x in obj.get("sharedFundingObjects", []):
            shared += x.get("onBoundaryFunding") or 0
    return {k: v for k, v in totals.items() if v > 0}, shared


def is_domestic(donor: str, recipient: str) -> bool:
    """True when the 'donor' is the recipient's own government (e.g. Pakistan -> Pakistan)."""
    a, b = donor.lower().strip(), recipient.lower().strip()
    return (a == b or b.startswith(a + " (") or b.startswith(a + " ")
            or ("palestin" in a and "palestin" in b))


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    gap = pd.read_csv(PROCESSED / "gap_table.csv")
    year = int(gap["year"].max())
    codes = list(dict.fromkeys(gap["location_code"]))
    names = dict(zip(gap["location_code"], gap["location_name"]))
    print(f"{len(codes)} countries, year {year}", flush=True)

    by_code, grand = {}, {}
    for i, iso in enumerate(codes, 1):
        data = fetch(iso, year)
        if not data:
            print(f"[{i}/{len(codes)}] {iso}: no data", flush=True)
            continue
        d, shared = donors_of(data)
        # A country's own government spending on its own response is not cross-border
        # aid, so keep it out of the donor list and report it separately.
        domestic = sum(v for k, v in d.items() if is_domestic(k, names.get(iso, "")))
        d = {k: v for k, v in d.items() if not is_domestic(k, names.get(iso, ""))}
        total = sum(d.values())
        if total <= 0:
            continue
        named = sorted(((k, v) for k, v in d.items() if k != "Not specified"), key=lambda kv: -kv[1])
        top = named[:TOP_PER_COUNTRY]
        other = sum(v for _, v in named[TOP_PER_COUNTRY:])
        by_code[iso] = {
            "total": round(total),
            "top": [{"donor": k, "usd": round(v), "share": round(v / total, 4)} for k, v in top],
            "other": round(other),
            "not_specified": round(d.get("Not specified", 0)),
            "shared": round(shared),      # given to several countries at once (not split by donor here)
            "domestic": round(domestic),  # the country's own government (excluded from the donor list)
        }
        for k, v in named:
            g = grand.setdefault(k, {"total": 0, "to": {}})
            g["total"] += v
            g["to"][iso] = round(v)
        print(f"[{i}/{len(codes)}] {iso}: ${total/1e6:,.0f}M from {len(named)} donors "
              f"(top: {top[0][0] if top else '-'})", flush=True)
        time.sleep(0.6)

    donors = sorted(grand.items(), key=lambda kv: -kv[1]["total"])[:14]
    payload = {
        "generated": date.today().isoformat(), "year": year,
        "source": "OCHA Financial Tracking Service (FTS) public API, flows grouped by donor country",
        "byCode": by_code,
        "donors": [{"name": k, "total": round(v["total"]), "to": v["to"]} for k, v in donors],
    }
    OUT.write_text("window.AIDGAP_DONORS = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"\nWrote {OUT.relative_to(ROOT)}: {len(by_code)} countries, top donors: "
          + ", ".join(d['name'] for d in payload['donors'][:6]))


if __name__ == "__main__":
    main()
