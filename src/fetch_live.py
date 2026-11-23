"""
AidGap - Step 19: the LIVE CRISIS TRACKER feed.

Collects what is happening NOW from six free public sources (also IFRC GO active appeals and NASA EONET open events) and writes one file for the tracker page:
  * ReliefWeb API (UN OCHA): disasters and crises with status "ongoing" or "alert"   (needs our approved app name)
  * GDACS (EU/UN): Orange and Red alerts for earthquakes, cyclones, floods, volcanoes, droughts, wildfires
  * USGS: significant earthquakes of the past week
  * WHO Disease Outbreak News: the latest notices

Nothing is invented: each item is a title, date and link taken from the source; severity words are the source's own
(GDACS alert colour, USGS magnitude). The tracker does NOT score these events: the Neglect Score stays separate.

Run:   python src/fetch_live.py
Saves: dashboard/live.js   (window.AIDGAP_LIVE)    -- re-run daily (a scheduled GitHub Action is the next step)
"""
import csv
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dashboard" / "live.js"
UA = {"User-Agent": "AidGap-portfolio-project/0.1"}
NOW = datetime.now(timezone.utc)

try:
    import sys
    sys.path.insert(0, str(ROOT / "src"))
    from config_local import RELIEFWEB_APPNAME
except Exception:
    RELIEFWEB_APPNAME = None
import os
RELIEFWEB_APPNAME = RELIEFWEB_APPNAME or os.environ.get("RELIEFWEB_APPNAME") or None   # GitHub Action passes it as a secret


def get(url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(UA)
    if data:
        h["Content-Type"] = "application/json"
    return json.load(urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=90))


def iso_day(s):
    return (s or "")[:10]


def reliefweb():
    if not RELIEFWEB_APPNAME:
        print("  ReliefWeb skipped: no app name in src/config_local.py")
        return []
    d = get("https://api.reliefweb.int/v2/disasters?appname=" + urllib.parse.quote(RELIEFWEB_APPNAME), {
        "limit": 300, "sort": ["date.event:desc"],
        "filter": {"field": "status", "value": ["ongoing", "alert"], "operator": "OR"},
        "fields": {"include": ["name", "status", "date.event", "primary_type.name", "country.name", "country.iso3", "url", "glide"]}})
    out = []
    for x in d["data"]:
        f = x["fields"]
        c = f.get("country") or []
        out.append({"source": "ReliefWeb", "kind": (f.get("primary_type") or {}).get("name", "Other"), "title": f["name"],
                    "countries": [i["name"] for i in c], "iso3": [i.get("iso3", "").upper() for i in c],
                    "date": iso_day(f["date"]["event"]), "level": "Alert" if f.get("status") == "alert" else "Ongoing",
                    "url": f.get("url") or ("https://reliefweb.int/disaster/" + (f.get("glide") or ""))})
    return out


GDACS_KIND = {"EQ": "Earthquake", "TC": "Tropical cyclone", "FL": "Flood", "VO": "Volcano", "DR": "Drought", "WF": "Wildfire"}


def gdacs():
    d = get("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=Orange;Red&eventlist=EQ;TC;FL;VO;DR;WF")
    cutoff = NOW - timedelta(days=30)
    out = []
    for ft in d["features"]:
        p = ft["properties"]
        end = p.get("todate") or p.get("fromdate") or ""
        try:
            if datetime.fromisoformat(end).replace(tzinfo=timezone.utc) < cutoff:
                continue
        except ValueError:
            pass
        out.append({"source": "GDACS", "kind": GDACS_KIND.get(p["eventtype"], p["eventtype"]), "title": p.get("name") or p.get("eventname"),
                    "countries": [c.strip() for c in (p.get("country") or "").split(",") if c.strip()], "iso3": [p["iso3"]] if p.get("iso3") else [],
                    "date": iso_day(p.get("fromdate")), "level": p.get("alertlevel") + " alert",
                    "url": (p.get("url") or {}).get("report", "https://www.gdacs.org")})
    return out


def usgs():
    d = get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson")
    out = []
    for ft in d["features"]:
        p = ft["properties"]
        out.append({"source": "USGS", "kind": "Earthquake", "title": f"M{p['mag']} earthquake, {p['place']}", "countries": [], "iso3": [],
                    "date": datetime.fromtimestamp(p["time"] / 1000, timezone.utc).strftime("%Y-%m-%d"), "level": f"Magnitude {p['mag']}", "url": p["url"]})
    return out


def who():
    d = get("https://www.who.int/api/news/diseaseoutbreaknews?sf_culture=en&$top=15&$orderby=PublicationDateAndTime%20desc")
    return [{"source": "WHO", "kind": "Disease outbreak", "title": v["Title"], "countries": [], "iso3": [], "date": iso_day(v["PublicationDateAndTime"]),
             "level": "Outbreak notice", "url": "https://www.who.int/emergencies/disease-outbreak-news/item/" + v["UrlName"]} for v in d["value"]]


def previous_items():
    """Items from the last run, so a source that fails now keeps its last good items instead of vanishing."""
    try:
        txt = OUT.read_text(encoding="utf-8")
        return json.loads(txt[txt.index("=") + 1:].strip().rstrip(";"))["items"]
    except Exception:
        return []


IFRC_KIND = {"Pluvial/Flash Flood": "Flood", "Cyclone": "Tropical cyclone", "Fire": "Wildfire", "Volcanic Eruption": "Volcano",
             "Storm Surge": "Tropical cyclone", "Insect Infestation": "Pest infestation", "Food Insecurity": "Food insecurity"}


def ifrc():
    """Red Cross / Red Crescent ACTIVE appeals (DREF and Emergency Appeals). Includes conflict-type crises (population movement, complex emergency)."""
    out, offset = [], 0
    while True:
        d = get(f"https://goadmin.ifrc.org/api/v2/appeal/?limit=100&offset={offset}&ordering=-start_date&status=0&format=json")
        for a in d["results"]:
            c = a.get("country") or {}
            k = (a.get("dtype") or {}).get("name", "Other")
            eid = a.get("event") or (a.get("event_details") or {}).get("id")
            out.append({"source": "IFRC", "kind": IFRC_KIND.get(k, k), "title": a["name"], "countries": [c["name"]] if c.get("name") else [],
                        "iso3": [c["iso3"].upper()] if c.get("iso3") else [], "date": iso_day(a.get("start_date")),
                        "level": "Red Cross " + ("emergency appeal" if a.get("atype_display") == "Emergency Appeal" else "DREF"),
                        "url": f"https://go.ifrc.org/emergencies/{eid}" if eid else "https://go.ifrc.org/appeals/all"})
        offset += 100
        if not d.get("next") or offset >= 600:
            return out


EONET_KIND = {"Wildfires": "Wildfire", "Severe Storms": "Severe storm", "Volcanoes": "Volcano", "Floods": "Flood", "Drought": "Drought", "Landslides": "Landslide"}


def eonet():
    """NASA EONET open natural events. Wildfires are mostly small, so only ones of 10,000 acres (4,000 ha) or more are kept."""
    d = get("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=1000")
    cutoff = NOW - timedelta(days=14)
    out = []
    for e in d["events"]:
        cat = e["categories"][0]["title"]
        if cat not in EONET_KIND:
            continue
        g = e["geometry"][-1]
        when = datetime.fromisoformat(g["date"].replace("Z", "+00:00"))
        if when < cutoff:
            continue
        mag, unit = g.get("magnitudeValue"), g.get("magnitudeUnit")
        if cat == "Wildfires":
            acres = (mag or 0) * (2.47105 if unit == "ha" else 1) if unit in ("acres", "ha") else 0
            if acres < 10000:
                continue
            level = f"{acres:,.0f} acres burned"
        else:
            level = "NASA open event"
        out.append({"source": "NASA EONET", "kind": EONET_KIND[cat], "title": e["title"], "countries": [], "iso3": [],
                    "date": when.strftime("%Y-%m-%d"), "level": level, "url": (e["sources"] or [{"url": e["link"]}])[0]["url"]})
    return out


def load_names():
    f = ROOT / "data" / "reference" / "country_names.csv"
    if not f.exists():
        return {}
    with open(f, encoding="utf-8") as fh:
        return {r["name"]: r["iso3"] for r in csv.DictReader(fh)}


NAMES = load_names()
US_STATES = set("alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana "
                "maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada oregon pennsylvania tennessee texas utah vermont virginia "
                "washington wyoming oklahoma".split())
NAME_RE = None


def resolve(name):
    n = (name or "").strip().lower()
    return NAMES.get(n) or NAMES.get(re.sub(r"\s*\(.*?\)", "", n).strip()) or NAMES.get(re.sub(r"^the\s+", "", n))


def find_in_title(title):
    """Country names written in a title (WHO notices), longest names first so 'Democratic Republic of the Congo' is not read as 'Congo'."""
    global NAME_RE
    if NAME_RE is None:
        NAME_RE = re.compile(r"(?<![\w])(" + "|".join(re.escape(n) for n in sorted(NAMES, key=len, reverse=True)) + r")(?![\w])", re.I)
    found, seen = [], set()
    for m in NAME_RE.finditer(title):
        iso = NAMES[m.group(1).lower()]
        if iso not in seen:
            seen.add(iso)
            found.append((m.group(1), iso))
    return found


def attach_countries(items):
    """Give every item a full ISO3 list (the sources only sometimes provide one), so events can be matched, grouped and mapped."""
    for it in items:
        if it["countries"]:
            iso = [resolve(c) for c in it["countries"]]
            it["iso3"] = [x for x in dict.fromkeys(iso) if x]
        elif it["source"] == "USGS":
            seg = it["title"].rsplit(",", 1)[-1].strip()
            seg = re.sub(r"\s+region$", "", seg, flags=re.I)
            iso = "USA" if (seg.lower() in US_STATES or re.fullmatch(r"[A-Z]{2}", seg)) else resolve(seg)
            if iso:
                it["iso3"], it["countries"] = [iso], [seg]
        elif it["source"] == "WHO":
            hits = find_in_title(it["title"])
            if hits:
                it["countries"] = [h[0].title() if h[0].islower() else h[0] for h in hits]
                it["iso3"] = [h[1] for h in hits]


def main() -> None:
    items, status = [], {}
    old = previous_items()
    for name, fn in (("ReliefWeb", reliefweb), ("GDACS", gdacs), ("USGS", usgs), ("WHO", who), ("IFRC", ifrc), ("NASA EONET", eonet)):
        try:
            got = fn()
            if name == "ReliefWeb" and not RELIEFWEB_APPNAME:
                raise RuntimeError("no app name")
            items += got
            status[name] = {"ok": True, "count": len(got)}
            print(f"{name}: {len(got)} items")
        except Exception as e:                                # one source failing must not break the others
            kept = [i for i in old if i["source"] == name]
            items += kept
            status[name] = {"ok": False, "error": str(e)[:120], "kept_old": len(kept)}
            print(f"{name}: FAILED ({e}); kept {len(kept)} items from the last run")
    attach_countries(items)
    print("With a country:", sum(1 for i in items if i["iso3"]), "of", len(items))
    items.sort(key=lambda x: x["date"], reverse=True)
    if items == old and OUT.exists() and (NOW.timestamp() - OUT.stat().st_mtime) < 6 * 3600 and "--force" not in sys.argv:
        print("Nothing new; file left alone (keeps the history free of empty commits).")
        return
    payload = {"generated": NOW.strftime("%Y-%m-%d %H:%M UTC"), "status": status, "items": items}
    OUT.write_text("window.AIDGAP_LIVE = " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("Wrote", OUT.relative_to(ROOT), f"({len(items)} items)")


if __name__ == "__main__":
    main()
