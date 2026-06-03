import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Primitivos compartilhados do editor da Sofia. Substituem os helpers locais
// duplicados (Card/Field/InfoBanner) e dão hierarquia visual + accent por seção,
// no espírito do DESIGN_SYSTEM (light-mode-first) e dos princípios do Emil.

export type Accent = 'indigo' | 'violet' | 'sky' | 'amber' | 'emerald' | 'rose' | 'slate'

// Welcome Weddings: paleta QUENTE. Os nomes dos acentos viram "slots" lógicos —
// os antigos frios (indigo/violet/sky) renderizam tons de marca (dourado/rosewood/oliva).
const ACCENT: Record<Accent, { icon: string; iconBg: string }> = {
  indigo: { icon: 'text-ww-gold-ink', iconBg: 'bg-ww-gold-soft' },
  violet: { icon: 'text-ww-rosewood', iconBg: 'bg-ww-rosewood-soft' },
  sky: { icon: 'text-ww-olive-ink', iconBg: 'bg-ww-olive-soft' },
  amber: { icon: 'text-amber-700', iconBg: 'bg-amber-50' },
  emerald: { icon: 'text-ww-olive-ink', iconBg: 'bg-ww-olive-soft' },
  rose: { icon: 'text-ww-rosewood', iconBg: 'bg-ww-rosewood-soft' },
  slate: { icon: 'text-ww-n500', iconBg: 'bg-ww-cream' },
}

// Seção (sub-bloco) dentro da gaveta. ACHATADA: sem caixa própria — a gaveta já é a
// superfície branca. Separação por hairline + respiro (nada de caixa-na-caixa).
export function EditorCard({
  icon, title, desc, accent = 'indigo', children, aside,
}: { icon: ReactNode; title: string; desc?: string; accent?: Accent; children: ReactNode; aside?: ReactNode }) {
  const a = ACCENT[accent]
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span className={cn('flex items-center justify-center w-9 h-9 rounded-xl shrink-0', a.iconBg, a.icon)}>{icon}</span>
        <div className="space-y-0.5 min-w-0 flex-1">
          <h3 className="font-ww-serif text-lg text-ww-n700 tracking-tight leading-tight">{title}</h3>
          {desc && <p className="text-sm text-ww-n500 leading-relaxed">{desc}</p>}
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
    <div className="border border-ww-sand rounded-2xl bg-white shadow-ww-lift overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-ww-cream/60 transition-colors duration-150 ease-out active:scale-[0.997] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ww-gold/40"
      >
        <span className="flex items-center gap-2 min-w-0">
          {icon && <span className={cn('shrink-0', a.icon)}>{icon}</span>}
          <span className="text-xs font-bold uppercase tracking-wide text-ww-n500 truncate">{label}</span>
          {count != null && (
            <span className="text-[11px] font-medium text-ww-n500 bg-ww-cream rounded-full px-1.5 py-0.5 shrink-0">{count}</span>
          )}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-ww-n400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3 border-t border-ww-sand">{children}</div>}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ww-n700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-ww-n400 mt-1 leading-relaxed">{hint}</p>}
    </div>
  )
}

export function InfoBanner({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 bg-ww-cream/60 border border-ww-sand rounded-xl p-4 text-xs text-ww-n600 leading-relaxed">
      {icon && <span className="text-ww-n400 shrink-0 mt-0.5">{icon}</span>}
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 rounded-xl border border-dashed border-ww-sand bg-ww-cream/40">
      {icon && <span className="text-ww-n400 mb-2">{icon}</span>}
      <p className="text-sm text-ww-n500">{title}</p>
      {hint && <p className="text-xs text-ww-n400 mt-0.5">{hint}</p>}
    </div>
  )
}
