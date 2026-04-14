# OpenStack Security Misconfiguration Scanner

An automated tool that scans an OpenStack cloud environment for security misconfigurations and generates a risk report with severity scoring.

---

## Architecture

```
openstack-scanner/
├── main.py                        # Entry point
├── config.py                      # OpenStack connection via env vars
├── collector/
│   └── data_collector.py          # Fetches resources from OpenStack APIs
├── rules/
│   ├── network_rules.py           # Checks security group rules
│   ├── ip_rules.py                # Checks floating IP allocation
│   └── storage_rules.py          # Checks volume encryption
├── scoring/
│   └── risk_scorer.py             # Calculates weighted risk score
└── reporting/
    └── report_generator.py        # Prints report + exports JSON
```

The scanner follows a modular pipeline:

```
OpenStack APIs → Data Collector → Rule Engine → Risk Scorer → Reporter
```

---

## Requirements

- Python 3.8+
- A running OpenStack environment (DevStack or Kolla-Ansible)
- Admin credentials

---

## Setup

**1. Clone the repository**
```bash
git clone https://github.com/raoufesseid/openstack-scanner.git
cd openstack-scanner
```

**2. Create and activate a virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Set your OpenStack credentials as environment variables**
```bash
export OS_AUTH_URL=http://<your-openstack-ip>:5000/v3
export OS_PROJECT_NAME=admin
export OS_USERNAME=admin
export OS_PASSWORD=your_password
export OS_USER_DOMAIN_NAME=Default
export OS_PROJECT_DOMAIN_NAME=Default
```

> Or simply source your existing openrc file:
> ```bash
> source ~/admin-openrc.sh
> ```

---

## Usage

**Run against a real OpenStack environment:**
```bash
python main.py
```

**Run with dummy data (no OpenStack needed):**
```bash
python test_logic.py
```

---

## What It Checks

| Check | Severity | API |
|---|---|---|
| SSH open to 0.0.0.0/0 or ::/0 | HIGH | Neutron |
| RDP open to 0.0.0.0/0 or ::/0 | HIGH | Neutron |
| Database ports exposed publicly (3306, 5432, 1433) | CRITICAL | Neutron |
| Allow-all security group rule | CRITICAL | Neutron |
| Unencrypted Cinder volumes | MEDIUM | Cinder |
| Orphaned floating IPs | LOW | Neutron |

---

## Risk Scoring

Each finding contributes to an overall risk score (capped at 100):

| Severity | Points |
|---|---|
| CRITICAL | 40 |
| HIGH | 25 |
| MEDIUM | 15 |
| LOW | 5 |

**Score ranges:**
- 🔴 70–100 → HIGH RISK
- 🟡 40–69 → MEDIUM RISK
- 🟢 0–39 → LOW RISK

---

## Output

The scanner prints a formatted report to the console and saves a timestamped JSON file:

```
report_YYYYMMDD_HHMMSS.json
```

Example console output:
```
🚀 Starting OpenStack Security Scanner...

  ✔ Collected 37 resources across 5 categories

==================================================
   OpenStack Security Scanner — Report
   Generated: 2026-04-10 11:36:22
==================================================

📋 Found 12 issue(s):
   CRITICAL: 2
   HIGH: 3
   MEDIUM: 4
   LOW: 3

[CRITICAL] Public Database Port
  Resource    : Security Group: misconfigured-sg
  Detail      : Rule exposes MySQL (port 3306) from 0.0.0.0/0
  Remediation : Database ports should never be publicly accessible.
...

Overall Risk Score: 100/100
🔴 Cloud Security Status: HIGH RISK
==================================================

📄 JSON report saved to: report_20260410_113622.json
```

best greeting besha bghal
