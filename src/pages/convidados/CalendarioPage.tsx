import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWeddings } from '../../hooks/convidados/useWeddings'
import {
  computeFluxoMessages,
  useFluxoTemplates,
  type FluxoCategoria,
  type FluxoVariation,
} from '../../hooks/convidados/useFluxoConfig'
import {
  useAllWeddingFluxos,
  type WeddingFluxoAssignment,
} from '../../hooks/convidados/useWeddingFluxo'

// ────────────────────────────────────────────────────────────────────────
// Helpers de data
// ────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildMonthGrid(monthStart: Date): Date[] {
  // 6 semanas × 7 dias = 42 células, começando no domingo da semana do dia 1.
  const out: Date[] = []
  const first = startOfMonth(monthStart)
  const startSunday = new Date(first)
  startSunday.setDate(first.getDate() - first.getDay())
  for (let i = 0; i < 42; i++) {
    const d = new Date(startSunday)
    d.setDate(startSunday.getDate() + i)
    out.push(d)
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────
// Helpers de dispatch (mensagens agendadas)
// ────────────────────────────────────────────────────────────────────────

interface Dispatch {
  date: Date
  weddingId: string
  weddingName: string
  slug: string
  categoria: FluxoCategoria
  messageIndex: number
  positionInCategory: number
}

function computeScheduleForWedding(
  assignment: WeddingFluxoAssignment,
  flow: FluxoVariation,
): Array<{ index: number; slug: string; categoria: FluxoCategoria; date: Date }> {
  const full = computeFluxoMessages(flow.intervals, new Date(2000, 0, 1))
  const startEntry = full.find(m => m.index === assignment.startIndex)
  if (!startEntry) return []
  const startDate = new Date(assignment.startDate + 'T00:00:00')
  if (Number.isNaN(startDate.getTime())) return []
  const offsetMs = startDate.getTime() - startEntry.date.getTime()
  return full
    .filter(m => m.index >= assignment.startIndex)
    .map(m => ({ ...m, date: new Date(m.date.getTime() + offsetMs) }))
}

function positionInCategory(slug: string, categoria: FluxoCategoria): number {
  const tail = slug.replace(categoria.slug, '')
  const n = parseInt(tail, 10)
  return Number.isNaN(n) ? 0 : n
}

function formatMessageLabel(categoria: FluxoCategoria, position: number): string {
  if (categoria.slug === 'promom') return `Promocional ${position}`
  return `${categoria.label} - Msg ${position}`
}

// ────────────────────────────────────────────────────────────────────────
// Página
// ────────────────────────────────────────────────────────────────────────

export default function CalendarioPage() {
  const navigate = useNavigate()
  const { data: weddings = [], isLoading } = useWeddings()
  const { data: flows = [] } = useFluxoTemplates()
  const { data: assignmentStore = {} } = useAllWeddingFluxos()

  // Estado de navegação do mês.
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()))
  const today = useMemo(() => startOfDay(new Date()), [])

  // Agrega todos os disparos de todos os casamentos ativos.
  const allDispatches = useMemo<Dispatch[]>(() => {
    const out: Dispatch[] = []
    for (const w of weddings) {
      // Encerrado/cancelado: nada a enviar.
      if (w.etapa === 'encerrado' || w.etapa === 'cancelado') continue
      const assignment = assignmentStore[w.id]
      if (!assignment) continue
      const flow = flows.find(f => f.id === assignment.fluxoId)
      if (!flow) continue
      const schedule = computeScheduleForWedding(assignment, flow)
      for (const msg of schedule) {
        out.push({
          date: msg.date,
          weddingId: w.id,
          weddingName: w.titulo,
          slug: msg.slug,
          categoria: msg.categoria,
          messageIndex: msg.index,
          positionInCategory: positionInCategory(msg.slug, msg.categoria),
        })
      }
    }
    return out
  }, [weddings, assignmentStore, flows])

  // Index por dia para acesso rápido na renderização do grid.
  const byDate = useMemo(() => {
    const map = new Map<string, Dispatch[]>()
    for (const d of allDispatches) {
      const key = dateKey(d.date)
      const list = map.get(key) ?? []
      list.push(d)
      map.set(key, list)
    }
    return map
  }, [allDispatches])

  const gridDays = useMemo(() => buildMonthGrid(viewMonth), [viewMonth])
  const monthLabel = `${MONTH_NAMES[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`

  // Total de casamentos com fluxo configurado.
  const totalConfigurados = useMemo(() => {
    return weddings.filter(
      w => w.etapa !== 'encerrado' && w.etapa !== 'cancelado' && !!assignmentStore[w.id],
    ).length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weddings, assignmentStore])

  const goPrev = () => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  const goNext = () => setViewMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const goToday = () => setViewMonth(startOfMonth(new Date()))

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/convidados')}
            className="mt-1 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 capitalize">{monthLabel}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Calendário de disparos do fluxo de mensagens
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/convidados/fluxo"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
            Configurar Fluxo
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 ml-1 rounded-full text-[10px] font-semibold bg-white/20">
              {totalConfigurados}
            </span>
          </Link>
          <button
            type="button"
            onClick={goToday}
            className="inline-flex items-center h-9 px-3 rounded-md text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            aria-label="Próximo mês"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Header das colunas */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
          {WEEKDAY_LABELS.map(label => (
            <div
              key={label}
              className="px-3 py-2 text-xs font-semibold text-slate-500 text-center uppercase tracking-wide"
            >
              {label}
            </div>
          ))}
        </div>

        {/* 6 semanas */}
        <div className="grid grid-cols-7">
          {gridDays.map((d, i) => {
            const isToday = isSameDay(d, today)
            const inMonth = isSameMonth(d, viewMonth)
            const dispatches = byDate.get(dateKey(d)) ?? []
            return (
              <DayCell
                key={i}
                date={d}
                isToday={isToday}
                inMonth={inMonth}
                dispatches={dispatches}
              />
            )
          })}
        </div>
      </div>

      {isLoading && (
        <p className="text-xs text-slate-400 text-center">Carregando casamentos…</p>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Célula de dia
// ────────────────────────────────────────────────────────────────────────

const MAX_VISIBLE_MESSAGES = 3

interface DayCellProps {
  date: Date
  isToday: boolean
  inMonth: boolean
  dispatches: Dispatch[]
}

function DayCell({ date, isToday, inMonth, dispatches }: DayCellProps) {
  const visible = dispatches.slice(0, MAX_VISIBLE_MESSAGES)
  const hidden = dispatches.length - visible.length

  return (
    <div
      className={cn(
        'min-h-[120px] border-r border-b border-slate-100 last:border-r-0 px-2 py-1.5 flex flex-col gap-1',
        !inMonth && 'bg-slate-50/40',
      )}
    >
      {/* Header da célula: número do dia + total de mensagens */}
      <div className="flex items-center justify-between gap-2">
        {isToday ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold tabular-nums">
            {date.getDate()}
          </span>
        ) : (
          <span
            className={cn(
              'text-xs font-medium tabular-nums',
              inMonth ? 'text-slate-700' : 'text-slate-300',
            )}
          >
            {date.getDate()}
          </span>
        )}
        {dispatches.length > 0 && (
          <span className="text-[10px] text-slate-400 tabular-nums">
            {dispatches.length} msg
          </span>
        )}
      </div>

      {/* Lista de mensagens */}
      <div className="flex flex-col gap-0.5 min-h-0">
        {visible.map(d => {
          const label = formatMessageLabel(d.categoria, d.positionInCategory)
          return (
            <div
              key={`${d.weddingId}-${d.messageIndex}`}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded truncate',
                d.categoria.bgLight,
                d.categoria.text,
              )}
              title={`${d.weddingName} — ${label}`}
            >
              {d.weddingName} - {label}
            </div>
          )
        })}
        {hidden > 0 && (
          <span className="text-[10px] text-slate-500 px-1.5">+{hidden} mais</span>
        )}
      </div>
    </div>
  )
}
