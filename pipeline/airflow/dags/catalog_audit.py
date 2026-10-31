"""Data audit of the Usable Space knowledge base (CRISP-DM: data understanding).

Reads sources.json (the same file the app's Knowledge view shows), checks that every source is still reachable,
and writes a report next to it. It downloads no datasets: only a HEAD request (or a tiny GET when HEAD is refused),
so it is polite to the hosts and safe to run often. Licence text is never guessed here: the report only repeats
what sources.json says and flags the entries that still say "to verify".

Run it by hand in the Airflow web UI (trigger the DAG). Output: $USABLE_SPACE_HOME/out/catalog_audit.json
"""
import json
import os
from datetime import datetime
from pathlib import Path

import requests
from airflow.decorators import dag, task

HOME = Path(os.environ.get("USABLE_SPACE_HOME", "/workspace/usable-space"))
SOURCES = HOME / "sources.json"
OUT = HOME / "out"
HEADERS = {"User-Agent": "UsableSpace-research-audit/0.1 (student project, TH OWL)"}


@dag(
    dag_id="catalog_audit",
    schedule=None,  # manual: a research step, not a cron job
    start_date=datetime(2026, 11, 1),
    catchup=False,
    tags=["usable-space", "crisp-dm", "data-understanding"],
    doc_md=__doc__,
)
def catalog_audit():
    @task
    def load() -> list[dict]:
        data = json.loads(SOURCES.read_text(encoding="utf-8"))
        return data["sources"]

    @task
    def check(sources: list[dict]) -> list[dict]:
        rows = []
        for s in sources:
            url = s["url"]
            row = {"id": s["id"], "name": s["name"], "url": url, "status_in_catalogue": s["status"], "license_in_catalogue": s["license"]}
            if url.startswith("http://193.") or url.startswith("http://10.") or url.startswith("http://192.168."):
                row.update(reachable=None, note="campus address: not checked from outside the network")
            else:
                try:
                    r = requests.head(url, headers=HEADERS, timeout=15, allow_redirects=True)
                    if r.status_code >= 400:
                        r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
                        r.close()
                    row.update(reachable=r.status_code < 400, http=r.status_code, final_url=r.url,
                               size=r.headers.get("Content-Length"), modified=r.headers.get("Last-Modified"))
                except requests.RequestException as e:
                    row.update(reachable=False, note=type(e).__name__)
            rows.append(row)
        return rows

    @task
    def report(rows: list[dict]) -> str:
        OUT.mkdir(parents=True, exist_ok=True)
        summary = {
            "checked_at": datetime.now().isoformat(timespec="seconds"),
            "total": len(rows),
            "reachable": sum(1 for r in rows if r.get("reachable") is True),
            "unreachable": [r["id"] for r in rows if r.get("reachable") is False],
            "not_checked": [r["id"] for r in rows if r.get("reachable") is None],
            "licence_to_verify": [r["id"] for r in rows if "verify" in r["license_in_catalogue"] or "confirm" in r["license_in_catalogue"]],
            "rows": rows,
        }
        path = OUT / "catalog_audit.json"
        path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
        return str(path)

    report(check(load()))


catalog_audit()
