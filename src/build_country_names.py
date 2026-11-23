"""
Builds data/reference/country_names.csv: country name (lower case) -> ISO3, used by fetch_live.py to attach countries to events
(e.g. a WHO notice "Chikungunya virus disease - Switzerland" or a USGS place "Comandau, Romania").
Names come from the map's country list (data/raw/geo/countries.geo.json) plus the aliases below that the live sources use.
Run once (needs the geo file); the CSV is committed so the GitHub Action does not need the geo file.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALIASES = {
    "COD": ["democratic republic of congo", "democratic republic of the congo", "dr congo", "drc", "congo, democratic republic of the"],
    "COG": ["congo", "republic of congo", "republic of the congo"],
    "LAO": ["lao pdr", "lao people's democratic republic", "laos"],
    "VNM": ["viet nam", "vietnam"], "RUS": ["russia", "russian federation"], "KOR": ["south korea", "republic of korea"],
    "PRK": ["north korea", "dpr korea", "democratic people's republic of korea"],
    "USA": ["united states", "united states of america", "usa"], "GBR": ["united kingdom", "uk", "great britain"],
    "BOL": ["bolivia", "bolivia (plurinational state of)"], "VEN": ["venezuela", "venezuela (bolivarian republic of)"],
    "IRN": ["iran", "iran (islamic republic of)", "islamic republic of iran", "iran, islamic republic of"], "SYR": ["syria", "syrian arab republic"],
    "TZA": ["tanzania", "united republic of tanzania"], "CZE": ["czech republic", "czechia"],
    "BIH": ["bosnia and herzegovina", "bosnia & herzegovina", "bosnia  and  herzegovina"],
    "CIV": ["cote d'ivoire", "côte d'ivoire", "ivory coast"],
    "PSE": ["occupied palestinian territory", "palestine", "state of palestine", "west bank", "gaza", "gaza strip"],
    "MMR": ["myanmar", "burma"], "CPV": ["cabo verde", "cape verde"], "TUR": ["turkey", "türkiye", "turkiye"],
    "SWZ": ["eswatini", "swaziland", "eswatini, kingdom of"], "MKD": ["north macedonia", "macedonia"], "MDA": ["moldova", "republic of moldova", "moldova, republic of"],
    "SAU": ["saudi arabia", "kingdom of saudi arabia"], "TLS": ["timor-leste", "east timor", "timor leste"], "GNB": ["guinea-bissau", "guinea bissau"],
    "SRB": ["serbia", "republic of serbia"], "BHS": ["bahamas", "the bahamas"], "GMB": ["gambia", "the gambia", "gambia, republic of the"],
    "FSM": ["micronesia", "federated states of micronesia"], "PNG": ["papua new guinea"], "MNG": ["mongolia"],
    "TWN": ["taiwan"], "HKG": ["hong kong"], "ARE": ["united arab emirates", "uae"], "KGZ": ["kyrgyzstan", "kyrgyz republic"],
    "SVK": ["slovakia", "slovak republic"], "SOM": ["somalia"], "PHL": ["philippines", "the philippines"],
    "NER": ["niger"], "NGA": ["nigeria"], "BRN": ["brunei", "brunei darussalam"], "GUF": ["french guiana"], "REU": ["réunion", "reunion", "réunion (france)"],
    "COM": ["comoros"], "MUS": ["mauritius"], "WSM": ["samoa"], "COK": ["cook islands"], "STP": ["sao tome and principe", "são tomé and príncipe"],
    "GUM": ["guam"], "MNP": ["northern mariana islands"], "ABW": ["aruba"], "ASM": ["american samoa"], "KIR": ["kiribati"], "MHL": ["marshall islands"],
    "PLW": ["palau"], "TUV": ["tuvalu"], "TON": ["tonga"], "VUT": ["vanuatu"], "FJI": ["fiji"], "MDV": ["maldives"], "SYC": ["seychelles"],
    "TZA": ["tanzania, united republic of"], "NCL": ["new caledonia", "new caledonia (france)"], "NRU": ["nauru", "republic of naoero"],
}
g = json.load(open(ROOT / "data" / "raw" / "geo" / "countries.geo.json", encoding="utf-8"))
rows = {f["properties"]["name"].lower(): f["id"] for f in g["features"]}
for iso, names in ALIASES.items():
    for n in names:
        rows[n.lower()] = iso
with open(ROOT / "data" / "reference" / "country_names.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh)
    w.writerow(["name", "iso3"])
    for n in sorted(rows):
        w.writerow([n, rows[n]])
print(len(rows), "names")
