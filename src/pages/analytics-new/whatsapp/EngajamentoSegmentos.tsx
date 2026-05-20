import { Sparkles, MessageSquareOff, CalendarCheck, Repeat, AlertTriangle, Trophy, Frown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EngajamentoFilters } from '@/types/engagement'

interface Props {
  filters: EngajamentoFilters
  onChange: (updates: Partial<EngajamentoFilters>) => void
}

interface Segment {
  id: string
  label: string
  description: string
  icon: typeof Sparkles
  fg: string
  bg: string
  match: (f: EngajamentoFilters) => boolean
  apply: () => Partial<EngajamentoFilters>
}

const RESET_FILTER: Partial<EngajamentoFilters> = {
  stateFilter: [],
  inboundMin: null,
  inboundMax: null,
  meetingStates: [],
  stageNames: [],
  stagePhases: [],
}

const SEGMENTS: Segment[] = [
  {
    id: 'nao_respondeu',
    label: 'Nunca respondeu',
    description: 'recebeu nossa msg e ficou em silêncio',
    icon: MessageSquareOff,
    fg: 'text-slate-700',
    bg: 'bg-slate-100',
    match: f =>
      f.stateFilter.length === 1 &&
      f.stateFilter[0] === 'cold' &&
      f.meetingStates.length === 0,
    apply: () => ({ ...RESET_FILTER, stateFilter: ['cold'] }),
  },
  {
    id: 'uma_vez_so',
    label: 'Respondeu 1× e sumiu',
    description: 'engajou uma vez e parou 48h+',
    icon: Frown,
    fg: 'text-amber-700',
    bg: 'bg-amber-100',
    match: f =>
      f.inboundMin === 1 && f.inboundMax === 1 && f.stateFilter.length === 1 && f.stateFilter[0] === 'lost',
    apply: () => ({ ...RESET_FILTER, inboundMin: 1, inboundMax: 1, stateFilter: ['lost'] }),
  },
  {
    id: 'reuniao_agendada',
    label: 'Reunião agendada',
    description: 'aceitou marcar (não aconteceu ainda)',
    icon: CalendarCheck,
    fg: 'text-violet-700',
    bg: 'bg-violet-100',
    match: f =>
      f.meetingStates.length === 1 && f.meetingStates[0] === 'meeting_scheduled',
    apply: () => ({ ...RESET_FILTER, meetingStates: ['meeting_scheduled'] }),
  },
  {
    id: 'reuniao_feita',
    label: 'Reunião feita',
    description: 'apresentação ou além',
    icon: Sparkles,
    fg: 'text-emerald-700',
    bg: 'bg-emerald-100',
    match: f =>
      f.meetingStates.length === 1 && f.meetingStates[0] === 'meeting_done',
    apply: () => ({ ...RESET_FILTER, meetingStates: ['meeting_done'] }),
  },
  {
    id: 'respondeu_sem_reuniao',
    label: 'Respondeu mas não marcou',
    description: 'engajou mas sem reunião · oportunidade morna',
    icon: Repeat,
    fg: 'text-sky-700',
    bg: 'bg-sky-100',
    match: f =>
      f.inboundMin === 1 && f.meetingStates.length === 1 && f.meetingStates[0] === 'none',
    apply: () => ({ ...RESET_FILTER, inboundMin: 1, meetingStates: ['none'] }),
  },
  {
    id: 'paradoxo_cold_reuniao',
    label: 'Marcou sem responder',
    description: 'cold no WhatsApp mas tem reunião · checar outro canal',
    icon: AlertTriangle,
    fg: 'text-rose-700',
    bg: 'bg-rose-100',
    match: f =>
      f.stateFilter.includes('cold') &&
      (f.meetingStates.includes('meeting_scheduled') || f.meetingStates.includes('meeting_done')),
    apply: () => ({
      ...RESET_FILTER,
      stateFilter: ['cold'],
      meetingStates: ['meeting_scheduled', 'meeting_done'],
    }),
  },
  {
    id: 'ganhou',
    label: 'Vendeu',
    description: 'virou venda no SDR ou comercial',
    icon: Trophy,
    fg: 'text-amber-700',
    bg: 'bg-amber-100',
    match: f => f.stateFilter.length === 1 && f.stateFilter[0] === 'won',
    apply: () => ({ ...RESET_FILTER, stateFilter: ['won'] }),
  },
]

export default function EngajamentoSegmentos({ filters, onChange }: Props) {
  const anySegmentActive = SEGMENTS.some(s => s.match(filters))
  const anyFilterActive =
    filters.stateFilter.length > 0 ||
    filters.inboundMin !== null ||
    filters.inboundMax !== null ||
    filters.meetingStates.length > 0 ||
    filters.stageNames.length > 0 ||
    filters.stagePhases.length > 0

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
            Segmentos rápidos
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Combinações comuns de filtros · clique pra recortar tudo
          </p>
        </div>
        {anyFilterActive && (
          <button
            onClick={() => onChange(RESET_FILTER)}
            className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-50"
          >
            <X className="w-3 h-3" />
            Limpar
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {SEGMENTS.map(seg => {
          const isActive = seg.match(filters)
          return (
            <button
              key={seg.id}
              onClick={() => onChange(isActive ? RESET_FILTER : seg.apply())}
              className={cn(
                'group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 active:scale-[0.98]',
                isActive
                  ? `${seg.bg} ${seg.fg} ring-2 ring-offset-1 ring-current shadow-sm`
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              )}
              title={seg.description}
            >
              <seg.icon className="w-3.5 h-3.5" />
              {seg.label}
            </button>
          )
        })}
      </div>

      {!anySegmentActive && anyFilterActive && (
        <p className="text-[11px] text-slate-400 mt-3">
          Filtros customizados ativos · não casam com nenhum segmento pronto.
        </p>
      )}
    </div>
  )
}
