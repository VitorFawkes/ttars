import { useState } from 'react'
import { Check, X, MessageCircle, ThumbsUp, Ban, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { KanbanTarefaItem } from '../../../hooks/concierge/useKanbanTarefas'

interface SelectionActionBarProps {
  selected: KanbanTarefaItem[]
  onClear: () => void
  onMarcarFeito: () => void
  onMarcarAceito: () => void
  onNotificar: () => void
  onEncerrar: () => void
  isPending?: boolean
}

export function SelectionActionBar({
  selected,
  onClear,
  onMarcarFeito,
  onMarcarAceito,
  onNotificar,
  onEncerrar,
  isPending,
}: SelectionActionBarProps) {
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)
  if (selected.length === 0) return null

  const ofertas = selected.filter(s => s.tipo_concierge === 'oferta').length
  const semOutcome = selected.filter(s => !s.outcome).length
  const aFazer = selected.filter(s => !s.outcome && !s.notificou_cliente_em).length

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-white rounded-xl border border-slate-200 shadow-xl px-3 py-2 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
        <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-[12px] font-bold inline-flex items-center justify-center font-mono">
          {selected.length}
        </div>
        <div className="text-[12px] text-slate-700">
          <span className="font-semibold">selecionado{selected.length === 1 ? '' : 's'}</span>
          <span className="text-slate-500 ml-1">· {semOutcome} aberto{semOutcome === 1 ? '' : 's'}</span>
        </div>
      </div>

      <ActionButton
        icon={<Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
        label="Feito"
        sublabel={`${semOutcome}`}
        tone="emerald"
        onClick={onMarcarFeito}
        disabled={isPending || semOutcome === 0}
        onHover={() => setHoveredAction('feito')}
        onLeave={() => setHoveredAction(null)}
        hovered={hoveredAction === 'feito'}
      />

      <ActionButton
        icon={<ThumbsUp className="w-3.5 h-3.5" strokeWidth={2.5} />}
        label="Aceito"
        sublabel={`${ofertas} oferta${ofertas === 1 ? '' : 's'}`}
        tone="purple"
        onClick={onMarcarAceito}
        disabled={isPending || ofertas === 0}
        onHover={() => setHoveredAction('aceito')}
        onLeave={() => setHoveredAction(null)}
        hovered={hoveredAction === 'aceito'}
      />

      <ActionButton
        icon={<MessageCircle className="w-3.5 h-3.5" strokeWidth={2.5} />}
        label="Notificar"
        sublabel={`${aFazer}`}
        tone="amber"
        onClick={onNotificar}
        disabled={isPending || aFazer === 0}
        onHover={() => setHoveredAction('notificar')}
        onLeave={() => setHoveredAction(null)}
        hovered={hoveredAction === 'notificar'}
      />

      <ActionButton
        icon={<Ban className="w-3.5 h-3.5" strokeWidth={2.5} />}
        label="Encerrar"
        tone="slate"
        onClick={onEncerrar}
        disabled={isPending || semOutcome === 0}
        onHover={() => setHoveredAction('encerrar')}
        onLeave={() => setHoveredAction(null)}
        hovered={hoveredAction === 'encerrar'}
      />

      <button
        type="button"
        onClick={onClear}
        disabled={isPending}
        className="ml-1 p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label="Limpar seleção"
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

const TONE_STYLES: Record<string, { idle: string; hover: string; disabled: string }> = {
  emerald: {
    idle: 'text-emerald-700',
    hover: 'bg-emerald-50',
    disabled: 'text-slate-400',
  },
  purple: {
    idle: 'text-purple-700',
    hover: 'bg-purple-50',
    disabled: 'text-slate-400',
  },
  amber: {
    idle: 'text-amber-700',
    hover: 'bg-amber-50',
    disabled: 'text-slate-400',
  },
  slate: {
    idle: 'text-slate-700',
    hover: 'bg-slate-100',
    disabled: 'text-slate-400',
  },
}

function ActionButton({
  icon, label, sublabel, tone, onClick, disabled, onHover, onLeave, hovered,
}: {
  icon: React.ReactNode
  label: string
  sublabel?: string
  tone: keyof typeof TONE_STYLES
  onClick: () => void
  disabled?: boolean
  onHover: () => void
  onLeave: () => void
  hovered: boolean
}) {
  const styles = TONE_STYLES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] font-medium border border-transparent transition-colors',
        disabled ? styles.disabled : styles.idle,
        !disabled && hovered && styles.hover,
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {icon}
      <span>{label}</span>
      {sublabel && <span className="text-[10.5px] text-slate-500 font-mono">{sublabel}</span>}
    </button>
  )
}
