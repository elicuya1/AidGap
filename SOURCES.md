# Data sources and resources

_Generated from `data/reference/sources.csv` by `src/export_dashboard_data.py`. Edit the CSV, not this file._


## Used

- **[HDX HAPI v2: humanitarian needs](https://hapi.humdata.org/)** (OCHA Centre for Humdata (HDX)). People in need per country (intersectoral, national level).  
  Terms: See HDX / HAPI terms of use; credit OCHA and HDX. Accessed 2026-11-17. Needs data is often a year behind the funding year; such rows are flagged.
- **[HDX HAPI v2: funding](https://hapi.humdata.org/)** (OCHA Centre for Humdata (HDX); data from OCHA FTS). Funding requirements and amounts received per appeal.  
  Terms: See HDX / HAPI terms of use; credit OCHA FTS. Accessed 2026-11-17. Current year only; appeals with no requirement are dropped.
- **[OCHA Financial Tracking Service public API](https://api.hpc.tools/v1/public/fts/flow)** (UN OCHA). Who funds each crisis: donor country totals per recipient (flows grouped by donor country).  
  Terms: Public API; credit OCHA FTS. Accessed 2026-11-17. Counts only money given to one country (single flows). Money split across several countries is excluded to avoid double counting. Totals include money outside the formal appeal, so they are larger than the appeal funding.
- **[GDELT Project DOC 2.0 API](https://api.gdeltproject.org/api/v2/doc/doc)** (The GDELT Project). Recent English-language articles per crisis; outlet country; coverage mix.  
  Terms: Free and open; credit GDELT. Accessed 2026-11-17. Rate limits are strict, so data arrives slowly. Sample of up to 250 articles per crisis.
- **[World country outlines](https://github.com/johan/world.geo.json)** (johan/world.geo.json (outlines from Natural Earth)). Map shapes (drawn with the Equal Earth projection).  
  Terms: Natural Earth is public domain. Accessed 2026-11-17. Palestine appears as the West Bank only.
- **[Hand-found people-in-need figures](https://github.com/elicuya1/AidGap/blob/main/data/reference/manual_pin.csv)** (OCHA / UNICEF / WFP / ECHO documents (see data/reference/manual_pin.csv)). Missing people-in-need figures for Palestine, Lebanon, Madagascar, Nepal, Viet Nam (used) and Cuba, Pakistan, Honduras (found but not used).  
  Terms: Each row lists its own source URL. Accessed 2026-11-17. Figures were read from search-result summaries; the primary PDFs blocked our tools (HTTP 403). Please verify in the original documents.
- **[Where-to-donate pages](https://github.com/elicuya1/AidGap/blob/main/data/reference/donate_links.csv)** (UNICEF, World Food Programme, International Rescue Committee, MSF, UNRWA, Charity Navigator, CharityWatch, OCHA FTS (see data/reference/donate_links.csv)). Links to relief organisations' country pages.  
  Terms: Links only. Not an endorsement or rating. Accessed 2026-11-17. Each address was checked to load on the date shown. 'Loads' does not mean 'recommended'.

## Cited for context

- **[News Droughts News Floods and US Disaster Relief](https://doi.org/10.1162/qjec.122.2.693)** (Eisensee and Stromberg, Quarterly Journal of Economics (2007)). Research context: news coverage affects whether disaster relief is given.  
  Terms: Cited for context only. Accessed 2026-11-17. Please check the exact finding before quoting it in the final write-up.

## Planned

- **[Suffering in Silence (annual report)](https://www.care.org/)** (CARE International). Planned: compare with the most under-reported crises list.  
  Terms: Cited for context only. Accessed 2026-11-17. Not yet matched to our ranking.

## Possible future sources

- **[ReliefWeb API v2](https://apidoc.reliefweb.int/)** (UN OCHA). Considered for humanitarian reports per country.  
  Terms: Needs a pre-approved app name; requests returned HTTP 403 without one. Accessed 2026-11-17. Good future option: register a free app name, then add humanitarian reports per country.

## Considered and rejected

- **[Google News RSS](https://news.google.com/rss)** (Google). Considered for article lists.  
  Terms: The feed states it is for personal feed readers only; any other use is prohibited. Accessed 2026-11-17. Not used because the terms forbid use on a public website.
