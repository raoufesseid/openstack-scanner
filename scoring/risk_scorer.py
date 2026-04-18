SEVERITY_WEIGHTS = {
    "CRITICAL": 40,
    "HIGH": 25,
    "MEDIUM": 15,
    "LOW": 5,
}


def calculate_score(findings):
    raw_score = 0

    for f in findings:
        severity = f.get("severity", "LOW").upper()
        raw_score += SEVERITY_WEIGHTS.get(severity, 0)

    total_findings = len(findings)
    max_possible = total_findings * 40

    if max_possible == 0:
        return 0

    return round((raw_score / max_possible) * 100, 2)
