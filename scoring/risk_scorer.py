import math

LIKELIHOOD = {
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 3,
    "CRITICAL": 4,
}

IMPACT = {
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 3,
    "CRITICAL": 4,
}


def calculate_score(findings):
    if not findings:
        return 0

    total_likelihood = 0
    max_impact = 0

    for f in findings:
        severity = f.get("severity", "LOW").upper()

        likelihood = LIKELIHOOD.get(severity, 1)
        impact = IMPACT.get(severity, 1)

        total_likelihood += likelihood
        max_impact = max(max_impact, impact)

    # normalize likelihood
    normalized_likelihood = min(total_likelihood / len(findings), 4)

    # OWASP formula
    score = (normalized_likelihood * max_impact / 16) * 100

    return round(score, 2)
