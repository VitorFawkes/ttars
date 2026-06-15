import { useMemo, useState } from 'react'
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
  Store,
  BedDouble,
  ListChecks,
  Plus,
  Heart,
  Trash2,
  X,
  ChevronDown,
  Pencil,
  Check,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { brl, formatDataLonga, formatDataCurta, daysUntil, isPast } from '../../lib/planejamento/format'
import { setorIcon } from '../../lib/planejamento/setorIcons'
import { usePlanejamentoWeddings } from '../../hooks/planejamento/usePlanejamentoWeddings'
import { useWeddingFornecedores } from '../../hooks/planejamento/useWeddingFornecedores'
import { useWeddingChecklist } from '../../hooks/planejamento/useWeddingChecklist'
import { useFornecedorBank } from '../../hooks/planejamento/useFornecedorBank'
import { WipBadge } from '../../components/planejamento/WipBadge'
import {
  PLANEJAMENTO_LABEL,
  FORNECEDOR_SETORES,
  FORNECEDOR_STATUS_LABEL,
  FORNECEDOR_STATUS_LIST,
  type EtapaPlanejamento,
  type Fornecedor,
  type FornecedorBankEntry,
  type FornecedorStatus,
  type ChecklistItem,
} from '../../hooks/planejamento/types'

const FORNECEDOR_STATUS_CHIP: Record<FornecedorStatus, string> = {
  a_contratar: 'bg-slate-100 text-slate-600 border-slate-200',
  contratado: 'bg-sky-50 text-sky-700 border-sky-200',
  pago: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const ETAPA_CHIP: Record<EtapaPlanejamento, string> = {
  boas_vindas: 'bg-slate-100 text-slate-600 border-slate-200',
  onboarding: 'bg-sky-50 text-sky-700 border-sky-200',
  propostas: 'bg-violet-50 text-violet-700 border-violet-200',
  definicao: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  passagem: 'bg-amber-50 text-amber-700 border-amber-200',
  aditivo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

// Setores de fornecedor + ícone (labels vêm de FORNECEDOR_SETORES; ícone do
// mapa compartilhado em lib/planejamento/setorIcons).
const SETORES_COM_ICONE: { label: string; icon?: string }[] = FORNECEDOR_SETORES.map(
  (label) => ({ label, icon: setorIcon(label) }),
)

export default function PlanejamentoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const cardId = id ?? null

  const { data, isLoading, isError } = usePlanejamentoWeddings()
  const wedding = data.find(w => w.id === cardId) ?? null
  const { fornecedores, add, remove, setStatus, update } = useWeddingFornecedores(cardId)
  const { bank, add: bankAdd } = useFornecedorBank()
  const checklist = useWeddingChecklist(cardId)
  const [fornModal, setFornModal] = useState<{ edit: Fornecedor | null } | null>(null)
  const [checklistModal, setChecklistModal] = useState<{ edit: ChecklistItem | null } | null>(null)

  const handleSubmitChecklist = (payload: Omit<ChecklistItem, 'id'>) => {
    const editing = checklistModal?.edit
    if (editing) {
      checklist.update.mutate({ ...editing, ...payload }, { onSuccess: () => setChecklistModal(null) })
    } else {
      checklist.add.mutate(payload, { onSuccess: () => setChecklistModal(null) })
    }
  }

  // Agrupa por setor uma vez (em vez de filtrar a lista por setor no map).
  const fornecedoresPorSetor = useMemo(() => {
    const map = new Map<string, Fornecedor[]>()
    for (const f of fornecedores) {
      const list = map.get(f.setor) ?? []
      list.push(f)
      map.set(f.setor, list)
    }
    return map
  }, [fornecedores])

  // Add (ao casamento + banco com o local do card, sem duplicar) ou edição.
  const handleSubmitForn = (payload: Omit<Fornecedor, 'id'>) => {
    const editing = fornModal?.edit
    if (editing) {
      update.mutate({ ...editing, ...payload }, { onSuccess: () => setFornModal(null) })
      return
    }
    add.mutate(payload, { onSuccess: () => setFornModal(null) })
    const loc = (wedding?.local ?? '').trim()
    const jaExiste = bank.some(
      (b) =>
        b.nome.trim().toLowerCase() === payload.nome.trim().toLowerCase() &&
        b.setor === payload.setor &&
        (b.localizacao ?? '').trim().toLowerCase() === loc.toLowerCase(),
    )
    if (!jaExiste) {
      bankAdd.mutate({
        nome: payload.nome,
        setor: payload.setor,
        localizacao: loc,
        contato: payload.contato ?? null,
        valor: payload.valor ?? null,
        observacoes: null,
      })
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
  const { confirmado, total } = wedding.counts

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

      {/* Informações do casamento — o que já existe (vem do funil / AC) */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Informações do casamento</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="Data" value={dateLong ?? '—'} icon={<Calendar className="w-3.5 h-3.5" />} />
          <InfoItem label="Local / Destino" value={wedding.local ?? '—'} icon={<MapPin className="w-3.5 h-3.5" />} />
          <InfoItem
            label="Convidados"
            value={total > 0 ? `${confirmado} confirmados / ${total}` : '—'}
            icon={<Users className="w-3.5 h-3.5" />}
          />
          <InfoItem
            label="Etapa de planejamento"
            value={PLANEJAMENTO_LABEL[wedding.planejamentoEtapa]}
            icon={<ClipboardList className="w-3.5 h-3.5" />}
          />
        </div>
      </section>

      {/* Fornecedores + Cronograma lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Fornecedores */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <header className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">Fornecedores</h2>
            <WipBadge />
          </div>
          <button
            type="button"
            onClick={() => setFornModal({ edit: null })}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar fornecedor
          </button>
        </header>
        <ul className="space-y-1.5">
          {SETORES_COM_ICONE.map((cat) => {
            const itens = fornecedoresPorSetor.get(cat.label) ?? []
            return (
              <li key={cat.label} className="border border-slate-100 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm bg-white">
                  <span className="flex items-center gap-2.5 text-slate-700 font-medium">
                    {cat.icon ? (
                      <img src={cat.icon} alt="" aria-hidden className="w-6 h-6 object-contain shrink-0" />
                    ) : (
                      <span className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 inline-flex items-center justify-center shrink-0">
                        <Store className="w-3.5 h-3.5 text-slate-400" />
                      </span>
                    )}
                    {cat.label}
                  </span>
                  {itens.length > 0 ? (
                    <span className="font-mono text-[11px] px-1.5 h-5 inline-flex items-center rounded-md font-semibold tabular-nums bg-slate-100 text-slate-600 border border-slate-200">
                      {itens.length}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">a definir</span>
                  )}
                </div>
                {itens.length > 0 && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40">
                    {itens.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{f.nome}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {[f.contato, f.valor != null ? brl.format(f.valor) : null]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div
                            className={cn(
                              'relative inline-flex items-center rounded-full border text-[10px] font-semibold uppercase tracking-wide',
                              FORNECEDOR_STATUS_CHIP[f.status],
                            )}
                            title="Mudar fase"
                          >
                            <select
                              value={f.status}
                              onChange={(e) =>
                                setStatus.mutate({ id: f.id, status: e.target.value as FornecedorStatus })
                              }
                              className="appearance-none bg-transparent pl-2 pr-5 py-0.5 rounded-full cursor-pointer focus:outline-none uppercase"
                              aria-label={`Fase de ${f.nome}`}
                            >
                              {FORNECEDOR_STATUS_LIST.map((s) => (
                                <option key={s} value={s} className="bg-white text-slate-700 normal-case">
                                  {FORNECEDOR_STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
                          </div>
                          <button
                            type="button"
                            onClick={() => setFornModal({ edit: f })}
                            className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            title="Editar fornecedor"
                            aria-label={`Editar ${f.nome}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove.mutate(f.id)}
                            disabled={remove.isPending}
                            className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            title="Remover fornecedor"
                            aria-label={`Remover ${f.nome}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* Cronograma & Checklist */}
      <ChecklistSection
        items={checklist.items}
        onAdd={() => setChecklistModal({ edit: null })}
        onEdit={(item) => setChecklistModal({ edit: item })}
        onToggle={(item) => checklist.toggle.mutate({ id: item.id, feito: !item.feito })}
        onRemove={(id) => checklist.remove.mutate(id)}
        removing={checklist.remove.isPending}
      />
      </div>

      {/* Hospedagem — em construção */}
      <WipSection icon={<BedDouble className="w-5 h-5 text-slate-500" />} title="Hospedagem">
        Bloqueio de quartos, check-in/check-out e ocupação dos convidados — em construção.
      </WipSection>

      {fornModal && (
        <AddFornecedorModal
          initial={fornModal.edit}
          setores={SETORES_COM_ICONE.map((c) => c.label)}
          bankEntries={bank}
          saving={add.isPending || update.isPending}
          onClose={() => setFornModal(null)}
          onSubmit={handleSubmitForn}
        />
      )}

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

function WipSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <header className="flex items-center gap-2 mb-2">
        {icon}
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <WipBadge />
      </header>
      <p className="text-sm text-slate-500">{children}</p>
    </section>
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

  const canSave = titulo.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    onSubmit({
      titulo: titulo.trim(),
      prazo: prazo.trim() || null,
      feito: initial?.feito ?? false,
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
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Definir data, contratar buffet, enviar convites…"
              className={FIELD_CLS}
            />
          </label>
          <label className="text-xs font-medium text-slate-700 block">
            Prazo (opcional)
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={FIELD_CLS} />
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

const FIELD_CLS =
  'w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'

function AddFornecedorModal({
  initial,
  setores,
  bankEntries,
  saving,
  onClose,
  onSubmit,
}: {
  initial?: Fornecedor | null
  setores: string[]
  bankEntries: FornecedorBankEntry[]
  saving: boolean
  onClose: () => void
  onSubmit: (payload: Omit<Fornecedor, 'id'>) => void
}) {
  const isEdit = !!initial
  const [setor, setSetor] = useState(initial?.setor ?? setores[0] ?? '')
  const [nome, setNome] = useState(initial?.nome ?? '')
  const [contato, setContato] = useState(initial?.contato ?? '')
  const [valor, setValor] = useState(initial?.valor != null ? String(initial.valor) : '')
  const [bankPick, setBankPick] = useState('')

  // No modo edição não oferecemos puxar do banco (já é um registro existente).
  const bankOptions = isEdit ? [] : bankEntries.filter((b) => b.setor === setor)

  const onSetor = (v: string) => {
    setSetor(v)
    setBankPick('')
  }

  const applyBank = (id: string) => {
    setBankPick(id)
    const b = bankEntries.find((x) => x.id === id)
    if (b) {
      setNome(b.nome)
      setContato(b.contato ?? '')
      setValor(b.valor != null ? String(b.valor) : '')
    }
  }

  const canSave = nome.trim().length > 0 && !!setor

  const handleSave = () => {
    if (!canSave) return
    const parsed = valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null
    onSubmit({
      setor,
      nome: nome.trim(),
      contato: contato.trim() || null,
      valor: parsed != null && !Number.isNaN(parsed) ? parsed : null,
      status: initial?.status ?? 'a_contratar',
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
          <h2 className="text-base font-semibold text-slate-900">
            {isEdit ? 'Editar fornecedor' : 'Adicionar fornecedor'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-xs font-medium text-slate-700 block">
            Setor
            <select value={setor} onChange={(e) => onSetor(e.target.value)} className={FIELD_CLS}>
              {setores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {bankOptions.length > 0 && (
            <label className="text-xs font-medium text-slate-700 block">
              Do banco (opcional)
              <select value={bankPick} onChange={(e) => applyBank(e.target.value)} className={FIELD_CLS}>
                <option value="">— preencher manualmente —</option>
                {bankOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                    {b.localizacao ? ` — ${b.localizacao}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-xs font-medium text-slate-700 block">
            Nome / empresa *
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Buffet Sabor & Arte"
              className={FIELD_CLS}
            />
          </label>

          <label className="text-xs font-medium text-slate-700 block">
            Contato (opcional)
            <input
              value={contato}
              onChange={(e) => setContato(e.target.value)}
              placeholder="telefone, e-mail ou @"
              className={FIELD_CLS}
            />
          </label>

          <label className="text-xs font-medium text-slate-700 block">
            Valor (opcional)
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
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
