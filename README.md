# OpenStack Security Misconfiguration Scanner

An automated tool that connects to a live OpenStack environment, scans it for security misconfigurations across five resource categories, scores the overall risk using an OWASP-based formula, and presents the results through both a CLI report and a React web UI.

---

## Features

- **14 security checks** across network, identity, compute, storage, and floating IP resources
- **OWASP-based risk scoring** — weighted by likelihood and maximum impact, capped at 100
- **React dashboard** for browsing scan history and drilling into findings
- **FastAPI backend** that triggers scans on demand and serves historical JSON reports
- **Dockerized** — runs as two services (scanner + UI) via Docker Compose
- **CI/CD pipeline** via GitHub Actions for automated deployment

---

## Architecture

```
openstack-scanner/
├── main.py                          # CLI entry point
├── api.py                           # FastAPI backend (triggers scans, serves reports)
├── config.py                        # OpenStack connection via environment variables
├── collector/
│   └── data_collector.py            # Fetches resources from OpenStack APIs
├── rules/
│   ├── network_rules.py             # Security group checks (SSH, RDP, DB ports, etc.)
│   ├── ip_rules.py                  # Floating IP checks
│   ├── storage_rules.py             # Cinder volume checks
│   ├── compute_rules.py             # Nova instance checks
│   └── identity_rules.py           # Keystone user/role checks
├── scoring/
│   └── risk_scorer.py               # OWASP-based weighted risk scoring
├── reporting/
│   └── report_generator.py          # Console report + JSON export
├── openstack-scanner-ui/            # React frontend (Vite)
├── Dockerfile
├── docker-compose.yml
└── .github/workflows/build.yml
```

### Pipeline

```
OpenStack APIs → Data Collector → Rule Engine → Risk Scorer → Reporter / React UI
```

---

## What It Checks

### Network (Neutron)

| Check | Severity |
|---|---|
| SSH open to `0.0.0.0/0` or `::/0` | HIGH |
| RDP open to `0.0.0.0/0` or `::/0` | HIGH |
| Database port exposed publicly (MySQL 3306, PostgreSQL 5432, MSSQL 1433) | CRITICAL |
| Unencrypted HTTP (port 80) exposed publicly | MEDIUM |
| HTTPS (port 443) exposed publicly — advisory | LOW |
| Allow-all security group rule | CRITICAL |
| Empty security group (no rules defined) | LOW |

### Identity (Keystone)

| Check | Severity |
|---|---|
| Non-default user granted admin role | HIGH |

### Compute (Nova)

| Check | Severity |
|---|---|
| Instance with no security group assigned | HIGH |
| Instance in ERROR state | MEDIUM |

### Storage (Cinder)

| Check | Severity |
|---|---|
| Unencrypted volume | MEDIUM |
| Volume in error state | MEDIUM |
| Volume allocated but not attached to any instance | LOW |

### Floating IPs (Neutron)

| Check | Severity |
|---|---|
| Floating IP allocated but not associated with any instance | LOW |

---

## Risk Scoring

Each finding is scored using an adapted OWASP Risk Rating formula based on **likelihood** and **impact**:

| Severity | Likelihood | Impact |
|---|---|---|
| LOW | 1 | 1 |
| MEDIUM | 2 | 2 |
| HIGH | 3 | 3 |
| CRITICAL | 4 | 4 |

```
score = (avg_likelihood × max_impact / 16) × 100
```

The denominator of 16 is the theoretical maximum (4 × 4), so no artificial cap is needed — the formula naturally produces a 0–100 range. The key property of this approach: **a single CRITICAL finding locks `max_impact` at 4**, immediately elevating the score regardless of how many low-severity issues exist. An environment with only LOW findings will always score significantly lower than one with a single CRITICAL finding, even at equal finding counts.

> **Why not a simpler formula?** Two alternatives were evaluated first: a plain additive sum (unbounded, hard to compare across scans) and a capped additive model (bounded at 100, but purely cumulative — many LOW findings could score the same as a few CRITICAL ones). The OWASP likelihood × impact model was chosen because it correctly reflects the asymmetric nature of security risk.

The score maps to three bands:

| Score | Status |
|---|---|
| 70 – 100 | 🔴 HIGH RISK |
| 40 – 69 | 🟡 MEDIUM RISK |
| 0 – 39 | 🟢 LOW RISK |

---

## AI Assistant (Beta)

The dashboard includes an experimental AI-powered security assistant built with the Groq API (Llama 3.1 8B). It provides context-aware remediation recommendations based on the current scan findings. The assistant is accessible as a floating chat interface from all dashboard pages.

---

## Requirements

- Python 3.8+
- Docker and Docker Compose (for containerized deployment)
- A running OpenStack environment (DevStack or Kolla-Ansible)
- Admin-level credentials

> **Tested on:** DevStack (development/validation) and Kolla-Ansible all-in-one on a physical Ubuntu 22.04 server (production validation). The scanner connects to OpenStack APIs over the host network and requires no modifications between environments.

---

## Quick Start

### Option 1 — Docker Compose (recommended)

**1. Clone the repository**
```bash
git clone https://github.com/raoufesseid/openstack-scanner.git
cd openstack-scanner
```

**2. Create a `.env` file with your OpenStack credentials**
```env
OS_AUTH_URL=http://<your-openstack-ip>:5000/v3
OS_PROJECT_NAME=admin
OS_USERNAME=admin
OS_PASSWORD=your_password
OS_USER_DOMAIN_NAME=Default
OS_PROJECT_DOMAIN_NAME=Default
```

**3. Start the UI**
```bash
docker compose up ui
```

The web dashboard will be available at `http://localhost:9000`.

**4. Run a one-off scan**
```bash
docker compose run scanner
```

---

### Option 2 — Local Python

**1. Clone and set up a virtual environment**
```bash
git clone https://github.com/raoufesseid/openstack-scanner.git
cd openstack-scanner
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**2. Export your OpenStack credentials**
```bash
export OS_AUTH_URL=http://<your-openstack-ip>:5000/v3
export OS_PROJECT_NAME=admin
export OS_USERNAME=admin
export OS_PASSWORD=your_password
export OS_USER_DOMAIN_NAME=Default
export OS_PROJECT_DOMAIN_NAME=Default
```

Or source an existing openrc file:
```bash
source ~/admin-openrc.sh
```

**3. Run the scanner**
```bash
python main.py
```

**4. (Optional) Start the API + UI**
```bash
uvicorn api:app --host 0.0.0.0 --port 9000
```

---

### No OpenStack? Run with dummy data

```bash
python test_logic.py
```

This runs the full rule engine and scoring pipeline against a set of hardcoded test fixtures — no OpenStack connection needed.

---

## Example Output

```
🚀 Starting OpenStack Security Scanner...

  ✔ Collected 37 resources across 6 categories

==================================================
   OpenStack Security Scanner — Report
   Generated: 2026-04-10 11:36:22
==================================================

📋 Found 12 issue(s):
   CRITICAL: 2
   HIGH: 3
   MEDIUM: 4
   LOW: 3

--------------------------------------------------

[CRITICAL] Public Database Port
  Resource    : Security Group: misconfigured-sg
  Detail      : Rule exposes MySQL (port 3306) from 0.0.0.0/0
  Remediation : Database ports should never be publicly accessible. Remove this rule immediately.

[HIGH] Public SSH Access
  Resource    : Security Group: default
  Detail      : Rule allows SSH (port 22) from 0.0.0.0/0
  Remediation : Restrict SSH access to known IP ranges only.

...

--------------------------------------------------
Overall Risk Score: 87.5/100
🔴 Cloud Security Status: HIGH RISK
==================================================

📄 JSON report saved to: reports/report_20260410_113622.json
```

Reports are saved as timestamped JSON files under `reports/` and are accessible through the web UI.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/scan` | Trigger a new scan and return the resulting report |
| `GET` | `/reports` | List all saved report filenames |
| `GET` | `/reports/{filename}` | Retrieve a specific report by filename |

---

## CI/CD

The project includes a GitHub Actions workflow (`.github/workflows/build.yml`) that triggers on pushes to `main` and pull requests. It SSHs into the deployment server and runs a remote deploy script automatically.

---

## Extending the Scanner

New checks can be added by creating a function in the appropriate file under `rules/` that returns a list of finding dictionaries:

```python
def check_my_new_rule(data):
    findings = []
    for item in data.get("some_resource", []):
        if some_condition(item):
            findings.append({
                "check": "My Check Name",
                "severity": "HIGH",          # CRITICAL | HIGH | MEDIUM | LOW
                "resource": f"Resource: {item.name}",
                "detail": "What was found",
                "remediation": "What to do about it",
            })
    return findings
```

Then import and call it in `main.py` alongside the existing rule sets.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Scanner | Python 3.11, openstacksdk |
| Backend API | FastAPI, Uvicorn |
| Frontend | React, Vite, Recharts |
| AI Assistant | Groq API, Llama 3.1 8B (beta) |
| Containerization | Docker, Docker Compose |
| Deployment | Kolla-Ansible (production), DevStack (development) |
| CI/CD | GitHub Actions |
