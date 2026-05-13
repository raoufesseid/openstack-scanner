import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart
} from 'recharts'

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

function riskColor(score) {
  if (score >= 70) return '#f87171'
  if (score >= 40) return '#facc15'
  return '#34d399'
}

function parseFilename(filename) {
  const match = filename.match(/report_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  if (!match) return null
  const [, year, month, day, hour, min] = match
  const date = new Date(`${year}-${month}-${day}T${hour}:${min}:00`)
  return {
    timestamp: date.getTime(),
    label: `${day}/${month} ${hour}:${min}`,
    shortDate: `${day}/${month}`,
  }
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

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const risk = riskLabel(d.score)
  return (
    <div className="rounded-2xl border border-white/15 bg-slate-900/98 p-4 shadow-2xl backdrop-blur-xl min-w-[160px]">
      <p className="text-xs text-slate-400 mb-3">{d.fullLabel}</p>
      <div className="flex items-end gap-2 mb-1">
        <span className="text-3xl font-black text-white">{d.score.toFixed(1)}</span>
        <span className="text-slate-400 text-sm mb-1">/100</span>
      </div>
      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${risk.cls}`}>
        {risk.label} Risk
      </span>
      <div className="mt-3 pt-3 border-t border-white/10 text-xs text-slate-400">
        {d.findings} finding{d.findings !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

// ── Custom dot on the line ────────────────────────────────────────────────────
function CustomDot(props) {
  const { cx, cy, payload, selectedIdx } = props
  const isSelected = payload.idx === selectedIdx
  const color = riskColor(payload.score)
  return (
    <g key={`dot-${payload.idx}`}>
      {isSelected && (
        <circle cx={cx} cy={cy} r={14} fill={color} fillOpacity={0.15} />
      )}
      <circle
        cx={cx} cy={cy}
        r={isSelected ? 7 : 5}
        fill={isSelected ? color : '#0f172a'}
        stroke={color}
        strokeWidth={isSelected ? 0 : 2}
        style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
      />
    </g>
  )
}

// ── History Page ──────────────────────────────────────────────────────────────
function HistoryPage({ allReports }) {
  const [fullHistory, setFullHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const [activeView, setActiveView] = useState('chart') // 'chart' | 'table'

  useEffect(() => {
    async function fetchAll() {
      setLoadingHistory(true)
      try {
        const details = await Promise.all(
          allReports.map((name) =>
            fetch(`${API_BASE}/reports/${name}`)
              .then(r => r.json())
              .then(data => {
                const parsed = parseFilename(name)
                return parsed ? { ...data, filename: name, ...parsed } : null
              })
              .catch(() => null)
          )
        )
        const valid = details
          .filter(Boolean)
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((r, i) => ({ ...r, idx: i }))
        setFullHistory(valid)
        // Auto-select the latest
        if (valid.length > 0) setSelectedIdx(valid.length - 1)
      } finally {
        setLoadingHistory(false)
      }
    }
    if (allReports.length > 0) fetchAll()
  }, [allReports])

  const chartData = fullHistory.map((r) => ({
    name: r.shortDate,
    fullLabel: r.label,
    score: parseFloat(r.risk_score.toFixed(2)),
    findings: r.total_findings,
    idx: r.idx,
  }))

  const bestScore  = fullHistory.length ? Math.min(...fullHistory.map(r => r.risk_score)) : 0
  const worstScore = fullHistory.length ? Math.max(...fullHistory.map(r => r.risk_score)) : 0
  const latestScore = fullHistory.length ? fullHistory[fullHistory.length - 1].risk_score : 0
  const firstScore  = fullHistory.length ? fullHistory[0].risk_score : 0
  const trend = latestScore - firstScore

  const selectedReport = selectedIdx !== null ? fullHistory[selectedIdx] : null

  const summaryCards = [
    {
      label: 'Total Scans',
      value: allReports.length,
      sub: 'all time',
      color: 'text-white',
      accent: 'border-white/10',
    },
    {
      label: 'Best Score',
      value: bestScore.toFixed(1),
      sub: 'lowest risk recorded',
      color: 'text-emerald-300',
      accent: 'border-emerald-400/20',
    },
    {
      label: 'Worst Score',
      value: worstScore.toFixed(1),
      sub: 'highest risk recorded',
      color: 'text-red-300',
      accent: 'border-red-400/20',
    },
    {
      label: 'Overall Trend',
      value: `${trend > 0 ? '+' : ''}${trend.toFixed(1)}`,
      sub: trend <= 0 ? '↓ improving over time' : '↑ worsening over time',
      color: trend <= 0 ? 'text-emerald-300' : 'text-red-300',
      accent: trend <= 0 ? 'border-emerald-400/20' : 'border-red-400/20',
    },
  ]

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 p-7">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/8 blur-3xl" />
        <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Analytics</p>
        <h2 className="mt-2 text-4xl font-black tracking-tight text-white">Scan History</h2>
        <p className="mt-3 text-base text-slate-300 max-w-xl">
          Track how your cloud security posture has evolved across all {allReports.length} scans.
        </p>
      </div>

      {loadingHistory ? (
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-16 text-center">
          <div className="inline-flex gap-1.5 items-center text-slate-400">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '120ms' }} />
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '240ms' }} />
            <span className="ml-3 text-sm">Loading full scan history…</span>
          </div>
        </div>
      ) : (
        <>
          {/* ── Summary stat cards ── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map(s => (
              <div key={s.label} className={`rounded-[28px] border ${s.accent} bg-white/5 p-5 backdrop-blur-xl`}>
                <p className="text-sm text-slate-400">{s.label}</p>
                <h3 className={`mt-3 text-4xl font-black ${s.color}`}>{s.value}</h3>
                <p className="mt-3 text-sm text-slate-500">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Chart card ── */}
          <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[0_15px_45px_rgba(0,0,0,0.25)]">
            {/* Card header */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold text-white">Risk Score Trend</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Click any point to inspect that scan's details below
                </p>
              </div>
              {/* View toggle */}
              <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-slate-950/60 p-1">
                {['chart', 'table'].map(v => (
                  <button
                    key={v}
                    onClick={() => setActiveView(v)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${
                      activeView === v
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-[2px] w-5 rounded-full bg-red-400/60 inline-block" />
                High risk (≥70)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[2px] w-5 rounded-full bg-yellow-400/60 inline-block" />
                Medium (40–69)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[2px] w-5 rounded-full bg-emerald-400/60 inline-block" />
                Low (&lt;40)
              </span>
            </div>

            {/* Chart */}
            {activeView === 'chart' && (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 15, right: 20, left: 0, bottom: 5 }}
                  onClick={e => {
                    if (e?.activePayload?.[0]) {
                      setSelectedIdx(e.activePayload[0].payload.idx)
                    }
                  }}
                  onMouseMove={e => {
                    if (e?.activePayload?.[0]) setHoveredIdx(e.activePayload[0].payload.idx)
                  }}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: '#475569', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.07)', strokeWidth: 1 }} />
                  {/* Risk band reference lines */}
                  <ReferenceLine y={70} stroke="rgba(248,113,113,0.25)" strokeDasharray="5 4" label={{ value: '70', fill: '#f87171', fontSize: 10, position: 'right' }} />
                  <ReferenceLine y={40} stroke="rgba(250,204,21,0.25)"  strokeDasharray="5 4" label={{ value: '40', fill: '#facc15',  fontSize: 10, position: 'right' }} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    fill="url(#scoreGrad)"
                    dot={<CustomDot selectedIdx={selectedIdx} />}
                    activeDot={{ r: 8, fill: '#22d3ee', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {/* Table view */}
            {activeView === 'table' && (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="px-4 pb-2">#</th>
                      <th className="px-4 pb-2">Date & Time</th>
                      <th className="px-4 pb-2">Risk Score</th>
                      <th className="px-4 pb-2">Findings</th>
                      <th className="px-4 pb-2">Level</th>
                      <th className="px-4 pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...fullHistory].reverse().map((r, i) => {
                      const risk = riskLabel(r.risk_score)
                      const isSelected = r.idx === selectedIdx
                      return (
                        <tr
                          key={r.filename}
                          onClick={() => setSelectedIdx(r.idx)}
                          className={`text-sm text-slate-300 cursor-pointer transition ${isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                        >
                          <td className={`rounded-l-2xl border-y border-l px-4 py-3 text-slate-500 ${isSelected ? 'border-cyan-400/30 bg-cyan-400/5' : 'border-white/10 bg-slate-950/60'}`}>
                            {allReports.length - i}
                          </td>
                          <td className={`border-y px-4 py-3 ${isSelected ? 'border-cyan-400/30 bg-cyan-400/5' : 'border-white/10 bg-slate-950/60'}`}>{r.generated_at}</td>
                          <td className={`border-y px-4 py-3 font-bold ${isSelected ? 'border-cyan-400/30 bg-cyan-400/5 text-cyan-300' : 'border-white/10 bg-slate-950/60 text-white'}`}>
                            {r.risk_score.toFixed(1)}
                          </td>
                          <td className={`border-y px-4 py-3 ${isSelected ? 'border-cyan-400/30 bg-cyan-400/5' : 'border-white/10 bg-slate-950/60'}`}>{r.total_findings}</td>
                          <td className={`border-y px-4 py-3 ${isSelected ? 'border-cyan-400/30 bg-cyan-400/5' : 'border-white/10 bg-slate-950/60'}`}>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${risk.cls}`}>{risk.label}</span>
                          </td>
                          <td className={`rounded-r-2xl border-y border-r px-4 py-3 ${isSelected ? 'border-cyan-400/30 bg-cyan-400/5' : 'border-white/10 bg-slate-950/60'}`}>
                            <a
                              href={`${API_BASE}/reports/${r.filename}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold"
                            >
                              View →
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Selected scan detail panel ── */}
          {selectedReport && (
            <div className="rounded-[30px] border border-cyan-400/25 bg-gradient-to-br from-cyan-400/5 to-transparent p-6 backdrop-blur-xl shadow-[0_0_40px_rgba(34,211,238,0.06)]">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-300 mb-1">Selected Scan</p>
                  <h3 className="text-2xl font-bold text-white">{selectedReport.generated_at}</h3>
                  <p className="text-sm text-slate-400 mt-1">Scan #{selectedReport.idx + 1} of {fullHistory.length}</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Prev / Next navigation */}
                  <button
                    onClick={() => setSelectedIdx(i => Math.max(0, i - 1))}
                    disabled={selectedIdx === 0}
                    className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => setSelectedIdx(i => Math.min(fullHistory.length - 1, i + 1))}
                    disabled={selectedIdx === fullHistory.length - 1}
                    className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    →
                  </button>
                  <a
                    href={`${API_BASE}/reports/${selectedReport.filename}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-300 transition"
                  >
                    View Full Report →
                  </a>
                </div>
              </div>

              {/* Stat tiles */}
              <div className="grid gap-4 sm:grid-cols-3 mb-5">
                {[
                  {
                    label: 'Risk Score',
                    value: selectedReport.risk_score.toFixed(1),
                    sub: riskLabel(selectedReport.risk_score).label + ' risk',
                    cls: riskLabel(selectedReport.risk_score).cls.split(' ').find(c => c.startsWith('text-')),
                  },
                  {
                    label: 'Total Findings',
                    value: selectedReport.total_findings,
                    sub: 'issues detected',
                    cls: 'text-white',
                  },
                  {
                    label: 'vs Previous',
                    value: (() => {
                      if (selectedIdx === 0) return '—'
                      const prev = fullHistory[selectedIdx - 1]
                      const diff = selectedReport.risk_score - prev.risk_score
                      return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}`
                    })(),
                    sub: selectedIdx === 0 ? 'first scan' : (selectedReport.risk_score <= fullHistory[selectedIdx - 1]?.risk_score ? '↓ improved' : '↑ worsened'),
                    cls: (() => {
                      if (selectedIdx === 0) return 'text-slate-400'
                      const diff = selectedReport.risk_score - fullHistory[selectedIdx - 1]?.risk_score
                      return diff <= 0 ? 'text-emerald-300' : 'text-red-300'
                    })(),
                  },
                ].map(t => (
                  <div key={t.label} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <p className="text-xs text-slate-400">{t.label}</p>
                    <p className={`text-3xl font-black mt-2 ${t.cls}`}>{t.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{t.sub}</p>
                  </div>
                ))}
              </div>

              {/* Top 3 findings from selected scan */}
              {selectedReport.findings && selectedReport.findings.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-300 mb-3">Top findings in this scan</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {selectedReport.findings.slice(0, 3).map((f, i) => (
                      <div key={i} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${badgeClass(f.severity)}`}>{f.severity}</span>
                        </div>
                        <p className="text-sm font-semibold text-white">{f.check}</p>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{f.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

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
        <button className={navButtonClass(page === 'findings')}  onClick={() => setPage('findings')}>Findings</button>
        <button className={navButtonClass(page === 'reports')}   onClick={() => setPage('reports')}>Reports</button>
        <button className={navButtonClass(page === 'history')}   onClick={() => setPage('history')}>History</button>
        <button className={navButtonClass(page === 'settings')}  onClick={() => setPage('settings')}>Settings</button>
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
                  <button
                    onClick={() => setPage('history')}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
                  >
                    Full History →
                  </button>
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
                    <button className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white hover:bg-white/10" onClick={() => setPage('history')}>View History</button>
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
          {page === 'findings'  && <FindingsPage />}
          {page === 'reports'   && <ReportsPage />}
          {page === 'history'   && <HistoryPage allReports={reports} />}
          {page === 'settings'  && <SettingsPage />}
        </div>
      </div>
    </div>
  )
}
