"""
AidGap - Step 9: summarise the media coverage for the dashboard.

Reads  data/raw/media/*.json      (from fetch_media.py)
Writes dashboard/media.js         (what the web page shows)

For each crisis the page shows two lists of articles:
  * PUBLISHED ABROAD         - by outlets based in other countries
  * PUBLISHED IN THE COUNTRY - by outlets based in the crisis country itself

What this measures (and what it does NOT):
  * WHO covers each crisis: which countries the outlets are based in, and how much
    comes from state-linked outlets.
  * It is a SAMPLE of English-language articles (GDELT returns at most 250 per
    request), so it shows the mix of coverage, not the total amount. Coverage in the
    country's own language is missing, so the "in the country" list is often short.
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

# How GDELT spells the country an outlet is based in, for each crisis (lower case).
# An article counts as "published in the country" if its outlet country is one of these.
LOCAL_NAMES = {
    "YEM": {"yemen"}, "AFG": {"afghanistan"}, "HND": {"honduras"}, "MLI": {"mali"},
    "BFA": {"burkina faso"}, "NER": {"niger"}, "SYR": {"syria"}, "MMR": {"burma", "myanmar"},
    "SDN": {"sudan"}, "COL": {"colombia"}, "CMR": {"cameroon"}, "SSD": {"south sudan"},
    "SOM": {"somalia"}, "VEN": {"venezuela"}, "COD": {"congo, the democratic republic of the",
                                                       "congo (kinshasa)", "democratic republic of the congo", "dr congo"},
    "HTI": {"haiti"}, "TCD": {"chad"}, "MOZ": {"mozambique"}, "NGA": {"nigeria"},
    "CAF": {"central african republic"}, "UKR": {"ukraine"},
    "PSE": {"west bank", "gaza strip", "palestine", "palestinian territory"},
    "LBN": {"lebanon"}, "CUB": {"cuba"}, "MDG": {"madagascar"}, "PAK": {"pakistan"},
    "VNM": {"vietnam", "viet nam"}, "NPL": {"nepal"},
}

MAX_PER_TAB = 25

# GDELT matches words loosely (it returned "Vietnam veteran gets free home repairs" for
# Viet Nam, and a Gaza story for Yemen). So we only keep an article when its HEADLINE
# names the country (or a clear demonym / capital). Word boundaries stop "mali" matching
# "Somalia" and "niger" matching "Nigeria".
TITLE_TERMS = {
    "YEM": "yemen|yemeni|houthi|sanaa", "AFG": "afghan|afghans|afghanistan|taliban|kabul",
    "HND": "honduras|honduran", "MLI": "mali|malian|bamako", "BFA": "burkina|ouagadougou",
    "NER": "niger|nigerien|niamey", "SYR": "syria|syrian|syrians|damascus",
    "MMR": "myanmar|burma|burmese|rohingya", "SDN": "sudan|sudanese|khartoum|darfur",
    "COL": "colombia|colombian|bogot[aá]", "CMR": "cameroon|cameroonian",
    "SSD": "south sudan|south sudanese|juba", "SOM": "somalia|somali|mogadishu",
    "VEN": "venezuela|venezuelan|caracas", "COD": "congo|congolese|drc|kinshasa|goma|kivu",
    "HTI": "haiti|haitian|haitians|port-au-prince", "TCD": "chadian|n'djamena|chad",
    "MOZ": "mozambique|mozambican|cabo delgado", "NGA": "nigeria|nigerian|nigerians|borno",
    "CAF": "central african republic|bangui", "UKR": "ukraine|ukrainian|ukrainians|kyiv|kharkiv",
    "PSE": "gaza|palestin\\w*|west bank|rafah", "LBN": "lebanon|lebanese|beirut",
    "CUB": "cuba|cuban|cubans|havana", "MDG": "madagascar|malagasy",
    "PAK": "pakistan|pakistani|pakistanis", "VNM": "vietnam|viet nam|vietnamese",
    "NPL": "nepal|nepali|nepalese|kathmandu",
}
TITLE_RE = {c: re.compile(r"\b(" + t + r")\b", re.I) for c, t in TITLE_TERMS.items()}
# words that signal the headline is about something else
NOISE_RE = {
    "VNM": re.compile(r"veteran|vietnam war|war memorial", re.I),
    "TCD": re.compile(r"\bchad\s+(?:[A-Z]\w+\s+)?(?:said|says|told|smith|johnson)|\bchad's\b", re.I),
}


def relevant(code: str, title: str) -> bool:
    rx = TITLE_RE.get(code)
    if rx is None:
        return True
    if not rx.search(title or ""):
        return False
    t = (title or "").lower()
    if code == "SDN" and "south sudan" in t and not re.search(r"\b(?<!south )sudan\b|khartoum|darfur", t):
        return False                                    # a South Sudan story, not Sudan
    if code == "TCD" and re.search(r"\bchad\b", t) and not re.search(
            r"chadian|n'djamena|refugee|sudan|sahel|humanitarian|famine|aid|camp|border|lake chad", t):
        return False                                    # probably a person called Chad
    nz = NOISE_RE.get(code)
    return not (nz and nz.search(title or ""))


def state_link(domain: str):
    d = domain.lower().removeprefix("www.")
    for known, gov in STATE_LINKED.items():
        if d == known or d.endswith("." + known):
            return gov
    return None


def clean_title(t: str) -> str:
    t = re.sub(r"\s+([,.;:!?%])", r"\1", t or "").strip()   # GDELT puts spaces before punctuation
    t = re.sub(r"(\d), (\d{3})\b", r"\1,\2", t)              # "333, 000" -> "333,000"
    return re.sub(r"\s{2,}", " ", t)


def parse_date(s: str) -> str:
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if s and len(s) >= 8 else ""


def load_articles(code: str) -> list[dict]:
    """All articles for a crisis from every file we have, repeated headlines removed."""
    seen, out = set(), []
    for key in ("local", "articles"):                    # local first so they win ties
        f = RAW / f"{code}_{key}.json"
        if not f.exists():
            continue
        for a in json.loads(f.read_text(encoding="utf-8")).get("articles") or []:
            url = str(a.get("url", ""))
            k = re.sub(r"\W+", "", (a.get("title") or "").lower())[:80]
            if not k or k in seen or not url.startswith(("http://", "https://")):
                continue
            if not relevant(code, clean_title(a.get("title"))):
                continue
            seen.add(k)
            a["_from_local_query"] = key == "local"
            out.append(a)
    return out


def article_row(a: dict) -> dict:
    return {"title": clean_title(a.get("title")), "url": a["url"], "domain": a.get("domain", ""),
            "country": a.get("sourcecountry") or "", "date": parse_date(a.get("seendate", "")),
            "state": state_link(a.get("domain", ""))}


def summarise(code: str) -> dict | None:
    arts = load_articles(code)
    if not arts:
        return None
    local_names = LOCAL_NAMES.get(code, set())

    def is_local(a):
        return a["_from_local_query"] or (a.get("sourcecountry") or "").lower() in local_names

    local = sorted((a for a in arts if is_local(a)), key=lambda a: a.get("seendate", ""), reverse=True)
    abroad = sorted((a for a in arts if not is_local(a)), key=lambda a: a.get("seendate", ""), reverse=True)

    n = len(arts)
    countries = Counter(a.get("sourcecountry") or "Unknown" for a in arts)
    linked = [state_link(a.get("domain", "")) for a in arts]
    linked = [g for g in linked if g]
    return {
        "n": n, "n_local": len(local), "n_abroad": len(abroad),
        "sources": [{"country": c, "share": round(k / n, 3)} for c, k in countries.most_common(6)],
        "state_share": round(len(linked) / n, 3),
        "state_by_gov": [{"gov": g, "n": k} for g, k in Counter(linked).most_common(4)],
        "abroad": [article_row(a) for a in abroad[:MAX_PER_TAB]],
        "local": [article_row(a) for a in local[:MAX_PER_TAB]],
    }


def volume(code: str) -> dict | None:
    """Hourly article counts -> total, share of ALL monitored coverage, and a daily series."""
    f = RAW / f"{code}_volume.json"
    if not f.exists():
        return None
    try:
        pts = json.loads(f.read_text(encoding="utf-8"))["timeline"][0]["data"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return None
    if not pts:
        return None
    total = sum(p["value"] for p in pts)
    norm = sum(p.get("norm", 0) for p in pts)
    days: dict[str, int] = {}
    for p in pts:
        days[p["date"][:8]] = days.get(p["date"][:8], 0) + p["value"]
    return {"total": int(total), "share_pct": round(total / norm * 100, 4) if norm else None,
            "daily": list(days.values())}


def main() -> None:
    gap = pd.read_csv(PROCESSED / "gap_table.csv")
    codes = list(dict.fromkeys(gap["location_code"]))
    by_code = {}
    for code in codes:
        s = summarise(code) or {}
        v = volume(code)
        if v:
            s["volume"] = v
        if s:
            by_code[code] = s

    payload = {
        "generated": date.today().isoformat(),
        "window": "the last week",
        "source": "GDELT DOC 2.0 API, English-language articles with humanitarian framing",
        "state_list_size": len(STATE_LINKED),
        "byCode": by_code,
    }
    OUT.write_text("window.AIDGAP_MEDIA = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    total = sum(v.get("n", 0) for v in by_code.values())
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(by_code)} countries, {total} articles "
          f"({sum(v.get('n_local', 0) for v in by_code.values())} published in-country), "
          f"{sum(1 for v in by_code.values() if 'volume' in v)} with volume")


if __name__ == "__main__":
    main()
