import { useEffect, useMemo, useState } from 'react'

const API_BASE = `http://${window.location.hostname}:9000`

function deriveCategory(check) {
  if (!check) return 'General'
  const c = check.toLowerCase()
  if (c.includes('ssh') || c.includes('port') || c.includes('floating') || c.includes('allow-all') || c.includes('database')) return 'Network'
  if (c.includes('volume') || c.includes('encrypt')) return 'Storage'
  if (c.includes('user') || c.includes('login') || c.includes('password') || c.includes('admin')) return 'Identity'
  if (c.includes('vm') || c.includes('instance') || c.includes('compute')) return 'Compute'
  return 'General'
}

function deriveStatus(severity) {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'Open'
  if (severity === 'MEDIUM') return 'Review'
  return 'Monitor'
}

function badgeClass(severity) {
  if (severity === 'CRITICAL') return 'border-red-500/30 bg-red-500/15 text-red-300'
  if (severity === 'HIGH') return 'border-orange-500/30 bg-orange-500/15 text-orange-300'
  if (severity === 'MEDIUM') return 'border-yellow-500/30 bg-yellow-500/15 text-yellow-300'
  return 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300'
}

function statusDotClass(severity) {
  if (severity === 'CRITICAL') return 'bg-red-400'
  if (severity === 'HIGH') return 'bg-orange-400'
  if (severity === 'MEDIUM') return 'bg-yellow-400'
  return 'bg-cyan-400'
}

function navButtonClass(active) {
  return active
    ? 'w-full rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-left font-semibold text-white shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
    : 'w-full rounded-2xl px-4 py-3 text-left font-medium text-slate-300 transition hover:bg-white/5 hover:text-white'
}

function riskLabel(score) {
  if (score >= 70) return { label: 'High', cls: 'border-red-400/20 bg-red-400/10 text-red-300' }
  if (score >= 40) return { label: 'Medium', cls: 'border-yellow-400/20 bg-yellow-400/10 text-yellow-300' }
  return { label: 'Low', cls: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' }
}

function DonutRing({ score }) {
  const pct = Math.min(score, 100)
  return (
    <div
      className="relative flex h-44 w-44 items-center justify-center rounded-full p-3 shadow-[0_0_40px_rgba(34,211,238,0.12)]"
      style={{ background: `conic-gradient(#22d3ee 0 ${pct}%, #1e293b ${pct}% 100%)` }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-slate-950 text-center">
        <span className="text-4xl font-bold text-white">{Math.round(pct)}</span>
        <span className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">Risk</span>
      </div>
    </div>
  )
}

function MiniBars({ reports }) {
  const bars = reports.slice(0, 7).reverse().map(r => r.risk_score || 0)
  const max = Math.max(...bars, 1)
  return (
    <div className="flex h-40 items-end gap-3">
      {bars.map((value, index) => (
        <div key={index} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full rounded-t-2xl bg-gradient-to-t from-cyan-500 to-blue-400 shadow-[0_8px_30px_rgba(34,211,238,0.2)]"
            style={{ height: `${(value / max) * 100}%` }}
          />
          <span className="text-xs text-slate-500">S{index + 1}</span>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [latestReport, setLatestReport] = useState(null)
  const [reports, setReports] = useState([])
  const [reportDetails, setReportDetails] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [loadingReports, setLoadingReports] = useState(true)

  const findings = useMemo(() => {
    if (!latestReport) return []
    return latestReport.findings.map((f, i) => ({
      id: i,
      severity: f.severity,
      title: f.check,
      resource: f.resource,
      category: deriveCategory(f.check),
      description: f.detail,
      remediation: f.remediation,
      status: deriveStatus(f.severity),
    }))
  }, [latestReport])

  const counts = useMemo(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    findings.forEach(f => { if (c[f.severity] !== undefined) c[f.severity]++ })
    return c
  }, [findings])

  const stats = useMemo(() => {
    if (!latestReport) return []
    const sgs = new Set(findings.filter(f => f.category === 'Network').map(f => f.resource)).size
    const vols = findings.filter(f => f.category === 'Storage').length
    return [
      { title: 'Total Findings', value: String(latestReport.total_findings), note: 'from latest scan' },
      { title: 'Network Issues', value: String(sgs), note: 'security group rules' },
      { title: 'Storage Issues', value: String(vols), note: 'volume checks' },
      { title: 'Risk Score', value: `${Math.round(latestReport.risk_score)}/100`, note: riskLabel(latestReport.risk_score).label + ' risk' },
    ]
  }, [latestReport, findings])

  useEffect(() => { fetchReports() }, [])

  async function fetchReports() {
    setLoadingReports(true)
    try {
      const res = await fetch(`${API_BASE}/reports`)
      const filenames = await res.json()
      setReports(filenames)
      const details = await Promise.all(
        filenames.slice(0, 7).map(name =>
          fetch(`${API_BASE}/reports/${name}`).then(r => r.json())
        )
      )
      setReportDetails(details)
      if (details.length > 0) setLatestReport(details[0])
    } catch (e) {
      setScanError('Failed to load reports from API.')
    } finally {
      setLoadingReports(false)
    }
  }

  async function runScan() {
    setScanning(true)
    setScanError(null)
    try {
      const res = await fetch(`${API_BASE}/scan`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Scan failed')
      }
      const report = await res.json()
      setLatestReport(report)
      await fetchReports()
    } catch (e) {
      setScanError(e.message)
    } finally {
      setScanning(false)
    }
  }

  const filteredFindings = useMemo(() => {
    return findings.filter((item) => {
      const matchesSeverity = severityFilter === 'ALL' || item.severity === severityFilter
      const q = search.toLowerCase()
      const matchesSearch =
        item.title.toLowerCase().includes(q) ||
        item.resource.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      return matchesSeverity && matchesSearch
    })
  }, [findings, search, severityFilter])

  const ScanButton = ({ className, label }) => (
    <button onClick={runScan} disabled={scanning} className={className}>
      {scanning ? 'Scanning...' : label}
    </button>
  )

  const Sidebar = () => (
    <div className="rounded-[30px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
      <div className="mb-6 rounded-[28px] border border-cyan-400/20 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
            <span className="text-xl">◈</span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Project</p>
            <h1 className="text-xl font-bold text-white">OpenStack Scanner</h1>
          </div>
        </div>
        <p className="text-sm leading-6 text-slate-300">Modern security dashboard for detecting risky OpenStack misconfigurations.</p>
      </div>
      <div className="space-y-2">
        <button className={navButtonClass(page === 'dashboard')} onClick={() => setPage('dashboard')}>Dashboard</button>
        <button className={navButtonClass(page === 'findings')} onClick={() => setPage('findings')}>Findings</button>
        <button className={navButtonClass(page === 'reports')} onClick={() => setPage('reports')}>Reports</button>
        <button className={navButtonClass(page === 'settings')} onClick={() => setPage('settings')}>Settings</button>
      </div>
      <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Last Scan</p>
          {latestReport ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Success</span>
          ) : (
            <span className="rounded-full border border-slate-400/20 bg-slate-400/10 px-3 py-1 text-xs font-semibold text-slate-300">None</span>
          )}
        </div>
        {latestReport ? (
          <>
            <p className="mt-3 text-sm text-slate-400">Completed successfully</p>
            <p className="mt-1 text-sm text-slate-500">{latestReport.generated_at}</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-400">No scan run yet.</p>
        )}
        {scanError && <p className="mt-2 text-xs text-red-400">{scanError}</p>}
        <ScanButton label="Run New Scan" className="mt-4 w-full rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:scale-[1.02] hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed" />
      </div>
    </div>
  )

  const DashboardPage = () => {
    const risk = latestReport ? riskLabel(latestReport.risk_score) : null
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 p-7 shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute bottom-0 right-10 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Security Overview</p>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">Cloud Risk Monitoring Dashboard</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">Real-time security scanning for your OpenStack cloud. Detect misconfigurations, assess risk, and take action.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ScanButton label="Start Scan" className="rounded-2xl bg-cyan-400 px-6 py-4 font-bold text-slate-950 transition hover:scale-[1.02] hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed" />
              <button className="rounded-2xl border border-white/15 bg-white/5 px-6 py-4 font-semibold text-white backdrop-blur hover:bg-white/10" onClick={() => setPage('reports')}>View Reports</button>
            </div>
          </div>
        </div>

        {loadingReports ? (
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 text-center text-slate-400">Loading scan data...</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((item) => (
                <div key={item.title} className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-[0_15px_40px_rgba(0,0,0,0.2)]">
                  <p className="text-sm text-slate-400">{item.title}</p>
                  <h3 className="mt-3 text-4xl font-black text-white">{item.value}</h3>
                  <p className="mt-4 text-sm text-slate-500">{item.note}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 2xl:grid-cols-[1.35fr_0.95fr]">
              <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.25)]">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-white">Scan History</h3>
                    <p className="mt-1 text-sm text-slate-400">Risk score across last {reportDetails.length} scans.</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">Recent Scans</span>
                </div>
                <MiniBars reports={reportDetails} />
              </div>
              <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.25)]">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-white">Overall Risk</h3>
                    <p className="mt-1 text-sm text-slate-400">Current cloud posture summary.</p>
                  </div>
                  {risk && <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${risk.cls}`}>{risk.label}</span>}
                </div>
                <div className="flex flex-col items-center justify-center gap-5 lg:flex-row lg:justify-between">
                  <DonutRing score={latestReport ? latestReport.risk_score : 0} />
                  <div className="space-y-3 text-sm text-slate-300">
                    <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full bg-red-400" /> Critical: {counts.CRITICAL}</div>
                    <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full bg-orange-400" /> High: {counts.HIGH}</div>
                    <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full bg-yellow-400" /> Medium: {counts.MEDIUM}</div>
                    <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full bg-cyan-400" /> Low: {counts.LOW}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
              <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.25)]">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-white">Top Findings</h3>
                    <p className="mt-1 text-sm text-slate-400">Highest-priority issues from the latest scan.</p>
                  </div>
                  <button className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10" onClick={() => setPage('findings')}>View All</button>
                </div>
                <div className="space-y-4">
                  {findings.slice(0, 3).map((item) => (
                    <div key={item.id} className="rounded-[24px] border border-white/10 bg-slate-950/60 p-5 transition hover:border-cyan-400/25">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`h-3 w-3 rounded-full ${statusDotClass(item.severity)}`} />
                        <h4 className="text-xl font-semibold text-white">{item.title}</h4>
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badgeClass(item.severity)}`}>{item.severity}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{item.description}</p>
                      <p className="mt-2 text-sm text-slate-500">Resource: {item.resource}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.25)]">
                  <h3 className="text-2xl font-bold text-white">Scanner Status</h3>
                  <div className="mt-5 space-y-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <span>Status</span>
                      <span className={`font-semibold ${scanning ? 'text-yellow-300' : 'text-emerald-300'}`}>{scanning ? 'Scanning...' : 'Ready'}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <span>Environment</span>
                      <span className="font-semibold text-white">Kolla OpenStack</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <span>Total Reports</span>
                      <span className="font-semibold text-white">{reports.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Last Scan</span>
                      <span className="font-semibold text-white text-right text-xs">{latestReport ? latestReport.generated_at : 'Never'}</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.25)]">
                  <h3 className="text-2xl font-bold text-white">Quick Actions</h3>
                  <div className="mt-5 space-y-3">
                    <ScanButton label="Start Scan" className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed" />
                    <button className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white hover:bg-white/10" onClick={() => setPage('reports')}>View History</button>
                    <button className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white hover:bg-white/10" onClick={() => setPage('findings')}>Browse Findings</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  const FindingsPage = () => (
    <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Findings</h2>
          <p className="mt-1 text-sm text-slate-400">{findings.length} issue(s) detected in the latest scan.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, resource, category" className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/30" />
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-cyan-400/30">
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </div>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-3">
          <thead>
            <tr className="text-left text-sm text-slate-500">
              <th className="px-4">Severity</th>
              <th className="px-4">Check</th>
              <th className="px-4">Resource</th>
              <th className="px-4">Category</th>
              <th className="px-4">Detail</th>
            </tr>
          </thead>
          <tbody>
            {filteredFindings.map((item) => (
              <tr key={item.id} className="text-sm text-slate-300">
                <td className="rounded-l-2xl border-y border-l border-white/10 bg-slate-950/60 px-4 py-4">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${badgeClass(item.severity)}`}>{item.severity}</span>
                </td>
                <td className="border-y border-white/10 bg-slate-950/60 px-4 py-4 font-semibold text-white">{item.title}</td>
                <td className="border-y border-white/10 bg-slate-950/60 px-4 py-4">{item.resource}</td>
                <td className="border-y border-white/10 bg-slate-950/60 px-4 py-4">{item.category}</td>
                <td className="rounded-r-2xl border-y border-r border-white/10 bg-slate-950/60 px-4 py-4 text-slate-400">{item.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredFindings.length === 0 && <p className="mt-4 text-center text-slate-500">No findings match your filter.</p>}
      </div>
    </div>
  )

  const ReportsPage = () => (
    <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Reports</h2>
          <p className="mt-1 text-sm text-slate-400">{reports.length} scan report(s) saved.</p>
        </div>
        <ScanButton label="Run New Scan" className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed" />
      </div>
      <div className="mt-6 grid gap-4">
        {reports.map((filename) => {
          const detail = reportDetails.find(r => r.generated_at && filename.includes(r.generated_at.replace(/[^0-9]/g, '').slice(0, 8)))
          return (
            <div key={filename} className="rounded-[24px] border border-white/10 bg-slate-950/60 p-5 transition hover:border-cyan-400/25">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{filename}</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {detail ? `${detail.generated_at} • ${detail.total_findings} findings • Score: ${Math.round(detail.risk_score)}/100` : 'JSON'}
                  </p>
                </div>
                <a href={`${API_BASE}/reports/${filename}`} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300">View</a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const SettingsPage = () => (
    <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.25)]">
      <h2 className="text-3xl font-bold text-white">Settings</h2>
      <p className="mt-1 text-sm text-slate-400">Scanner configuration and output preferences.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[24px] border border-white/10 bg-slate-950/60 p-5">
          <h3 className="text-lg font-semibold text-white">Scanner Configuration</h3>
          <div className="mt-4 space-y-4">
            <input className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500" placeholder="OpenStack API Endpoint" />
            <input className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500" placeholder="Project Name" />
            <input className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white placeholder:text-slate-500" placeholder="Username" />
          </div>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-slate-950/60 p-5">
          <h3 className="text-lg font-semibold text-white">Output Preferences</h3>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <label className="flex items-center gap-3"><input type="checkbox" defaultChecked /> Save JSON report</label>
            <label className="flex items-center gap-3"><input type="checkbox" defaultChecked /> Save PDF report</label>
            <label className="flex items-center gap-3"><input type="checkbox" /> Email alerts later</label>
          </div>
          <button className="mt-6 rounded-2xl bg-cyan-400 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-300">Save Settings</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.08),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] p-4 text-white md:p-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        <Sidebar />
        <div>
          {page === 'dashboard' && <DashboardPage />}
          {page === 'findings' && <FindingsPage />}
          {page === 'reports' && <ReportsPage />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </div>
    </div>
  )
}
