"""
AidGap - Step 13b: humanitarian reports per crisis from the ReliefWeb API (UN OCHA), keyed version.

Replaces the RSS feed (which only held the latest 20 reports per country) with the real API:
EVERY report published about each crisis country in the last WINDOW_DAYS days, with its
language, source and themes. The weekly attention rate is then a true count, not an estimate.

Needs the approved app name in src/config_local.py (git-ignored):
    RELIEFWEB_APPNAME = "..."

Rules we keep: honest User-Agent, a pause between requests, small number of requests (about 1-3
per country), titles/dates/sources/links only (the content belongs to its publishers).
A country counts when it is listed among a report's countries (same rule as the old feed), so a
regional report that names Yemen counts for Yemen.

Run:   python src/fetch_reliefweb_api.py          (about 1 minute)
Saves: data/raw/reliefweb/<ISO3>.json  (list of reports, same shape as the old feed files)
       data/raw/reliefweb/_meta.json   (window used, so the summary knows how to compute the rate)
Then:  python src/build_reports_summary.py
"""
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
RAW = ROOT / "data" / "raw" / "reliefweb"
PROCESSED = ROOT / "data" / "processed"
UA = "AidGap-portfolio-project/0.1 (humanitarian data project; https://github.com/elicuya1/AidGap)"
API = "https://api.reliefweb.int/v2/reports?appname={app}"
WINDOW_DAYS = 90
PAGE = 1000          # the API maximum per call
PAUSE = 1.0


def appname() -> str:
    try:
        import config_local
        return config_local.RELIEFWEB_APPNAME
    except (ImportError, AttributeError):
        raise SystemExit("Put RELIEFWEB_APPNAME = \"...\" in src/config_local.py first.")


def post(app: str, body: dict):
    req = urllib.request.Request(API.format(app=app), data=json.dumps(body).encode(), method="POST",
                                 headers={"User-Agent": UA, "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise SystemExit(f"ReliefWeb refused the request (HTTP {e.code}). Check the app name; not retrying.")
            time.sleep(5 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError):
            time.sleep(5 * (attempt + 1))
    return None


def fetch_country(app: str, iso: str, since: str):
    out, offset, total = [], 0, None
    while True:
        body = {
            "limit": PAGE, "offset": offset,
            "sort": ["date.original:desc"],
            "fields": {"include": ["title", "url_alias", "date.original", "source.name", "country.name",
                                    "theme.name", "language.code"]},
            "filter": {"operator": "AND", "conditions": [
                {"field": "country.iso3", "value": iso.lower()},
                {"field": "date.original", "value": {"from": since}},
            ]},
        }
        d = post(app, body)
        time.sleep(PAUSE)
        if not d or "data" not in d:
            return None
        total = d.get("totalCount", 0)
        for x in d["data"]:
            f = x["fields"]
            out.append({
                "title": (f.get("title") or "").strip(), "url": f.get("url_alias", ""),
                "date": (f.get("date", {}).get("original") or "")[:10],
                "publisher": (f.get("source") or [{}])[0].get("name", ""),
                "countries": [c["name"] for c in f.get("country", [])],
                "tags": [t["name"] for t in f.get("theme", [])][:6],
                "lang": (f.get("language") or [{}])[0].get("code", ""),
            })
        offset += PAGE
        if offset >= total or not d["data"]:
            return out, total


def main() -> None:
    app = appname()
    RAW.mkdir(parents=True, exist_ok=True)
    since = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%dT00:00:00+00:00")
    gap = pd.read_csv(PROCESSED / "gap_table.csv")
    codes = [c for c in dict.fromkeys(gap["location_code"]) if c in set(pd.read_csv(PROCESSED / "neglect_scores.csv")["location_code"])]
    print(f"{len(codes)} countries, reports since {since[:10]} ({WINDOW_DAYS} days)", flush=True)
    for n, code in enumerate(codes, 1):
        res = fetch_country(app, code, since)
        if not res:
            print(f"[{n}/{len(codes)}] {code}: failed, skipped", flush=True)
            continue
        items, total = res
        seen, keep = set(), []
        for it in items:
            if it["url"] and it["url"] not in seen and it["title"]:
                seen.add(it["url"]); keep.append(it)
        (RAW / f"{code}.json").write_text(json.dumps(keep, ensure_ascii=False), encoding="utf-8")
        print(f"[{n}/{len(codes)}] {code}: {len(keep)} reports (API total {total})", flush=True)
    (RAW / "_meta.json").write_text(json.dumps({"mode": "api", "window_days": WINDOW_DAYS,
                                                 "fetched": datetime.now(timezone.utc).date().isoformat()}), encoding="utf-8")
    print("\nDone.")


if __name__ == "__main__":
    main()
