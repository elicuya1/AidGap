"""
AidGap - Step 14: summarise the ReliefWeb reports for the dashboard.

Reads  data/raw/reliefweb/*.json   (from fetch_reliefweb.py)
Writes dashboard/reports.js        (what the web page shows)

Per crisis we keep:
  * how many humanitarian reports were published in the last 30 / 90 days (our measure of
    the aid sector's attention; ReliefWeb is OCHA's own publishing platform)
  * the top publishers (UNICEF, WFP, OCHA, NGOs...), the topics, and a language guess
  * a 12-week series and the latest items (title, link, date, publisher)

Language is GUESSED from the headline (script, then common words). It is approximate and
the page says so. Reports belong to their publishers; the page always links to them.

Run:  python src/build_reports_summary.py
"""

import json
import re
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "reliefweb"
OUT = ROOT / "dashboard" / "reports.js"
MAX_ITEMS = 60

WORDS = {
    "French": {"le", "la", "les", "des", "du", "de", "et", "en", "pour", "dans", "sur", "au", "aux", "une", "un", "d", "l", "rapport", "situation"},
    "Spanish": {"el", "los", "las", "del", "y", "en", "para", "por", "con", "una", "un", "informe", "situación", "de"},
    "Portuguese": {"o", "os", "as", "do", "da", "dos", "das", "em", "com", "para", "relatório"},
    "English": {"the", "of", "and", "in", "for", "to", "on", "a", "an", "with", "update", "report", "situation"},
}
SCRIPTS = [("Arabic", r"[؀-ۿ]"), ("Russian/Ukrainian", r"[Ѐ-ӿ]"), ("Burmese", r"[က-႟]"),
           ("Nepali", r"[ऀ-ॿ]"), ("Chinese", r"[一-鿿]")]


# Words that identify a country in a publisher's name (name and adjective, lower case).
COUNTRY_WORDS = {
    "YEM": ["yemen"], "AFG": ["afghan"], "HND": ["hondure", "honduras"], "MLI": ["mali", "malien"],
    "BFA": ["burkina", "burkinab"], "NER": ["niger", "nigérien", "nigerien"], "SYR": ["syria"],
    "MMR": ["myanmar", "burma", "burmese"], "SDN": ["sudan"], "COL": ["colombia"],
    "CMR": ["cameroon", "cameroun", "camerounais"], "SSD": ["south sudan"], "SOM": ["somali"],
    "VEN": ["venezuela"], "COD": ["congo", "congolais", "rdc"], "HTI": ["haiti", "haïti", "haitien", "haïtien"],
    "TCD": ["tchad", "chad", "tchadien"], "MOZ": ["mozambi", "moçambi"], "NGA": ["nigeria"],
    "CAF": ["centrafri", "central african"], "UKR": ["ukrain"], "PSE": ["palestin"], "LBN": ["leban", "libanais"],
    "CUB": ["cuba"], "MDG": ["madagascar", "malagasy", "malgache"], "PAK": ["pakistan"],
    "VNM": ["viet nam", "vietnam"], "NPL": ["nepal"],
}
# publishers that carry a country's name but are international bodies working there
INTERNATIONAL_HINTS = ("united nations", "un ", "ingo", "international", "humanitarian country team",
                       "equipo humanitario", "cluster", "mission", "office", "unhcr", "unicef", "wfp", "ocha")
NATIONAL_SOCIETY = ("red cross", "red crescent", "croix-rouge", "cruz roja", "media luna")


def is_local_publisher(code: str, publisher: str) -> bool:
    """True when the PUBLISHER is based in the country: its government, its national Red
    Cross or Red Crescent society, or an organisation whose name starts with the country.
    A rule of thumb, not a guarantee; the page says so."""
    p = publisher.lower().strip()
    words = COUNTRY_WORDS.get(code, [])
    if not words or any(h in p for h in INTERNATIONAL_HINTS):
        return False
    if code == "SDN" and "south sudan" in p:
        return False
    starts = any(p.startswith(w) for w in words)
    govt = bool(re.match(r"(government|ministry|ministère|ministerio)\b.*", p)) and any(w in p for w in words)
    society = any(s in p for s in NATIONAL_SOCIETY) and any(w in p for w in words)
    return starts or govt or society


def guess_language(title: str) -> str:
    for name, rx in SCRIPTS:
        if re.search(rx, title):
            return name
    toks = re.findall(r"[a-zà-ÿ]+", title.lower())
    scores = {lang: sum(1 for t in toks if t in ws) for lang, ws in WORDS.items()}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "English"


LANG_NAMES = {"en": "English", "fr": "French", "es": "Spanish", "ar": "Arabic", "pt": "Portuguese", "ru": "Russian/Ukrainian",
              "uk": "Russian/Ukrainian", "my": "Burmese", "ne": "Nepali", "zh": "Chinese"}


def summarise(code: str, items: list[dict], today: date, fixed_window: int | None = None) -> dict | None:
    if not items:
        return None
    rows = []
    for it in items:
        try:
            d = date.fromisoformat(it["date"])
        except (ValueError, KeyError):
            continue
        rows.append({**it, "d": d, "lang": LANG_NAMES.get(it.get("lang", ""), "") or guess_language(it["title"]),
                     "local": is_local_publisher(code, it.get("publisher", ""))})
    if not rows:
        return None
    rows.sort(key=lambda r: r["d"], reverse=True)
    # The free feed holds only the latest ~20 reports, so the TIME THEY SPAN is the signal:
    # 20 reports in 9 days is a busy crisis, 20 reports over 4 months is a quiet one.
    # With the API we hold EVERY report of a fixed window (e.g. 90 days), so the rate is a true count.
    window = fixed_window or max(1, (today - rows[-1]["d"]).days)
    return {
        "n": len(rows), "per_week": round(len(rows) / window * 7, 2), "window_days": window,
        "oldest": rows[-1]["d"].isoformat(),
        "publishers": [{"name": k, "n": v} for k, v in Counter(r["publisher"] for r in rows if r["publisher"]).most_common(6)],
        "tags": [{"name": k, "n": v} for k, v in Counter(t for r in rows for t in r["tags"]).most_common(6)],
        "langs": dict(Counter(r["lang"] for r in rows).most_common()),
        "items": [{"title": r["title"], "url": r["url"], "date": r["d"].isoformat(), "publisher": r["publisher"],
                   "lang": r["lang"], "local": r["local"], "tags": r["tags"][:3]} for r in rows[:MAX_ITEMS]],
    }


def main() -> None:
    today = date.today()
    by_code = {}
    meta_f = RAW / "_meta.json"
    meta = json.loads(meta_f.read_text(encoding="utf-8")) if meta_f.exists() else {}
    fixed = meta.get("window_days") if meta.get("mode") == "api" else None
    for f in sorted(RAW.glob("*.json")):
        if f.stem.startswith("_"):
            continue
        s = summarise(f.stem, json.loads(f.read_text(encoding="utf-8")), today, fixed)
        if s:
            by_code[f.stem] = s
    payload = {
        "generated": today.isoformat(),
        "source": "ReliefWeb API (UN OCHA)" if fixed else "ReliefWeb (UN OCHA) public RSS feed",
        "window_days": fixed,
        "note": "Reports belong to their publishers. Language is guessed from the headline.",
        "byCode": by_code,
    }
    OUT.write_text("window.AIDGAP_REPORTS = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    tot = sum(v["n"] for v in by_code.values())
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(by_code)} countries, {tot} reports")
    for code, v in sorted(by_code.items(), key=lambda kv: -kv[1]["per_week"]):
        print(f"  {code}: {v['per_week']:>5} reports/week (latest {v['n']} span {v['window_days']} days)")


if __name__ == "__main__":
    main()
