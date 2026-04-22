import { useMemo } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { useCardStageHistory } from '@/hooks/analyticsV2/useAnalyticsV2Rpcs'
import {
  ArrowRight, Trophy, MessageCircle, CheckCircle2, XCircle, FileText, Flag, Sparkles, ExternalLink, RotateCcw,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface TimelineEvent {
  at: string
  kind: string
  payload: Record<string, unknown>
}

interface Props {
  cardId: string | null
  cardTitle?: string
  onOpenChange: (open: boolean) => void
}

export default function CardTimelineDrawer({ cardId, cardTitle, onOpenChange }: Props) {
  const { data, isLoading } = useCardStageHistory(cardId)

  const events = useMemo(() => (data?.events ?? []) as TimelineEvent[], [data])

  const open = cardId != null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full">
        <SheetHeader>
          <SheetTitle className="text-slate-900 tracking-tight">
            {cardTitle ?? 'Histórico do card'}
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-500">
            Linha do tempo completa do card — mudanças de etapa, handoffs, ganhos e eventos relevantes.
          </SheetDescription>
        </SheetHeader>

        {cardId && (
          <a
            href={`/cards/${cardId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 -mt-2"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir card
          </a>
        )}

        {isLoading ? (
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="w-8 h-8 rounded-full bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-48 bg-slate-100 rounded" />
                  <div className="h-3 w-32 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="mt-8 text-center text-sm text-slate-400">
            Nenhum evento registrado para este card.
          </div>
        ) : (
          <ol className="mt-4 relative border-l border-slate-200 ml-4 space-y-5">
            {events.map((ev, i) => (
              <li key={i} className="pl-6 relative">
                <span className="absolute -left-[15px] top-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <EventIcon kind={ev.kind} payload={ev.payload} />
                </span>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900">{eventLabel(ev)}</div>
                  <time className="text-[11px] text-slate-400 flex-shrink-0 tabular-nums">
                    {formatDateTime(ev.at)}
                  </time>
                </div>
                <EventDetail kind={ev.kind} payload={ev.payload} />
              </li>
            ))}
          </ol>
        )}
      </SheetContent>
    </Sheet>
  )
}

function EventIcon({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  const cls = 'w-3.5 h-3.5'
  switch (kind) {
    case 'stage_changed':
      return payload.is_rework ? <RotateCcw className={`${cls} text-amber-600`} /> : <ArrowRight className={`${cls} text-indigo-500`} />
    case 'ganho_sdr_event':
      return <Flag className={`${cls} text-sky-500`} />
    case 'ganho_planner_event':
      return <Trophy className={`${cls} text-emerald-500`} />
    case 'ganho_pos_event':
      return <CheckCircle2 className={`${cls} text-green-600`} />
    case 'lost':
    case 'card_lost':
      return <XCircle className={`${cls} text-red-500`} />
    case 'whatsapp_outbound':
    case 'whatsapp_inbound':
      return <MessageCircle className={`${cls} text-sky-500`} />
    case 'proposal_created':
    case 'proposal_version':
      return <FileText className={`${cls} text-violet-500`} />
    default:
      return <Sparkles className={`${cls} text-slate-400`} />
  }
}

function eventLabel(ev: TimelineEvent): string {
  const p = ev.payload ?? {}
  switch (ev.kind) {
    case 'stage_changed': {
      const from = (p.old_stage_nome as string | undefined) ?? '—'
      const to = (p.new_stage_nome as string | undefined) ?? '—'
      const rework = p.is_rework ? ' (retrabalho)' : ''
      return `Mudou de etapa: ${from} → ${to}${rework}`
    }
    case 'ganho_sdr_event':
      return 'Handoff SDR → Planner'
    case 'ganho_planner_event':
      return 'Planner fechou a venda'
    case 'ganho_pos_event':
      return 'Viagem entregue pelo Pós'
    case 'lost':
    case 'card_lost':
      return 'Card perdido'
    case 'whatsapp_outbound':
      return 'Mensagem enviada'
    case 'whatsapp_inbound':
      return 'Mensagem recebida'
    case 'proposal_created':
      return 'Proposta criada'
    case 'proposal_version':
      return 'Nova versão da proposta'
    default:
      return ev.kind.replace(/_/g, ' ')
  }
}

function EventDetail({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  const p = payload ?? {}
  const items: Array<[string, string]> = []

  if (kind === 'stage_changed') {
    if (p.old_stage_ordem != null && p.new_stage_ordem != null) {
      items.push(['Ordem', `${p.old_stage_ordem} → ${p.new_stage_ordem}`])
    }
    if (p.moved_by_nome) items.push(['Por', String(p.moved_by_nome)])
  }
  if (kind === 'lost' || kind === 'card_lost') {
    if (p.motivo) items.push(['Motivo', String(p.motivo)])
    if (p.comentario) items.push(['Comentário', String(p.comentario)])
  }
  if (kind === 'proposal_version' && p.version != null) {
    items.push(['Versão', String(p.version)])
  }

  if (items.length === 0) return null
  return (
    <dl className="mt-1 text-xs text-slate-500 space-y-0.5">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <dt className="text-slate-400">{k}:</dt>
          <dd className="text-slate-600">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function formatDateTime(iso: string): string {
  try {
    return format(new Date(iso), "dd/MM/yy HH:mm", { locale: ptBR })
  } catch {
    return iso
  }
}
