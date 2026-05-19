import { useMemo, useState } from 'react'
import { Heart, ChevronRight, Search, Users, Loader2, FileText } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useWeddingsWithGuestCounts } from '../../../hooks/convidados/useWeddingsWithGuestCounts'
import {
  computeFluxoMessages,
  useFluxoTemplates,
  type FluxoCategoria,
  type FluxoVariation,
} from '../../../hooks/convidados/useFluxoConfig'
import {
  useAllWeddingFluxos,
  type WeddingFluxoAssignment,
} from '../../../hooks/convidados/useWeddingFluxo'
import { useEnvioStatus } from '../../../hooks/convidados/useEnvioStatus'
import { ConfigurarEnvioModal } from './ConfigurarEnvioModal'
import { RelatorioEnvioModal } from './RelatorioEnvioModal'

interface MensagemDoDia {
  weddingId: string
  weddingTitulo: string
  weddingDate: string | null
  categoria: FluxoCategoria
  slug: string
  position: number
  pendentes: number
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function parseDateInput(value: string): Date {
  // Espera 'YYYY-MM-DD' (input nativo do navegador)
  const [y, m, d] = value.split('-').map(n => parseInt(n, 10))
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEKDAY_FULL = [
  'domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado',
]

const MONTHS_FULL = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]

function longDate(d: Date): string {
  return `${WEEKDAY_FULL[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} de ${MONTHS_FULL[d.getMonth()]} de ${d.getFullYear()}`
}

function computeScheduleForWedding(
  assignment: WeddingFluxoAssignment,
  flow: FluxoVariation,
) {
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

export function EnviosDoDiaBoard() {
  const { data: weddings = [], isLoading } = useWeddingsWithGuestCounts()
  const { data: flows = [] } = useFluxoTemplates()
  const { data: assignmentStore = {} } = useAllWeddingFluxos()

  const today = useMemo(() => startOfDay(new Date()), [])
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [search, setSearch] = useState('')
  const [openConfig, setOpenConfig] = useState<{ cardId: string; titulo: string; slug: string } | null>(null)
  const [openRelatorio, setOpenRelatorio] = useState<{ loteId: string; titulo: string; slug: string } | null>(null)

  const mensagens = useMemo<MensagemDoDia[]>(() => {
    const out: MensagemDoDia[] = []
    for (const w of weddings) {
      if (w.etapa === 'encerrado' || w.etapa === 'cancelado') continue
      const assignment = assignmentStore[w.id]
      if (!assignment) continue
      const flow = flows.find(f => f.id === assignment.fluxoId)
      if (!flow) continue
      const schedule = computeScheduleForWedding(assignment, flow)
      for (const msg of schedule) {
        if (isSameDay(msg.date, selectedDate)) {
          // Convidados ativos (que vão receber): total - nao_vai
          const ativos = w.counts.total - w.counts.nao_vai
          out.push({
            weddingId: w.id,
            weddingTitulo: w.titulo,
            weddingDate: w.wedding_date,
            categoria: msg.categoria,
            slug: msg.slug,
            position: positionInCategory(msg.slug, msg.categoria),
            pendentes: ativos,
          })
        }
      }
    }
    return out.sort((a, b) => a.weddingTitulo.localeCompare(b.weddingTitulo, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weddings, assignmentStore, flows, selectedDate])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return mensagens
    return mensagens.filter(
      m =>
        m.weddingTitulo.toLowerCase().includes(term) ||
        m.slug.toLowerCase().includes(term),
    )
  }, [mensagens, search])

  const totalPendentes = filtered.reduce((acc, m) => acc + m.pendentes, 0)
  const isToday = isSameDay(selectedDate, today)

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
        Carregando…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Mensagens do Dia</h2>
          <p className="text-sm text-indigo-600 font-medium mt-0.5">
            {longDate(selectedDate)} {isToday && '(Hoje)'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="date"
            value={toDateInputValue(selectedDate)}
            onChange={e => setSelectedDate(parseDateInput(e.target.value))}
            className="h-10 px-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
          />
          <div className="text-right">
            <div className="text-3xl font-bold text-indigo-600 leading-none tabular-nums">
              {totalPendentes}
            </div>
            <div className="text-xs text-slate-500 mt-1">mensagens pendentes</div>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome do casamento ou código da mensagem..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-700">
            {mensagens.length === 0
              ? 'Nenhuma mensagem programada para esta data.'
              : 'Nenhum resultado para a busca.'}
          </p>
          {mensagens.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">
              Casamentos com fluxo vinculado e mensagem agendada para o dia aparecem aqui.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(m => (
            <MensagemRow
              key={`${m.weddingId}-${m.slug}`}
              mensagem={m}
              onConfigurar={() => setOpenConfig({ cardId: m.weddingId, titulo: m.weddingTitulo, slug: m.slug })}
              onVerRelatorio={loteId => setOpenRelatorio({ loteId, titulo: m.weddingTitulo, slug: m.slug })}
            />
          ))}
        </div>
      )}

      {openConfig && (
        <ConfigurarEnvioModal
          open={!!openConfig}
          onClose={() => setOpenConfig(null)}
          cardId={openConfig.cardId}
          weddingTitulo={openConfig.titulo}
          templateSlug={openConfig.slug}
        />
      )}

      {openRelatorio && (
        <RelatorioEnvioModal
          open={!!openRelatorio}
          onClose={() => setOpenRelatorio(null)}
          loteId={openRelatorio.loteId}
          weddingTitulo={openRelatorio.titulo}
          templateSlug={openRelatorio.slug}
        />
      )}
    </div>
  )
}

interface MensagemRowProps {
  mensagem: MensagemDoDia
  onConfigurar: () => void
  onVerRelatorio: (loteId: string) => void
}

function MensagemRow({ mensagem, onConfigurar, onVerRelatorio }: MensagemRowProps) {
  const cat = mensagem.categoria
  const { data: lote } = useEnvioStatus(mensagem.weddingId, mensagem.slug)
  const enviando = lote?.status === 'enviando'
  const concluido = lote?.status === 'concluido'

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-slate-300 hover:shadow-sm transition-all">
      <Heart className="w-4 h-4 text-rose-500 shrink-0" />
      <div className="font-semibold text-slate-900 min-w-0 truncate flex-1 md:flex-none md:w-48">
        {mensagem.weddingTitulo}
      </div>

      <span
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border shrink-0',
          cat.bgLight,
          cat.text,
          'border-current/20',
        )}
        title={`${cat.label} - posição ${mensagem.position}`}
      >
        {mensagem.slug}
      </span>

      <div className="flex items-center gap-1.5 text-sm shrink-0">
        {enviando ? (
          <>
            <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
            <span className="font-semibold text-indigo-600 tabular-nums">{lote.sent + lote.failed}/{lote.total}</span>
            <span className="text-slate-500">enviando</span>
          </>
        ) : concluido ? (
          <>
            <Users className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-semibold text-emerald-600 tabular-nums">{lote.sent}</span>
            <span className="text-slate-500">enviadas</span>
            {lote.failed > 0 && (
              <span className="ml-1 text-rose-600 tabular-nums">· {lote.failed} falhas</span>
            )}
          </>
        ) : (
          <>
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-amber-600 tabular-nums">{mensagem.pendentes}</span>
            <span className="text-slate-500">{mensagem.pendentes === 1 ? 'pendente' : 'pendentes'}</span>
          </>
        )}
      </div>

      <div className="flex-1" />

      {concluido && lote ? (
        <button
          type="button"
          onClick={() => onVerRelatorio(lote.id)}
          className="inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-slate-200 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors shrink-0"
        >
          <FileText className="w-4 h-4" />
          Ver relatório
        </button>
      ) : enviando ? (
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 h-9 px-3 bg-indigo-100 text-indigo-500 rounded-md text-sm font-medium cursor-not-allowed shrink-0"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          Enviando…
        </button>
      ) : (
        <button
          type="button"
          onClick={onConfigurar}
          className="inline-flex items-center gap-1.5 h-9 px-3 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors shrink-0"
        >
          Configurar Envio
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
