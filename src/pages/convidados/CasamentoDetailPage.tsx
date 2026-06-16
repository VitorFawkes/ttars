import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Heart,
  Calendar,
  MapPin,
  Globe,
  ExternalLink,
  Pencil,
  Trash2,
  BellOff,
  Settings,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Save,
  Search,
  Check,
  X,
  Loader2,
  Plus,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useWedding } from '../../hooks/convidados/useWedding'
import { useGuests } from '../../hooks/convidados/useGuests'
import { useUpdateWeddingEtapa } from '../../hooks/convidados/useUpdateWeddingEtapa'
import { ETAPA_LABEL, type EtapaConvidados } from '../../hooks/convidados/types'
import {
  useFluxoConfig,
  computeFluxoMessages,
  type FluxoVariation,
} from '../../hooks/convidados/useFluxoConfig'
import { useWeddingFluxo, type WeddingFluxoAssignment } from '../../hooks/convidados/useWeddingFluxo'
import { WeddingHotelCard } from '../../components/convidados/WeddingHotelCard'
import { NovoGuestModal } from '../../components/convidados/NovoGuestModal'
import { EditarCasamentoModal } from '../../components/convidados/EditarCasamentoModal'
import { GuestKanbanBoard } from '../../components/convidados/guests/GuestKanbanBoard'
import { Button } from '../../components/ui/Button'
import { BaixarPdfButton } from '../../components/convidados/pdf/BaixarPdfButton'
import { LinkCasalSection } from '../../components/convidados/casais/LinkCasalSection'

const MONTH_FULL = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro',
]

function longDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getDate()).padStart(2, '0')} de ${MONTH_FULL[d.getMonth()]} de ${d.getFullYear()}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function CasamentoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cardId = id ?? null

  const { data: wedding, isLoading: loadingWedding, isError: errorWedding } = useWedding(cardId)
  const { data: guests = [], isLoading: loadingGuests } = useGuests(cardId)
  const updateEtapa = useUpdateWeddingEtapa()
  const fluxo = useWeddingFluxo(cardId)

  const [showAdd, setShowAdd] = useState(false)
  const [showEditar, setShowEditar] = useState(false)
  const [search, setSearch] = useState('')
  const [confirmEncerrar, setConfirmEncerrar] = useState(false)
  const [confirmCancelar, setConfirmCancelar] = useState(false)

  if (loadingWedding) {
    return (
      <div className="px-6 py-8 flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando casamento…
      </div>
    )
  }

  if (errorWedding || !wedding) {
    return (
      <div className="px-6 py-8">
        <button onClick={() => navigate('/convidados')} className="text-sm text-indigo-600 hover:underline mb-4">
          ← Voltar
        </button>
        <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
          Não consegui carregar este casamento.
        </div>
      </div>
    )
  }

  const dateLong = longDate(wedding.wedding_date)
  const days = daysUntil(wedding.wedding_date)

  const handleEncerrar = async () => {
    if (!cardId) return
    setConfirmEncerrar(false)
    await updateEtapa.mutateAsync({ cardId, etapa: 'encerrado' })
    fluxo.clear() // desconfigura o fluxo deste casamento
  }

  const handleCancelar = async () => {
    if (!cardId) return
    setConfirmCancelar(false)
    await updateEtapa.mutateAsync({ cardId, etapa: 'cancelado' })
    fluxo.clear() // desconfigura o fluxo deste casamento
    navigate('/convidados')
  }

  const isEncerrado = wedding.etapa === 'encerrado'
  const isCancelado = wedding.etapa === 'cancelado'

  /** Configurar (ou reconfigurar) um fluxo "reativa" o casamento: se ele
   *  estava em encerrado/cancelado (estado manual), o rawEtapa volta pra
   *  'padrao' no banco — assim a etapa exibida volta a derivar do fluxo
   *  (promo/padrao) em vez de ficar travada no estado terminal. */
  const handleFluxoSave = async (next: WeddingFluxoAssignment) => {
    if (!cardId) return
    fluxo.save(next)
    if (isEncerrado || isCancelado) {
      await updateEtapa.mutateAsync({ cardId, etapa: 'padrao' })
    }
  }

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/convidados')}
            className="mt-1 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Heart className="w-7 h-7 text-rose-500 fill-rose-500 shrink-0" />
              <h1 className="text-2xl font-bold text-slate-900 break-words">{wedding.titulo}</h1>
              <EtapaChipHeader etapa={wedding.etapa} />
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-slate-600">
              {dateLong && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {dateLong}
                </span>
              )}
              {wedding.local && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {wedding.local}
                </span>
              )}
              {days !== null && (
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                    days < 0
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-sky-50 text-sky-700 border-sky-200',
                  )}
                >
                  {days < 0 ? 'Passado' : days === 0 ? 'Hoje' : `Faltam ${days} ${days === 1 ? 'dia' : 'dias'}`}
                </span>
              )}
            </div>
            {wedding.site_url && (
              <a
                href={wedding.site_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline mt-1"
              >
                <Globe className="w-3.5 h-3.5" /> Site do Casamento
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cardId && <BaixarPdfButton cardId={cardId} />}
          <a
            href={`/cards/${wedding.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir card em nova aba"
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md px-3 text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Acessar card
          </a>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowEditar(true)}
          >
            <Pencil className="w-4 h-4" /> Editar
          </Button>

          {/* Encerrar — comunicação cessa, mas o casamento ainda acontece */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmEncerrar(c => !c)}
              disabled={updateEtapa.isPending || isEncerrado}
              title={isEncerrado ? 'Já está encerrado' : 'Encerrar comunicação com convidados'}
            >
              <BellOff className="w-4 h-4" /> Encerrar
            </Button>
            {confirmEncerrar && (
              <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-white border border-slate-200 shadow-lg rounded-lg p-3">
                <p className="text-xs text-slate-700 mb-2">
                  Mover este casamento para etapa <strong>Encerrado</strong>? A comunicação com os convidados será cessada — o casamento continua acontecendo, mas nenhuma mensagem nova é enviada.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmEncerrar(false)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 rounded-md"
                  >
                    <X className="w-3 h-3" /> Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleEncerrar}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-slate-700 hover:bg-slate-800 rounded-md"
                  >
                    <Check className="w-3 h-3" /> Encerrar comunicação
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Cancelar — o casamento em si foi cancelado */}
          <div className="relative">
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmCancelar(c => !c)}
              disabled={updateEtapa.isPending || isCancelado}
              title={isCancelado ? 'Já está cancelado' : 'Marcar casamento como cancelado'}
            >
              <Trash2 className="w-4 h-4" /> Cancelar
            </Button>
            {confirmCancelar && (
              <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-white border border-slate-200 shadow-lg rounded-lg p-3">
                <p className="text-xs text-slate-700 mb-2">
                  Marcar este casamento como <strong>Cancelado</strong>? Isso indica que o casamento em si não vai mais acontecer (não é só pausar a comunicação).
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmCancelar(false)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 rounded-md"
                  >
                    <X className="w-3 h-3" /> Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelar}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md"
                  >
                    <Check className="w-3 h-3" /> Confirmar cancelamento
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Link do casal (lista pública) */}
      {cardId && <LinkCasalSection cardId={cardId} cardTitulo={wedding.titulo} />}

      {/* Hotel — ficha real (fonte única, compartilhada com Planejamento) */}
      {cardId && <WeddingHotelCard cardId={cardId} local={wedding.local} />}

      {/* Configuração do Fluxo */}
      <FluxoSection
        assignment={fluxo.assignment}
        onSave={handleFluxoSave}
        onClear={fluxo.clear}
      />

      {/* Busca + Novo convidado */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 bg-white"
          />
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Novo convidado
        </Button>
      </div>

      {/* Kanban — altura próxima da viewport; a página pode rolar um pouco
          pra mostrar o que ficou abaixo da dobra. */}
      {loadingGuests ? (
        <div className="p-6 text-center text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando convidados…
        </div>
      ) : (
        <div className="h-[80vh] min-h-[480px]">
          <GuestKanbanBoard guests={guests} search={search} />
        </div>
      )}

      {showAdd && (
        <NovoGuestModal
          isOpen={showAdd}
          onClose={() => setShowAdd(false)}
          defaultCardId={cardId ?? undefined}
          lockedCard
        />
      )}

      {showEditar && cardId && (
        <EditarCasamentoModal
          open={showEditar}
          onClose={() => setShowEditar(false)}
          cardId={cardId}
        />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Fluxo — vincula uma variação de fluxo + posição inicial + data ao casamento
// ──────────────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface FluxoSectionProps {
  assignment: WeddingFluxoAssignment | null
  onSave: (next: WeddingFluxoAssignment) => void
  onClear: () => void
}

function FluxoSection({ assignment, onSave, onClear }: FluxoSectionProps) {
  const { flows } = useFluxoConfig()
  // Atalhos para o restante do código continuar idêntico.
  const save = onSave
  const clear = onClear

  const [editing, setEditing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [draft, setDraft] = useState<WeddingFluxoAssignment>(() => ({
    fluxoId: assignment?.fluxoId ?? flows[0]?.id ?? '',
    startIndex: assignment?.startIndex ?? 1,
    startDate: assignment?.startDate ?? todayISO(),
  }))

  // Quando o assignment muda externamente (e não estamos editando), ressincroniza.
  useMemo(() => {
    if (editing) return
    setDraft({
      fluxoId: assignment?.fluxoId ?? flows[0]?.id ?? '',
      startIndex: assignment?.startIndex ?? 1,
      startDate: assignment?.startDate ?? todayISO(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.fluxoId, assignment?.startIndex, assignment?.startDate, editing, flows.length])

  const selectedFlow: FluxoVariation | undefined = flows.find(f => f.id === draft.fluxoId) ?? flows[0]
  const startDateObj = useMemo(() => {
    const d = new Date(draft.startDate + 'T00:00:00')
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [draft.startDate])

  // Posições possíveis baseadas no fluxo escolhido.
  const allPositions = useMemo(() => {
    if (!selectedFlow) return []
    // Computa as 35 mensagens a partir de uma data dummy só para extrair os slugs.
    return computeFluxoMessages(selectedFlow.intervals, new Date(2000, 0, 1)).map(m => ({
      index: m.index,
      slug: m.slug,
      categoriaLabel: m.categoria.label,
    }))
  }, [selectedFlow])

  // Cronograma real do casamento: a mensagem #startIndex sai em startDate;
  // as seguintes seguem os intervalos do fluxo. Mensagens anteriores ao
  // startIndex são pulada.
  const schedule = useMemo(() => {
    if (!selectedFlow) return []
    const full = computeFluxoMessages(selectedFlow.intervals, new Date(2000, 0, 1))
    const startEntry = full.find(m => m.index === draft.startIndex)
    if (!startEntry) return []
    const offsetMs = startDateObj.getTime() - startEntry.date.getTime()
    return full
      .filter(m => m.index >= draft.startIndex)
      .map(m => ({
        ...m,
        date: new Date(m.date.getTime() + offsetMs),
      }))
  }, [selectedFlow, draft.startIndex, startDateObj])

  if (flows.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <header className="flex items-center gap-2 mb-3">
          <Settings className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Configuração do Fluxo</h2>
        </header>
        <p className="text-sm text-slate-500">
          Nenhum fluxo cadastrado ainda.{' '}
          <Link to="/convidados/fluxo" className="text-indigo-600 hover:underline">Criar agora</Link>.
        </p>
      </section>
    )
  }

  const isConfigured = !!assignment
  const showEditor = editing || !isConfigured

  const handleSave = () => {
    if (!draft.fluxoId) return
    save(draft)
    setEditing(false)
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4">
      <header className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Configuração do Fluxo</h2>
          {isConfigured ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
              <CheckCircle2 className="w-3 h-3" /> Configurado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 uppercase">
              <AlertCircle className="w-3 h-3" /> Pendente
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            to="/convidados/fluxo"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md"
            title="Gerenciar variações de fluxo"
          >
            <Settings className="w-3.5 h-3.5" /> Gerenciar fluxos
          </Link>
          {isConfigured && !editing && (
            <>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Ver Preview
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
              <button
                type="button"
                onClick={() => clear()}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md"
              >
                <X className="w-3.5 h-3.5" /> Desvincular
              </button>
            </>
          )}
        </div>
      </header>

      {showEditor ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="text-xs font-medium text-slate-700">Fluxo</label>
            <select
              value={draft.fluxoId}
              onChange={(e) => setDraft(d => ({ ...d, fluxoId: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            >
              {flows.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-medium text-slate-700">Posição Inicial no Fluxo</label>
            <select
              value={draft.startIndex}
              onChange={(e) => setDraft(d => ({ ...d, startIndex: parseInt(e.target.value, 10) || 1 }))}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            >
              {allPositions.map(p => (
                <option key={p.index} value={p.index}>
                  #{String(p.index).padStart(2, '0')} — {p.slug} ({p.categoriaLabel})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-xs font-medium text-slate-700">Data de Início</label>
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft(d => ({ ...d, startDate: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>
          <div className="md:col-span-3 flex items-center gap-2 flex-wrap">
            <Button onClick={handleSave} className="gap-1.5">
              <Save className="w-4 h-4" /> Salvar configuração
            </Button>
            <Button
              onClick={() => setShowPreview(true)}
              variant="outline"
              className="gap-1.5"
              disabled={schedule.length === 0}
            >
              <MessageSquare className="w-4 h-4" /> Ver Preview
            </Button>
            {isConfigured && (
              <Button onClick={() => setEditing(false)} variant="outline">
                Cancelar
              </Button>
            )}
            <p className="text-[11px] text-slate-400 ml-2">
              A primeira mensagem ({allPositions.find(p => p.index === draft.startIndex)?.slug}) sai em{' '}
              {draft.startDate.split('-').reverse().join('/')}.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Fluxo</p>
            <p className="font-medium text-slate-900 mt-0.5">{selectedFlow?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Início</p>
            <p className="font-medium text-slate-900 mt-0.5">
              #{String(draft.startIndex).padStart(2, '0')} — {allPositions.find(p => p.index === draft.startIndex)?.slug}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Primeira saída</p>
            <p className="font-medium text-slate-900 mt-0.5 tabular-nums">
              {draft.startDate.split('-').reverse().join('/')}
            </p>
          </div>
        </div>
      )}

      {isConfigured && !editing && schedule.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs text-indigo-600 hover:text-indigo-700 select-none">
            Ver cronograma ({schedule.length} mensagens)
          </summary>
          <ol className="mt-3 flex flex-col gap-1 max-h-72 overflow-y-auto pr-2">
            {schedule.map(m => (
              <li
                key={m.slug}
                className="flex items-center justify-between gap-3 px-3 py-1.5 rounded text-xs bg-slate-50"
              >
                <span className="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums">
                  #{String(m.index).padStart(2, '0')}
                </span>
                <span className="font-semibold text-slate-700 flex-1 truncate">{m.slug}</span>
                <span className="text-slate-500 tabular-nums shrink-0">
                  {String(m.date.getDate()).padStart(2, '0')}/{String(m.date.getMonth() + 1).padStart(2, '0')}/{m.date.getFullYear()}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {showPreview && (
        <FluxoPreviewModal
          schedule={schedule}
          fluxoName={selectedFlow?.name ?? ''}
          onClose={() => setShowPreview(false)}
        />
      )}
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Preview modal — lista cada disparo com dia da semana + data
// ──────────────────────────────────────────────────────────────────────────

const WEEKDAYS_FULL = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
]

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatDateWithWeekday(d: Date): { weekday: string; weekdayShort: string; date: string } {
  return {
    weekday: WEEKDAYS_FULL[d.getDay()],
    weekdayShort: WEEKDAYS_SHORT[d.getDay()],
    date: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
  }
}

interface FluxoPreviewModalProps {
  schedule: Array<{
    index: number
    slug: string
    categoria: { label: string; bgLight: string; text: string; dot: string }
    date: Date
  }>
  fluxoName: string
  onClose: () => void
}

function FluxoPreviewModal({ schedule, fluxoName, onClose }: FluxoPreviewModalProps) {
  const first = schedule[0]
  const last = schedule[schedule.length - 1]
  const firstFmt = first ? formatDateWithWeekday(first.date) : null
  const lastFmt = last ? formatDateWithWeekday(last.date) : null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={e => {
        // Fecha ao clicar no backdrop (fora do modal).
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl bg-white border border-slate-200 shadow-lg rounded-xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Preview do fluxo</h2>
            <p className="text-xs text-slate-500">
              {fluxoName} · {schedule.length} {schedule.length === 1 ? 'mensagem' : 'mensagens'}
              {firstFmt && lastFmt && (
                <> · de {firstFmt.date} a {lastFmt.date}</>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {schedule.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Nenhuma mensagem nesse cronograma. Verifique a configuração.
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {schedule.map(msg => {
                const fmt = formatDateWithWeekday(msg.date)
                return (
                  <li
                    key={msg.slug}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md border border-slate-100',
                      msg.categoria.bgLight,
                    )}
                  >
                    <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums w-8">
                      #{String(msg.index).padStart(2, '0')}
                    </span>
                    <span className={cn('text-sm font-semibold w-28 shrink-0 truncate', msg.categoria.text)}>
                      {msg.slug}
                    </span>
                    <span className="text-xs text-slate-500 flex-1 truncate hidden sm:inline">
                      {msg.categoria.label}
                    </span>
                    <span className={cn('text-xs font-medium shrink-0 hidden md:inline', msg.categoria.text)}>
                      {fmt.weekday}
                    </span>
                    <span className={cn('text-xs font-medium shrink-0 inline md:hidden', msg.categoria.text)}>
                      {fmt.weekdayShort}
                    </span>
                    <span className={cn('text-xs tabular-nums shrink-0 w-24 text-right', msg.categoria.text)}>
                      {fmt.date}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <Button onClick={onClose} variant="outline" size="sm">Fechar</Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Chip da etapa atual no header do detalhe (visual feedback imediato)
// ──────────────────────────────────────────────────────────────────────────

const ETAPA_CHIP_STYLE: Record<EtapaConvidados, string> = {
  promo: 'bg-amber-50 text-amber-700 border-amber-200',
  padrao: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  encerrado: 'bg-slate-100 text-slate-600 border-slate-200',
  cancelado: 'bg-rose-50 text-rose-700 border-rose-200',
}

function EtapaChipHeader({ etapa }: { etapa: EtapaConvidados }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border uppercase tracking-wide',
        ETAPA_CHIP_STYLE[etapa],
      )}
      title={`Etapa: ${ETAPA_LABEL[etapa]}`}
    >
      {ETAPA_LABEL[etapa]}
    </span>
  )
}
