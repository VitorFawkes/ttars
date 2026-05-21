import { useMemo, useState } from 'react'
import { Heart, ChevronRight, ChevronDown, Search, Users, Loader2, FileText, Clock, Layers } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useWeddingsWithGuestCounts } from '../../../hooks/convidados/useWeddingsWithGuestCounts'
import {
  computeFluxoMessages,
  FLUXO_CATEGORIAS,
  useFluxoTemplates,
  type FluxoCategoria,
  type FluxoVariation,
} from '../../../hooks/convidados/useFluxoConfig'
import {
  useAllWeddingFluxos,
  type WeddingFluxoAssignment,
} from '../../../hooks/convidados/useWeddingFluxo'
import { useEnviosLotesDoDia, type EnvioLoteHistorico } from '../../../hooks/convidados/useEnviosLotesDoDia'
import { ConfigurarEnvioModal } from './ConfigurarEnvioModal'
import { RelatorioEnvioModal } from './RelatorioEnvioModal'

interface MensagemProgramada {
  weddingId: string
  weddingTitulo: string
  categoria: FluxoCategoria
  slug: string
  position: number
  pendentes: number
}

interface LinhaHistorico {
  kind: 'lote'
  // Lote mais recente do grupo (representa a "linha pai")
  lote: EnvioLoteHistorico
  // Lotes do mesmo (card, slug) ordenados do mais recente pro mais antigo
  // (length >= 1 — sempre tem ao menos o representante)
  grupo: EnvioLoteHistorico[]
  weddingTitulo: string
  categoria: FluxoCategoria | null
  position: number
  // Acumulado de envios bem-sucedidos de TODOS os lotes do grupo
  totalSent: number
  // Total de convidados da campanha (= total do primeiro lote, ou último — equivalentes)
  totalConvidados: number
}

interface LinhaProgramada {
  kind: 'programado'
  mensagem: MensagemProgramada
}

type LinhaBoard = LinhaHistorico | LinhaProgramada

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function parseDateInput(value: string): Date {
  const [y, m, d] = value.split('-').map(n => parseInt(n, 10))
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}
function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEKDAY_FULL = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']
const MONTHS_FULL = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

function longDate(d: Date): string {
  return `${WEEKDAY_FULL[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} de ${MONTHS_FULL[d.getMonth()]} de ${d.getFullYear()}`
}

function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function computeScheduleForWedding(assignment: WeddingFluxoAssignment, flow: FluxoVariation) {
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

/** Extrai categoria do slug pra colorir o chip (usado em lotes sem associação de fluxo). */
function categoriaForSlug(slug: string): { cat: FluxoCategoria; position: number } | null {
  for (const cat of FLUXO_CATEGORIAS) {
    if (slug.startsWith(cat.slug)) {
      const tail = slug.replace(cat.slug, '')
      const n = parseInt(tail, 10)
      return { cat, position: Number.isNaN(n) ? 0 : n }
    }
  }
  return null
}

export function EnviosDoDiaBoard() {
  const { data: weddings = [], isLoading: weddingsLoading } = useWeddingsWithGuestCounts()
  const { data: flows = [] } = useFluxoTemplates()
  const { data: assignmentStore = {} } = useAllWeddingFluxos()

  const today = useMemo(() => startOfDay(new Date()), [])
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const { data: lotes = [], isLoading: lotesLoading } = useEnviosLotesDoDia(selectedDate)

  const [search, setSearch] = useState('')
  const [openConfig, setOpenConfig] = useState<{ cardId: string; titulo: string; slug: string } | null>(null)
  const [openRelatorio, setOpenRelatorio] = useState<{ loteId: string; titulo: string; slug: string } | null>(null)

  const weddingTituloById = useMemo(() => {
    const map = new Map<string, string>()
    for (const w of weddings) map.set(w.id, w.titulo)
    return map
  }, [weddings])

  // Mensagens programadas pra o dia (a partir do fluxo).
  // Elegíveis a receber = sem_reacao + intencao (não envia pra confirmado nem nao_vai).
  const programadas = useMemo<MensagemProgramada[]>(() => {
    const out: MensagemProgramada[] = []
    for (const w of weddings) {
      if (w.etapa === 'encerrado' || w.etapa === 'cancelado') continue
      const assignment = assignmentStore[w.id]
      if (!assignment) continue
      const flow = flows.find(f => f.id === assignment.fluxoId)
      if (!flow) continue
      const schedule = computeScheduleForWedding(assignment, flow)
      for (const msg of schedule) {
        if (isSameDay(msg.date, selectedDate)) {
          const elegiveis = w.counts.sem_reacao + w.counts.intencao
          out.push({
            weddingId: w.id,
            weddingTitulo: w.titulo,
            categoria: msg.categoria,
            slug: msg.slug,
            position: positionInCategory(msg.slug, msg.categoria),
            pendentes: elegiveis,
          })
        }
      }
    }
    return out
  }, [weddings, assignmentStore, flows, selectedDate])

  // Agrupa lotes por (card_id, slug). Lotes do hook já estão ordenados DESC por started_at.
  const gruposPorCardSlug = useMemo(() => {
    const map = new Map<string, EnvioLoteHistorico[]>()
    for (const l of lotes) {
      const key = `${l.card_id}|${l.template_slug}`
      const arr = map.get(key) ?? []
      arr.push(l)
      map.set(key, arr)
    }
    return map
  }, [lotes])

  // Constrói lista final
  const linhas = useMemo<LinhaBoard[]>(() => {
    const out: LinhaBoard[] = []
    // Cada grupo (cardId, slug) vira 1 linha de histórico
    for (const grupo of gruposPorCardSlug.values()) {
      const ultimo = grupo[0]
      const sl = categoriaForSlug(ultimo.template_slug)
      const totalSent = grupo.reduce((acc, l) => acc + l.sent, 0)
      const totalConvidados = ultimo.total  // mesmo conjunto de elegíveis (reenvios usam mesma base)
      out.push({
        kind: 'lote',
        lote: ultimo,
        grupo,
        weddingTitulo: weddingTituloById.get(ultimo.card_id) ?? '(casamento removido)',
        categoria: sl?.cat ?? null,
        position: sl?.position ?? 0,
        totalSent,
        totalConvidados,
      })
    }
    // Ordena grupos pelo lote mais recente
    out.sort((a, b) => {
      if (a.kind !== 'lote' || b.kind !== 'lote') return 0
      return b.lote.started_at.localeCompare(a.lote.started_at)
    })

    // Programadas sem lote (alfabético)
    const cardSlugComLote = new Set<string>()
    for (const l of lotes) cardSlugComLote.add(`${l.card_id}|${l.template_slug}`)
    const semLote = programadas
      .filter(p => !cardSlugComLote.has(`${p.weddingId}|${p.slug}`))
      .sort((a, b) => a.weddingTitulo.localeCompare(b.weddingTitulo, 'pt-BR'))
    for (const m of semLote) out.push({ kind: 'programado', mensagem: m })
    return out
  }, [lotes, programadas, gruposPorCardSlug, weddingTituloById])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return linhas
    return linhas.filter(linha => {
      if (linha.kind === 'lote') {
        return linha.weddingTitulo.toLowerCase().includes(term) || linha.lote.template_slug.toLowerCase().includes(term)
      }
      return linha.mensagem.weddingTitulo.toLowerCase().includes(term) || linha.mensagem.slug.toLowerCase().includes(term)
    })
  }, [linhas, search])

  const totalPendentes = useMemo(
    () => linhas.reduce((acc, l) => acc + (l.kind === 'programado' ? l.mensagem.pendentes : 0), 0),
    [linhas],
  )
  const totalEnviadas = useMemo(
    () => lotes.reduce((acc, l) => acc + l.sent, 0),
    [lotes],
  )
  const isToday = isSameDay(selectedDate, today)
  const loading = weddingsLoading || lotesLoading

  if (loading) {
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
            <div className="text-3xl font-bold text-indigo-600 leading-none tabular-nums">{totalPendentes}</div>
            <div className="text-xs text-slate-500 mt-1">a enviar</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-emerald-600 leading-none tabular-nums">{totalEnviadas}</div>
            <div className="text-xs text-slate-500 mt-1">enviadas hoje</div>
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
            {linhas.length === 0
              ? 'Nenhum envio ou mensagem programada para esta data.'
              : 'Nenhum resultado para a busca.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(linha => {
            if (linha.kind === 'lote') {
              return (
                <LinhaLoteRow
                  key={`lote-${linha.lote.card_id}-${linha.lote.template_slug}`}
                  linha={linha}
                  onVerRelatorio={loteId => setOpenRelatorio({
                    loteId,
                    titulo: linha.weddingTitulo,
                    slug: linha.lote.template_slug,
                  })}
                />
              )
            }
            return (
              <LinhaProgramadaRow
                key={`prog-${linha.mensagem.weddingId}-${linha.mensagem.slug}`}
                mensagem={linha.mensagem}
                onConfigurar={() => setOpenConfig({
                  cardId: linha.mensagem.weddingId,
                  titulo: linha.mensagem.weddingTitulo,
                  slug: linha.mensagem.slug,
                })}
              />
            )
          })}
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

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

function SlugChip({ categoria, slug }: { categoria: FluxoCategoria | null; slug: string }) {
  if (!categoria) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-slate-200 bg-slate-50 text-slate-600 shrink-0">
        {slug}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border shrink-0',
        categoria.bgLight,
        categoria.text,
        'border-current/20',
      )}
      title={categoria.label}
    >
      {slug}
    </span>
  )
}

function LinhaLoteRow({
  linha,
  onVerRelatorio,
}: {
  linha: LinhaHistorico
  onVerRelatorio: (loteId: string) => void
}) {
  const { lote, grupo, weddingTitulo, categoria, totalSent, totalConvidados } = linha
  const [expanded, setExpanded] = useState(false)
  const enviando = grupo.some(g => g.status === 'enviando')
  const ultimoFailed = lote.failed
  const temMaisDeUm = grupo.length > 1

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header da linha */}
      <div className="px-4 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
        {temMaisDeUm ? (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-slate-400 hover:text-slate-700 shrink-0"
            aria-label={expanded ? 'Recolher' : 'Expandir'}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        <Heart className="w-4 h-4 text-rose-500 shrink-0" />
        <div className="font-semibold text-slate-900 min-w-0 truncate flex-1 md:flex-none md:w-48">
          {weddingTitulo}
        </div>

        <SlugChip categoria={categoria} slug={lote.template_slug} />

        <div className="flex items-center gap-1.5 text-sm shrink-0">
          {enviando ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
              <span className="font-semibold text-indigo-600 tabular-nums">{lote.sent + lote.failed}/{lote.total}</span>
              <span className="text-slate-500">enviando</span>
            </>
          ) : (
            <>
              <Users className="w-3.5 h-3.5 text-emerald-500" />
              <span className="font-semibold text-emerald-600 tabular-nums">{totalSent}/{totalConvidados}</span>
              <span className="text-slate-500">enviadas</span>
              {ultimoFailed > 0 && (
                <span className="ml-1 text-rose-600 tabular-nums">· {ultimoFailed} falhas</span>
              )}
            </>
          )}
        </div>

        {temMaisDeUm && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0" title={`${grupo.length} lotes`}>
            <Layers className="w-3 h-3" />
            {grupo.length}
          </span>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-1 text-xs text-slate-400 tabular-nums shrink-0" title={lote.started_at}>
          <Clock className="w-3 h-3" />
          {hhmm(lote.started_at)}
        </div>

        {enviando ? (
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
            onClick={() => onVerRelatorio(lote.id)}
            className="inline-flex items-center gap-1.5 h-9 px-3 bg-white border border-slate-200 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors shrink-0"
          >
            <FileText className="w-4 h-4" />
            Ver relatório
          </button>
        )}
      </div>

      {/* Sub-linhas (cada lote individual) */}
      {expanded && temMaisDeUm && (
        <div className="border-t border-slate-100 bg-slate-50/30 divide-y divide-slate-100">
          {grupo.map((l, idx) => {
            const isOriginal = idx === grupo.length - 1
            const subEnviando = l.status === 'enviando'
            return (
              <div key={l.id} className="px-4 py-2 flex items-center gap-4 text-sm">
                <div className="w-4 shrink-0" />
                <div className="w-4 shrink-0" />
                <div className="text-xs font-medium text-slate-500 w-20 shrink-0">
                  {isOriginal ? 'Original' : `Reenvio ${grupo.length - idx - 1}`}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {subEnviando ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                      <span className="text-indigo-600 tabular-nums">{l.sent + l.failed}/{l.total}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-emerald-600 tabular-nums font-medium">{l.sent}</span>
                      <span className="text-slate-500">enviadas</span>
                      {l.failed > 0 && (
                        <span className="text-rose-600 tabular-nums ml-1">· {l.failed} falhas</span>
                      )}
                    </>
                  )}
                </div>

                <div className="flex-1" />

                <div className="flex items-center gap-1 text-xs text-slate-400 tabular-nums shrink-0">
                  <Clock className="w-3 h-3" />
                  {hhmm(l.started_at)}
                </div>

                <button
                  type="button"
                  onClick={() => onVerRelatorio(l.id)}
                  className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-100 shrink-0"
                >
                  <FileText className="w-3 h-3" />
                  Relatório
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LinhaProgramadaRow({ mensagem, onConfigurar }: { mensagem: MensagemProgramada; onConfigurar: () => void }) {
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center gap-4 hover:border-slate-300 hover:shadow-sm transition-all">
      <Heart className="w-4 h-4 text-rose-500 shrink-0" />
      <div className="font-semibold text-slate-900 min-w-0 truncate flex-1 md:flex-none md:w-48">
        {mensagem.weddingTitulo}
      </div>

      <SlugChip categoria={mensagem.categoria} slug={mensagem.slug} />

      <div className="flex items-center gap-1.5 text-sm shrink-0">
        <Users className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-semibold text-amber-600 tabular-nums">{mensagem.pendentes}</span>
        <span className="text-slate-500">{mensagem.pendentes === 1 ? 'pendente' : 'pendentes'}</span>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onConfigurar}
        className="inline-flex items-center gap-1.5 h-9 px-3 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors shrink-0"
      >
        Configurar Envio
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
