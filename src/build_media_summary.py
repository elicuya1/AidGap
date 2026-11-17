"""
AidGap - Step 9: summarise the media coverage for the dashboard.

Reads  data/raw/media/*.json      (from fetch_media.py)
Writes dashboard/media.js         (what the web page shows)

What this measures (and what it does NOT):
  * WHO covers each crisis: which countries the outlets are based in, which outlets
    appear most, and how much comes from state-linked outlets.
  * It is a SAMPLE (GDELT returns at most 250 articles per request), so it shows the
    mix of coverage, not the total amount.
  * "State-linked" means an outlet that is owned, funded or controlled by a government
    (state news agencies, state broadcasters). It describes OWNERSHIP, not accuracy.
    The list below is short and incomplete, so shares are a LOWER bound.
  * It cannot tell whether any article is propaganda. That needs reading the articles
    (a case study), not a statistic.

Run:  python src/build_media_summary.py
"""

import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "media"
PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "dashboard" / "media.js"

# domain -> the government it is linked to. Ownership/funding only; extend as needed.
STATE_LINKED = {
    "rt.com": "Russia", "sputnikglobe.com": "Russia", "sputniknews.com": "Russia",
    "tass.com": "Russia", "ria.ru": "Russia",
    "xinhuanet.com": "China", "news.cn": "China", "cgtn.com": "China",
    "globaltimes.cn": "China", "chinadaily.com.cn": "China", "en.people.cn": "China",
    "presstv.ir": "Iran", "irna.ir": "Iran", "tehrantimes.com": "Iran",
    "mehrnews.com": "Iran", "tasnimnews.com": "Iran",
    "aa.com.tr": "Turkey", "trtworld.com": "Turkey",
    "aljazeera.com": "Qatar", "qna.org.qa": "Qatar",
    "voanews.com": "United States", "spa.gov.sa": "Saudi Arabia", "wam.ae": "UAE",
    "kuna.net.kw": "Kuwait", "ukrinform.net": "Ukraine",
}

MAX_ARTICLES = 30


def state_link(domain: str):
    d = domain.lower().removeprefix("www.")
    for known, gov in STATE_LINKED.items():
        if d == known or d.endswith("." + known):
            return gov
    return None


def clean_title(t: str) -> str:
    t = re.sub(r"\s+([,.;:!?%])", r"\1", t or "").strip()   # GDELT puts spaces before punctuation
    return re.sub(r"\s{2,}", " ", t)


def parse_date(s: str) -> str:
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if s and len(s) >= 8 else ""


def summarise_articles(data: dict) -> dict | None:
    arts = data.get("articles") or []
    if not arts:
        return None
    seen, uniq = set(), []
    for a in arts:                                   # drop repeated headlines
        key = re.sub(r"\W+", "", (a.get("title") or "").lower())[:80]
        if key and key not in seen and str(a.get("url", "")).startswith(("http://", "https://")):
            seen.add(key); uniq.append(a)

    n = len(uniq)
    countries = Counter(a.get("sourcecountry") or "Unknown" for a in uniq)
    outlets = Counter(a.get("domain", "") for a in uniq)
    linked = [(a["domain"], state_link(a["domain"])) for a in uniq if state_link(a["domain"])]
    linked_by_gov = Counter(g for _, g in linked)

    top = sorted(uniq, key=lambda a: a.get("seendate", ""), reverse=True)[:MAX_ARTICLES]
    return {
        "n": n,
        "sources": [{"country": c, "share": round(k / n, 3)} for c, k in countries.most_common(6)],
        "outlets": [{"domain": d, "n": k} for d, k in outlets.most_common(5)],
        "state_share": round(len(linked) / n, 3),
        "state_by_gov": [{"gov": g, "n": k} for g, k in linked_by_gov.most_common(4)],
        "articles": [{
            "title": clean_title(a.get("title")), "url": a["url"], "domain": a.get("domain", ""),
            "country": a.get("sourcecountry") or "", "date": parse_date(a.get("seendate", "")),
            "state": state_link(a.get("domain", "")),
        } for a in top],
    }


def summarise_timeline(data: dict, is_tone: bool) -> dict | None:
    try:
        pts = data["timeline"][0]["data"]
    except (KeyError, IndexError, TypeError):
        return None
    if not pts:
        return None
    if is_tone:
        vals = [p["value"] for p in pts if p.get("value") is not None]
        return {"avg": round(sum(vals) / len(vals), 2)} if vals else None
    total = sum(p["value"] for p in pts)
    norm = sum(p.get("norm", 0) for p in pts)
    weeks = [sum(p["value"] for p in pts[i:i + 7]) for i in range(0, len(pts), 7)]
    last30, prior = sum(p["value"] for p in pts[-30:]), pts[:-30]
    prior_daily = sum(p["value"] for p in prior) / len(prior) if prior else 0
    return {
        "total": int(total),
        "share_pct": round(total / norm * 100, 4) if norm else None,
        "weekly": weeks,
        "trend_pct": round((last30 / 30 / prior_daily - 1) * 100) if prior_daily else None,
    }


def main() -> None:
    scores = pd.read_csv(PROCESSED / "neglect_scores.csv")
    gap = pd.read_csv(PROCESSED / "gap_table.csv")
    codes = list(dict.fromkeys(list(scores["location_code"]) + list(gap["location_code"])))

    by_code, have = {}, {"articles": 0, "volume": 0, "tone": 0}
    for code in codes:
        entry = {}
        for key in ("articles", "volume", "tone"):
            f = RAW / f"{code}_{key}.json"
            if not f.exists():
                continue
            data = json.loads(f.read_text(encoding="utf-8"))
            res = (summarise_articles(data) if key == "articles"
                   else summarise_timeline(data, key == "tone"))
            if res:
                entry["tone" if key == "tone" else key] = res
                have[key] += 1
        if entry:
            by_code[code] = entry

    payload = {
        "generated": date.today().isoformat(),
        "window": "the last month",
        "source": "GDELT DOC 2.0 API, English-language articles with humanitarian framing",
        "state_list_size": len(STATE_LINKED),
        "byCode": by_code,
    }
    OUT.write_text("window.AIDGAP_MEDIA = " + json.dumps(payload, ensure_ascii=False) + ";\n",
                   encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(by_code)} countries "
          f"(articles {have['articles']}, volume {have['volume']}, tone {have['tone']})")


if __name__ == "__main__":
    main()
