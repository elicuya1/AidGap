"""
AidGap - Step 17: LOCAL news, read straight from outlets based in each country (no key needed).

Why: free global news searches (GDELT) find very little published inside the crisis countries.
Many local outlets publish an RSS feed, the standard way to let others list their headlines.
We read those feeds, keep only items about humanitarian topics (in the outlet's own language),
and store the headline, link, date and outlet. Nothing else of the article is copied.

Rules we follow
  * An honest client name, a pause between requests, and a hard stop if a site says no
    (HTTP 401/403/429): a refusal is respected, never worked around.
  * Titles and links only, shown with the outlet's name and a link back to the original.
  * Outlets owned or run by a government are labelled "state-linked" on the page.
  * Please check each outlet's own terms before publishing the site widely.

Run:   python src/fetch_local_news.py        (a few minutes; safe to re-run)
Saves: data/raw/localnews/<ISO3>.json   and   data/raw/localnews/_status.json
Then:  python src/build_media_summary.py ; python src/export_dashboard_data.py
"""

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "localnews"
UA = "AidGap-portfolio-project/0.1 (humanitarian data project; reads public RSS feeds)"
PAUSE = 1.2
MAX_KEEP = 25

# (country code, outlet name, home page, language)
OUTLETS = [
    ("YEM", "Yemen Times", "https://www.yementimes.com/", "English"),
    ("YEM", "Almasdar Online", "https://almasdaronline.com/", "Arabic"),
    ("AFG", "TOLOnews", "https://tolonews.com/", "English"),
    ("AFG", "Pajhwok Afghan News", "https://pajhwok.com/", "English"),
    ("HND", "La Prensa", "https://www.laprensa.hn/", "Spanish"),
    ("HND", "El Heraldo", "https://www.elheraldo.hn/", "Spanish"),
    ("MLI", "Maliweb", "https://www.maliweb.net/", "French"),
    ("BFA", "Lefaso.net", "https://lefaso.net/", "French"),
    ("BFA", "Burkina24", "https://burkina24.com/", "French"),
    ("NER", "ActuNiger", "https://www.actuniger.com/", "French"),
    ("SYR", "SANA", "https://sana.sy/en/", "English"),
    ("MMR", "Myanmar Times", "https://www.mmtimes.com/", "English"),
    ("SDN", "Al-Rakoba", "https://www.alrakoba.net/", "Arabic"),
    ("COL", "El Tiempo", "https://www.eltiempo.com/", "Spanish"),
    ("COL", "El Espectador", "https://www.elespectador.com/", "Spanish"),
    ("COL", "Semana", "https://www.semana.com/", "Spanish"),
    ("CMR", "Journal du Cameroun", "https://www.journalducameroun.com/", "French"),
    ("CMR", "Cameroon Tribune", "https://www.cameroon-tribune.cm/", "French"),
    ("SSD", "Eye Radio", "https://eyeradio.org/", "English"),
    ("SSD", "Sudans Post", "https://www.sudanspost.com/", "English"),
    ("SOM", "Garowe Online", "https://www.garoweonline.com/en", "English"),
    ("VEN", "El Nacional", "https://www.elnacional.com/", "Spanish"),
    ("VEN", "Efecto Cocuyo", "https://efectococuyo.com/", "Spanish"),
    ("COD", "Radio Okapi", "https://www.radiookapi.net/", "French"),
    ("COD", "Actualite.cd", "https://actualite.cd/", "French"),
    ("HTI", "Le Nouvelliste", "https://lenouvelliste.com/", "French"),
    ("HTI", "AlterPresse", "https://www.alterpresse.org/", "French"),
    ("TCD", "Alwihda Info", "https://www.alwihdainfo.com/", "French"),
    ("TCD", "Tchadinfos", "https://tchadinfos.com/", "French"),
    ("MOZ", "Club of Mozambique", "https://clubofmozambique.com/", "English"),
    ("MOZ", "O Pais", "https://www.opais.co.mz/", "Portuguese"),
    ("NGA", "Premium Times", "https://www.premiumtimesng.com/", "English"),
    ("NGA", "Punch", "https://punchng.com/", "English"),
    ("NGA", "TheCable", "https://www.thecable.ng/", "English"),
    ("CAF", "Radio Ndeke Luka", "https://www.radiondekeluka.org/", "French"),
    ("CAF", "Oubangui Medias", "https://oubanguimedias.com/", "French"),
    ("UKR", "Kyiv Independent", "https://kyivindependent.com/", "English"),
    ("UKR", "Ukrinform", "https://www.ukrinform.net/", "English"),
    ("UKR", "Ukrainska Pravda (English)", "https://www.pravda.com.ua/eng/", "English"),
    ("PSE", "Ma'an News Agency", "https://www.maannews.net/", "Arabic"),
    ("PSE", "WAFA", "https://english.wafa.ps/", "English"),
    ("LBN", "Naharnet", "https://www.naharnet.com/", "English"),
    ("LBN", "The Daily Star", "https://www.dailystar.com.lb/", "English"),
    ("LBN", "L'Orient Today", "https://today.lorientlejour.com/", "English"),
    ("CUB", "14ymedio", "https://www.14ymedio.com/", "Spanish"),
    ("CUB", "Cubadebate", "https://www.cubadebate.cu/", "Spanish"),
    ("CUB", "Granma", "https://www.granma.cu/", "Spanish"),
    ("MDG", "Newsmada", "https://www.newsmada.com/", "French"),
    ("MDG", "L'Express de Madagascar", "https://lexpress.mg/", "French"),
    ("PAK", "Dawn", "https://www.dawn.com/", "English"),
    ("PAK", "The Express Tribune", "https://tribune.com.pk/", "English"),
    ("PAK", "The News International", "https://www.thenews.com.pk/", "English"),
    ("VNM", "VnExpress International", "https://e.vnexpress.net/", "English"),
    ("VNM", "Viet Nam News", "https://vietnamnews.vn/", "English"),
    ("VNM", "Tuoi Tre News", "https://tuoitrenews.vn/", "English"),
    ("NPL", "The Kathmandu Post", "https://kathmandupost.com/", "English"),
    ("NPL", "Republica", "https://myrepublica.nagariknetwork.com/", "English"),
    ("NPL", "The Rising Nepal", "https://risingnepaldaily.com/", "English"),
]

KEYWORDS = {
    # deliberately specific: "aid" alone matches "aid-comptable" and "aid an ill passenger"
    "English": r"humanitarian|food aid|emergency aid|aid agenc|aid worker|famine|hunger|food insecurity|malnutrition|displace|refugee|flood|drought|cholera|outbreak|ceasefire|armed conflict|war|relief (?:effort|supplies|camp|fund)|shelter|WFP|UNICEF|UNHCR|OCHA|United Nations|UN|cyclone|earthquake|landslide|airstrike|clashes|evacuat|epidemic|dengue|measles|blockade|armed group|typhoon|monsoon",
    "French": r"humanitaire|aide alimentaire|aide d.urgence|famine|faim|insécurité alimentaire|malnutrition|déplacé|réfugié|inondation|sécheresse|choléra|épidémie|cessez-le-feu|conflit armé|guerre|PAM|UNICEF|HCR|OCHA|ONU|Nations unies|cyclone|séisme|sinistré|rougeole|dengue|mpox|attaque armée|groupes? armés?",
    "Spanish": r"humanitari|hambre|inseguridad alimentaria|desnutrici|desplazad|refugiad|inundaci|sequ[ií]a|c[oó]lera|dengue|hurac[aá]n|conflicto armado|ONU|Naciones Unidas|PMA|UNICEF|ACNUR|damnificad|grupos armados",
    "Portuguese": r"humanit[aá]ri|fome|deslocad|refugiad|cheias?|seca|c[oó]lera|conflito armado|ciclone|ONU|Nações Unidas|PMA|UNICEF|ACNUR",
    "Arabic": r"إنساني|مساعدات|مجاعة|جوع|نازح|لاجئ|فيضان|جفاف|كوليرا|حرب|وقف إطلاق|الأمم المتحدة|غارة|قصف|سوء التغذية|حصار",
}
FEED_GUESSES = ["feed", "rss", "rss.xml", "feed/", "feeds/rss", "index.xml", "en/rss"]
ATOM = "{http://www.w3.org/2005/Atom}"


class Refused(Exception):
    pass


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, text/html;q=0.8"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.read(3_000_000)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            raise Refused(f"HTTP {e.code}")
        raise


def discover(home: str) -> list[str]:
    """Feed addresses the home page itself advertises, then a few standard guesses."""
    found = []
    try:
        page = fetch(home).decode("utf-8", "replace")
        for m in re.finditer(r"<link[^>]+>", page, flags=re.I):
            tag = m.group(0)
            if re.search(r"application/(?:rss|atom)\+xml", tag, re.I):
                h = re.search(r'href=["\']([^"\']+)', tag)
                if h and "comment" not in h.group(1).lower():
                    found.append(urllib.parse.urljoin(home, h.group(1)))
    except Refused:
        raise
    except Exception:
        pass
    found += [urllib.parse.urljoin(home, g) for g in FEED_GUESSES]
    return list(dict.fromkeys(found))[:6]


def parse_feed(blob: bytes) -> list[dict]:
    root = ET.fromstring(blob)
    items = []
    for it in root.iter("item"):
        items.append({"title": it.findtext("title") or "", "url": (it.findtext("link") or "").strip(), "date": it.findtext("pubDate") or ""})
    for en in root.iter(ATOM + "entry"):
        link = next((l.get("href") for l in en.findall(ATOM + "link") if l.get("rel") in (None, "alternate")), "")
        items.append({"title": en.findtext(ATOM + "title") or "", "url": link or "", "date": en.findtext(ATOM + "updated") or en.findtext(ATOM + "published") or ""})
    return items


def to_date(s: str) -> str:
    for f in (lambda x: parsedate_to_datetime(x), lambda x: datetime.fromisoformat(x.replace("Z", "+00:00"))):
        try:
            return f(s).astimezone(timezone.utc).date().isoformat()
        except (TypeError, ValueError):
            continue
    return ""


def refilter() -> None:
    """Re-apply the (tighter) keyword test to headlines already downloaded. No requests are made."""
    n_before = n_after = 0
    for f in OUT.glob("??*.json"):
        if f.name.startswith("_"):
            continue
        items = json.loads(f.read_text(encoding="utf-8"))
        keep = [x for x in items if re.search(KEYWORDS.get(x["lang"], ".*"), x["title"], re.I)]
        n_before += len(items); n_after += len(keep)
        f.write_text(json.dumps(keep, ensure_ascii=False), encoding="utf-8")
    print(f"Re-filtered: kept {n_after} of {n_before} headlines.")


def main() -> None:
    if "--refilter" in __import__("sys").argv:
        return refilter()
    OUT.mkdir(parents=True, exist_ok=True)
    status, by_code = {}, {}
    for n, (code, name, home, lang) in enumerate(OUTLETS, 1):
        domain = urllib.parse.urlparse(home).netloc.removeprefix("www.")
        st = {"outlet": name, "country": code, "result": ""}
        try:
            feed_items = None
            for f in discover(home):
                time.sleep(PAUSE)
                try:
                    feed_items = parse_feed(fetch(f))
                    if feed_items:
                        st["feed"] = f
                        break
                except Refused:
                    raise
                except Exception:
                    continue
            if not feed_items:
                st["result"] = "no feed found"
            else:
                rx = re.compile(KEYWORDS[lang], re.I)
                kept = []
                for it in feed_items:
                    t = re.sub(r"\s+", " ", it["title"]).strip()
                    if t and it["url"].startswith("http") and rx.search(t):
                        kept.append({"title": t, "url": it["url"], "domain": domain, "outlet": name, "lang": lang, "date": to_date(it["date"])})
                by_code.setdefault(code, []).extend(kept[:MAX_KEEP])
                st["result"] = f"ok: {len(kept)} humanitarian of {len(feed_items)} items"
        except Refused as e:
            st["result"] = f"refused ({e}); skipped"
        except Exception as e:                                   # noqa: BLE001
            st["result"] = f"error {type(e).__name__}"
        status[f"{code} {name}"] = st["result"]
        print(f"[{n}/{len(OUTLETS)}] {code} {name}: {st['result']}", flush=True)
        time.sleep(PAUSE)
    for code, items in by_code.items():
        (OUT / f"{code}.json").write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    (OUT / "_status.json").write_text(json.dumps(status, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved local news for {len(by_code)} countries, {sum(len(v) for v in by_code.values())} headlines.")


if __name__ == "__main__":
    main()
