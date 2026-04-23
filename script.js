async function runScan() {
  try {
    const response = await fetch("/report.json");
    const data = await response.json();

    const findings = data.findings || [];
    const tableBody = document.getElementById("findingsTableBody");
    tableBody.innerHTML = "";

    let totalScore = 0;

    findings.forEach(f => {
      let score = 0;

      if (f.severity === "CRITICAL") score = 40;
      else if (f.severity === "HIGH") score = 25;
      else if (f.severity === "MEDIUM") score = 15;
      else score = 5;

      totalScore += score;

      const row = `
        <tr>
          <td>${f.check}</td>
          <td class="${f.severity.toLowerCase()}">${f.severity}</td>
          <td>${f.resource}</td>
          <td>${f.detail}</td>
          <td>${f.remediation}</td>
        </tr>
      `;

      tableBody.innerHTML += row;
    });

    document.getElementById("totalFindings").innerText = findings.length;
    document.getElementById("riskScore").innerText = Math.min(totalScore, 100) + " / 100";

    let riskLevel = "LOW";
    if (totalScore >= 70) riskLevel = "HIGH";
    else if (totalScore >= 40) riskLevel = "MEDIUM";

    const riskElement = document.getElementById("riskLevel");
    riskElement.innerText = riskLevel;

    // Add color styling to risk level
    riskElement.className = "";
    if (riskLevel === "HIGH") riskElement.classList.add("critical");
    else if (riskLevel === "MEDIUM") riskElement.classList.add("medium");
    else riskElement.classList.add("low");

  } catch (error) {
    console.error("Error loading scan data:", error);
    alert("Failed to load scan data.");
  }
}

document.getElementById("runScanBtn").addEventListener("click", runScan);
