import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SofiaTab {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  dirty?: boolean
}

// Layout próprio da Sofia (isolado da Patricia). Rail vertical refinado: pílula ativa
// com barra de acento, ícones, e uma faixa horizontal rolável no mobile.
export function SofiaLayout({
  tabs, activeTab, onTabChange, children,
}: {
  tabs: SofiaTab[]
  activeTab: string
  onTabChange: (id: string) => void
  children: ReactNode
}) {
  return (
    <div className="flex gap-6 flex-col md:flex-row">
      <nav className="md:w-60 flex-shrink-0 md:sticky md:top-6 md:self-start" aria-label="Seções da Sofia">
        {/* Desktop rail */}
        <div className="hidden md:flex flex-col gap-0.5 bg-white/80 backdrop-blur border border-ww-sand rounded-2xl p-2 shadow-ww-lift">
          {tabs.map(t => {
            const Icon = t.icon
            const active = t.id === activeTab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={cn(
                  'group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl text-sm text-left',
                  'transition-[background-color,color] duration-150 ease-out active:scale-[0.98]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ww-gold/40',
                  active ? 'bg-ww-gold-soft text-ww-n700 font-semibold' : 'text-ww-n500 hover:bg-ww-cream/70 hover:text-ww-n700',
                )}
              >
                <span className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-full bg-ww-gold transition-[height,opacity] duration-200 ease-out', active ? 'h-6 opacity-100' : 'h-0 opacity-0')} />
                <Icon className={cn('w-[18px] h-[18px] transition-colors', active ? 'text-ww-gold-ink' : 'text-ww-n400 group-hover:text-ww-n500')} />
                <span className="flex-1">{t.label}</span>
                {t.dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="Modificado" />}
              </button>
            )
          })}
        </div>

        {/* Mobile: faixa horizontal rolável */}
        <div className="md:hidden -mx-1 flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map(t => {
            const Icon = t.icon
            const active = t.id === activeTab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs whitespace-nowrap border shrink-0',
                  'transition-[background-color,color,border-color] duration-150 ease-out active:scale-[0.96]',
                  active ? 'bg-ww-gold text-white border-ww-gold' : 'bg-white text-ww-n500 border-ww-sand',
                )}
              >
                <Icon className="w-3.5 h-3.5" />{t.label}{t.dirty ? ' •' : ''}
              </button>
            )
          })}
        </div>
      </nav>

      <div className="flex-1 min-w-0 space-y-5">{children}</div>
    </div>
  )
}
