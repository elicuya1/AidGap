"""
AidGap - Step 11: build the "where to donate" list, keeping only pages that really load.

For each crisis we build candidate web addresses on the country pages of large, long-
established relief organisations (their country pages have donate buttons), then CHECK
every address and keep only the ones that answer. Nothing is typed in blind.

IMPORTANT: this is a list of places to start, NOT an endorsement or a rating. Before
giving, check an independent evaluator (Charity Navigator, CharityWatch) and read how
each organisation uses donations for that specific crisis.

Run:   python src/verify_links.py
Saves: data/reference/donate_links.csv  (every candidate, with its status and date)
       (the dashboard export keeps only rows with status "ok")
"""

import concurrent.futures as cf
import csv
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "reference" / "donate_links.csv"
# We say who we are. If a site refuses an honest request we simply leave its link out;
# we never disguise the client to get past a block.
UA = "AidGap-portfolio-project/0.1 (link check)"

# code -> (name, {org: slug on that org's site})
SLUGS = {
    "YEM": ("Yemen", "yemen"), "AFG": ("Afghanistan", "afghanistan"), "HND": ("Honduras", "honduras"),
    "MLI": ("Mali", "mali"), "BFA": ("Burkina Faso", "burkina-faso"), "NER": ("Niger", "niger"),
    "SYR": ("Syrian Arab Republic", "syria"), "MMR": ("Myanmar", "myanmar"), "SDN": ("Sudan", "sudan"),
    "COL": ("Colombia", "colombia"), "CMR": ("Cameroon", "cameroon"), "SSD": ("South Sudan", "south-sudan"),
    "SOM": ("Somalia", "somalia"), "VEN": ("Venezuela (Bolivarian Republic of)", "venezuela"),
    "COD": ("Democratic Republic of the Congo", "democratic-republic-congo"), "HTI": ("Haiti", "haiti"),
    "TCD": ("Chad", "chad"), "MOZ": ("Mozambique", "mozambique"), "NGA": ("Nigeria", "nigeria"),
    "CAF": ("Central African Republic", "central-african-republic"), "UKR": ("Ukraine", "ukraine"),
    "PSE": ("State of Palestine", "palestine"), "LBN": ("Lebanon", "lebanon"),
    "MDG": ("Madagascar", "madagascar"), "NPL": ("Nepal", "nepal"), "VNM": ("Viet Nam", "viet-nam"),
    "CUB": ("Cuba", "cuba"), "PAK": ("Pakistan", "pakistan"),
}
# Different organisations spell some countries differently.
UNICEF_SLUG = {"BFA": "burkinafaso", "SSD": "southsudan", "COD": "drcongo", "CAF": "car", "VNM": "vietnam",
               "SYR": "syria", "PSE": "state-of-palestine", "VEN": "venezuela"}
WFP_SLUG = {"COD": "democratic-republic-congo", "PSE": "palestine", "VNM": "viet-nam", "SYR": "syrian-arab-republic"}
IRC_SLUG = {"COD": "democratic-republic-congo", "SYR": "syria", "PSE": "israel-and-occupied-palestinian-territory"}
UNHCR_SLUG = {"COD": "democratic-republic-congo", "SYR": "syria", "PSE": "palestine", "VNM": "viet-nam"}

ORGS = [
    ("UNICEF", "Children: health, nutrition, water, schooling", lambda c, s: f"https://www.unicef.org/{UNICEF_SLUG.get(c, s.replace('-', ''))}"),
    ("World Food Programme", "Food and nutrition assistance", lambda c, s: f"https://www.wfp.org/countries/{WFP_SLUG.get(c, s)}"),
    ("International Rescue Committee", "Health, safety and cash support for families", lambda c, s: f"https://www.rescue.org/country/{IRC_SLUG.get(c, s)}"),
    ("Doctors Without Borders (MSF)", "Emergency medical care", lambda c, s: f"https://www.msf.org/{MSF_SLUG.get(c, s)}"),
]
MSF_SLUG = {"COD": "drc", "SYR": "syria", "PSE": "palestine", "VNM": "vietnam", "CAF": "central-african-republic"}
# Extra, country-specific organisations.
EXTRA = {
    "PSE": [("UNRWA", "Palestine refugees: food, health, schooling", "https://www.unrwa.org/donate")],
    "LBN": [("UNRWA", "Palestine refugees in Lebanon", "https://www.unrwa.org/donate")],
    "SYR": [("UNRWA", "Palestine refugees in Syria", "https://www.unrwa.org/donate")],
}
# Not tied to one country: how to give wisely.
GENERAL = [
    ("Charity Navigator", "Independent charity ratings: check before you give", "https://www.charitynavigator.org/"),
    ("CharityWatch", "Independent charity watchdog", "https://www.charitywatch.org/"),
    ("OCHA Financial Tracking Service", "See exactly who has funded each appeal", "https://fts.unocha.org/"),
]


def check(url: str):
    """-> (status, final_url). 'ok' only for a normal page after redirects."""
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "text/html"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return ("ok" if 200 <= r.status < 300 else f"http {r.status}"), r.geturl()
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (403, 405, 400, 404):
                continue                     # some sites refuse HEAD; try a normal GET
            return f"http {e.code}", url
        except (urllib.error.URLError, TimeoutError) as e:
            return f"error {type(e).__name__}", url
    return "failed", url


def main() -> None:
    today = date.today().isoformat()
    rows = []
    for code, (name, slug) in SLUGS.items():
        for org, what, build in ORGS:
            rows.append({"location_code": code, "location_name": name, "org": org, "what": what,
                         "url": build(code, slug), "kind": "country"})
    for code, items in EXTRA.items():
        for org, what, url in items:
            rows.append({"location_code": code, "location_name": SLUGS[code][0], "org": org,
                         "what": what, "url": url, "kind": "country"})
    for org, what, url in GENERAL:
        rows.append({"location_code": "ALL", "location_name": "All crises", "org": org, "what": what,
                     "url": url, "kind": "general"})

    print(f"Checking {len(rows)} addresses...", flush=True)
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(lambda r: check(r["url"]), rows))
    for r, (status, final) in zip(rows, results):
        r["status"], r["final_url"], r["checked"] = status, final, today

    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

    ok = [r for r in rows if r["status"] == "ok"]
    print(f"\n{len(ok)} of {len(rows)} addresses load. Not loading:")
    for r in rows:
        if r["status"] != "ok":
            print(f"  {r['status']:<14} {r['org']:<32} {r['location_name']}: {r['url']}")
    per = {}
    for r in ok:
        if r["kind"] == "country":
            per[r["location_name"]] = per.get(r["location_name"], 0) + 1
    print("\nLinks that work per country:", dict(sorted(per.items(), key=lambda kv: kv[1])))


if __name__ == "__main__":
    main()
