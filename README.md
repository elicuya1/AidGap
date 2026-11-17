# AidGap

Tracks humanitarian **need vs. funding** by crisis and flags neglected crises.

Data: UN OCHA Financial Tracking Service (FTS), via the HDX Humanitarian API (HAPI).

## Setup

```bash
conda create -n aidgap python=3.11 -y
conda activate aidgap
pip install -r requirements.txt spyder-kernels
```

Create `src/config_local.py` (git-ignored) containing:

```python
APP_IDENTIFIER = "your-identifier"
```

Get the identifier from the HAPI sandbox: https://hapi.humdata.org/docs (Utility → encode identifier).

## Run

```bash
python src/fetch_funding.py
```

## Roadmap

- [ ] Funding data ingestion (FTS)
- [ ] Need data (people in need) + join
- [ ] Gap score model
- [ ] Streamlit dashboard with map
- [ ] Automated alerts for neglected crises
- [ ] Deploy
