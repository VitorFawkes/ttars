import { createElement, useState, type ReactNode } from 'react'
import {
  ChevronDown, Database, CalendarClock, BookOpen, BellRing, Mic, Sparkles, type LucideIcon,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { CapStatus } from '@/components/wsdr/sofiaConfig'

const ICONS: Record<string, LucideIcon> = { Database, CalendarClock, BookOpen, BellRing, Mic, Sparkles }

const COLOR: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  indigo: 'bg-ww-gold-soft text-ww-gold-ink',
}

const STATUS_STYLE: Record<CapStatus, { label: string; cls: string }> = {
  pronto: { label: 'Pronto pra usar', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  em_testes: { label: 'Em testes', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  em_breve: { label: 'Ligando em breve', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
}

interface Props {
  icon: string
  color: string
  title: string
  subtitle: string
  description: string
  status: CapStatus
  enabled: boolean
  onToggle: (v: boolean) => void
  children?: ReactNode
}

export function CapabilityCard({ icon, color, title, subtitle, description, status, enabled, onToggle, children }: Props) {
  const [open, setOpen] = useState(false)
  const IconComp = ICONS[icon] ?? Sparkles
  const st = STATUS_STYLE[status]
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', COLOR[color] ?? COLOR.indigo)}>
          {createElement(IconComp, { className: 'w-5 h-5' })}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h3>
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full border', st.cls)}>{st.label}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} className={enabled ? 'bg-ww-gold' : ''} />
      </div>

      {children && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2 border-t border-slate-100 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <span>{open ? 'Ocultar ajustes' : 'Ver ajustes'}</span>
          <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180', open && 'text-ww-gold-ink')} />
        </button>
      )}

      {open && children && (
        <div className="px-4 pb-4 pt-3 border-t border-slate-100 space-y-3">
          <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
          {enabled ? children : (
            <p className="text-xs text-slate-400 italic">Ligue a capacidade acima para configurar os detalhes.</p>
          )}
        </div>
      )}
    </div>
  )
}
