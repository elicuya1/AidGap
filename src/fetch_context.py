"""
AidGap - Step 16: collect the "crisis overview" text from OCHA's 2026 country plans.

Source: humanitarianaction.info (OCHA's plan tracker). Each 2026 country plan has an
overview article that explains the crisis in a few paragraphs. We download it (honest client
name, pause between requests) so the one-paragraph summaries on the dashboard can be written
FROM A SOURCE instead of from memory. The raw text is kept in data/raw/context/ (not committed);
the summaries we write from it live in data/reference/country_context.csv (committed, with the
source link and the date) and are paraphrased, never copied.

Countries without an OCHA plan page (Nepal) get no summary from this source.

Run:  python src/fetch_context.py
"""

import html
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "context"
UA = "AidGap-portfolio-project/0.1 (humanitarian data project)"
BASE = "https://humanitarianaction.info"

NAME_TO_CODE = {
    "Afghanistan": "AFG", "Burkina Faso": "BFA", "Cameroon": "CMR", "Central African Republic": "CAF",
    "Chad": "TCD", "Colombia": "COL", "Cuba": "CUB", "Democratic Republic of the Congo": "COD",
    "Haiti": "HTI", "Honduras": "HND", "Lebanon": "LBN", "Madagascar": "MDG", "Mali": "MLI",
    "Mozambique": "MOZ", "Myanmar": "MMR", "Niger": "NER", "Nigeria": "NGA",
    "Occupied Palestinian Territory": "PSE", "Pakistan": "PAK", "Somalia": "SOM",
    "South Sudan": "SSD", "Sudan": "SDN", "Syrian Arab Republic": "SYR", "Ukraine": "UKR",
    "Venezuela": "VEN", "Viet Nam (Multiple Typhoons 2025-2026)": "VNM", "Yemen": "YEM",
}


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")


def text_of(page: str) -> str:
    body = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", page, flags=re.S)
    return html.unescape(re.sub(r"\s+", " ", body)).replace("�", "'")


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    home = get(f"{BASE}/plan/1520")                       # any plan page lists all country plans in its menu
    plans = {}
    for name, code in NAME_TO_CODE.items():
        m = re.search(r'href="(/plan/\d+)"[^>]*>\s*' + re.escape(name) + r"\s*<", home)
        if m:
            plans[code] = (name, m.group(1))
    print(f"{len(plans)} country plans found in the menu", flush=True)
    for code, (name, path) in plans.items():
        out = RAW / f"{code}.txt"
        if out.exists():
            continue
        try:
            plan = get(BASE + path)
            pid = path.rsplit("/", 1)[-1]
            cands = re.findall(r'href="(/plan/' + pid + r'(?:/document/[^"/#]+)?/article/[^"#]+)', plan)
            pref = ("overview", "apercu", "aperçu", "crisis", "context", "resumen", "panorama", "situation")
            pick = next((c for k in pref for c in cands if k in c.lower()), cands[0] if cands else None)
            if not pick:
                print(f"  {name}: no overview article", flush=True)
                continue
            link = type("L", (), {"group": lambda self, n=1, p=pick: p})()
            art = text_of(get(BASE + link.group(1)))
            i = re.search(r"Crisis overview|Context|Overview of the crisis", art, re.I)
            start = i.start() if i else art.find("Share on Twitter")
            out.write_text(f"{BASE}{link.group(1)}\n{art[start:start + 3200]}", encoding="utf-8")
            print(f"  {name}: saved {len(art[start:start + 3200])} chars", flush=True)
        except Exception as e:                            # noqa: BLE001
            print(f"  {name}: {type(e).__name__} {e}", flush=True)
        time.sleep(1.2)


if __name__ == "__main__":
    main()
