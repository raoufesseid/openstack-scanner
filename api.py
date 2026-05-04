from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import subprocess
import os
import json

app = FastAPI()

REPORTS_DIR = "reports"

@app.post("/scan")
def run_scan():
    try:
        result = subprocess.run(
            ["python", "main.py"],
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=result.stderr)
        
        # Return the latest report
        files = sorted(os.listdir(REPORTS_DIR))
        if not files:
            raise HTTPException(status_code=404, detail="No report generated")
        
        latest = files[-1]
        with open(f"{REPORTS_DIR}/{latest}") as f:
            return json.load(f)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Scan timed out")

@app.get("/reports")
def list_reports():
    if not os.path.exists(REPORTS_DIR):
        return []
    files = sorted(os.listdir(REPORTS_DIR), reverse=True)
    return [f for f in files if f.endswith(".json")]

@app.get("/reports/{filename}")
def get_report(filename: str):
    path = f"{REPORTS_DIR}/{filename}"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Report not found")
    with open(path) as f:
        return json.load(f)

# Serve React UI — must be last
app.mount("/", StaticFiles(directory="openstack-scanner-ui/dist", html=True), name="ui")
