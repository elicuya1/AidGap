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
4. `src/gap_score.py` → `data/processed/neglect_scores.csv` (Neglect Score v1)

## Data source
- HDX HAPI **v2**: `https://hapi.humdata.org/api/v2/...` (funding: `coordination-context/funding`; needs: `affected-people/humanitarian-needs`)
- Every request needs `app_identifier`, stored in `src/config_local.py` (git-ignored — never commit or print it).
- Max 10,000 rows per request; page with `offset`.

## Data decisions (keep these)
- Funding: current year only; drop appeals with no `requirements_usd` (some records are dated 2031 with NaN targets).
- People in need: `population_status` INN, intersectoral sector, admin level 0; take the MAX across categories, never sum sectors.
- Countries without a PIN figure are mostly in **Regional response plans** (refugee-hosting countries, e.g. Latin America). Their per-country funding is unreliable → excluded from rankings (`has_national_plan` flag).
- Flag rows where the PIN year is older than the funding year (e.g. Honduras: PIN 2025).

## Findings so far (2026)
- 45 countries with appeals; 21 with a national plan, 24 regional-only.
- Lowest $ per person in need: Honduras (~$0.73, 2.9% funded), Yemen, Afghanistan, Myanmar, Mali, Burkina Faso, Sudan.

## Neglect Score v1
Percentile ranks among national-plan countries, weighted: coverage (% funded) 40%, $ per person in need 40%, scale (people in need) 20%. 0–100, higher = more neglected. Weights are a choice → later: sensitivity analysis.

## Roadmap
- [x] Setup, funding data, needs data, gap table, Neglect Score v1
- [ ] Run gap_score.py on real data and review the ranking
- [ ] Streamlit dashboard: world map colored by Neglect Score, country detail view
- [ ] Multi-year trends + automated alerts (GitHub Actions, weekly)
- [ ] Media coverage phase: GDELT DOC API (volume, tone, source country). Frame as "narrative analysis", not "propaganda". Validate against CARE's under-reported crises list.
- [ ] Deploy (Streamlit Community Cloud) + polished README with methodology and limitations
