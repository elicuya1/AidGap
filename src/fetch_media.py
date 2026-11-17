"""
AidGap - Step 7: media coverage per crisis (GDELT DOC 2.0 API, free, no key).

For each crisis we ask GDELT three things about HUMANITARIAN-framed English-language
news from the last ~3 months (GDELT's rolling window):
  1. volume  - how many articles, and what share of ALL monitored coverage
  2. tone    - average tone (negative = bleak wording)
  3. articles- a sample of recent articles (title, outlet, source country)

GDELT allows about one request per 5 seconds and is often busier than that, so this
script is deliberately slow and patient: it waits between requests, backs off when
told "too many requests", and saves every answer in data/raw/media/ so you can stop
and re-run it any time without starting over.

Run:  python src/fetch_media.py            (takes ~20-30 minutes; safe to interrupt)
Then: python src/build_media_summary.py
"""

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "media"
PROCESSED = ROOT / "data" / "processed"
API = "https://api.gdeltproject.org/api/v2/doc/doc"

GAP_BETWEEN_CALLS = 11      # seconds (GDELT asks for >= 5)
BACKOFF = [30, 60, 120, 240]  # seconds to wait after a "too many requests" answer

# Humanitarian framing: we measure coverage of the CRISIS, not any mention of the country.
CONTEXT = ('(humanitarian OR famine OR hunger OR refugees OR displaced '
           'OR "food insecurity" OR "aid agencies")')

# Search terms per country. Some names are ambiguous, so they get extra care.
TERMS = {
    "YEM": '"Yemen"', "AFG": '"Afghanistan"', "HND": '"Honduras"', "MLI": '"Mali"',
    "BFA": '"Burkina Faso"', "NER": '"Niger"', "SYR": '"Syria"',
    "MMR": "(Myanmar OR Burma)", "SDN": '"Sudan" -"South Sudan"',
    "COL": '"Colombia"', "CMR": '"Cameroon"', "SSD": '"South Sudan"',
    "SOM": '"Somalia"', "VEN": '"Venezuela"',
    "COD": '("DR Congo" OR "Democratic Republic of Congo" OR "Democratic Republic of the Congo" OR DRC)',
    "HTI": '"Haiti"', "TCD": '"Chad"', "MOZ": '"Mozambique"', "NGA": '"Nigeria"',
    "CAF": '"Central African Republic"', "UKR": '"Ukraine"',
    # appeals we cannot score (no needs data) still get media numbers
    "PSE": '(Gaza OR "West Bank" OR Palestinian)', "LBN": '"Lebanon"', "CUB": '"Cuba"',
    "MDG": '"Madagascar"', "PAK": '"Pakistan"', "VNM": "(Vietnam OR \"Viet Nam\")",
    "NPL": '"Nepal"',
}

MODES = {
    "volume":   {"mode": "timelinevolraw", "timespan": "3months"},
    "tone":     {"mode": "timelinetone",   "timespan": "3months"},
    "articles": {"mode": "artlist",        "timespan": "1month", "maxrecords": "250",
                 "sort": "hybridrel"},
}


def ask(code: str, key: str):
    """One GDELT request with patient retries. Returns parsed JSON or None."""
    spec = MODES[key]
    params = {"query": f"{TERMS[code]} {CONTEXT} sourcelang:english",
              "format": "json", **spec}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "AidGap-portfolio-project/0.1"})
    for attempt in range(len(BACKOFF) + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                text = resp.read().decode("utf-8", errors="replace")
            if text.lstrip().startswith(("{", "[")):
                return json.loads(text)      # may be {} = "nothing found"
            reason = "rate limited"          # GDELT answers plain text when busy
        except urllib.error.HTTPError as e:
            reason = f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            reason = type(e).__name__
        if attempt < len(BACKOFF):
            print(f"    {reason}; waiting {BACKOFF[attempt]}s then retrying", flush=True)
            time.sleep(BACKOFF[attempt])
    return None


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    scores = pd.read_csv(PROCESSED / "neglect_scores.csv")
    unranked = pd.read_csv(PROCESSED / "unranked_appeals.csv")
    names = dict(zip(scores["location_code"], scores["location_name"]))
    gap = pd.read_csv(PROCESSED / "gap_table.csv")
    names.update(dict(zip(gap["location_code"], gap["location_name"])))
    wanted = list(scores["location_code"]) + [
        c for c in gap.loc[gap["location_name"].isin(unranked["location_name"]), "location_code"]]
    wanted = [c for c in dict.fromkeys(wanted) if c in TERMS]

    # Article lists first (they work reliably); volume and tone are a bonus pass.
    jobs = [(c, k) for k in ("articles", "volume", "tone") for c in wanted]
    todo = [(c, k) for c, k in jobs if not (RAW / f"{c}_{k}.json").exists()]
    print(f"{len(wanted)} countries, {len(jobs)} requests, {len(todo)} still to fetch "
          f"(~{len(todo) * GAP_BETWEEN_CALLS // 60} min minimum)", flush=True)

    for n, (code, key) in enumerate(todo, 1):
        print(f"[{n}/{len(todo)}] {names.get(code, code)} - {key}", flush=True)
        data = ask(code, key)
        if data is None:
            print("    gave up for now (will retry next run)", flush=True)
        elif not data and key != "articles":
            # GDELT sometimes answers {} to timeline requests: that is "no data",
            # not a result, so do NOT save it (a later run will try again).
            print("    empty answer - not saved", flush=True)
        else:
            (RAW / f"{code}_{key}.json").write_text(json.dumps(data), encoding="utf-8")
        time.sleep(GAP_BETWEEN_CALLS)

    missing = [(c, k) for c, k in jobs if not (RAW / f"{c}_{k}.json").exists()]
    print("\nDone." if not missing else f"\n{len(missing)} requests missing - just run this script again.")
    sys.exit(0)


if __name__ == "__main__":
    main()
