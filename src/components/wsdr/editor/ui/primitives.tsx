import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Primitivos compartilhados do editor da Sofia. Substituem os helpers locais
// duplicados (Card/Field/InfoBanner) e dão hierarquia visual + accent por seção,
// no espírito do DESIGN_SYSTEM (light-mode-first) e dos princípios do Emil.

export type Accent = 'indigo' | 'violet' | 'sky' | 'amber' | 'emerald' | 'rose' | 'slate'

const ACCENT: Record<Accent, { icon: string; iconBg: string }> = {
  indigo: { icon: 'text-indigo-600', iconBg: 'bg-indigo-50' },
  violet: { icon: 'text-violet-600', iconBg: 'bg-violet-50' },
  sky: { icon: 'text-sky-600', iconBg: 'bg-sky-50' },
  amber: { icon: 'text-amber-600', iconBg: 'bg-amber-50' },
  emerald: { icon: 'text-emerald-600', iconBg: 'bg-emerald-50' },
  rose: { icon: 'text-rose-600', iconBg: 'bg-rose-50' },
  slate: { icon: 'text-slate-500', iconBg: 'bg-slate-100' },
}

// Card de seção: ícone em chip colorido + título forte + descrição. Um accent por seção
// dá leitura imediata (nada de parede de cards brancos iguais).
export function EditorCard({
  icon, title, desc, accent = 'indigo', children, aside,
}: { icon: ReactNode; title: string; desc?: string; accent?: Accent; children: ReactNode; aside?: ReactNode }) {
  const a = ACCENT[accent]
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-start gap-3">
        <span className={cn('flex items-center justify-center w-9 h-9 rounded-lg shrink-0', a.iconBg, a.icon)}>{icon}</span>
        <div className="space-y-0.5 min-w-0 flex-1">
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">{title}</h3>
          {desc && <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

// Grupo colapsável: header com label MAIÚSCULO + contador. Pra agrupar muitos itens
// (capacidades, regras) sem virar uma lista plana cansativa.
export function EditorSectionGroup({
  label, icon, accent = 'slate', count, defaultOpen = true, children,
}: { label: string; icon?: ReactNode; accent?: Accent; count?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const a = ACCENT[accent]
  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors active:scale-[0.997]"
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon && <span className={cn('shrink-0', a.icon)}>{icon}</span>}
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 truncate">{label}</span>
          {count != null && (
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5 shrink-0">{count}</span>
          )}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">{children}</div>}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-900 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{hint}</p>}
    </div>
  )
}

export function InfoBanner({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 bg-slate-50/70 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
      {icon && <span className="text-slate-400 shrink-0 mt-0.5">{icon}</span>}
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
      {icon && <span className="text-slate-300 mb-2">{icon}</span>}
      <p className="text-sm text-slate-500">{title}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )
}
