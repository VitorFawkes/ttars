import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ListChecks, Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, Paperclip, MessageSquare, Repeat } from 'lucide-react'
import { cn } from '../../lib/utils'
import { daysUntil, isPast } from '../../lib/planejamento/format'
import { WEDDING_TASK_TYPES, WEDDING_TASK_TIPO_LIST } from '../../hooks/planejamento/taskTypes'
import {
  PLANEJAMENTO_ORDER,
  PLANEJAMENTO_LABEL,
  MARCOS_POR_ETAPA,
  MARCO_LABEL,
  WEDDING_TASK_TIPO_DEFAULT,
  spineMarcoId,
  type ChecklistItem,
  type EtapaPlanejamento,
  type WeddingTaskTipo,
} from '../../hooks/planejamento/types'
import type { useWeddingChecklist } from '../../hooks/planejamento/useWeddingChecklist'

type ChecklistApi = ReturnType<typeof useWeddingChecklist>

const CARD = 'bg-white border border-[#EAE1D3] rounded-2xl p-5 shadow-[0_1px_2px_rgba(78,24,32,0.05)]'

// tipo sugerido por marco (preenche o seletor ao adicionar sob um marco)
const TIPO_SUGERIDO: Record<string, WeddingTaskTipo> = {
  'onboarding:reuniao1': 'reuniao',
  'propostas:definicao': 'reserva',
  'definicao:reserva': 'reserva',
  'definicao:documentacao': 'documento',
  'definicao:pagamento': 'pagamento',
  'passagem:bloqueio': 'bloqueio',
  'aditivo:lista': 'lista',
}

/**
 * Espinha do Planejamento: TODAS as tarefas num lugar só, agrupadas por
 * Etapa → Marco (hierarquia do Vitor). Cada tarefa tem tipo, data e roll-up
 * pro marco. A reunião é uma tarefa (tipo 'reuniao'). Etapa atual aberta; as
 * outras recolhidas (foto completa sob demanda).
 */
export function CronogramaSpine({
  checklist,
  currentEtapa,
  onOpenDoc,
}: {
  checklist: ChecklistApi
  currentEtapa: EtapaPlanejamento
  /** Abre os anexos do casamento (📎 das tarefas com abre_doc). */
  onOpenDoc?: () => void
}) {
  const { items } = checklist
  const [open, setOpen] = useState<Set<EtapaPlanejamento>>(() => new Set([currentEtapa]))
  const [modal, setModal] = useState<{ marco: string | null; edit: ChecklistItem | null } | null>(null)

  const total = items.length
  const feitos = items.filter((i) => i.feito).length
  const atrasados = items.filter((i) => !i.feito && i.prazo && isPast(i.prazo)).length

  // marco → tarefas
  const byMarco = useMemo(() => {
    const m = new Map<string, ChecklistItem[]>()
    const avulsas: ChecklistItem[] = []
    for (const it of items) {
      if (!it.marco) { avulsas.push(it); continue }
      const arr = m.get(it.marco)
      if (arr) arr.push(it)
      else m.set(it.marco, [it])
    }
    return { m, avulsas }
  }, [items])

  const registry = useMemo(() => new Set(Object.values(MARCOS_POR_ETAPA).flat()), [])

  const toggleEtapa = (e: EtapaPlanejamento) =>
    setOpen((prev) => {
      const n = new Set(prev)
      if (n.has(e)) n.delete(e)
      else n.add(e)
      return n
    })

  const handleSubmit = (payload: Omit<ChecklistItem, 'id'>) => {
    const editing = modal?.edit
    if (editing) {
      checklist.update.mutate({ ...editing, ...payload }, { onSuccess: () => setModal(null) })
    } else {
      checklist.add.mutate(payload, { onSuccess: () => setModal(null) })
    }
  }

  return (
    <section className={CARD}>
      <header className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-[#BD965C]" />
          <h2 className="text-base font-semibold text-slate-900">Cronograma &amp; Tarefas</h2>
          {total > 0 && (
            <span className="text-[11px] text-slate-500 tabular-nums">
              {feitos} de {total} feitas{atrasados > 0 ? ` · ${atrasados} atrasada${atrasados > 1 ? 's' : ''}` : ''}
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-2.5">
        {PLANEJAMENTO_ORDER.map((etapa) => {
          const marcosRegistro = MARCOS_POR_ETAPA[etapa]
          // marcos extras (criados em dados, fora do registro) dessa etapa
          const extras = [...byMarco.m.keys()].filter(
            (mk) => mk.startsWith(`${etapa}:`) && !registry.has(mk),
          )
          const marcos = [...marcosRegistro, ...extras]
          const etapaTasks = marcos.reduce((acc, mk) => acc + (byMarco.m.get(mk)?.length ?? 0), 0)
          const etapaFeitos = marcos.reduce(
            (acc, mk) => acc + (byMarco.m.get(mk)?.filter((t) => t.feito).length ?? 0),
            0,
          )
          const isOpen = open.has(etapa)
          const isCurrent = etapa === currentEtapa

          return (
            <div key={etapa} className={cn('rounded-xl border', isCurrent ? 'border-[#E6D3B3] bg-[#FCF9F2]' : 'border-[#EEE7DA] bg-[#FBF9F5]')}>
              <button
                type="button"
                onClick={() => toggleEtapa(etapa)}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-[#A88C57]" /> : <ChevronRight className="w-4 h-4 text-[#A88C57]" />}
                <span className={cn('text-[13.5px] font-semibold', isCurrent ? 'text-[#8A6A33]' : 'text-[#5C5751]')}>
                  {PLANEJAMENTO_LABEL[etapa]}
                </span>
                {isCurrent && <span className="text-[9.5px] font-bold uppercase tracking-wide text-[#BD965C] bg-[#F4ECDD] border border-[#E6D3B3] rounded-full px-1.5 py-0.5">atual</span>}
                <span className="ml-auto text-[11px] text-slate-400 tabular-nums">{etapaFeitos}/{etapaTasks}</span>
              </button>

              {isOpen && (
                <div className="px-3.5 pb-3 flex flex-col gap-3">
                  {marcos.length === 0 && (
                    <p className="text-[12px] text-slate-400 italic pl-6">Sem marcos com tarefas nesta etapa.</p>
                  )}
                  {marcos.map((mk) => (
                    <MarcoGroup
                      key={mk}
                      marcoKey={mk}
                      tasks={byMarco.m.get(mk) ?? []}
                      checklist={checklist}
                      onAdd={() => setModal({ marco: mk, edit: null })}
                      onEdit={(it) => setModal({ marco: mk, edit: it })}
                      onOpenDoc={onOpenDoc}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Avulsas (sem marco) */}
        <div className="rounded-xl border border-[#EEE7DA] bg-[#FBF9F5]">
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <span className="text-[13.5px] font-semibold text-[#5C5751]">Outras tarefas (avulsas)</span>
            <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
              {byMarco.avulsas.filter((t) => t.feito).length}/{byMarco.avulsas.length}
            </span>
          </div>
          <div className="px-3.5 pb-3 flex flex-col gap-1.5">
            {byMarco.avulsas.map((it) => (
              <TaskRow key={it.id} item={it} checklist={checklist} onEdit={() => setModal({ marco: null, edit: it })} onOpenDoc={onOpenDoc} />
            ))}
            <button
              type="button"
              onClick={() => setModal({ marco: null, edit: null })}
              className="self-start inline-flex items-center gap-1.5 h-7 px-2 text-xs font-medium text-[#8A6A33] border border-[#E6D3B3] rounded-md hover:bg-[#FBF6E8]"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar tarefa avulsa
            </button>
          </div>
        </div>
      </div>

      {modal && (
        <TaskModal
          initial={modal.edit}
          marco={modal.marco}
          saving={checklist.add.isPending || checklist.update.isPending}
          nextOrdem={() => checklist.nextOrdem(modal.marco)}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  )
}

function MarcoGroup({
  marcoKey,
  tasks,
  checklist,
  onAdd,
  onEdit,
  onOpenDoc,
}: {
  marcoKey: string
  tasks: ChecklistItem[]
  checklist: ChecklistApi
  onAdd: () => void
  onEdit: (it: ChecklistItem) => void
  onOpenDoc?: () => void
}) {
  const label = MARCO_LABEL[marcoKey] ?? marcoKey.split(':')[1]
  const done = tasks.filter((t) => t.feito).length
  return (
    <div id={spineMarcoId(marcoKey)} className="scroll-mt-6 pl-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#A88C57]">{label}</span>
        <span className="text-[10px] text-slate-400 tabular-nums">{done}/{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {tasks.map((it) => (
          <TaskRow key={it.id} item={it} checklist={checklist} onEdit={() => onEdit(it)} onOpenDoc={onOpenDoc} />
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="self-start inline-flex items-center gap-1.5 h-7 px-2 text-[11px] font-medium text-[#8A6A33] border border-dashed border-[#D9CFC2] rounded-md hover:bg-[#FBF6E8]"
        >
          <Plus className="w-3 h-3" /> adicionar tarefa
        </button>
      </div>
    </div>
  )
}

function TaskRow({
  item,
  checklist,
  onEdit,
  onOpenDoc,
}: {
  item: ChecklistItem
  checklist: ChecklistApi
  onEdit: () => void
  onOpenDoc?: () => void
}) {
  const meta = WEDDING_TASK_TYPES[item.tipo] ?? WEDDING_TASK_TYPES.tarefa
  const Icon = meta.icon
  const past = !item.feito && item.prazo && isPast(item.prazo)
  const d = item.prazo ? daysUntil(item.prazo) : null
  const [commentOpen, setCommentOpen] = useState(false)

  return (
    <div className="rounded-lg border border-slate-100 bg-white">
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <button
          type="button"
          onClick={() => checklist.toggle.mutate({ id: item.id, feito: !item.feito })}
          className={cn(
            'w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors',
            item.feito ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400',
          )}
          aria-label={item.feito ? 'Marcar como pendente' : 'Marcar como feita'}
        >
          {item.feito && <Check className="w-3.5 h-3.5" />}
        </button>

        <span className={cn('w-6 h-6 rounded-md grid place-items-center shrink-0 border', meta.bg, meta.border)} title={meta.label}>
          <Icon className={cn('w-3.5 h-3.5', meta.color)} />
        </span>

        <span className={cn('flex-1 min-w-0 text-[13px] truncate', item.feito ? 'text-slate-400 line-through' : 'text-slate-800')} title={item.titulo}>
          {item.titulo}
        </span>

        {/* Ações discretas (sem tags coloridas): 🔁 cobra sozinha · 📎 abrir documento ·
            💬 comentário. A trava aparece no botão Avançar; a data vencida fica em
            vermelho aqui mesmo — nada disso vira etiqueta colorida. */}
        <div className="flex items-center gap-1 shrink-0">
          {item.gera_cobranca && !item.feito && (
            <span title="Cobra sozinha quando o prazo vence" className="w-6 h-6 rounded grid place-items-center text-slate-400">
              <Repeat className="w-3.5 h-3.5" />
            </span>
          )}
          {item.abre_doc && onOpenDoc && (
            <button
              type="button"
              onClick={onOpenDoc}
              title="Abrir os documentos do casamento (anexos)"
              className="w-6 h-6 rounded grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCommentOpen((v) => !v)}
            title="Comentário rápido"
            className={cn(
              'w-6 h-6 rounded grid place-items-center hover:bg-slate-100',
              item.observacoes && item.observacoes.trim().length > 0 ? 'text-[#8A6A33]' : 'text-slate-300 hover:text-slate-600',
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        </div>

        <input
          type="date"
          value={item.prazo ?? ''}
          onChange={(e) => checklist.update.mutate({ ...item, prazo: e.target.value || null })}
          className={cn(
            'shrink-0 text-[11.5px] px-1.5 py-1 rounded-md border bg-white tabular-nums',
            past ? 'border-rose-300 text-rose-600 font-semibold bg-rose-50' : d === 0 ? 'border-amber-200 text-amber-700' : 'border-slate-200 text-slate-600',
          )}
          title={past ? 'atrasada' : 'prazo'}
        />

        <button type="button" onClick={onEdit} className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0" title="Editar" aria-label="Editar tarefa">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => checklist.remove.mutate(item.id)}
          disabled={checklist.remove.isPending}
          className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
          title="Remover"
          aria-label="Remover tarefa"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Comentário rápido — 1 clique, sem abrir o modal inteiro. */}
      {commentOpen && (
        <div className="px-2.5 pb-2.5 pl-11">
          <textarea
            defaultValue={item.observacoes ?? ''}
            rows={2}
            autoFocus
            placeholder="Escrever um comentário rápido…"
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== (item.observacoes ?? '')) {
                checklist.update.mutate({ ...item, observacoes: v || null })
              }
            }}
            className="w-full text-[12.5px] px-2.5 py-1.5 rounded-md border border-[#E6D3B3] bg-[#FBF6E8]/40 focus:outline-none focus:ring-2 focus:ring-[#BD965C]/30"
          />
        </div>
      )}
    </div>
  )
}

const FIELD = 'w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#BD965C]/30 focus:border-[#BD965C]'

function TaskModal({
  initial,
  marco,
  saving,
  nextOrdem,
  onClose,
  onSubmit,
}: {
  initial: ChecklistItem | null
  marco: string | null
  saving: boolean
  nextOrdem: () => number
  onClose: () => void
  onSubmit: (payload: Omit<ChecklistItem, 'id'>) => void
}) {
  const isEdit = !!initial
  const [titulo, setTitulo] = useState(initial?.titulo ?? '')
  const [prazo, setPrazo] = useState(initial?.prazo ?? '')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')
  const [tipo, setTipo] = useState<WeddingTaskTipo>(
    initial?.tipo ?? (marco ? TIPO_SUGERIDO[marco] ?? WEDDING_TASK_TIPO_DEFAULT : WEDDING_TASK_TIPO_DEFAULT),
  )

  const canSave = titulo.trim().length > 0
  const handleSave = () => {
    if (!canSave) return
    onSubmit({
      titulo: titulo.trim(),
      prazo: prazo.trim() || null,
      feito: initial?.feito ?? false,
      observacoes: observacoes.trim() || null,
      tipo,
      marco: initial?.marco ?? marco,
      ordem: initial?.ordem ?? nextOrdem(),
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 shadow-lg rounded-xl flex flex-col">
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">{isEdit ? 'Editar tarefa' : 'Nova tarefa'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </header>

        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-xs font-medium text-slate-700 block">
            Tarefa *
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Visitar o espaço, assinar contrato, reunião de alinhamento…" className={FIELD} />
          </label>

          <div className="block">
            <span className="text-xs font-medium text-slate-700">Tipo</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WEDDING_TASK_TIPO_LIST.map((t) => {
                const m = WEDDING_TASK_TYPES[t]
                const TIcon = m.icon
                const active = tipo === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[12px] font-medium transition-colors',
                      active ? cn(m.bg, m.border, m.color) : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
                    )}
                  >
                    <TIcon className="w-3.5 h-3.5" /> {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="text-xs font-medium text-slate-700 block">
            Prazo (opcional)
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={FIELD} />
          </label>
          <label className="text-xs font-medium text-slate-700 block">
            Observação (opcional)
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} placeholder="Detalhes, contexto, links…" className={FIELD} />
          </label>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} className="inline-flex items-center justify-center h-9 rounded-md px-3 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={!canSave || saving} className="inline-flex items-center justify-center h-9 rounded-md px-3 text-sm font-medium bg-[#BD965C] text-white hover:bg-[#a37f47] disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
