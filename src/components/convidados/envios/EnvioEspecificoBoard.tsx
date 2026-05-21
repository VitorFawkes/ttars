import { useCallback, useMemo, useState } from 'react'
import {
  Send, AlertTriangle, Loader2, Users, Phone, PhoneOff,
  CheckCircle2, FileText, ArrowRight, Search,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useWeddings } from '../../../hooks/convidados/useWeddings'
import { useGuests } from '../../../hooks/convidados/useGuests'
import { useWeddingLotes } from '../../../hooks/convidados/useWeddingLotes'
import { useWhatsAppLinhas } from '../../../hooks/useWhatsAppLinhas'
import { useWhatsAppTemplates, parseTemplateBody } from '../../../hooks/useWhatsAppTemplates'
import { STATUS_RSVP_LABEL, STATUS_RSVP_LIST, type Guest, type StatusRSVP } from '../../../hooks/convidados/types'
import { ConfigurarEnvioModal } from './ConfigurarEnvioModal'
import { RelatorioEnvioModal } from './RelatorioEnvioModal'
import { WeddingPicker } from './WeddingPicker'

const STATUS_TONE: Record<StatusRSVP, {
  card: string
  badge: string
  text: string
  accent: string
}> = {
  confirmado: {
    card: 'border-emerald-200 bg-emerald-50/40',
    badge: 'bg-emerald-600 text-white',
    text: 'text-emerald-700',
    accent: 'bg-emerald-500',
  },
  intencao: {
    card: 'border-sky-200 bg-sky-50/40',
    badge: 'bg-sky-600 text-white',
    text: 'text-sky-700',
    accent: 'bg-sky-500',
  },
  sem_reacao: {
    card: 'border-slate-200 bg-slate-50/40',
    badge: 'bg-slate-700 text-white',
    text: 'text-slate-700',
    accent: 'bg-slate-500',
  },
  nao_vai: {
    card: 'border-rose-200 bg-rose-50/40',
    badge: 'bg-rose-600 text-white',
    text: 'text-rose-700',
    accent: 'bg-rose-500',
  },
}

// Altura fixa da lista de convidados dentro de cada coluna de status.
// Conteúdo excedente fica em scroll interno em vez de expandir a página.
const LIST_MAX_HEIGHT = 'max-h-72'

export function EnvioEspecificoBoard() {
  const { data: weddings = [], isLoading: weddingsLoading } = useWeddings()
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set())
  const [templateSlug, setTemplateSlug] = useState<string>('')
  const [openConfig, setOpenConfig] = useState(false)
  const [reportLoteId, setReportLoteId] = useState<string | null>(null)

  // Troca de casamento limpa seleção e template — feito no handler em vez
  // de useEffect pra evitar cascading renders.
  const handleWeddingChange = useCallback((id: string | null) => {
    setSelectedCardId(id)
    setSelectedGuestIds(new Set())
    setTemplateSlug('')
  }, [])

  const selectedWedding = useMemo(
    () => weddings.find(w => w.id === selectedCardId) ?? null,
    [weddings, selectedCardId],
  )

  return (
    <div className="flex flex-col gap-4">
      <HeaderSection />

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Casamento</label>
        <WeddingPickerInline
          weddings={weddings}
          loading={weddingsLoading}
          selected={selectedCardId}
          onChange={handleWeddingChange}
        />
      </div>

      {selectedCardId && (
        <SelecaoConvidados
          cardId={selectedCardId}
          selectedGuestIds={selectedGuestIds}
          onSelectionChange={setSelectedGuestIds}
        />
      )}

      {selectedCardId && (
        <TemplatePicker templateSlug={templateSlug} onTemplateChange={setTemplateSlug} />
      )}

      {selectedCardId && (
        <ResumoSticky
          selectedGuestIds={selectedGuestIds}
          cardId={selectedCardId}
          templateSlug={templateSlug}
          onSubmit={() => setOpenConfig(true)}
        />
      )}

      {selectedCardId && (
        <HistoricoCasamento
          cardId={selectedCardId}
          onOpenReport={(loteId) => setReportLoteId(loteId)}
        />
      )}

      {openConfig && selectedCardId && selectedWedding && templateSlug && (
        <ConfigurarEnvioModal
          open={openConfig}
          onClose={() => setOpenConfig(false)}
          cardId={selectedCardId}
          weddingTitulo={selectedWedding.titulo}
          templateSlug={templateSlug}
          targetGuestIds={Array.from(selectedGuestIds)}
        />
      )}

      {reportLoteId && selectedWedding && (
        <RelatorioEnvioModal
          open={!!reportLoteId}
          onClose={() => setReportLoteId(null)}
          loteId={reportLoteId}
          weddingTitulo={selectedWedding.titulo}
          templateSlug={''}
        />
      )}
    </div>
  )
}

function HeaderSection() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Envio específico</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Dispara um template do WhatsApp para um casamento específico, escolhendo manualmente os convidados.
      </p>
    </div>
  )
}

// ─── Picker inline (full-width) ──────────────────────────────────────────

interface WeddingPickerInlineProps {
  weddings: { id: string; titulo: string }[]
  loading: boolean
  selected: string | null
  onChange: (id: string | null) => void
}

function WeddingPickerInline({ weddings, loading, selected, onChange }: WeddingPickerInlineProps) {
  if (loading) {
    return <div className="h-9 bg-slate-100 rounded-md animate-pulse" />
  }
  if (weddings.length === 0) {
    return (
      <div className="text-sm text-slate-500 py-2">
        Nenhum casamento em pós-venda ainda. Vá em "Por casamento" para configurar.
      </div>
    )
  }
  return (
    <WeddingPicker
      weddings={weddings.map(w => ({ id: w.id, titulo: w.titulo }))}
      selected={selected}
      onChange={onChange}
    />
  )
}

// ─── Seleção de convidados por status ────────────────────────────────────

interface SelecaoConvidadosProps {
  cardId: string
  selectedGuestIds: Set<string>
  onSelectionChange: (next: Set<string>) => void
}

function SelecaoConvidados({ cardId, selectedGuestIds, onSelectionChange }: SelecaoConvidadosProps) {
  const { data: guests = [], isLoading } = useGuests(cardId)

  const grouped = useMemo(() => {
    const map: Record<StatusRSVP, Guest[]> = {
      confirmado: [],
      intencao: [],
      sem_reacao: [],
      nao_vai: [],
    }
    for (const g of guests) {
      map[g.status_rsvp].push(g)
    }
    return map
  }, [guests])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-56 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  // Ordem visual: melhor pro pior estado
  const order: StatusRSVP[] = ['confirmado', 'intencao', 'sem_reacao', 'nao_vai']

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {order.map(status => (
        <StatusCard
          key={status}
          status={status}
          guests={grouped[status]}
          selectedGuestIds={selectedGuestIds}
          onSelectionChange={onSelectionChange}
        />
      ))}
    </div>
  )
}

interface StatusCardProps {
  status: StatusRSVP
  guests: Guest[]
  selectedGuestIds: Set<string>
  onSelectionChange: (next: Set<string>) => void
}

function StatusCard({ status, guests, selectedGuestIds, onSelectionChange }: StatusCardProps) {
  const [search, setSearch] = useState('')
  const tone = STATUS_TONE[status]

  const selectable = useMemo(
    () => guests.filter(g => (g.telefone ?? '').trim().length > 0),
    [guests],
  )
  const selectedCount = selectable.filter(g => selectedGuestIds.has(g.id)).length
  const allSelected = selectable.length > 0 && selectedCount === selectable.length

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return guests
    return guests.filter(g => {
      const nome = `${g.nome} ${g.sobrenome ?? ''}`.toLowerCase()
      const tel = (g.telefone ?? '').toLowerCase()
      return nome.includes(term) || tel.includes(term)
    })
  }, [guests, search])

  const toggleAll = () => {
    const next = new Set(selectedGuestIds)
    if (allSelected) {
      for (const g of selectable) next.delete(g.id)
    } else {
      for (const g of selectable) next.add(g.id)
    }
    onSelectionChange(next)
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedGuestIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  return (
    <div className={cn('border rounded-xl p-3 flex flex-col gap-2', tone.card)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', tone.badge)}>
              {STATUS_RSVP_LABEL[status]}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {selectedCount}/{selectable.length}
            </span>
          </div>
          <label className="inline-flex items-center gap-1.5 mt-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={selectable.length === 0}
              className="rounded border-slate-300 disabled:opacity-40"
            />
            <span className={cn('font-medium', selectable.length === 0 ? 'text-slate-400' : 'text-slate-700')}>
              Marcar todos do grupo
            </span>
          </label>
        </div>
      </div>

      {status === 'nao_vai' && guests.length > 0 && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Geralmente não se envia para quem já recusou.</span>
        </div>
      )}

      {guests.length > 0 && (
        <div className="relative">
          <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar"
            className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-md bg-white/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
          />
        </div>
      )}

      <ul className={cn('flex flex-col gap-0.5 overflow-y-auto custom-scrollbar pr-0.5', LIST_MAX_HEIGHT)}>
        {guests.length === 0 ? (
          <li className="text-xs text-slate-400 py-2">Nenhum convidado neste grupo.</li>
        ) : filtered.length === 0 ? (
          <li className="text-xs text-slate-400 py-2">Nenhum convidado encontrado.</li>
        ) : (
          filtered.map(g => {
            const hasPhone = (g.telefone ?? '').trim().length > 0
            const selected = selectedGuestIds.has(g.id)
            return (
              <li key={g.id}>
                <label
                  className={cn(
                    'flex items-center gap-2 px-1.5 py-1 rounded text-xs',
                    hasPhone ? 'hover:bg-white/60 cursor-pointer' : 'opacity-60 cursor-not-allowed',
                    selected && 'bg-white',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleOne(g.id)}
                    disabled={!hasPhone}
                    className="rounded border-slate-300 disabled:opacity-40"
                  />
                  <span className="truncate flex-1 font-medium text-slate-900">
                    {g.nome}{g.sobrenome ? ` ${g.sobrenome}` : ''}
                  </span>
                  {hasPhone ? (
                    <span className="inline-flex items-center gap-1 text-slate-500 text-[10px] shrink-0">
                      <Phone className="w-2.5 h-2.5" /> {g.telefone}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400 text-[10px] shrink-0">
                      <PhoneOff className="w-2.5 h-2.5" /> sem telefone
                    </span>
                  )}
                </label>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

// ─── Template picker ─────────────────────────────────────────────────────

interface TemplatePickerProps {
  templateSlug: string
  onTemplateChange: (slug: string) => void
}

function TemplatePicker({ templateSlug, onTemplateChange }: TemplatePickerProps) {
  const { data: linhas = [] } = useWhatsAppLinhas('WEDDING')
  const convidadosLinha = useMemo(
    () => linhas.find(l => l.phone_number_label === 'Convidados') ?? linhas[0] ?? null,
    [linhas],
  )
  const { data: templates = [], isLoading } = useWhatsAppTemplates(convidadosLinha?.phone_number_id ?? null)

  const approved = useMemo(
    () => templates.filter(t => t.status === 'APPROVED'),
    [templates],
  )

  const current = approved.find(t => t.name === templateSlug)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-slate-600 inline-flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Template do WhatsApp
        </label>
        {!convidadosLinha && (
          <span className="text-xs text-rose-600">Sem linha "Convidados" configurada.</span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando templates…
        </div>
      ) : approved.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nenhum template aprovado encontrado nesta linha.</p>
      ) : (
        <>
          <select
            value={templateSlug}
            onChange={e => onTemplateChange(e.target.value)}
            className="mt-1.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          >
            <option value="">Escolha um template…</option>
            {approved.map(t => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
          {current && <TemplatePreview templateName={current.name} bodyText={parseTemplateBody(current).bodyText} />}
        </>
      )}
    </div>
  )
}

function TemplatePreview({ templateName, bodyText }: { templateName: string, bodyText: string }) {
  if (!bodyText) return null
  return (
    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-md p-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Prévia · {templateName}</p>
      <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap line-clamp-6">{bodyText}</p>
    </div>
  )
}

// ─── Resumo sticky ───────────────────────────────────────────────────────

interface ResumoStickyProps {
  selectedGuestIds: Set<string>
  cardId: string
  templateSlug: string
  onSubmit: () => void
}

function ResumoSticky({ selectedGuestIds, cardId, templateSlug, onSubmit }: ResumoStickyProps) {
  const { data: guests = [] } = useGuests(cardId)

  const breakdown = useMemo(() => {
    const acc: Record<StatusRSVP, number> = { confirmado: 0, intencao: 0, sem_reacao: 0, nao_vai: 0 }
    for (const g of guests) {
      if (selectedGuestIds.has(g.id)) acc[g.status_rsvp]++
    }
    return acc
  }, [guests, selectedGuestIds])

  const total = breakdown.confirmado + breakdown.intencao + breakdown.sem_reacao + breakdown.nao_vai
  const hasNaoVai = breakdown.nao_vai > 0
  const canSubmit = total > 0 && templateSlug.trim().length > 0

  return (
    <div className="sticky bottom-2 z-10 bg-white border border-slate-200 shadow-sm rounded-xl p-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-medium text-slate-900 tabular-nums">
          {total} selecionado{total === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {STATUS_RSVP_LIST.map(s => breakdown[s] > 0 && (
          <span key={s} className={cn('px-2 py-0.5 rounded-full font-medium', STATUS_TONE[s].badge)}>
            {breakdown[s]} {STATUS_RSVP_LABEL[s].toLowerCase()}
          </span>
        ))}
      </div>

      {hasNaoVai && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
          <AlertTriangle className="w-3 h-3" /> Inclui "não vai"
        </span>
      )}

      <div className="ml-auto">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
          Configurar envio
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Histórico de envios do casamento ────────────────────────────────────

interface HistoricoCasamentoProps {
  cardId: string
  onOpenReport: (loteId: string) => void
}

function HistoricoCasamento({ cardId, onOpenReport }: HistoricoCasamentoProps) {
  const { data: lotes = [], isLoading } = useWeddingLotes(cardId)

  if (isLoading) {
    return <div className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Histórico de envios deste casamento</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {lotes.length === 0
            ? 'Nenhum envio registrado ainda.'
            : `${lotes.length} envio${lotes.length === 1 ? '' : 's'} registrado${lotes.length === 1 ? '' : 's'}.`}
        </p>
      </div>

      {lotes.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {lotes.map(l => (
            <LoteRow key={l.id} lote={l} onOpenReport={() => onOpenReport(l.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

interface LoteRowProps {
  lote: {
    id: string
    template_slug: string
    started_at: string
    total: number
    sent: number
    failed: number
    status: 'enviando' | 'concluido' | 'erro'
  }
  onOpenReport: () => void
}

function LoteRow({ lote, onOpenReport }: LoteRowProps) {
  const started = new Date(lote.started_at)
  const dateLabel = started.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  return (
    <li className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/60 transition-colors">
      {lote.status === 'enviando' ? (
        <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
      ) : lote.failed > 0 ? (
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-700">{lote.template_slug}</code>
          <span className="text-xs text-slate-500">{dateLabel}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
          Total {lote.total} · Enviadas {lote.sent} · Falhas {lote.failed}
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenReport}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition-colors"
      >
        Ver relatório <ArrowRight className="w-3 h-3" />
      </button>
    </li>
  )
}
