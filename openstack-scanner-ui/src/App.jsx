import { useEffect, useMemo, useState, useRef } from 'react'
import {
  Area, AreaChart, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'

const API_BASE = `http://${window.location.hostname}:9000`

/* ── Google Fonts injection ─────────────────────────────────────────────── */
const fontLink = document.createElement('link')
fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap'
fontLink.rel = 'stylesheet'
document.head.appendChild(fontLink)

const style = document.createElement('style')
style.textContent = `
  * { font-family: 'DM Sans', sans-serif; }
  .mono { font-family: 'Space Mono', monospace !important; }
  .card-hover { transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .card-hover:hover { transform: translateY(-2px); box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
  .pulse-ring { animation: pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite; }
  @keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 0.8; } 100% { transform: scale(1.4); opacity: 0; } }
  .fade-in { animation: fadeIn 0.4s ease forwards; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .stagger-1 { animation-delay: 0.05s; opacity: 0; }
  .stagger-2 { animation-delay: 0.10s; opacity: 0; }
  .stagger-3 { animation-delay: 0.15s; opacity: 0; }
  .stagger-4 { animation-delay: 0.20s; opacity: 0; }
  .row-expand { transition: max-height 0.25s ease, opacity 0.25s ease; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
`
document.head.appendChild(style)

/* ── Helpers ────────────────────────────────────────────────────────────── */
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
  if (severity === 'CRITICAL') return 'border-red-500/40 bg-red-500/10 text-red-300'
  if (severity === 'HIGH') return 'border-orange-500/40 bg-orange-500/10 text-orange-300'
  if (severity === 'MEDIUM') return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
  return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
}

function severityAccent(severity) {
  if (severity === 'CRITICAL') return 'border-l-red-500'
  if (severity === 'HIGH') return 'border-l-orange-400'
  if (severity === 'MEDIUM') return 'border-l-yellow-400'
  return 'border-l-cyan-400'
}

function riskLabel(score) {
  if (score >= 70) return { label: 'High Risk',   cls: 'border-red-400/30 bg-red-400/10 text-red-300',         dot: 'bg-red-400' }
  if (score >= 40) return { label: 'Medium Risk', cls: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300', dot: 'bg-yellow-400' }
  return             { label: 'Low Risk',    cls: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300', dot: 'bg-emerald-400' }
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
  return { timestamp: date.getTime(), label: `${day}/${month} ${hour}:${min}`, shortDate: `${day}/${month}` }
}

function navButtonClass(active) {
  return active
    ? 'w-full flex items-center gap-3 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-white'
    : 'w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200'
}

const NAV_ICONS = { dashboard: '⬡', findings: '◉', reports: '▤', history: '◈', settings: '⊙' }

/* ── Stat Card ──────────────────────────────────────────────────────────── */
function StatCard({ title, value, note, accentColor, delay, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`card-hover fade-in stagger-${delay} relative overflow-hidden rounded-2xl border border-white/8 bg-slate-900/80 p-5 backdrop-blur ${onClick ? 'cursor-pointer hover:border-cyan-400/30' : ''}`}
    >
      <div className={`absolute left-0 top-0 h-full w-[3px] rounded-l-2xl ${accentColor}`} />
      <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{title}</p>
      <p className="mono mt-3 text-3xl font-bold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
      {onClick && <p className="mt-2 text-[10px] text-cyan-400/60">Click to explore →</p>}
    </div>
  )
}

/* ── DonutRing ──────────────────────────────────────────────────────────── */
function DonutRing({ score }) {
  const pct = Math.min(score, 100)
  const color = riskColor(score)
  return (
    <div className="relative flex h-40 w-40 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 314} 314`}
          style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s ease', filter: `drop-shadow(0 0 8px ${color}80)` }} />
      </svg>
      <div className="text-center">
        <span className="mono text-4xl font-bold text-white">{Math.round(pct)}</span>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">/ 100</p>
      </div>
    </div>
  )
}

/* ── MiniBars ───────────────────────────────────────────────────────────── */
function MiniBars({ reports }) {
  const [hovered, setHovered] = useState(null)
  const bars = [...reports].reverse().map(r => r.risk_score ?? 0)
  const max = Math.max(...bars, 1)
  if (!bars.length) return <p className="text-sm text-slate-600">No data yet.</p>
  return (
    <div className="relative w-full" style={{ height: '144px' }}>
      <div className="absolute inset-0 flex items-end gap-2">
        {bars.map((value, i) => {
          const color = riskColor(value)
          const isHov = hovered === i
          const heightPct = Math.max((value / max) * 100, 6)
          return (
            <div key={i} className="relative flex flex-1 flex-col items-center gap-1.5 cursor-default h-full justify-end"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              {isHov && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs font-bold text-white whitespace-nowrap z-10 mono">
                  {value.toFixed(1)}
                </div>
              )}
              <div
                className="w-full rounded-t-lg transition-all duration-300"
                style={{
                  height: `${heightPct}%`,
                  background: `linear-gradient(to top, ${color}88, ${color}ee)`,
                  boxShadow: isHov ? `0 0 16px ${color}60` : `0 0 8px ${color}30`,
                }}
              />
              <span className="text-[10px] text-slate-600 mt-1">S{bars.length - i}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Chart Tooltip ──────────────────────────────────────────────────────── */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const risk = riskLabel(d.score)
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/98 p-4 shadow-2xl backdrop-blur min-w-[150px]">
      <p className="mono text-[10px] text-slate-500 mb-2">{d.fullLabel}</p>
      <p className="mono text-3xl font-bold text-white">{d.score.toFixed(1)}</p>
      <span className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${risk.cls}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${risk.dot}`} />{risk.label}
      </span>
      <p className="mt-2 text-[11px] text-slate-500">{d.findings} findings</p>
    </div>
  )
}

/* ── Custom Chart Dot ───────────────────────────────────────────────────── */
function CustomDot(props) {
  const { cx, cy, payload, selectedIdx } = props
  const isSel = payload.idx === selectedIdx
  const color = riskColor(payload.score)
  return (
    <g>
      {isSel && <circle cx={cx} cy={cy} r={16} fill={color} fillOpacity={0.1} />}
      {isSel && <circle cx={cx} cy={cy} r={10} fill={color} fillOpacity={0.2} />}
      <circle cx={cx} cy={cy} r={isSel ? 6 : 4} fill={isSel ? color : '#0f172a'} stroke={color} strokeWidth={2} style={{ cursor: 'pointer' }} />
    </g>
  )
}

/* ── Report Detail Page ─────────────────────────────────────────────────── */
function ReportDetailPage({ report, filename, onBack }) {
  const [expandedRow, setExpandedRow] = useState(null)
  const risk = riskLabel(report.risk_score)
  const color = riskColor(report.risk_score)

  const findings = report.findings.map((f, i) => ({
    id: i, severity: f.severity, title: f.check,
    resource: f.resource, category: deriveCategory(f.check),
    description: f.detail, remediation: f.remediation,
  }))

  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  findings.forEach(f => { if (counts[f.severity] !== undefined) counts[f.severity]++ })

  const bySeverity = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

  return (
    <div className="space-y-4 fade-in">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950/50 p-6">
        <div className="absolute right-0 top-0 h-full w-64 bg-gradient-to-l from-cyan-400/5 to-transparent" />
        <div className="relative">
          <button onClick={onBack} className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition">
            ← Back to Reports
          </button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.3em] text-cyan-400/70 mb-1">Scan Report</p>
              <h2 className="text-2xl font-black text-white">{report.generated_at}</h2>
              <p className="text-xs text-slate-500 mt-1 mono">{filename}</p>
            </div>
            <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold ${risk.cls}`}>
              <span className={`h-2 w-2 rounded-full ${risk.dot}`} />{risk.label}
            </span>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Risk Score"      value={`${Math.round(report.risk_score)}/100`} note={risk.label}          accentColor="bg-cyan-400"    delay={1} />
        <StatCard title="Total Findings"  value={report.total_findings}                  note="issues detected"      accentColor="bg-white/20"    delay={2} />
        <StatCard title="Critical / High" value={`${counts.CRITICAL + counts.HIGH}`}     note="need immediate action" accentColor="bg-red-400"     delay={3} />
        <StatCard title="Medium / Low"    value={`${counts.MEDIUM + counts.LOW}`}        note="monitor or review"    accentColor="bg-yellow-400"  delay={4} />
      </div>

      {/* Risk breakdown */}
      <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
          <h3 className="font-bold text-white mb-4">Risk Breakdown</h3>
          <div className="flex items-center justify-between gap-6">
            <DonutRing score={report.risk_score} />
            <div className="space-y-3 flex-1">
              {[
                ['CRITICAL', 'bg-red-400',    'text-red-300',    counts.CRITICAL],
                ['HIGH',     'bg-orange-400', 'text-orange-300', counts.HIGH],
                ['MEDIUM',   'bg-yellow-400', 'text-yellow-300', counts.MEDIUM],
                ['LOW',      'bg-cyan-400',   'text-cyan-300',   counts.LOW],
              ].map(([label, dot, text, count]) => (
                <div key={label} className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dot}`} />
                  <span className="text-xs text-slate-400 w-16">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${dot}`}
                      style={{ width: `${findings.length ? (count / findings.length) * 100 : 0}%`, opacity: 0.7 }} />
                  </div>
                  <span className={`mono text-sm font-bold ${text}`}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
          <h3 className="font-bold text-white mb-4">By Category</h3>
          <div className="space-y-2.5">
            {['Network','Storage','Identity','Compute','General'].map(cat => {
              const catFindings = findings.filter(f => f.category === cat)
              if (!catFindings.length) return null
              const critical = catFindings.filter(f => f.severity === 'CRITICAL').length
              const high = catFindings.filter(f => f.severity === 'HIGH').length
              return (
                <div key={cat} className="flex items-center gap-3 rounded-xl border border-white/8 bg-slate-950/60 px-4 py-2.5">
                  <span className="text-sm font-semibold text-white w-20">{cat}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full bg-cyan-400/60"
                      style={{ width: `${(catFindings.length / findings.length) * 100}%` }} />
                  </div>
                  <span className="mono text-xs text-slate-300 w-4 text-right">{catFindings.length}</span>
                  {(critical + high) > 0 && (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300">
                      {critical + high} critical/high
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Findings list */}
      <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
        <h3 className="font-bold text-white mb-1">All Findings</h3>
        <p className="text-xs text-slate-500 mb-4">Click any row to see details & remediation</p>
        <div className="space-y-2">
          {bySeverity.flatMap(sev =>
            findings.filter(f => f.severity === sev).map(item => (
              <div key={item.id}>
                <div onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                  className={`rounded-xl border-l-2 border border-white/8 bg-slate-950/60 px-4 py-3.5 cursor-pointer transition hover:bg-slate-900 ${severityAccent(item.severity)}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(item.severity)}`}>{item.severity}</span>
                    <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                    <span className="rounded-lg border border-white/8 bg-white/3 px-2 py-0.5 text-[10px] text-slate-400">{item.category}</span>
                    <span className="ml-auto mono text-[10px] text-slate-500">{expandedRow === item.id ? '▲' : '▼'}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 mono">{item.resource}</p>
                </div>
                {expandedRow === item.id && (
                  <div className="rounded-b-xl border border-t-0 border-white/8 bg-slate-950/80 px-4 py-4 space-y-3 fade-in">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Detail</p>
                      <p className="text-sm text-slate-300">{item.description}</p>
                    </div>
                    {item.remediation && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-emerald-400/70 mb-1">Remediation</p>
                        <p className="text-sm text-emerald-300/90">{item.remediation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ── History Page ───────────────────────────────────────────────────────── */
function HistoryPage({ allReports }) {
  const [fullHistory, setFullHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [activeView, setActiveView] = useState('chart')

  useEffect(() => {
    async function fetchAll() {
      setLoading(true)
      const details = await Promise.all(
        allReports.map(name =>
          fetch(`${API_BASE}/reports/${name}`).then(r => r.json())
            .then(data => { const p = parseFilename(name); return p ? { ...data, filename: name, ...p } : null })
            .catch(() => null)
        )
      )
      const valid = details.filter(Boolean).sort((a, b) => a.timestamp - b.timestamp).map((r, i) => ({ ...r, idx: i }))
      setFullHistory(valid)
      if (valid.length > 0) setSelectedIdx(valid.length - 1)
      setLoading(false)
    }
    if (allReports.length > 0) fetchAll()
  }, [allReports])

  const chartData = fullHistory.map(r => ({
    name: r.shortDate, fullLabel: r.label,
    score: parseFloat(r.risk_score.toFixed(2)),
    findings: r.total_findings, idx: r.idx,
  }))

  const best   = fullHistory.length ? Math.min(...fullHistory.map(r => r.risk_score)) : 0
  const worst  = fullHistory.length ? Math.max(...fullHistory.map(r => r.risk_score)) : 0
  const latest = fullHistory.length ? fullHistory[fullHistory.length - 1].risk_score : 0
  const first  = fullHistory.length ? fullHistory[0].risk_score : 0
  const trend  = latest - first
  const sel    = selectedIdx !== null ? fullHistory[selectedIdx] : null

  return (
    <div className="space-y-5 fade-in">
      <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-cyan-400/4 to-transparent" />
        <p className="mono text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">Analytics</p>
        <h2 className="mt-2 text-3xl font-black text-white">Scan History</h2>
        <p className="mt-2 text-sm text-slate-400">Security posture across all {allReports.length} scans</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/8 bg-slate-900/60 p-16 text-slate-500">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '120ms' }} />
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '240ms' }} />
          <span className="ml-2 text-sm">Loading history…</span>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total Scans', value: allReports.length, sub: 'all time',       accent: 'bg-cyan-400',    delay: 1 },
              { label: 'Best Score',  value: best.toFixed(1),   sub: 'lowest risk',    accent: 'bg-emerald-400', delay: 2 },
              { label: 'Worst Score', value: worst.toFixed(1),  sub: 'highest risk',   accent: 'bg-red-400',     delay: 3 },
              { label: 'Trend', value: `${trend > 0 ? '+' : ''}${trend.toFixed(1)}`, sub: trend <= 0 ? '↓ improving' : '↑ worsening', accent: trend <= 0 ? 'bg-emerald-400' : 'bg-red-400', delay: 4 },
            ].map(s => <StatCard key={s.label} title={s.label} value={s.value} note={s.sub} accentColor={s.accent} delay={s.delay} />)}
          </div>

          <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5 backdrop-blur">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Risk Score Trend</h3>
                <p className="text-xs text-slate-500 mt-0.5">Click any point to inspect that scan</p>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-slate-950/80 p-1">
                {['chart', 'table'].map(v => (
                  <button key={v} onClick={() => setActiveView(v)}
                    className={`rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition ${activeView === v ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4 flex gap-4 text-[11px] text-slate-500">
              {[['#f87171','≥70 High'],['#facc15','40–69 Med'],['#34d399','<40 Low']].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="h-[2px] w-4 rounded-full inline-block" style={{ background: c }} />{l}
                </span>
              ))}
            </div>

            {activeView === 'chart' && (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  onClick={e => e?.activePayload?.[0] && setSelectedIdx(e.activePayload[0].payload.idx)}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#22d3ee" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.05)' }} />
                  <ReferenceLine y={70} stroke="rgba(248,113,113,0.2)" strokeDasharray="4 4" label={{ value: '70', fill: '#f8717150', fontSize: 9, position: 'right' }} />
                  <ReferenceLine y={40} stroke="rgba(250,204,21,0.2)"  strokeDasharray="4 4" label={{ value: '40', fill: '#facc1550', fontSize: 9, position: 'right' }} />
                  <Area type="monotone" dataKey="score" stroke="#22d3ee" strokeWidth={2} fill="url(#sg)"
                    dot={<CustomDot selectedIdx={selectedIdx} />}
                    activeDot={{ r: 7, fill: '#22d3ee', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {activeView === 'table' && (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-1.5">
                  <thead>
                    <tr className="text-left">
                      {['#','Date','Score','Findings','Level',''].map(h => (
                        <th key={h} className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...fullHistory].reverse().map((r, i) => {
                      const risk = riskLabel(r.risk_score)
                      const isSel = r.idx === selectedIdx
                      const td = `border-y px-3 py-2.5 text-sm ${isSel ? 'border-cyan-400/20 bg-cyan-400/5' : 'border-white/5 bg-slate-950/60'}`
                      return (
                        <tr key={r.filename} onClick={() => setSelectedIdx(r.idx)} className="cursor-pointer transition hover:opacity-100 opacity-80">
                          <td className={`rounded-l-xl ${td} mono text-slate-600 border-l`}>{allReports.length - i}</td>
                          <td className={`${td} text-slate-300`}>{r.generated_at}</td>
                          <td className={`${td} mono font-bold ${isSel ? 'text-cyan-300' : 'text-white'}`}>{r.risk_score.toFixed(1)}</td>
                          <td className={`${td} text-slate-400`}>{r.total_findings}</td>
                          <td className={td}>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${risk.cls}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${risk.dot}`} />{risk.label}
                            </span>
                          </td>
                          <td className={`rounded-r-xl ${td} border-r`}>
                            <span className="text-[11px] font-semibold text-cyan-400/50 select-none">→</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {sel && (
            <div className="rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-400/4 to-slate-900/60 p-5 backdrop-blur fade-in">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <p className="mono text-[10px] uppercase tracking-[0.25em] text-cyan-400/60 mb-1">Selected Scan</p>
                  <h3 className="text-xl font-bold text-white">{sel.generated_at}</h3>
                  <p className="text-xs text-slate-500 mt-1">Scan #{sel.idx + 1} of {fullHistory.length}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedIdx(i => Math.max(0, i - 1))} disabled={selectedIdx === 0}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-25 transition text-sm">←</button>
                  <button onClick={() => setSelectedIdx(i => Math.min(fullHistory.length - 1, i + 1))} disabled={selectedIdx === fullHistory.length - 1}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-25 transition text-sm">→</button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 mb-4">
                {[
                  { label: 'Risk Score', value: sel.risk_score.toFixed(1), sub: riskLabel(sel.risk_score).label, color: riskColor(sel.risk_score) },
                  { label: 'Findings',   value: sel.total_findings, sub: 'issues detected', color: '#fff' },
                  { label: 'vs Previous', value: selectedIdx === 0 ? '—' : (() => { const d = sel.risk_score - fullHistory[selectedIdx-1].risk_score; return `${d>0?'+':''}${d.toFixed(1)}` })(),
                    sub: selectedIdx === 0 ? 'first scan' : sel.risk_score <= fullHistory[selectedIdx-1]?.risk_score ? '↓ improved' : '↑ worsened',
                    color: selectedIdx === 0 ? '#94a3b8' : sel.risk_score <= fullHistory[selectedIdx-1]?.risk_score ? '#34d399' : '#f87171' },
                ].map(t => (
                  <div key={t.label} className="rounded-xl border border-white/8 bg-slate-950/60 p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">{t.label}</p>
                    <p className="mono text-3xl font-bold mt-2" style={{ color: t.color }}>{t.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{t.sub}</p>
                  </div>
                ))}
              </div>
              {sel.findings?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Top findings</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {sel.findings.slice(0, 3).map((f, i) => (
                      <div key={i} className={`rounded-xl border-l-2 border border-white/8 bg-slate-950/60 p-3 ${severityAccent(f.severity)}`}>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(f.severity)}`}>{f.severity}</span>
                        <p className="text-sm font-semibold text-white mt-2">{f.check}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{f.detail}</p>
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

/* ── Findings Page ──────────────────────────────────────────────────────── */
function FindingsPage({ findings, filteredFindings, search, setSearch, severityFilter, setSeverityFilter, categoryFilter, setCategoryFilter, expandedRow, setExpandedRow }) {
  const categories = ['ALL', 'Network', 'Storage', 'Identity', 'Compute', 'General']
  const categoryCounts = useMemo(() => {
    const c = {}
    findings.forEach(f => { c[f.category] = (c[f.category] || 0) + 1 })
    return c
  }, [findings])

  return (
    <div className="space-y-4 fade-in">
      <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-white">Findings</h2>
            <p className="text-xs text-slate-500 mt-1">{filteredFindings.length} of {findings.length} issue(s) — click any row to see remediation</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search title, resource…"
              className="rounded-xl border border-white/8 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/30"
            />
            <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
              className="rounded-xl border border-white/8 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400/30">
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Category sidebar */}
        <div className="hidden lg:flex flex-col gap-1 w-44 flex-shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 px-2 mb-1">Category</p>
          {categories.map(cat => {
            const count = cat === 'ALL' ? findings.length : (categoryCounts[cat] || 0)
            const isActive = categoryFilter === cat
            return (
              <button key={cat} onClick={() => setCategoryFilter(cat)}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-cyan-400/10 border border-cyan-400/25 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                <span>{cat}</span>
                <span className={`mono text-xs rounded-lg px-1.5 py-0.5 ${isActive ? 'bg-cyan-400/20 text-cyan-300' : 'bg-white/5 text-slate-500'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        {/* Findings list */}
        <div className="flex-1 space-y-2 min-w-0">
          {/* Mobile category pills */}
          <div className="flex lg:hidden gap-2 flex-wrap">
            {categories.map(cat => (
              <button key={cat} onClick={() => setCategoryFilter(cat)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${categoryFilter === cat ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300' : 'border-white/8 bg-white/3 text-slate-400'}`}>
                {cat}
              </button>
            ))}
          </div>

          {filteredFindings.map(item => (
            <div key={item.id}>
              <div onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                className={`rounded-xl border-l-2 border border-white/8 bg-slate-900/80 px-4 py-3.5 cursor-pointer transition hover:bg-slate-900 ${severityAccent(item.severity)}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(item.severity)}`}>{item.severity}</span>
                  <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                  <span className="rounded-lg border border-white/8 bg-white/3 px-2 py-0.5 text-[10px] text-slate-400">{item.category}</span>
                  <span className="ml-auto mono text-[10px] text-slate-500">{expandedRow === item.id ? '▲' : '▼'}</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">{item.resource}</p>
              </div>
              {expandedRow === item.id && (
                <div className="rounded-b-xl border border-t-0 border-white/8 bg-slate-950/80 px-4 py-4 space-y-3 fade-in">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Detail</p>
                    <p className="text-sm text-slate-300">{item.description}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-emerald-400/70 mb-1">Remediation</p>
                    <p className="text-sm text-emerald-300/90">{item.remediation}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filteredFindings.length === 0 && (
            <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-10 text-center text-sm text-slate-500">No findings match your filter.</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Main App ───────────────────────────────────────────────────────────── */
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
  const [expandedRow, setExpandedRow] = useState(null)
  const [viewingReport, setViewingReport] = useState(null)   // { data, filename }
  const [cliOutput, setCliOutput] = useState(null)
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  const findings = useMemo(() => {
    if (!latestReport) return []
    return latestReport.findings.map((f, i) => ({
      id: i, severity: f.severity, title: f.check,
      resource: f.resource, category: deriveCategory(f.check),
      description: f.detail, remediation: f.remediation,
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
    const sgs  = new Set(findings.filter(f => f.category === 'Network').map(f => f.resource)).size
    const vols = findings.filter(f => f.category === 'Storage').length
    return [
      { title: 'Total Findings', value: String(latestReport.total_findings), note: 'latest scan',          accent: 'bg-white/20',  delay: 1, onClick: () => goToFindings('ALL') },
      { title: 'Network Issues', value: String(sgs),  note: 'security group rules',  accent: 'bg-cyan-400',  delay: 2, onClick: () => goToFindings('Network') },
      { title: 'Storage Issues', value: String(vols), note: 'volume checks',          accent: 'bg-blue-400',  delay: 3, onClick: () => goToFindings('Storage') },
      { title: 'Risk Score',     value: `${Math.round(latestReport.risk_score)}`, note: riskLabel(latestReport.risk_score).label, accent: 'bg-cyan-400', delay: 4, onClick: null },
    ]
  }, [latestReport, findings])

  useEffect(() => { fetchReports() }, [])

  async function fetchReports() {
    setLoadingReports(true)
    try {
      const res = await fetch(`${API_BASE}/reports`)
      const filenames = await res.json()
      setReports(filenames)
      const details = await Promise.all(filenames.slice(0, 7).map(n => fetch(`${API_BASE}/reports/${n}`).then(r => r.json())))
      setReportDetails(details)
      if (details.length > 0) setLatestReport(details[0])
    } catch { setScanError('Failed to load reports.') }
    finally { setLoadingReports(false) }
  }

  async function runScan() {
    setScanning(true); setScanError(null)
    try {
      const res = await fetch(`${API_BASE}/scan`, { method: 'POST' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Scan failed') }
      const report = await res.json()
      const { __cli_output__, ...cleanReport } = report
      setCliOutput(__cli_output__ || null)
      setLatestReport(cleanReport)
      await fetchReports()
    } catch (e) { setScanError(e.message) }
    finally { setScanning(false) }
  }

  async function openReportDetail(filename) {
    try {
      const res = await fetch(`${API_BASE}/reports/${filename}`)
      const data = await res.json()
      setViewingReport({ data, filename })
    } catch { setScanError('Failed to load report.') }
  }

  const filteredFindings = useMemo(() => findings.filter(item => {
    const matchesSev = severityFilter === 'ALL' || item.severity === severityFilter
    const matchesCat = categoryFilter === 'ALL' || item.category === categoryFilter
    const q = search.toLowerCase()
    return matchesSev && matchesCat && (item.title.toLowerCase().includes(q) || item.resource.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
  }), [findings, search, severityFilter, categoryFilter])

  function goToFindings(category = 'ALL') {
    setCategoryFilter(category)
    setSeverityFilter('ALL')
    setSearch('')
    setPage('findings')
  }

  const ScanButton = ({ className, label }) => (
    <button onClick={runScan} disabled={scanning} className={className}>
      {scanning
        ? <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />Scanning…</span>
        : label}
    </button>
  )

  /* ── Sidebar ── */
  const Sidebar = () => (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-slate-900/60 p-4 backdrop-blur lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
      <div className="rounded-xl border border-white/8 bg-slate-950/60 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10">
            <span className="text-lg text-cyan-300">◈</span>
            <span className="pulse-ring absolute inset-0 rounded-xl border border-cyan-400/30" />
          </div>
          <div>
            <p className="mono text-[9px] uppercase tracking-[0.3em] text-slate-500">OpenStack</p>
            <h1 className="text-sm font-bold text-white leading-tight">Security Scanner</h1>
          </div>
        </div>
        {latestReport && (
          <div className="flex items-center gap-2 rounded-lg bg-white/3 px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <p className="text-[11px] text-slate-400 truncate">{latestReport.generated_at}</p>
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-1">
        {['dashboard','findings','reports','history','settings'].map(p => (
          <button key={p} className={navButtonClass(page === p && !viewingReport)} onClick={() => { setViewingReport(null); setPage(p) }}>
            <span className="mono text-base opacity-60">{NAV_ICONS[p]}</span>
            <span className="capitalize">{p}</span>
            {page === p && !viewingReport && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400" />}
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-white/8 bg-slate-950/60 p-4">
        {scanError && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{scanError}</p>}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-white">Scanner</p>
          <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${scanning ? 'text-yellow-300' : 'text-emerald-300'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${scanning ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400'}`} />
            {scanning ? 'Active' : 'Ready'}
          </span>
        </div>
        <div className="mb-3 space-y-1.5 text-[11px] text-slate-500">
          <div className="flex justify-between"><span>Reports</span><span className="mono text-slate-300">{reports.length}</span></div>
          <div className="flex justify-between"><span>Environment</span><span className="text-slate-300">Kolla</span></div>
        </div>
        <ScanButton label="Run New Scan" className="w-full rounded-xl bg-cyan-400 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50" />
      </div>
    </div>
  )

  /* ── Dashboard ── */
  const DashboardPage = () => {
    const risk = latestReport ? riskLabel(latestReport.risk_score) : null
    return (
      <div className="space-y-5 fade-in">
        <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950/50 p-6">
          <div className="absolute right-0 top-0 h-full w-64 bg-gradient-to-l from-cyan-400/5 to-transparent" />
          <div className="absolute -right-8 -bottom-8 h-48 w-48 rounded-full bg-cyan-400/5 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="mono text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">Security Overview</span>
              {risk && (
                <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${risk.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${risk.dot}`} />{risk.label}
                </span>
              )}
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white leading-tight">Cloud Risk<br />Monitoring Dashboard</h2>
            <p className="mt-3 text-sm text-slate-400 max-w-lg">Real-time misconfiguration detection for your OpenStack environment.</p>
            <div className="mt-5 flex gap-3">
              <ScanButton label="▶ Start Scan" className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 transition disabled:opacity-50" />
              <button onClick={() => setPage('history')} className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 transition">View Trends →</button>
            </div>
          </div>
        </div>

        {loadingReports ? (
          <div className="rounded-2xl border border-white/8 bg-slate-900/60 p-12 text-center text-slate-500 text-sm">Loading scan data…</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map(s => <StatCard key={s.title} title={s.title} value={s.value} note={s.note} accentColor={s.accent} delay={s.delay} onClick={s.onClick} />)}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-white">Scan History</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Last {reportDetails.length} scans</p>
                  </div>
                  <button onClick={() => setPage('history')} className="rounded-lg border border-white/8 bg-white/3 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/8 transition">Full History →</button>
                </div>
                <MiniBars reports={reportDetails} />
              </div>

              <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-white">Overall Risk</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Current posture</p>
                  </div>
                  {risk && <span className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${risk.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${risk.dot}`} />{risk.label}</span>}
                </div>
                <div className="flex items-center justify-between gap-4">
                  <DonutRing score={latestReport?.risk_score ?? 0} />
                  <div className="space-y-2.5">
                    {[['CRITICAL','bg-red-400',counts.CRITICAL],['HIGH','bg-orange-400',counts.HIGH],['MEDIUM','bg-yellow-400',counts.MEDIUM],['LOW','bg-cyan-400',counts.LOW]].map(([label,dot,count]) => (
                      <div key={label} className="flex items-center gap-2.5 text-sm">
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dot}`} />
                        <span className="text-slate-400 w-16">{label}</span>
                        <span className="mono font-bold text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-white">Top Findings</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Highest-priority issues</p>
                </div>
                <button onClick={() => setPage('findings')} className="rounded-lg border border-white/8 bg-white/3 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/8 transition">View All →</button>
              </div>
              <div className="space-y-2.5">
                {findings.slice(0, 4).map(item => (
                  <div key={item.id} className={`rounded-xl border-l-2 border border-white/8 bg-slate-950/60 px-4 py-3 ${severityAccent(item.severity)}`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(item.severity)}`}>{item.severity}</span>
                      <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                      <span className="ml-auto text-[11px] text-slate-500">{item.category}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400 line-clamp-1">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* CLI Output terminal */}
            {cliOutput && (
              <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5 fade-in">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1.5">
                      <span className="h-3 w-3 rounded-full bg-red-500/70" />
                      <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
                      <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
                    </span>
                    <p className="mono text-[11px] text-slate-500 ml-1">scanner output</p>
                  </div>
                  <button onClick={() => setCliOutput(null)} className="text-xs text-slate-600 hover:text-slate-400 transition">✕ dismiss</button>
                </div>
                <pre className="mono text-xs text-emerald-300/90 leading-relaxed overflow-x-auto overflow-y-auto max-h-72 whitespace-pre-wrap bg-slate-950/60 rounded-xl p-4 border border-white/5">
                  {cliOutput}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    )
  }



  /* ── Reports Page ── */
  const ReportsPage = () => (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-900/80 p-5">
        <div>
          <h2 className="text-2xl font-black text-white">Reports</h2>
          <p className="text-xs text-slate-500 mt-1">{reports.length} saved reports</p>
        </div>
        <ScanButton label="+ New Scan" className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 transition disabled:opacity-50" />
      </div>
      <div className="space-y-2">
        {reports.map((filename, i) => {
          const detail = reportDetails.find(r => r.generated_at && filename.includes(r.generated_at.replace(/[^0-9]/g, '').slice(0, 8)))
          const risk = detail ? riskLabel(detail.risk_score) : null
          return (
            <div key={filename} className="flex items-center gap-4 rounded-xl border border-white/8 bg-slate-900/80 px-4 py-3.5 transition hover:bg-slate-900 card-hover">
              <div className="mono flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs text-slate-400">
                {reports.length - i}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{filename}</p>
                {detail && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {detail.generated_at} · {detail.total_findings} findings · Score: <span className="mono font-bold text-slate-300">{detail.risk_score.toFixed(1)}</span>
                  </p>
                )}
              </div>
              {risk && <span className={`hidden sm:flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${risk.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${risk.dot}`} />{risk.label}</span>}
              <button onClick={() => openReportDetail(filename)}
                className="rounded-lg bg-cyan-400/10 border border-cyan-400/20 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-400/20 transition flex-shrink-0">
                View
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )

  /* ── Settings Page ── */
  const SettingsPage = () => (
    <div className="space-y-4 fade-in">
      <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
        <h2 className="text-2xl font-black text-white">Settings</h2>
        <p className="text-xs text-slate-500 mt-1">Scanner configuration and preferences</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
          <h3 className="text-sm font-bold text-white mb-4">Scanner Configuration</h3>
          <div className="space-y-3">
            {['OpenStack API Endpoint','Project Name','Username'].map(p => (
              <input key={p} className="w-full rounded-xl border border-white/8 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-cyan-400/30 transition" placeholder={p} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-5">
          <h3 className="text-sm font-bold text-white mb-4">Output Preferences</h3>
          <div className="space-y-3">
            {[['Save JSON report',true],['Save PDF report',true],['Email alerts',false]].map(([label,checked]) => (
              <label key={label} className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" defaultChecked={checked} className="h-4 w-4 rounded accent-cyan-400" />
                <span className="text-sm text-slate-300 group-hover:text-white transition">{label}</span>
              </label>
            ))}
          </div>
          <button className="mt-5 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 transition">Save Settings</button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.05),_transparent_50%),linear-gradient(180deg,#020617_0%,#0a1628_100%)] p-4 text-white md:p-5">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Sidebar />
        <main className="min-w-0">
          {/* If a report is being viewed, show detail page regardless of current nav */}
          {viewingReport ? (
            <ReportDetailPage
              report={viewingReport.data}
              filename={viewingReport.filename}
              onBack={() => setViewingReport(null)}
            />
          ) : (
            <>
              {page === 'dashboard' && <DashboardPage />}
              {page === 'findings'  && <FindingsPage findings={findings} filteredFindings={filteredFindings} search={search} setSearch={setSearch} severityFilter={severityFilter} setSeverityFilter={setSeverityFilter} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} expandedRow={expandedRow} setExpandedRow={setExpandedRow} />}
              {page === 'reports'   && <ReportsPage />}
              {page === 'history'   && <HistoryPage allReports={reports} />}
              {page === 'settings'  && <SettingsPage />}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
