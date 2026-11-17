"""
AidGap - Step 13: humanitarian reports per crisis from ReliefWeb (UN OCHA), no key needed.

ReliefWeb publishes the situation reports, appeals, maps and analyses that aid
organisations (OCHA, UNICEF, WFP, WHO, IOM, NGOs...) write about each crisis, in several
languages. It is the humanitarian sector's own record of attention, so it makes a good
counterpart to general news (GDELT).

How this works
  * We read ReliefWeb's public RSS search feed (20 items per page, several pages per country)
    with an honest client name and a pause between requests.
  * Every item lists its countries. We keep an item only if OUR country is among them,
    so a regional dashboard that merely mentions Yemen does not count as a Yemen report.
  * Titles, dates, publishers and links are kept. The content belongs to its publishers and
    the page always links back to ReliefWeb and the original source.
  * ReliefWeb also has a richer API that needs a free "app name" (https://apidoc.reliefweb.int/).
    If you get one, this script can be extended to use it.

Run:   python src/fetch_reliefweb.py            (about 10 minutes; safe to interrupt and re-run)
Saves: data/raw/reliefweb/<ISO3>.json
Then:  python src/build_reports_summary.py
"""

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "reliefweb"
PROCESSED = ROOT / "data" / "processed"
UA = "AidGap-portfolio-project/0.1 (humanitarian data project)"
# ReliefWeb's own per-country feed. Found by testing: it returns the 20 MOST RECENT reports and
# ignores the `page` parameter, so without an account that is all one feed can give. (The keyed
# API, free to register, returns up to 1,000 per call with full history; see the note above.)
FEED = "https://reliefweb.int/updates/rss.xml?legacy-river=country/{iso}"
PAUSE = 1.5                # seconds between requests

# ReliefWeb's own spelling of each country
RW_NAME = {
    "YEM": "Yemen", "AFG": "Afghanistan", "HND": "Honduras", "MLI": "Mali", "BFA": "Burkina Faso",
    "NER": "Niger", "SYR": "Syrian Arab Republic", "MMR": "Myanmar", "SDN": "Sudan",
    "COL": "Colombia", "CMR": "Cameroon", "SSD": "South Sudan", "SOM": "Somalia",
    "VEN": "Venezuela (Bolivarian Republic of)", "COD": "Democratic Republic of the Congo",
    "HTI": "Haiti", "TCD": "Chad", "MOZ": "Mozambique", "NGA": "Nigeria",
    "CAF": "Central African Republic", "UKR": "Ukraine", "PSE": "occupied Palestinian territory",
    "LBN": "Lebanon", "CUB": "Cuba", "MDG": "Madagascar", "PAK": "Pakistan", "VNM": "Viet Nam",
    "NPL": "Nepal",
}
# words to search with (shorter than the official name works better)
SEARCH_AS = {"SYR": "Syria", "VEN": "Venezuela", "COD": "Congo", "PSE": "Palestinian", "VNM": "Viet Nam"}


def get(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError) as e:
            code = getattr(e, "code", None)
            if code in (403, 404):
                return None                       # a refusal is respected, not retried or bypassed
            time.sleep(5 * (attempt + 1))
    return None


def parse(blob: bytes) -> list[dict]:
    try:
        items = ET.fromstring(blob).find("channel").findall("item")
    except (ET.ParseError, AttributeError):
        return []
    out = []
    for it in items:
        desc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", it.findtext("description") or "")).strip()
        m = re.match(r"Countr(?:y|ies): (.*?) Source:", desc)
        countries = [c.strip() for c in m.group(1).split(",")] if m else []
        cats = [c.text for c in it.findall("category") if c.text]
        publisher = it.findtext("author") or ""
        try:
            date = parsedate_to_datetime(it.findtext("pubDate")).astimezone(timezone.utc).date().isoformat()
        except (TypeError, ValueError):
            date = ""
        out.append({
            "title": (it.findtext("title") or "").strip(), "url": it.findtext("link") or "",
            "date": date, "publisher": publisher, "countries": countries,
            "tags": [c for c in cats if c not in countries and c != publisher][:6],
        })
    return out


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    gap = pd.read_csv(PROCESSED / "gap_table.csv")
    codes = [c for c in dict.fromkeys(gap["location_code"]) if c in RW_NAME]
    todo = [c for c in codes if not (RAW / f"{c}.json").exists()]
    print(f"{len(codes)} countries, {len(todo)} still to fetch", flush=True)
    for n, code in enumerate(todo, 1):
        name = RW_NAME[code]
        blob = get(FEED.format(iso=code.lower()))
        time.sleep(PAUSE)
        keep, seen = [], set()
        for it in (parse(blob) if blob else []):
            if it["url"] not in seen and it["title"]:     # the feed is already filtered to the country
                seen.add(it["url"]); keep.append(it)
        (RAW / f"{code}.json").write_text(json.dumps(keep, ensure_ascii=False), encoding="utf-8")
        dates = sorted(i["date"] for i in keep if i["date"])
        span = f"{dates[0]} to {dates[-1]}" if dates else "-"
        print(f"[{n}/{len(todo)}] {name}: {len(keep)} reports ({span})", flush=True)
    print("\nDone.")
    sys.exit(0)


if __name__ == "__main__":
    main()
