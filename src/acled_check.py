"""One-off test: does your myACLED account have API access?

Run it yourself in a terminal:   python src/acled_check.py
It asks for your email and password (the password is not shown and not saved),
logs in, and asks for 3 recent events. Nothing is written to disk.
"""
import getpass
import json
import os
import urllib.error
import urllib.parse
import urllib.request

TOKEN_URL = "https://acleddata.com/oauth/token"
DATA_URL = "https://acleddata.com/api/acled/read"
UA = "Mozilla/5.0 (compatible; AidGapResearchBot/1.0)"


def post_form(url, fields):
    body = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    email = os.environ.get("ACLED_EMAIL") or input("myACLED email: ").strip()
    password = os.environ.get("ACLED_PASSWORD") or getpass.getpass("myACLED password: ")
    try:
        tok = post_form(TOKEN_URL, {
            "username": email, "password": password,
            "grant_type": "password", "client_id": "acled", "scope": "authenticated",
        })
    except urllib.error.HTTPError as e:
        print("Login failed:", e.code, e.read()[:300].decode("utf-8", "replace"))
        return
    print("Login OK. Token valid for", tok.get("expires_in"), "seconds.")

    query = urllib.parse.urlencode({
        "_format": "json", "limit": 3,
        "fields": "event_id_cnty|event_date|event_type|country|fatalities",
    }, safe="|")
    req = urllib.request.Request(DATA_URL + "?" + query,
                                 headers={"Authorization": "Bearer " + tok["access_token"],
                                          "User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.load(r)
    except urllib.error.HTTPError as e:
        print("Data request refused:", e.code, e.read()[:300].decode("utf-8", "replace"))
        print("This usually means your account tier has no API access.")
        return
    rows = out.get("data", [])
    print("Data request OK. Rows returned:", len(rows))
    for row in rows:
        print(" ", row)
    if rows:
        newest = max(r.get("event_date", "") for r in rows)
        print("Newest event date in sample:", newest)

    # Recency test: ask only for the last 90 days, then the last 400 days.
    import datetime
    today = datetime.date.today()
    for days in (90, 400):
        start = (today - datetime.timedelta(days=days)).isoformat()
        q = urllib.parse.urlencode({
            "_format": "json", "limit": 5, "event_date": start + "|" + today.isoformat(),
            "event_date_where": "BETWEEN", "fields": "event_date|event_type|country",
        }, safe="|")
        req = urllib.request.Request(DATA_URL + "?" + q, headers={
            "Authorization": "Bearer " + tok["access_token"], "User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                got = json.load(r)
            data = got.get("data", [])
            print("Last", days, "days: rows returned =", len(data),
                  "| newest =", max((x["event_date"] for x in data), default="none"))
            if not data and got.get("message"):
                print("  message:", got.get("message"))
        except urllib.error.HTTPError as e:
            print("Last", days, "days refused:", e.code, e.read()[:200].decode("utf-8", "replace"))


if __name__ == "__main__":
    main()
