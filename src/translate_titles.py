"""
AidGap - Step 15 (optional): translate non-English headlines to English with Claude.

Needs an Anthropic API key (see the steps at the bottom of this file). Without a key the
dashboard still works: it shows headlines in the original language with a "Translate" button
(on-device browser translator) and a "Read translated page" link.

What it does
  * collects every non-English headline from dashboard/media.js and dashboard/reports.js
  * sends them to Claude in batches and saves the English versions in
    data/processed/translations.json  (a cache, so each headline is translated only once)
  * the two build scripts then show the English text first and keep the original below it

Cost: headlines are short. Run with --dry-run first: it counts how many headlines would be
sent and prints a rough cost for the model you chose, without calling the API.

Run:   python src/translate_titles.py --dry-run
       python src/translate_titles.py
       python src/translate_titles.py --model claude-haiku-5-5      (much cheaper)
Then:  python src/build_media_summary.py ; python src/build_reports_summary.py ; python src/export_dashboard_data.py

How to get a key:
  1. Go to https://console.anthropic.com and sign up (this is separate from a Claude chat
     subscription or Claude Code login: the API is billed on its own).
  2. Add a small amount of credit under Billing.
  3. Open API Keys -> Create Key. Copy it once; it is shown only once.
  4. Save it where this project reads secrets, in src/config_local.py (already git-ignored):
         ANTHROPIC_API_KEY = "sk-ant-..."
     or set the ANTHROPIC_API_KEY environment variable. Never commit it or paste it in chat.
"""

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "processed" / "translations.json"
DEFAULT_MODEL = "claude-opus-5-5"
PRICE_PER_MTOK = {"claude-opus-5-5": (4.0, 20.0), "claude-sonnet-5-5": (2.0, 10.0), "claude-haiku-5-5": (0.10, 0.50)}
BATCH = 40


def js_payload(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8").split("=", 1)[1].rstrip().rstrip(";"))


def collect() -> list[str]:
    """Every distinct non-English headline we show."""
    titles: set[str] = set()
    for x in js_payload(ROOT / "dashboard" / "media.js").get("byCode", {}).values():
        for key in ("abroad", "local"):
            for a in x.get(key, []):
                if a.get("lang") not in ("", "English", None):
                    titles.add(a["title"])
    for x in js_payload(ROOT / "dashboard" / "reports.js").get("byCode", {}).values():
        for a in x.get("items", []):
            if a.get("lang") not in ("", "English", None):
                titles.add(a["title"])
    return sorted(t for t in titles if t)


def get_key() -> str | None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    sys.path.insert(0, str(ROOT / "src"))
    try:
        import config_local                                   # git-ignored
        return getattr(config_local, "ANTHROPIC_API_KEY", None)
    except ImportError:
        return None


def main() -> None:
    model = DEFAULT_MODEL
    if "--model" in sys.argv:
        model = sys.argv[sys.argv.index("--model") + 1]
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    todo = [t for t in collect() if t not in cache]
    tok_in, tok_out = len(todo) * 45 + 300, len(todo) * 35          # rough: ~45 tokens in, ~35 out each
    pin, pout = PRICE_PER_MTOK.get(model, (4.0, 20.0))
    cost = tok_in / 1e6 * pin + tok_out / 1e6 * pout
    print(f"{len(todo)} headlines to translate (cached: {len(cache)}). Model {model}: roughly ${cost:.2f}.")
    if "--dry-run" in sys.argv or not todo:
        return
    key = get_key()
    if not key:
        sys.exit("No API key found. See the steps at the top of this file.")
    import anthropic                                              # pip install anthropic
    client = anthropic.Anthropic(api_key=key)
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        prompt = ("Translate each news or report headline below into natural English. Keep names "
                  "and numbers exactly. Reply with ONLY a JSON array of strings, one per headline, "
                  "in the same order.\n\n" + json.dumps(chunk, ensure_ascii=False))
        resp = client.beta.messages.create(
            model=model, max_tokens=8000, output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            messages=[{"role": "user", "content": prompt}],
        )
        if resp.stop_reason == "refusal":
            print(f"  batch {i // BATCH + 1}: declined, skipped")
            continue
        text = "".join(b.text for b in resp.content if b.type == "text")
        m = re.search(r"\[.*\]", text, re.S)
        try:
            out = json.loads(m.group(0)) if m else []
        except json.JSONDecodeError:
            out = []
        if len(out) != len(chunk):
            print(f"  batch {i // BATCH + 1}: got {len(out)} for {len(chunk)}, skipped")
            continue
        cache.update(dict(zip(chunk, out)))
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  batch {i // BATCH + 1}: translated {len(chunk)}", flush=True)
    print(f"Saved {len(cache)} translations to {CACHE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
