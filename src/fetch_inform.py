"""
AidGap - Step 16: INFORM Severity Index (country level), from HDX.

INFORM Severity is published monthly by the EU Joint Research Centre (method) and ACAPS (data and
analysis), coordinated by OCHA. It rates how severe each crisis is, 1 (low) to 10 (high), and groups
that into five levels. Licence: CC BY 4.0, so we credit INFORM / JRC / ACAPS on the page.
Source: https://data.humdata.org/dataset/823ab728-bccf-4ae1-adee-a0038c24b7dd

We read the Excel file with the Python standard library only (zip + xml), so no extra package is needed.

Run:   python src/fetch_inform.py
Saves: data/raw/inform/<file>.xlsx   (cache; not committed)
       data/processed/inform_severity.csv   (iso3, country, severity 1-10, category 1-5, trend, release)
"""
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "inform"
OUT = ROOT / "data" / "processed" / "inform_severity.csv"
UA = {"User-Agent": "AidGap-portfolio-project/0.1"}
PKG = "https://data.humdata.org/api/3/action/package_show?id=823ab728-bccf-4ae1-adee-a0038c24b7dd"
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
SHEET = "INFORM Severity - country"


def latest_resource() -> tuple[str, str]:
    d = json.load(urllib.request.urlopen(urllib.request.Request(PKG, headers=UA), timeout=60))
    best = None
    for r in d["result"]["resources"]:
        m = re.match(r"^(\d{6})\s+INFORM Severity", r["name"], re.I)
        if m and r["format"].upper() == "XLSX" and (best is None or m.group(1) > best[0]):
            best = (m.group(1), r["url"])
    if not best:
        raise SystemExit("Could not find a monthly INFORM Severity file on HDX.")
    return best


def read_sheet(path: Path, name: str) -> list[list]:
    z = zipfile.ZipFile(path)
    ss = [''.join(t.text or '' for t in si.iter(M + 't'))
          for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(M + "si")]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rid = next(s.get(R + "id") for s in wb.find(M + "sheets") if s.get("name") == name)
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = next(r.get("Target") for r in rels if r.get("Id") == rid)
    target = target.lstrip("/")
    sheet = ET.fromstring(z.read(target if target.startswith("xl/") else "xl/" + target))
    rows = []
    for row in sheet.iter(M + "row"):
        vals = []
        for c in row:
            v = c.find(M + "v")
            vals.append(None if v is None else (ss[int(v.text)] if c.get("t") == "s" else v.text))
        rows.append(vals)
    return rows


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    ym, url = latest_resource()
    f = RAW / f"{ym}_inform_severity.xlsx"
    if not f.exists():
        req = urllib.request.Request(url, headers=UA)
        f.write_bytes(urllib.request.urlopen(req, timeout=120).read())
    rows = read_sheet(f, SHEET)
    hdr = next(r for r in rows if r and r[0] == "CRISIS")
    ix = {h: i for i, h in enumerate(hdr) if h}
    i_c, i_iso, i_sev = ix["COUNTRY"], ix["ISO3"], next(i for h, i in ix.items() if h.startswith("INFORM Severity Index"))
    cats = [i for i, h in enumerate(hdr) if h and h.startswith("INFORM Severity category")]
    i_trend = next((i for h, i in ix.items() if h.startswith("Trend")), None)
    out = []
    for r in rows:
        if len(r) <= i_sev or not r[i_iso] or not re.fullmatch(r"[A-Z]{3}", r[i_iso] or ""):
            continue
        try:
            sev = float(r[i_sev])
        except (TypeError, ValueError):
            continue
        out.append({"iso3": r[i_iso], "country": r[i_c], "severity": round(sev, 2),
                    "category": int(float(r[cats[0]])) if r[cats[0]] else None,
                    "trend": r[i_trend] if i_trend is not None and len(r) > i_trend else "", "release": ym})
    df = pd.DataFrame(out).sort_values("severity", ascending=False).drop_duplicates("iso3")
    df.to_csv(OUT, index=False)
    print(f"INFORM Severity {ym}: {len(df)} countries -> {OUT.relative_to(ROOT)}")
    print(df.head(8).to_string(index=False))


if __name__ == "__main__":
    main()
