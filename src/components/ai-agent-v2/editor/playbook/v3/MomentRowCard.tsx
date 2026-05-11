import { GripVertical, ChevronRight, AlertTriangle, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlaybookMoment } from '@/hooks/v2/playbook/useAgentMoments'

interface Props {
  moment: PlaybookMoment
  index?: number
  alertCount?: number
  onOpen: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragHandleProps?: { attributes?: any; listeners?: any }
}

const TRIGGER_LABELS: Record<PlaybookMoment['trigger_type'], string> = {
  primeiro_contato: 'Primeira mensagem do lead',
  lead_respondeu: 'Lead respondeu',
  keyword: 'Contém palavras-chave',
  score_threshold: 'Score atingiu valor',
  always: 'Sempre disponível',
  custom: 'Customizado',
  manual: 'Disparo manual',
}

const MODE_LABELS: Record<PlaybookMoment['message_mode'], string> = {
  literal: 'Texto exato',
  faithful: 'Diretriz fiel',
  free: 'Estilo livre',
}

/**
 * Cartão resumido de momento (UI v3) — mostra só o essencial e abre drawer ao clicar.
 *
 * Propósito: substituir o MomentCard inline-expandable por uma listagem mais limpa
 * onde o admin vê de relance todos os momentos e abre um por vez no drawer lateral.
 *
 * Mantém paridade total: o MomentCard original continua sendo usado pra editar
 * (renderizado dentro do drawer com defaultExpanded=true, hideToggle=true).
 */
export function MomentRowCard({ moment, index, alertCount = 0, onOpen, dragHandleProps }: Props) {
  const isFlow = moment.kind === 'flow'
  const triggerLabel = TRIGGER_LABELS[moment.trigger_type] ?? moment.trigger_type
  const modeLabel = MODE_LABELS[moment.message_mode] ?? moment.message_mode

  const summary = (() => {
    if (moment.kind === 'flow') {
      // Mostra resumo do anchor_text (primeiras palavras significativas)
      const anchor = moment.anchor_text?.replace(/\s+/g, ' ').trim() ?? ''
      if (anchor.length > 0) {
        return anchor.length > 90 ? `${anchor.slice(0, 90)}…` : anchor
      }
      return moment.intent ?? '(sem texto âncora ainda)'
    }
    // Plays: mostra keywords se existirem
    const cfg = moment.trigger_config ?? {}
    const kws = Array.isArray(cfg.keywords) ? (cfg.keywords as string[]) : []
    if (kws.length > 0) {
      const head = kws.slice(0, 4).join(', ')
      const more = kws.length > 4 ? ` +${kws.length - 4}` : ''
      return `Dispara em: ${head}${more}`
    }
    return moment.intent ?? moment.anchor_text?.slice(0, 90) ?? '(sem gatilho configurado)'
  })()

  // Anti-pattern HTML: <button> dentro de <button>. Pra suportar drag handle
  // sem conflito com o click do card, usamos <div role="button"> e separamos
  // o drag handle como elemento próprio.
  return (
    <div
      className={cn(
        'group relative bg-white border rounded-xl shadow-sm transition-all',
        'hover:border-indigo-300 hover:shadow-md focus-within:ring-2 focus-within:ring-indigo-200',
        moment.enabled ? 'border-slate-200' : 'border-slate-200 opacity-70',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        {isFlow && dragHandleProps ? (
          <button
            type="button"
            {...(dragHandleProps?.attributes ?? {})}
            {...(dragHandleProps?.listeners ?? {})}
            className="relative z-10 text-slate-300 group-hover:text-slate-500 cursor-grab active:cursor-grabbing mt-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded"
            title="Arraste pra reordenar"
            aria-label="Reordenar momento"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        ) : isFlow ? (
          <span className="w-7 h-7 flex-shrink-0 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
            {index ?? '?'}
          </span>
        ) : (
          <span className="w-7 h-7 flex-shrink-0 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center" title="Jogada situacional">
            <Zap className="w-3.5 h-3.5" />
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-slate-900 truncate">
              {moment.moment_label || moment.moment_key}
            </h4>
            {!moment.enabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                desativada
              </span>
            )}
            {alertCount > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium inline-flex items-center gap-1"
                title={`${alertCount} alerta${alertCount > 1 ? 's' : ''} de inconsistência`}
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                {alertCount}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{summary}</p>

          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
            <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200">
              {triggerLabel}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200">
              {modeLabel}
            </span>
            {moment.delivery_mode === 'wait_for_reply' && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700">
                espera resposta
              </span>
            )}
            {moment.discovery_config && moment.discovery_config.slots.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-emerald-700">
                coleta {moment.discovery_config.slots.length} campos
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 mt-1.5 flex-shrink-0" />
      </div>

      {/* Click target invisível cobrindo o card todo, exceto o drag handle (z-0 fica abaixo do handle) */}
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 w-full h-full focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-xl"
        aria-label={`Abrir ${moment.moment_label || moment.moment_key}`}
      />
    </div>
  )
}
