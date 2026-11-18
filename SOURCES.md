# Data sources and resources

_Generated from `data/reference/sources.csv` by `src/export_dashboard_data.py`. Edit the CSV, not this file._


## Used

- **[HDX HAPI v2: humanitarian needs](https://hapi.humdata.org/)** (OCHA Centre for Humdata (HDX)). People in need per country (intersectoral, national level).  
  Terms: See HDX / HAPI terms of use; credit OCHA and HDX. Accessed 2026-11-17. Needs data is often a year behind the funding year; such rows are flagged.
- **[HDX HAPI v2: funding](https://hapi.humdata.org/)** (OCHA Centre for Humdata (HDX); data from OCHA FTS). Funding requirements and amounts received per appeal.  
  Terms: See HDX / HAPI terms of use; credit OCHA FTS. Accessed 2026-11-17. Current year only; appeals with no requirement are dropped.
- **[OCHA Financial Tracking Service public API](https://api.hpc.tools/v1/public/fts/flow)** (UN OCHA). Who funds each crisis: donor country totals per recipient (flows grouped by donor country).  
  Terms: Public API; credit OCHA FTS. Accessed 2026-11-17. Counts only money given to one country (single flows). Money split across several countries is excluded to avoid double counting. Totals include money outside the formal appeal, so they are larger than the appeal funding.
- **[GDELT Project DOC 2.0 API](https://api.gdeltproject.org/api/v2/doc/doc)** (The GDELT Project). Recent articles per crisis in English, in each country's main local language, and from outlets inside the country; outlet country; coverage mix. GDELT machine-translates other languages for matching, so English keywords find them.  
  Terms: Free and open; credit GDELT. Accessed 2026-11-17. Rate limits are strict, so data arrives slowly. Windows longer than about a week return nothing (use 1 week). Titles are shown in the original language with optional on-device or Google Translate help.
- **[World country outlines](https://github.com/johan/world.geo.json)** (johan/world.geo.json (outlines from Natural Earth)). Map shapes (drawn with the Equal Earth projection).  
  Terms: Natural Earth is public domain. Accessed 2026-11-17. Palestine appears as the West Bank only.
- **[Hand-found people-in-need figures](https://github.com/elicuya1/AidGap/blob/main/data/reference/manual_pin.csv)** (OCHA / UNICEF / WFP / ECHO documents (see data/reference/manual_pin.csv)). Missing people-in-need figures for Palestine, Lebanon, Madagascar, Nepal, Viet Nam, Cuba and Pakistan (used) and Honduras (found, not used).  
  Terms: Each row lists its own source URL. Accessed 2026-11-17. Each figure was read in the original document on 2026-11-17 and matched against the funding total it should belong to (see verification_report.csv). Cuba and Pakistan were first set aside by mistake and corrected after this check. Honduras remains unresolved.
- **[Humanitarian Action plan pages](https://humanitarianaction.info/)** (UN OCHA (humanitarianaction.info)). Year-by-year people in need, targeted, requirements and funding per plan: used to check Viet Nam, Cuba and Pakistan.  
  Terms: Public site; credit OCHA. Accessed 2026-11-17. Its figures matched our FTS funding data for Viet Nam, Cuba and Pakistan.
- **[Country summaries](https://humanitarianaction.info/)** (AidGap, written from OCHA 2026 plan pages and ReliefWeb headlines (data/reference/country_context.csv)). One short paragraph per country on what is happening; each is paraphrased from a document read on 2026-11-17, with its basis and link.  
  Terms: Paraphrased, not copied; OCHA content is licensed CC BY 4.0. Accessed 2026-11-17. Fetched with src/fetch_context.py. Where a plan page had no readable English narrative the summary rests on the latest aid-sector headlines instead and says so. Refresh by re-running the fetch and rewriting the CSV.
- **[Local news outlets (public RSS feeds)](https://github.com/elicuya1/AidGap/blob/main/src/fetch_local_news.py)** (About 58 news outlets based in the crisis countries (list in src/fetch_local_news.py)). Local headlines (title, link, date, outlet) in each outlet's own language, filtered for humanitarian keywords.  
  Terms: Public RSS feeds; headlines and links only, shown with attribution; sites that refused access (HTTP 401/403/429) were skipped; please check each outlet's terms before wide publication. Accessed 2026-11-17. About 20 of 58 outlets had a readable feed with relevant items. State-run outlets (SANA, Cameroon Tribune, WAFA, Cubadebate, Granma, The Rising Nepal, Ukrinform) are labelled state-linked.
- **[Background photograph: Food distribution at a refugee settlement, Uganda](https://commons.wikimedia.org/wiki/File:Uganda_Refugee_Settlements_Emergency_Food_Distribution_(39910884580).jpg)** (USAID, via Wikimedia Commons). Black-and-white picture on the left, shown with the scale section.  
  Terms: Marked Public domain on Wikimedia Commons (checked 2026-11-17); credited on the page. Accessed 2026-11-17. Illustrates the topic of the section, not necessarily the country shown. Not an endorsement.
- **[Background photograph: Za'atri refugee camp, Jordan, from the air](https://commons.wikimedia.org/wiki/File:Aerial_View_of_the_Za%27atri_Refugee_Camp.jpg)** (US Dept of State, via Wikimedia Commons). Black-and-white picture on the left, shown with the map section.  
  Terms: Marked Public domain on Wikimedia Commons (checked 2026-11-17); credited on the page. Accessed 2026-11-17. Illustrates the topic of the section, not necessarily the country shown. Not an endorsement.
- **[Background photograph: Health screening at a UNHCR site](https://commons.wikimedia.org/wiki/File:Uganda_Refugee_Settlements_Emergency_Food_Distribution_(40818914905).jpg)** (USAID, via Wikimedia Commons). Black-and-white picture on the left, shown with the rank section.  
  Terms: Marked Public domain on Wikimedia Commons (checked 2026-11-17); credited on the page. Accessed 2026-11-17. Illustrates the topic of the section, not necessarily the country shown. Not an endorsement.
- **[Background photograph: A US Air Force C-130 being loaded with cargo](https://commons.wikimedia.org/wiki/File:C130-loading.jpg)** (US Air Force, via Wikimedia Commons). Black-and-white picture on the left, shown with the donors section.  
  Terms: Marked Public domain on Wikimedia Commons (checked 2026-11-17); credited on the page. Accessed 2026-11-17. Illustrates the topic of the section, not necessarily the country shown. Not an endorsement.
- **[Background photograph: A journalist with camera and radio phone](https://commons.wikimedia.org/wiki/File:Journalist_Lucy_Morgan_with_video_camera_and_phone_(7026619371).jpg)** (Donn Dughi, via Wikimedia Commons). Black-and-white picture on the left, shown with the media section.  
  Terms: Marked Public domain on Wikimedia Commons (checked 2026-11-17); credited on the page. Accessed 2026-11-17. Illustrates the topic of the section, not necessarily the country shown. Not an endorsement.
- **[Background photograph: Mothers waiting at a child clinic, Lagos, Nigeria (historic photo)](https://commons.wikimedia.org/wiki/File:Mothers_wait_in_line_at_Child_Clinic_Centre_in_Lagos,_Nigeria.png)** (Vernon McKay, via Wikimedia Commons). Black-and-white picture on the left, shown with the gaps section.  
  Terms: Marked Public domain on Wikimedia Commons (checked 2026-11-17); credited on the page. Accessed 2026-11-17. Illustrates the topic of the section, not necessarily the country shown. Not an endorsement.
- **[Verification report](https://github.com/elicuya1/AidGap/blob/main/data/reference/verification_report.csv)** (AidGap (src/verify_data.py)). Independent checks: funding vs FTS plans API; recomputed scores; hand-added figures read in source documents; dashboard files vs CSVs.  
  Terms: Our own output. Accessed 2026-11-17. Run python src/verify_data.py to repeat. Documents are fetched with an honest client name; if a site refuses, the check is reported as unverified and never bypassed.
- **[Where-to-donate pages](https://github.com/elicuya1/AidGap/blob/main/data/reference/donate_links.csv)** (UNICEF, World Food Programme, International Rescue Committee, MSF, UNRWA, Charity Navigator, CharityWatch, OCHA FTS (see data/reference/donate_links.csv)). Links to relief organisations' country pages.  
  Terms: Links only. Not an endorsement or rating. Accessed 2026-11-17. Each address was checked to load on the date shown. 'Loads' does not mean 'recommended'.
- **[ReliefWeb public RSS feeds](https://reliefweb.int/updates/rss.xml?legacy-river=country/yem)** (UN OCHA (ReliefWeb)). Latest 20 humanitarian reports per country (title, link, date, publisher); attention rate in reports per week.  
  Terms: Public feed; content belongs to its publishers; every item links to the original. Accessed 2026-11-17. No key needed. The feed ignores page numbers, so only the latest 20 reports per country are available; their time span gives the rate. Language is guessed from the headline.
- **[OCHA FTS: funding by donor and year](https://fts.unocha.org/)** (UN OCHA Financial Tracking Service). Worldwide humanitarian funding per year (2022 to 2026) by donor country, and US funding to each ranked crisis in 2024 vs 2025 (src/fetch_donor_trend.py).  
  Terms: Public API, no key; credit OCHA FTS. Accessed 2026-11-18. Only what donors and agencies report; late reports mean the newest year is incomplete. Shows amounts given, not how well money was spent. Money given to several countries at once is not split by country.
- **[World Bank: military expenditure (SIPRI)](https://data.worldbank.org/indicator/MS.MIL.XPND.CD)** (World Bank; underlying data SIPRI Military Expenditure Database). Military spending 2024 and 2025 for the biggest aid donors, shown next to their humanitarian aid (src/fetch_donor_trend.py).  
  Terms: World Bank open data (CC BY 4.0); credit World Bank and SIPRI. Accessed 2026-11-18. Current US dollars. No figures for Qatar or the UAE. A comparison only; it does not show that one spending choice caused another.

## Cited for context

- **[News Droughts News Floods and US Disaster Relief](https://doi.org/10.1162/qjec.122.2.693)** (Eisensee and Stromberg, Quarterly Journal of Economics (2007)). Research context: news coverage affects whether disaster relief is given.  
  Terms: Cited for context only. Accessed 2026-11-17. Please check the exact finding before quoting it in the final write-up.

## Planned

- **[Suffering in Silence (annual report)](https://www.care.org/)** (CARE International). Planned: compare with the most under-reported crises list.  
  Terms: Cited for context only. Accessed 2026-11-17. Not yet matched to our ranking.
- **[Anthropic (Claude) API](https://console.anthropic.com/)** (Anthropic). Optional: stored English translations of non-English headlines (src/translate_titles.py).  
  Terms: Paid per use; needs a key. Accessed 2026-11-17. Not used yet. Without it the page shows original headlines with an on-device translate button and a Google Translate link.

## Possible future sources

- **[ReliefWeb API v2](https://apidoc.reliefweb.int/)** (UN OCHA). Would give up to 1000 reports per call with full history, languages and themes.  
  Terms: Needs a pre-approved app name (free to request); requests returned HTTP 403 without one. Accessed 2026-11-17. Best way to fill the page with many more reports: request an app name, then add it to src/config_local.py and extend fetch_reliefweb.py.

## Considered and rejected

- **[Google News RSS](https://news.google.com/rss)** (Google). Considered for article lists.  
  Terms: The feed states it is for personal feed readers only; any other use is prohibited. Accessed 2026-11-17. Not used because the terms forbid use on a public website.
