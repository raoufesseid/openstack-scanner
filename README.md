# OpenStack Security Misconfiguration Scanner

An automated tool that scans an OpenStack cloud environment for security misconfigurations, generates a risk report, and visualizes results through a lightweight web dashboard.

---

## 🚀 Overview

This project consists of two main components:

1. Scanner Engine (Backend)
   - Collects OpenStack resources
   - Applies security rules
   - Calculates risk score
   - Exports results as JSON

2. Web Dashboard (Frontend)
   - Displays findings in a modern UI
   - Dynamically loads scan results from /report.json
   - Designed to be portable and backend-agnostic

---

## 🧱 Architecture

openstack-scanner/ ├── main.py ├── config.py ├── collector/ │   └── data_collector.py ├── rules/ │   ├── network_rules.py │   ├── ip_rules.py │   └── storage_rules.py ├── scoring/ │   └── risk_scorer.py ├── reporting/ │   └── report_generator.py │ ├── index.html ├── style.css ├── script.js │ └── .gitignore

---

## 🔄 Data Flow

OpenStack APIs       ↓ Data Collector       ↓ Rule Engine       ↓ Risk Scorer       ↓ JSON Report (report.json)       ↓ Frontend UI (Dashboard)

---

## 📦 Requirements

- Python 3.8+
- OpenStack environment (DevStack or Kolla-Ansible)
- Admin credentials
- Web browser

---

## ⚙️ Setup

### 1. Clone repository
bash git clone https://github.com/raoufesseid/openstack-scanner.git cd openstack-scanner 

### 2. Create virtual environment
bash python3 -m venv venv source venv/bin/activate 

### 3. Install dependencies
bash pip install -r requirements.txt 

### 4. Configure OpenStack credentials
bash export OS_AUTH_URL=http://<your-openstack-ip>:5000/v3 export OS_PROJECT_NAME=admin export OS_USERNAME=admin export OS_PASSWORD=your_password export OS_USER_DOMAIN_NAME=Default export OS_PROJECT_DOMAIN_NAME=Default 

Or:
bash source ~/admin-openrc.sh 

---

## ▶️ Usage

### Run scanner
bash python main.py 

This generates:
- report.json
- report_YYYYMMDD_HHMMSS.json

---

## 🖥️ Run UI Dashboard

Start server:
bash python3 -m http.server 8000 --bind 0.0.0.0 

Open:
- http://localhost:8000
- http://<VM-IP>:8000

---

## 🎯 UI Features

- Dark (black + green) dashboard
- Risk score visualization
- Severity classification
- Dynamic findings table
- Fetches data from /report.json
- Portable design (no hardcoded backend)

---

## 🔍 What It Checks

| Check | Severity | API |
|------|--------|-----|
| SSH open to 0.0.0.0/0 | HIGH | Neutron |
| RDP open to public | HIGH | Neutron |
| Public database ports | CRITICAL | Neutron |
| Allow-all security groups | CRITICAL | Neutron |
| Unencrypted volumes | MEDIUM | Cinder |
| Unused floating IPs | LOW | Neutron |

---

## 📊 Risk Scoring

| Severity | Points |
|---------|--------|
| CRITICAL | 40 |
| HIGH | 25 |
| MEDIUM | 15 |
| LOW | 5 |

- 🔴 70–100 → HIGH RISK  
- 🟡 40–69 → MEDIUM RISK  
- 🟢 0–39 → LOW RISK  

---

## 📄 Output

### Console
- Findings list
- Severity breakdown
- Risk score

### JSON
json {   "generated_at": "...",   "risk_score": 100,   "total_findings": 17,   "findings": [] } 

---

## ⚠️ Notes

- report.json is generated dynamically (ignored in git)
- UI depends on /report.json
- Ready for Kolla integration

---

## 🔮 Future Work

- Kolla integration
- Backend API
- Authentication
- Scan history
- CI/CD integration

---

## 👨‍💻 Contribution

1. Fork repo  
2. Create branch  
3. Commit changes  
4. Open PR  

---

## 📌 Summary

- Modular scanner backend  
- Risk scoring system  
- Portable UI dashboard  
- Ready for production integrat
