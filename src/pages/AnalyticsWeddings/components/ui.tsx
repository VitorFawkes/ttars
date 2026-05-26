import type { ReactNode } from 'react'
import { deltaPct } from '../lib/dates'

export function SectionCard({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 shadow-sm rounded-xl p-5 ${className}`}>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function KpiCard({ label, value, prevValue, hint, onClick }: { label: string; value: string | number; prevValue?: number; hint?: string; onClick?: () => void }) {
  let badge: ReactNode = null
  if (prevValue !== undefined) {
    const current = typeof value === 'number' ? value : parseFloat(String(value).replace(/\D/g, '')) || 0
    const { pct, sign } = deltaPct(current, prevValue)
    const cls = sign === 'up' ? 'bg-emerald-50 text-emerald-700' : sign === 'down' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
    const arrow = sign === 'up' ? '▲' : sign === 'down' ? '▼' : '—'
    badge = (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>
        {arrow} {pct}%
      </span>
    )
  }
  const inner = (
    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 hover:border-slate-300 transition">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-slate-900 tracking-tight tabular-nums">{value}</div>
        {badge}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
  if (onClick) {
    return <button onClick={onClick} className="text-left w-full hover:scale-[1.01] transition">{inner}</button>
  }
  return inner
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-12 text-center text-sm text-slate-400">{message}</div>
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}

export function ErrorBanner({ error }: { error: string | Error }) {
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800">
      <strong>Erro:</strong> {String(error)}
    </div>
  )
}

export function ClickableBar({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (!onClick) return <>{children}</>
  return (
    <button onClick={onClick} className="text-left w-full hover:bg-slate-50 rounded transition">
      {children}
    </button>
  )
}
