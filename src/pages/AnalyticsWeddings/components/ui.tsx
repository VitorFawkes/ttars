import type { ReactNode } from 'react'
import { deltaPct } from '../lib/dates'

export function SectionCard({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-ww-sand shadow-ww-lift rounded-xl p-5 ${className}`}>
      <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="font-ww-serif text-[15px] font-semibold text-ww-n700 tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-ww-n500 mt-0.5 max-w-3xl">{subtitle}</p>}
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
    const cls = sign === 'up' ? 'bg-emerald-50 text-emerald-700' : sign === 'down' ? 'bg-rose-50 text-rose-600' : 'bg-ww-cream text-ww-n500'
    const arrow = sign === 'up' ? '▲' : sign === 'down' ? '▼' : '—'
    badge = (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>
        {arrow} {pct}%
      </span>
    )
  }
  const inner = (
    <div className="bg-white border border-ww-sand shadow-ww-lift rounded-xl p-4 hover:border-ww-sand-dk transition-colors">
      <div className="text-xs uppercase tracking-wide text-ww-n500 font-medium">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-ww-n700 tracking-tight tabular-nums">{value}</div>
        {badge}
      </div>
      {hint && <div className="mt-1 text-xs text-ww-n500">{hint}</div>}
    </div>
  )
  if (onClick) {
    return <button onClick={onClick} className="text-left w-full active:scale-[0.99] transition-transform">{inner}</button>
  }
  return inner
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-12 text-center text-sm text-ww-n400">{message}</div>
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 bg-ww-cream/70 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}

export function ErrorBanner({ error }: { error: string | Error | unknown }) {
  // Erros do Supabase (PostgrestError) são objetos planos — String() vira "[object Object]".
  const msg = typeof error === 'string' ? error
    : (error as { message?: string })?.message
      ?? (() => { try { return JSON.stringify(error) } catch { return 'erro desconhecido' } })()
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800">
      <strong>Não consegui carregar esta parte.</strong> Tente recarregar a página; se continuar, me avise com o texto abaixo.
      <div className="mt-1 text-rose-600/80 break-all">{msg}</div>
    </div>
  )
}

export function ClickableBar({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  if (!onClick) return <>{children}</>
  return (
    <button onClick={onClick} className="text-left w-full hover:bg-ww-cream/50 rounded transition-colors">
      {children}
    </button>
  )
}
