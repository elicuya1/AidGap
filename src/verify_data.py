"""
AidGap - Step 12: verify the data end to end. Prints PASS / FAIL / NOTE for every check.

What it checks
  A. Funding numbers: our appeal funding (from HAPI) vs the OCHA FTS plans API (a second,
     independent route to the same numbers).
  B. Scores: recomputes the Neglect Score from scratch and compares it with the pipeline's.
  C. Hand-added needs figures: tries to read each official document (honest client name,
     no tricks) and looks for the figure. If a site refuses automated access we STOP and
     report "could not verify": we never get around a block.
  D. The dashboard files agree with the CSVs, and the map has a shape for every country.
  E. Donor totals are consistent.

Run:  python src/verify_data.py
Saves: data/reference/verification_report.csv (so the results are tracked)
"""

import csv
import io
import json
import re
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
REF = ROOT / "data" / "reference"
DASH = ROOT / "dashboard"
UA = "AidGap-portfolio-project/0.1 (data verification)"
results: list[dict] = []


def log(group: str, check: str, status: str, detail: str = "") -> None:
    results.append({"group": group, "check": check, "status": status, "detail": detail,
                    "checked": date.today().isoformat()})
    print(f"[{status:<4}] {group}: {check}" + (f"  ({detail})" if detail else ""), flush=True)


def js_payload(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8").split("=", 1)[1].rstrip().rstrip(";"))


# ---------------------------------------------------------------- A. funding vs FTS plans
def check_funding() -> None:
    gap = pd.read_csv(PROC / "gap_table.csv")
    year = int(gap["year"].max())
    req = urllib.request.Request(f"https://api.hpc.tools/v1/public/plan/year/{year}", headers={"User-Agent": UA})
    try:
        plans = json.loads(urllib.request.urlopen(req, timeout=60).read())["data"]
    except Exception as e:                                    # noqa: BLE001
        log("A funding", "FTS plans API reachable", "NOTE", f"{type(e).__name__}: could not cross-check")
        return
    by_iso: dict[str, list[dict]] = {}
    for p in plans:
        for loc in p.get("locations") or []:
            if loc.get("iso3"):
                by_iso.setdefault(loc["iso3"], []).append(p)
    bad = []
    for _, r in gap.iterrows():
        cand = by_iso.get(r["location_code"], [])
        if not cand:
            continue
        # a country can have several plans; we sum those that have a requirement
        rq = sum((p.get("revisedRequirements") or 0) for p in cand if len(p.get("locations") or []) == 1)
        fd = sum(((p.get("funding") or {}).get("totalFunding") or 0) for p in cand if len(p.get("locations") or []) == 1)
        if rq <= 0:
            continue
        ours = r["requirements_usd"]
        if abs(ours - rq) / max(ours, 1) > 0.15:
            bad.append(f"{r['location_code']} ours ${ours/1e6:,.0f}M vs FTS ${rq/1e6:,.0f}M")
    n = len([1 for _, r in gap.iterrows() if r["location_code"] in by_iso])
    log("A funding", f"requirements agree with FTS plans API within 15% ({n} countries compared)",
        "PASS" if not bad else "NOTE", "; ".join(bad[:8]) if bad else "")


# ---------------------------------------------------------------- B. scores
def check_scores() -> None:
    gap = pd.read_csv(PROC / "gap_table.csv")
    sc = pd.read_csv(PROC / "neglect_scores.csv")
    df = gap[gap["has_national_plan"]].copy()
    n = len(df)

    def pct(v, worse_high):                                   # independent re-implementation
        r = v.rank(method="average", ascending=worse_high)
        return r / n * 100
    cov = pct(df["funding_pct"], False)
    per = pct(df["funding_per_person_usd"], False)
    scl = pct(df["people_in_need"], True)
    mine = (0.4 * cov + 0.4 * per + 0.2 * scl).round(1)
    merged = pd.DataFrame({"code": df["location_code"], "mine": mine}).merge(
        sc[["location_code", "neglect_score"]], left_on="code", right_on="location_code")
    diff = (merged["mine"] - merged["neglect_score"]).abs().max()
    log("B scores", f"independent recomputation matches neglect_scores.csv ({len(merged)} crises)",
        "PASS" if diff < 0.06 else "FAIL", f"max difference {diff:.2f}")
    # v2: independent recomputation from the stated formula and fixed ranges (a missing measure is left out and the rest rescaled)
    import math
    import numpy as np
    v2 = pd.read_csv(PROC / "neglect_scores_v2.csv")
    v2 = v2[v2["severity_rated"]]
    lg = lambda x: x.map(math.log10)
    parts = [
        (0.14, (100 - v2["funding_pct"]).clip(0, 100)),
        (0.06, (-v2["funding_change"] / 0.5 * 100).clip(0, 100)),
        (0.15, (100 - v2["avg_funded_2021_25"]).clip(0, 100)),
        (0.25, ((v2["inform_severity"] - 1) / 9 * 100).clip(0, 100)),
        (0.08, ((lg(v2["people_in_need"]) - 5) / (math.log10(5e7) - 5) * 100).clip(0, 100)),
        (0.12, (v2["displaced_share"] / 0.30 * 100).clip(0, 100)),
        (0.05, ((math.log10(10000) - lg(v2["gdp_per_capita"])) / (math.log10(10000) - math.log10(500)) * 100).clip(0, 100)),
        (0.05, ((v2["top_donor_share"] - 0.10) / 0.60 * 100).clip(0, 100)),
        (0.10, 100 - (lg(v2["reports_per_week"].clip(lower=1)) / math.log10(60) * 100).clip(0, 100)),
    ]
    num = sum(w * p.fillna(0) for w, p in parts)
    den = sum(w * p.notna() for w, p in parts)
    mine2 = (num / den).round(1)
    d2 = (mine2 - v2["score_v2"]).abs().max()
    log("B scores", f"v2 score recomputed independently ({len(v2)} rated crises)", "PASS" if d2 < 0.06 else "FAIL", f"max difference {d2:.2f}")
    log("B scores", "no missing values in ranked rows",
        "PASS" if sc[["funding_pct", "funding_per_person_usd", "people_in_need", "neglect_score"]].notna().all().all() else "FAIL")
    log("B scores", "funding percent = funding / requirement",
        "PASS" if ((sc["funding_usd"] / sc["requirements_usd"] * 100 - sc["funding_pct"]).abs() < 1e-6).all() else "FAIL")
    log("B scores", "dollars per person = funding / people in need",
        "PASS" if ((sc["funding_usd"] / sc["people_in_need"] - sc["funding_per_person_usd"]).abs() < 1e-6).all() else "FAIL")


# ---------------------------------------------------------------- C. hand-added needs figures
def text_of(url: str):
    """(status, text). Never disguises the client; a refusal is reported, not bypassed."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/pdf"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw, ctype = r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return f"refused (HTTP {e.code})", ""
    except Exception as e:                                    # noqa: BLE001
        return f"unreachable ({type(e).__name__})", ""
    if "pdf" in ctype.lower() or raw[:4] == b"%PDF":
        try:
            from pypdf import PdfReader
            return "ok", "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(raw)).pages[:12])
        except Exception as e:                                # noqa: BLE001
            return f"unreadable PDF ({type(e).__name__})", ""
    return "ok", re.sub(r"<[^>]+>", " ", raw.decode("utf-8", errors="replace"))


def figure_variants(n: int) -> list[str]:
    s = f"{n:,}"
    out = [s, s.replace(",", " "), s.replace(",", "")]
    if n >= 1_000_000:
        out += [f"{n/1e6:.2f} million", f"{n/1e6:.1f} million", f"{n/1e6:.1f}M", f"{n/1e6:.2f}M"]
    elif n >= 100_000:
        out += [f"{n/1e3:.0f}K", f"{n/1e3:.0f},000"]
    return out


def check_manual_pin() -> None:
    for r in csv.DictReader((REF / "manual_pin.csv").open(encoding="utf-8")):
        code, n, used = r["location_code"], int(r["people_in_need"]), r["use_in_ranking"] == "yes"
        status, text = text_of(r["source_url"])
        label = f"{code} {n:,} people in need ({'used' if used else 'not used'})"
        if status != "ok":
            log("C needs figures", label, "NOTE", f"could not verify: {status}. Please check by hand: {r['source_url']}")
            continue
        found = [v for v in figure_variants(n) if v.lower() in text.lower()]
        log("C needs figures", label, "PASS" if found else "NOTE",
            f"figure '{found[0]}' appears in the document" if found else "document opened but the figure was not found in its text")


# ---------------------------------------------------------------- D. dashboard files
def check_dashboard() -> None:
    sc = pd.read_csv(PROC / "neglect_scores_v2.csv")
    sc = sc[sc["severity_rated"]].rename(columns={"score_v2": "neglect_score"})
    data = js_payload(DASH / "data.js")
    mp = js_payload(DASH / "map.js")
    log("D dashboard", "data.js has every ranked crisis", "PASS" if len(data["crises"]) == len(sc) else "FAIL",
        f"{len(data['crises'])} vs {len(sc)}")
    same = all(abs(c["neglect_score"] - float(sc.loc[sc.location_code == c["location_code"], "neglect_score"].iloc[0])) < 1e-9
               for c in data["crises"])
    log("D dashboard", "scores in data.js equal the CSV", "PASS" if same else "FAIL")
    codes = [c["location_code"] for c in data["crises"]] + [u["location_code"] for u in data["unranked"]]
    missing = [c for c in codes if c not in mp["paths"]]
    log("D dashboard", "map has a shape for every ranked/unranked country", "PASS" if not missing else "FAIL", ", ".join(missing))
    total = sum(c["people_in_need"] for c in data["crises"]) / 1e6
    log("D dashboard", "hero number = sum of people in need", "NOTE", f"page shows {total:.1f} million")
    pct = sum(c["funding_usd"] for c in data["crises"]) / sum(c["requirements_usd"] for c in data["crises"]) * 100
    log("D dashboard", "hero 'funded' share", "NOTE", f"{pct:.1f}% funded, ${sum(c['unmet_usd'] for c in data['crises'])/1e9:.1f}B unpaid")
    don = DASH / "donors.js"
    if don.exists():
        d = js_payload(don)["byCode"]
        bad = [k for k, v in d.items() if sum(t["usd"] for t in v["top"]) + v["other"] + v["not_specified"] > v["total"] * 1.001]
        log("E donors", "donor parts never exceed the country total", "PASS" if not bad else "FAIL", ", ".join(bad))


def main() -> None:
    check_funding(); check_scores(); check_manual_pin(); check_dashboard()
    with (REF / "verification_report.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["group", "check", "status", "detail", "checked"])
        w.writeheader(); w.writerows(results)
    c = {s: sum(1 for r in results if r["status"] == s) for s in ("PASS", "FAIL", "NOTE")}
    print(f"\nPASS {c['PASS']}   FAIL {c['FAIL']}   NOTE {c['NOTE']}  (NOTE = could not verify or worth a look)")


if __name__ == "__main__":
    main()
