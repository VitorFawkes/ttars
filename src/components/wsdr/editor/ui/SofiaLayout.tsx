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
        <div className="hidden md:flex flex-col gap-0.5 bg-white/80 backdrop-blur border border-slate-200/80 rounded-2xl p-2 shadow-sm">
          {tabs.map(t => {
            const Icon = t.icon
            const active = t.id === activeTab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                className={cn(
                  'group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl text-sm text-left transition-all duration-150',
                  active ? 'bg-indigo-50 text-indigo-900 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <span className={cn('absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-full bg-indigo-600 transition-all', active ? 'h-6 opacity-100' : 'h-0 opacity-0')} />
                <Icon className={cn('w-[18px] h-[18px] transition-colors', active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-500')} />
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
                  'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs whitespace-nowrap border transition-colors shrink-0',
                  active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200',
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
