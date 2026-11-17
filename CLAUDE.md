# AidGap — project context for Claude Code

## What this is
AidGap compares humanitarian **need vs. funding** by crisis and ranks neglected crises.
Portfolio/resume project for Eli, a 2nd-year Data & Business Analytics student at IE University.
Goal: a full ongoing program (data pipeline + scoring model + dashboard + alerts), not a one-off report.

## About the developer
- Beginner with the command line and git. Explain steps simply, one at a time, and say what each command does before running it.
- Windows, cmd. Python venv in `.venv` (activate: `.venv\Scripts\activate`). No Anaconda.
- Uses GitHub Desktop; public repo github.com/elicuya1/AidGap. Commit after each working step with a clear message.

## Pipeline (run in this order)
1. `src/fetch_funding.py` → `data/raw/fts_funding.csv` (OCHA FTS funding per appeal)
2. `src/fetch_needs.py` → `data/raw/humanitarian_needs.csv`, `data/processed/pin_national.csv` (people in need per country/year)
3. `src/build_gap_table.py` → `data/processed/gap_table.csv` (funding + PIN joined per country, current year)
4. `src/gap_score.py` → `data/processed/neglect_scores.csv`, `unranked_appeals.csv` (Neglect Score v1)
5. `src/sensitivity.py` → `data/processed/sensitivity_ranks.csv` (rank under 6 weightings)
6. `src/export_dashboard_data.py` → `dashboard/data.js` (the only file the web page reads)

## Dashboard (`dashboard/`)
Custom static web page, NOT Streamlit (chosen for a smoother, more striking UI; hosts free on GitHub Pages).
- `index.html` = all UI (plain JS + canvas, no libraries); `score.js` = Neglect Score in JS (same maths as `gap_score.py`, tested: 0 mismatches); `data.js` = generated, committed.
- Centerpiece: dot-people field (1 dot = 100k people; blue = funded share of the appeal, orange = unfunded), toggle "Everyone together" / "By country". Plus live weight sliders that re-rank, detail drawer per country, "Not ranked" section, table view.
- To view: run steps 4-6, then double-click `dashboard/index.html` (no server needed).
- Dark/light theme; respects reduced-motion. Tested in headless Chrome (desktop + 375px phone). No world map yet.

## Data source
- HDX HAPI **v2**: `https://hapi.humdata.org/api/v2/...` (funding: `coordination-context/funding`; needs: `affected-people/humanitarian-needs`)
- Every request needs `app_identifier`, stored in `src/config_local.py` (git-ignored — never commit or print it).
- Max 10,000 rows per request; page with `offset`.

## Data decisions (keep these)
- Funding: current year only; drop appeals with no `requirements_usd` (some records are dated 2031 with NaN targets).
- People in need: `population_status` INN, intersectoral sector, admin level 0; take the MAX across categories, never sum sectors.
- Countries without a PIN figure are mostly in **Regional response plans** (refugee-hosting countries, e.g. Latin America). Their per-country funding is unreliable → excluded from rankings (`has_national_plan` flag).
- CAUTION: `has_national_plan` really means "has a PIN figure", not "has a national plan". 7 countries have their own non-regional appeal but no PIN in HAPI: State of Palestine ($4.06B, 35% funded), Lebanon, Cuba, Madagascar, Pakistan, Viet Nam, Nepal. They are NOT scored; `gap_score.py` lists them under "NOT RANKED" and saves `data/processed/unranked_appeals.csv`.
- Palestine (oPt Flash Appeal 2026): PIN likely 3.62M (Gaza 2.10M + West Bank 1.52M) but UNVERIFIED (OCHA pages blocked fetch; OCHA's at-a-glance page shows 3M, probably the targeted figure). Only add it by hand after checking the Flash Appeal PDF, with source and year.
- Rows where the PIN year is older than the funding year get `low_confidence = True` and a warning in the output (e.g. Honduras: PIN 2025, funding 2026). Still ranked, but indicative only.
- Tied scores share a rank (e.g. Myanmar and Sudan both rank 8).

## Findings so far (2026)
- 45 countries with appeals; 21 with a national plan, 24 regional-only.
- Lowest $ per person in need: Honduras (~$0.73, 2.9% funded), Yemen, Afghanistan, Myanmar, Mali, Burkina Faso, Sudan.
- Neglect Score v1 top 5: Yemen (93.3), Afghanistan (84.8), Honduras (81.0, low confidence), Mali (73.3), Burkina Faso (70.5). Bottom: Ukraine (18.1).

## Neglect Score v1
Percentile ranks among national-plan countries, weighted: coverage (% funded) 40%, $ per person in need 40%, scale (people in need) 20%. 0–100, higher = more neglected. Weights are a choice → later: sensitivity analysis.

## Roadmap
- [x] Setup, funding data, needs data, gap table, Neglect Score v1
- [x] Run gap_score.py on real data and review the ranking
- [ ] Verify Palestine PIN from the Flash Appeal PDF and add it (then scored normally)
- [x] Sensitivity analysis on weights (src/sensitivity.py): Yemen + Afghanistan top 5 in all 6 scenarios; Honduras, Mali, Sudan depend on weights
- [x] Dashboard v1 (custom web page, see Dashboard section): dot-people field, live re-ranking, country drawer
- [ ] Dashboard v2: world map view, shareable link for a weighting, polish after Eli's feedback
- [ ] Multi-year trends + automated alerts (GitHub Actions, weekly)
- [ ] Media coverage phase: GDELT DOC API (volume, tone, source country). Frame as "narrative analysis", not "propaganda". Validate against CARE's under-reported crises list.
- [ ] Deploy (GitHub Pages, serving `dashboard/`) + polished README with methodology and limitations
