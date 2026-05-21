/**
 * Shell — sidebar fixa estilo Notion/Linear + topbar + main scrollável.
 *
 * Sidebar sempre visível com:
 *  - "Visão geral" (overview)
 *  - 7 capítulos numerados com status visual (✓ completo / → próximo / ○ pendente)
 *  - Atalhos: Saúde, Teste, Modo avançado
 *
 * Navegação é 1 clique entre qualquer item — sem "voltar pra trilha".
 */

import type { ReactNode } from 'react'
import {
  CheckCircle2, Circle, AlertCircle,
  Compass, Activity, PlayCircle, Sliders, Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PATRICIA, CHAPTERS, type ChapterId } from './data-real'

export type View = 'home' | ChapterId | 'saude' | 'teste' | 'avancado'

interface ShellProps {
  view: View
  onChangeView: (v: View) => void
  dirty?: boolean
  onSave?: () => void
  children: ReactNode
}

export function PatriciaShell({ view, onChangeView, dirty, onSave, children }: ShellProps) {
  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans antialiased flex">
      <Sidebar view={view} onChangeView={onChangeView} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar dirty={dirty} onSave={onSave} />
        <main className="flex-1 overflow-y-auto px-10 py-8">
          <div className="max-w-[960px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sidebar
// ─────────────────────────────────────────────────────────────────────────────

function Sidebar({ view, onChangeView }: { view: View; onChangeView: (v: View) => void }) {
  const nextIncomplete = CHAPTERS.find(c => !c.isComplete)?.id

  return (
    <aside className="w-[280px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen">
      {/* Logo / agente */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 grid place-items-center text-base font-semibold">
            P
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-slate-900 tracking-tight truncate">
              {PATRICIA.nome}
            </p>
            <p className="text-[11px] text-slate-500 truncate">{PATRICIA.persona}</p>
          </div>
          <span className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            PATRICIA.ativa ? 'bg-emerald-500' : 'bg-slate-300',
          )} />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
        {/* Visão geral */}
        <Section>
          <Item
            icon={<Compass className="w-3.5 h-3.5" />}
            label="Visão geral"
            active={view === 'home'}
            onClick={() => onChangeView('home')}
          />
        </Section>

        {/* Capítulos */}
        <Section title="Construção em 7 passos">
          {CHAPTERS.map(c => (
            <ChapterItem
              key={c.id}
              num={c.num}
              title={c.title}
              isComplete={c.isComplete}
              isNext={c.id === nextIncomplete}
              active={view === c.id}
              onClick={() => onChangeView(c.id)}
            />
          ))}
        </Section>

        {/* Atalhos */}
        <Section title="Atalhos">
          <Item
            icon={<Activity className="w-3.5 h-3.5" />}
            label="Saúde"
            active={view === 'saude'}
            onClick={() => onChangeView('saude')}
          />
          <Item
            icon={<PlayCircle className="w-3.5 h-3.5" />}
            label="Testar ao vivo"
            active={view === 'teste'}
            onClick={() => onChangeView('teste')}
          />
          <Item
            icon={<Sliders className="w-3.5 h-3.5" />}
            label="Modo avançado"
            active={view === 'avancado'}
            onClick={() => onChangeView('avancado')}
          />
        </Section>
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 text-[10px] text-slate-400">
        <div className="flex items-center justify-between">
          <span>{PATRICIA.produto}</span>
          <span className="font-mono">{PATRICIA.modelo}</span>
        </div>
      </div>
    </aside>
  )
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 px-3 pb-1.5">
          {title}
        </p>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Item({
  icon, label, active, onClick,
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] text-left transition-colors',
        active
          ? 'bg-indigo-50 text-indigo-700 font-medium'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <span className={cn(active ? 'text-indigo-600' : 'text-slate-400')}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  )
}

function ChapterItem({
  num, title, isComplete, isNext, active, onClick,
}: {
  num: number
  title: string
  isComplete: boolean
  isNext: boolean
  active: boolean
  onClick: () => void
}) {
  const StatusIcon = isComplete ? CheckCircle2 : isNext ? AlertCircle : Circle
  const iconColor = isComplete
    ? 'text-emerald-500'
    : isNext
    ? 'text-indigo-500'
    : 'text-slate-300'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-left transition-colors',
        active
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      <StatusIcon className={cn('w-3.5 h-3.5 flex-shrink-0', iconColor)} />
      <span className={cn(
        'font-mono text-[11px] tabular-nums w-5 flex-shrink-0',
        active ? 'text-indigo-500' : 'text-slate-400',
      )}>
        {String(num).padStart(2, '0')}
      </span>
      <span className={cn(
        'flex-1 truncate text-[13px]',
        active && 'font-medium',
      )}>
        {title}
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  TopBar — magra
// ─────────────────────────────────────────────────────────────────────────────

function TopBar({ dirty, onSave }: { dirty?: boolean; onSave?: () => void }) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 px-8 flex items-center gap-3 flex-shrink-0">
      <div className="ml-auto flex items-center gap-3">
        {dirty && (
          <span className="text-[11px] text-amber-700 font-medium">
            alterações não salvas
          </span>
        )}
        <button
          onClick={onSave}
          disabled={!dirty}
          className={cn(
            'inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md transition-colors',
            dirty
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed',
          )}
        >
          <Save className="w-3.5 h-3.5" />
          Salvar
        </button>
      </div>
    </header>
  )
}
