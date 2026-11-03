"""Run the rules over the cases of export_cases.mjs and say how often each rule fires.

python -m usable_oracle.audit pipeline/oracle/out/cases.json [--json pipeline/oracle/out/audit.json] [--show 2]   (from the folder pipeline/oracle)
Exit code 0 when no case has an error, 1 otherwise: it can gate a build.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict

from .rules import RULES, check_case

CLASS = {  # the four things the app was blamed for, and the rule codes that measure each
    "too small spaces": ("net-width", "net-area", "net-aspect"),
    "walls that hit windows": ("wall-hits-window", "window-in-corner", "window-overlap"),
    "furniture inside walls": ("furniture-in-wall",),
    "walls inside walls": ("pokes-into-outer-wall", "overlapping-walls"),
}


def audit(cases: list[dict]) -> dict:
    per_rule: Counter = Counter()
    cases_with: dict[str, set] = defaultdict(set)
    examples: dict[str, list] = defaultdict(list)
    bad_cases = set()
    flagged_cases, unflagged_small = set(), 0  # too-small findings in plans the app itself flagged (a brief that did not fit) and in plans it did not flag (a bug)
    for c in cases:
        flagged = (c.get("app_flags") or {}).get("narrow", 0) > 0
        for v in check_case(c):
            if v.rule in ("net-width", "net-area", "net-aspect"):
                if flagged:
                    flagged_cases.add(c["id"])
                else:
                    unflagged_small += 1
            per_rule[v.rule] += 1
            cases_with[v.rule].add(c["id"])
            if v.severity == "error":
                bad_cases.add(c["id"])
            if len(examples[v.rule]) < 3:
                examples[v.rule].append({"case": c["id"], "subject": v.subject, "message": v.message})
    n = len(cases)
    classes = {name: {"violations": sum(per_rule[r] for r in codes), "cases": len(set().union(*[cases_with[r] for r in codes])), "share_of_cases": round(len(set().union(*[cases_with[r] for r in codes])) / n, 3) if n else 0} for name, codes in CLASS.items()}
    return {
        "cases": n,
        "cases_with_an_error": len(bad_cases),
        "per_rule": {r: {"violations": k, "cases": len(cases_with[r]), "examples": examples[r]} for r, k in per_rule.most_common()},
        "the_four": classes,
        "too_small_split": {"in_plans_the_app_flagged": len(flagged_cases), "violations_in_plans_the_app_did_not_flag": unflagged_small},
        "rules": [{"id": rid, "answers": what} for rid, _, what in RULES],
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cases")
    ap.add_argument("--json")
    ap.add_argument("--show", type=int, default=2, help="examples per rule to print")
    a = ap.parse_args(argv)
    with open(a.cases, encoding="utf-8") as f:
        cases = json.load(f)["cases"]
    res = audit(cases)
    print(f"{res['cases']} plans, {res['cases_with_an_error']} with at least one error\n")
    print("the four complaints:")
    for name, v in res["the_four"].items():
        print(f"  {name:<24} {v['violations']:>5} violations in {v['cases']:>3} plans ({v['share_of_cases'] * 100:.0f} %)")
    sp = res["too_small_split"]
    print(f"  of the too-small findings: {sp['in_plans_the_app_flagged']} plans were flagged by the app itself (the brief did not fit), {sp['violations_in_plans_the_app_did_not_flag']} violations came in plans it did not flag")
    print("\nby rule:")
    for r, v in res["per_rule"].items():
        print(f"  {r:<24} {v['violations']:>5} in {v['cases']:>3} plans")
        for e in v["examples"][: a.show]:
            print(f"      {e['case']}: {e['message']}")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=1)
    return 0 if res["cases_with_an_error"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
