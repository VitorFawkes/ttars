import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EditorTab {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
  disabledHint?: string
  dirty?: boolean
}

interface Props {
  tabs: EditorTab[]
  activeTab: string
  onTabChange: (id: string) => void
  children: ReactNode
}

export function AgentEditorLayout({ tabs, activeTab, onTabChange, children }: Props) {
  return (
    <div className="flex gap-6 flex-col md:flex-row">
      <nav
        className="md:w-56 flex-shrink-0 md:sticky md:top-4 md:self-start"
        aria-label="Seções do agente"
      >
        <div className="hidden md:flex flex-col gap-1 bg-white border border-slate-200 rounded-xl p-2 shadow-sm">
          {tabs.map(t => {
            const Icon = t.icon
            const active = t.id === activeTab
            return (
              <button
                key={t.id}
                type="button"
                disabled={t.disabled}
                onClick={() => onTabChange(t.id)}
                title={t.disabled ? t.disabledHint : undefined}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors relative',
                  active
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-50',
                  t.disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                )}
              >
                <Icon className={cn('w-4 h-4', active ? 'text-indigo-600' : 'text-slate-400')} />
                <span className="flex-1">{t.label}</span>
                {t.dirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="Modificado" />
                )}
              </button>
            )
          })}
        </div>

        <div className="md:hidden">
          <select
            value={activeTab}
            onChange={e => onTabChange(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            {tabs.map(t => (
              <option key={t.id} value={t.id} disabled={t.disabled}>
                {t.label}{t.dirty ? ' •' : ''}
              </option>
            ))}
          </select>
        </div>
      </nav>

      <div className="flex-1 min-w-0 space-y-6">{children}</div>
    </div>
  )
}
