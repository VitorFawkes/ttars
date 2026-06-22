import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ClipboardList,
  Calendar,
  MapPin,
  Globe,
  ExternalLink,
  Users,
  Loader2,
  ListChecks,
  Plus,
  Heart,
  Trash2,
  X,
  Pencil,
  Check,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { formatDataLonga, formatDataCurta, daysUntil, isPast } from '../../lib/planejamento/format'
import { usePlanejamentoWeddings } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { useWeddingChecklist } from '../../hooks/planejamento/useWeddingChecklist'
import { EtapaPanel } from '../../components/planejamento/EtapaPanel'
import { RelatorioCasamento } from '../../components/planejamento/RelatorioCasamento'
import { CasalSection } from '../../components/planejamento/CasalSection'
import { WeddingEquipeSection } from '../../components/planejamento/WeddingEquipeSection'
import {
  EspacoPacoteSection,
  AcaoPromoSection,
  ConvidadosResumoSection,
} from '../../components/planejamento/PlanejamentoSections'
import { WeddingHotelCard } from '../../components/convidados/WeddingHotelCard'
import {
  PLANEJAMENTO_LABEL,
  type EtapaPlanejamento,
  type ChecklistItem,
} from '../../hooks/planejamento/types'

const ETAPA_CHIP: Record<EtapaPlanejamento, string> = {
  boas_vindas: 'bg-slate-100 text-slate-600 border-slate-200',
  onboarding: 'bg-sky-50 text-sky-700 border-sky-200',
  propostas: 'bg-violet-50 text-violet-700 border-violet-200',
  definicao: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  passagem: 'bg-amber-50 text-amber-700 border-amber-200',
  aditivo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export default function PlanejamentoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cardId = id ?? null

  const { data, isLoading, isError } = usePlanejamentoWeddings()
  const wedding = data.find(w => w.id === cardId) ?? null
  const checklist = useWeddingChecklist(cardId)
  const [checklistModal, setChecklistModal] = useState<{ edit: ChecklistItem | null } | null>(null)

  const handleSubmitChecklist = (payload: Omit<ChecklistItem, 'id'>) => {
    const editing = checklistModal?.edit
    if (editing) {
      checklist.update.mutate({ ...editing, ...payload }, { onSuccess: () => setChecklistModal(null) })
    } else {
      checklist.add.mutate(payload, { onSuccess: () => setChecklistModal(null) })
    }
  }

  if (isLoading) {
    return (
      <div className="px-6 py-8 flex items-center justify-center text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando casamento…
      </div>
    )
  }

  if (isError || !wedding) {
    return (
      <div className="px-6 py-8">
        <button onClick={() => navigate('/planejamento')} className="text-sm text-indigo-600 hover:underline mb-4">
          ← Voltar
        </button>
        <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
          Não consegui carregar este casamento no planejamento.
        </div>
      </div>
    )
  }

  const dateLong = formatDataLonga(wedding.wedding_date)
  const days = daysUntil(wedding.wedding_date)
  const { total } = wedding.counts

  return (
    <div className="px-6 py-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/planejamento')}
            className="mt-1 p-1.5 rounded-md hover:bg-slate-100 text-slate-500 shrink-0"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <ClipboardList className="w-6 h-6 text-indigo-500 shrink-0" />
              <h1 className="text-2xl font-bold text-slate-900 break-words">{wedding.titulo}</h1>
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border uppercase tracking-wide',
                  ETAPA_CHIP[wedding.planejamentoEtapa],
                )}
                title={`Etapa de planejamento: ${PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}`}
              >
                {PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}
              </span>
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
          <button
            onClick={() => navigate(`/convidados/casamento/${wedding.id}`)}
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md px-3 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
            title="Ver convidados deste casamento"
          >
            <Heart className="w-4 h-4 text-rose-400" /> Convidados
          </button>
          <a
            href={`/cards/${wedding.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir card em nova aba"
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md px-3 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Acessar card
          </a>
        </div>
      </div>

      {/* Casal (clientes) + Equipe do casamento (interno) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <CasalSection cardId={wedding.id} />
        <WeddingEquipeSection cardId={wedding.id} />
      </div>

      {/* Etapa atual: trava (o que falta) + avançar + campos da etapa */}
      <EtapaPanel wedding={wedding} />

      {/* Informações do casamento (vem do funil / comercial — só leitura) */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Informações do casamento</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="Data" value={dateLong ?? '—'} icon={<Calendar className="w-3.5 h-3.5" />} />
          <InfoItem label="Local / Destino" value={wedding.local ?? '—'} icon={<MapPin className="w-3.5 h-3.5" />} />
          <InfoItem label="Lista de convidados" value={total > 0 ? `${total} nomes` : '—'} icon={<Users className="w-3.5 h-3.5" />} />
          <InfoItem label="Etapa de planejamento" value={PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]} icon={<ClipboardList className="w-3.5 h-3.5" />} />
        </div>
      </section>

      {/* Espaço & Pacote (o que se contrata no Planejamento) */}
      <EspacoPacoteSection wedding={wedding} />

      {/* Hospedagem (hotel — fonte única com Convidados) */}
      <WeddingHotelCard cardId={cardId} local={wedding.local} />

      {/* Ação promocional (definição) + Convidados (estimativa, sem confirmação) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <AcaoPromoSection wedding={wedding} />
        <ConvidadosResumoSection wedding={wedding} />
      </div>

      {/* Cronograma & Checklist do planejamento */}
      <ChecklistSection
        items={checklist.items}
        onAdd={() => setChecklistModal({ edit: null })}
        onEdit={(item) => setChecklistModal({ edit: item })}
        onToggle={(item) => checklist.toggle.mutate({ id: item.id, feito: !item.feito })}
        onRemove={(id) => checklist.remove.mutate(id)}
        removing={checklist.remove.isPending}
      />

      {/* Relatório do casamento — saúde, financeiro, convidados, prazos */}
      <RelatorioCasamento wedding={wedding} />

      {checklistModal && (
        <AddChecklistItemModal
          initial={checklistModal.edit}
          saving={checklist.add.isPending || checklist.update.isPending}
          onClose={() => setChecklistModal(null)}
          onSubmit={handleSubmitChecklist}
        />
      )}
    </div>
  )
}

function InfoItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="font-medium text-slate-900 mt-0.5 break-words">{value}</p>
    </div>
  )
}

// ── Cronograma & Checklist ──────────────────────────────────────────────────

function PrazoChip({ prazo, feito }: { prazo: string; feito: boolean }) {
  const label = formatDataCurta(prazo)
  if (!label) return null
  if (feito) {
    return <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{label}</span>
  }
  const past = isPast(prazo)
  const d = daysUntil(prazo)
  const tone = past ? 'text-rose-600' : d === 0 ? 'text-amber-600' : 'text-slate-500'
  const sufixo = past ? ' · atrasado' : d === 0 ? ' · hoje' : d != null && d <= 7 ? ` · faltam ${d}d` : ''
  return (
    <span className={cn('text-[11px] inline-flex items-center gap-1', tone)}>
      <Calendar className="w-3 h-3" />
      {label}
      {sufixo}
    </span>
  )
}

function ChecklistSection({
  items,
  onAdd,
  onEdit,
  onToggle,
  onRemove,
  removing,
}: {
  items: ChecklistItem[]
  onAdd: () => void
  onEdit: (item: ChecklistItem) => void
  onToggle: (item: ChecklistItem) => void
  onRemove: (id: string) => void
  removing: boolean
}) {
  const total = items.length
  const feitos = items.filter((i) => i.feito).length

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <header className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Cronograma & Checklist</h2>
          {total > 0 && (
            <span className="text-[11px] text-slate-500 tabular-nums">
              {feitos} de {total} concluídos
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar item
        </button>
      </header>

      {total === 0 ? (
        <p className="text-sm text-slate-400 italic py-2">Nenhum item ainda — adicione marcos e tarefas do planejamento.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
              <button
                type="button"
                onClick={() => onToggle(item)}
                className={cn(
                  'w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors',
                  item.feito
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-slate-300 hover:border-slate-400',
                )}
                aria-label={item.feito ? 'Marcar como pendente' : 'Marcar como feito'}
              >
                {item.feito && <Check className="w-3.5 h-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm break-words', item.feito ? 'text-slate-400 line-through' : 'text-slate-800')}>
                  {item.titulo}
                </p>
                {item.prazo && (
                  <div className="mt-0.5">
                    <PrazoChip prazo={item.prazo} feito={item.feito} />
                  </div>
                )}
                {item.observacoes && (
                  <p className="text-[11px] text-slate-500 mt-0.5 break-words whitespace-pre-wrap">
                    {item.observacoes}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  title="Editar item"
                  aria-label={`Editar ${item.titulo}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={removing}
                  className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                  title="Remover item"
                  aria-label={`Remover ${item.titulo}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const FIELD_CLS =
  'w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'

function AddChecklistItemModal({
  initial,
  saving,
  onClose,
  onSubmit,
}: {
  initial?: ChecklistItem | null
  saving: boolean
  onClose: () => void
  onSubmit: (payload: Omit<ChecklistItem, 'id'>) => void
}) {
  const isEdit = !!initial
  const [titulo, setTitulo] = useState(initial?.titulo ?? '')
  const [prazo, setPrazo] = useState(initial?.prazo ?? '')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')

  const canSave = titulo.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    onSubmit({
      titulo: titulo.trim(),
      prazo: prazo.trim() || null,
      feito: initial?.feito ?? false,
      observacoes: observacoes.trim() || null,
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg rounded-xl flex flex-col">
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{isEdit ? 'Editar item' : 'Adicionar item'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-xs font-medium text-slate-700 block">
            Item *
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Definir espaço, fechar contrato, montar programação…"
              className={FIELD_CLS}
            />
          </label>
          <label className="text-xs font-medium text-slate-700 block">
            Prazo (opcional)
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={FIELD_CLS} />
          </label>
          <label className="text-xs font-medium text-slate-700 block">
            Observação (opcional)
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Detalhes, contexto, links…"
              className={FIELD_CLS}
            />
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 rounded-md px-3 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="inline-flex items-center justify-center h-9 rounded-md px-3 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
