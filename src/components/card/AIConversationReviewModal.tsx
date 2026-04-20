import { useEffect, useMemo, useState, useCallback } from 'react'
import { X, Sparkles, Loader2, CheckCircle, AlertCircle, Check, Lock, UserPlus, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import type {
  ConversationPreview,
  ConversationStep,
  ApplyDecisions,
  CardFieldDecision,
  ContactFieldDecision,
  ViajanteDecision,
} from '@/hooks/useAIConversationExtraction'

interface Props {
  isOpen: boolean
  onClose: () => void
  step: ConversationStep
  preview: ConversationPreview | null
  onApply: (decisions: ApplyDecisions) => void
  onCancel: () => void
}

const CONTACT_LABELS: Record<string, string> = {
  contato_nome: 'Nome',
  contato_email: 'Email',
  contato_data_nascimento: 'Data de nascimento',
  contato_cidade: 'Cidade',
  contato_profissao: 'Profissão',
  contato_observacoes: 'Observações',
}

const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const fmtDate = (d: unknown) => {
      if (typeof d !== 'string') return String(d)
      const [y, m, day] = d.split('-')
      return `${day}/${m}/${y}`
    }
    if (obj.data_inicio && obj.data_fim) return `${fmtDate(obj.data_inicio)} a ${fmtDate(obj.data_fim)}`
    if (obj.start && obj.end) return `${fmtDate(obj.start)} a ${fmtDate(obj.end)}`
    if (obj.mes && obj.ano) return `${MONTH_NAMES[Number(obj.mes)] || obj.mes}/${obj.ano}`
    if (obj.mes_inicio && obj.mes_fim && obj.ano) return `${MONTH_NAMES[Number(obj.mes_inicio)]} a ${MONTH_NAMES[Number(obj.mes_fim)]}/${obj.ano}`
    if (typeof obj.min === 'number') {
      if (typeof obj.max === 'number') return `R$ ${Number(obj.min).toLocaleString('pt-BR')} a R$ ${Number(obj.max).toLocaleString('pt-BR')}`
      return `a partir de R$ ${Number(obj.min).toLocaleString('pt-BR')}`
    }
    if (obj.display) return String(obj.display)
    if (obj.tipo === 'total' && typeof obj.valor === 'number') return `R$ ${Number(obj.valor).toLocaleString('pt-BR')}`
    if (obj.tipo === 'por_pessoa' && typeof obj.valor === 'number') return `R$ ${Number(obj.valor).toLocaleString('pt-BR')} por pessoa`
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number' && value >= 1000) return `R$ ${value.toLocaleString('pt-BR')}`
  return String(value)
}

function formatContactValue(key: string, value: unknown): string {
  if (key === 'contato_data_nascimento' && typeof value === 'string' && value.length === 10) {
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }
  return formatDisplayValue(value)
}

type Tab = 'viagem' | 'contato' | 'viajantes'

export default function AIConversationReviewModal({ isOpen, onClose, step, preview, onApply, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('viagem')
  const [cardDecisions, setCardDecisions] = useState<CardFieldDecision[]>([])
  const [contactDecisions, setContactDecisions] = useState<ContactFieldDecision[]>([])
  const [viajanteDecisions, setViajanteDecisions] = useState<ViajanteDecision[]>([])

  const initialDecisions = useMemo(() => {
    if (!preview) return { card: [], contact: [], viajantes: [] }

    const cardKeys = Object.keys(preview.campos_card || {})
    const card: CardFieldDecision[] = cardKeys.map((k) => ({ key: k, accepted: true }))

    const contactKeys = Object.keys(preview.contato_principal || {})
      .filter((k) => preview.contato_principal[k] !== null && preview.contato_principal[k] !== '')
    const contact: ContactFieldDecision[] = contactKeys.map((k) => {
      // Nome trancado → começa desmarcado e desabilitado
      const isLockedName = k === 'contato_nome' && preview.contato_principal_nome_locked
      return { key: k, accepted: !isLockedName }
    })

    const viajantes: ViajanteDecision[] = (preview.viajantes || []).map((v, i) => ({
      index: i,
      // Já vinculados (match_type = existing_fuzzy) começam desmarcados — não há mudança útil
      accepted: v.match_type === 'new',
    }))

    return { card, contact, viajantes }
  }, [preview])

  useEffect(() => {
    setCardDecisions(initialDecisions.card)
    setContactDecisions(initialDecisions.contact)
    setViajanteDecisions(initialDecisions.viajantes)
    // Ao abrir novo preview, escolhe a aba que tem mais novidades
    if (preview) {
      const cardCount = initialDecisions.card.length
      const contactCount = initialDecisions.contact.length
      const viajantesCount = initialDecisions.viajantes.filter((d) => d.accepted).length
      if (cardCount >= contactCount && cardCount >= viajantesCount) setTab('viagem')
      else if (contactCount >= viajantesCount) setTab('contato')
      else setTab('viajantes')
    }
  }, [initialDecisions, preview])

  const toggleCard = useCallback((key: string) => {
    setCardDecisions((prev) => prev.map((d) => (d.key === key ? { ...d, accepted: !d.accepted } : d)))
  }, [])
  const toggleContact = useCallback((key: string) => {
    if (!preview) return
    // Não permite marcar nome trancado
    if (key === 'contato_nome' && preview.contato_principal_nome_locked) return
    setContactDecisions((prev) => prev.map((d) => (d.key === key ? { ...d, accepted: !d.accepted } : d)))
  }, [preview])
  const toggleViajante = useCallback((index: number) => {
    setViajanteDecisions((prev) => prev.map((d) => (d.index === index ? { ...d, accepted: !d.accepted } : d)))
  }, [])

  const acceptAll = useCallback(() => {
    if (!preview) return
    setCardDecisions((prev) => prev.map((d) => ({ ...d, accepted: true })))
    setContactDecisions((prev) =>
      prev.map((d) => ({
        ...d,
        accepted: !(d.key === 'contato_nome' && preview.contato_principal_nome_locked),
      })),
    )
    setViajanteDecisions((prev) => prev.map((d) => ({ ...d, accepted: true })))
  }, [preview])

  const acceptedTotal = useMemo(
    () =>
      cardDecisions.filter((d) => d.accepted).length +
      contactDecisions.filter((d) => d.accepted).length +
      viajanteDecisions.filter((d) => d.accepted).length,
    [cardDecisions, contactDecisions, viajanteDecisions],
  )

  const handleApply = useCallback(() => {
    onApply({
      cardFields: cardDecisions,
      contactFields: contactDecisions,
      viajantes: viajanteDecisions,
    })
  }, [cardDecisions, contactDecisions, viajanteDecisions, onApply])

  if (!isOpen) return null

  const isExtracting = step === 'extracting'
  const isReviewing = step === 'reviewing'
  const isApplying = step === 'applying'
  const isDone = step === 'done'
  const isError = step === 'error'

  const cardCount = cardDecisions.length
  const contactCount = contactDecisions.length
  const viajantesSuggestedCount = viajanteDecisions.length
  const viajantesAcceptedCount = viajanteDecisions.filter((d) => d.accepted).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-100 rounded-lg">
              <Sparkles className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Julia leu a conversa</h3>
              <p className="text-xs text-slate-500">
                {isExtracting
                  ? 'Analisando mensagens…'
                  : isReviewing && preview
                  ? `${preview.message_count} mensagens analisadas · revise o que aplicar`
                  : isApplying
                  ? 'Aplicando…'
                  : isDone
                  ? 'Concluído'
                  : isError
                  ? 'Erro'
                  : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isApplying}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              isApplying ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600',
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        {isReviewing && preview && (
          <div className="flex border-b border-slate-200 bg-slate-50 flex-shrink-0">
            <TabButton active={tab === 'viagem'} onClick={() => setTab('viagem')} label="Viagem" count={cardCount} />
            <TabButton
              active={tab === 'contato'}
              onClick={() => setTab('contato')}
              label="Contato"
              count={contactCount}
            />
            <TabButton
              active={tab === 'viajantes'}
              onClick={() => setTab('viajantes')}
              label="Viajantes"
              count={viajantesSuggestedCount}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isExtracting && (
            <div className="flex flex-col items-center gap-4 py-12 px-5">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-900">Julia está lendo a conversa…</p>
                <p className="text-xs text-slate-500 mt-1">Pode levar até 30 segundos</p>
              </div>
            </div>
          )}

          {isReviewing && preview && (
            <ScrollArea className="max-h-[60vh]">
              <div className="px-5 py-4 space-y-3">
                {tab === 'viagem' && (
                  <CardFieldsTab
                    preview={preview}
                    decisions={cardDecisions}
                    onToggle={toggleCard}
                  />
                )}
                {tab === 'contato' && (
                  <ContactFieldsTab
                    preview={preview}
                    decisions={contactDecisions}
                    onToggle={toggleContact}
                  />
                )}
                {tab === 'viajantes' && (
                  <ViajantesTab
                    preview={preview}
                    decisions={viajanteDecisions}
                    onToggle={toggleViajante}
                  />
                )}
              </div>
            </ScrollArea>
          )}

          {isApplying && (
            <div className="flex flex-col items-center gap-4 py-12 px-5">
              <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-900">Aplicando as mudanças…</p>
            </div>
          )}

          {isDone && (
            <div className="flex flex-col items-center gap-3 py-12 px-5">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="text-sm font-medium text-slate-900">Tudo atualizado!</p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-3 py-12 px-5">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm font-medium text-red-800">Erro ao processar</p>
              <p className="text-xs text-red-600">Tente novamente em alguns segundos</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <button
            onClick={isDone || isError ? onClose : onCancel}
            disabled={isApplying}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
          >
            {isDone || isError ? 'Fechar' : 'Cancelar'}
          </button>

          {isReviewing && (
            <div className="flex gap-2">
              <button
                onClick={acceptAll}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Aceitar tudo
              </button>
              <button
                onClick={handleApply}
                disabled={acceptedTotal === 0}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all',
                  acceptedTotal > 0
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed',
                )}
              >
                <Sparkles className="h-4 w-4" />
                Aplicar{acceptedTotal > 0 ? ` (${acceptedTotal})` : ''}
                {acceptedTotal > 0 && viajantesAcceptedCount > 0 && (
                  <span className="text-xs opacity-80">
                    · {viajantesAcceptedCount} viajante{viajantesAcceptedCount !== 1 ? 's' : ''}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Tab button
// ============================================================================

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 px-4 py-2.5 text-sm font-medium transition-colors border-b-2',
        active
          ? 'border-indigo-600 text-indigo-700 bg-white'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60',
      )}
    >
      {label}
      <span
        className={cn(
          'ml-1.5 text-xs px-1.5 py-0.5 rounded',
          active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600',
        )}
      >
        {count}
      </span>
    </button>
  )
}

// ============================================================================
// Card fields tab
// ============================================================================

function CardFieldsTab({
  preview,
  decisions,
  onToggle,
}: {
  preview: ConversationPreview
  decisions: CardFieldDecision[]
  onToggle: (key: string) => void
}) {
  if (decisions.length === 0) {
    return <EmptyState message="Nenhum campo de viagem novo encontrado." />
  }

  const fieldLabels: Record<string, string> = {}
  for (const f of preview.field_config || []) {
    fieldLabels[f.field_key] = f.label
  }

  return (
    <>
      {decisions.map((d) => {
        const newValue = preview.campos_card[d.key]
        const currentValue = preview.campos_card_atuais[d.key]
        const hasCurrent = currentValue !== null && currentValue !== undefined && currentValue !== ''
        return (
          <div
            key={d.key}
            className={cn(
              'p-3 rounded-lg border transition-colors',
              d.accepted ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50 opacity-60',
            )}
          >
            <button
              onClick={() => onToggle(d.key)}
              className="flex items-center gap-2 text-sm font-medium text-slate-900 w-full text-left"
            >
              <Checkbox checked={d.accepted} />
              {fieldLabels[d.key] || d.key}
            </button>
            {hasCurrent && (
              <p className="text-[11px] text-slate-400 mt-1 ml-7">Atual: {formatDisplayValue(currentValue)}</p>
            )}
            <p className="text-xs text-slate-700 mt-1 ml-7">{formatDisplayValue(newValue)}</p>
          </div>
        )
      })}
    </>
  )
}

// ============================================================================
// Contact fields tab
// ============================================================================

function ContactFieldsTab({
  preview,
  decisions,
  onToggle,
}: {
  preview: ConversationPreview
  decisions: ContactFieldDecision[]
  onToggle: (key: string) => void
}) {
  if (decisions.length === 0) {
    return <EmptyState message="Nenhum dado novo do contato encontrado." />
  }

  return (
    <>
      {decisions.map((d) => {
        const newValue = preview.contato_principal[d.key]
        const currentKey = d.key.replace(/^contato_/, '') // contato_nome → nome
        const currentValue = preview.contato_principal_atual[currentKey]
        const hasCurrent = currentValue !== null && currentValue !== undefined && currentValue !== ''
        const isLocked = d.key === 'contato_nome' && preview.contato_principal_nome_locked

        return (
          <div
            key={d.key}
            className={cn(
              'p-3 rounded-lg border transition-colors',
              isLocked
                ? 'border-amber-200 bg-amber-50 opacity-90'
                : d.accepted
                ? 'border-green-200 bg-green-50'
                : 'border-slate-200 bg-slate-50 opacity-60',
            )}
          >
            <button
              onClick={() => onToggle(d.key)}
              disabled={isLocked}
              className="flex items-center gap-2 text-sm font-medium text-slate-900 w-full text-left disabled:cursor-not-allowed"
            >
              <Checkbox checked={d.accepted} />
              {CONTACT_LABELS[d.key] || d.key}
              {isLocked && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                  <Lock className="h-2.5 w-2.5" />
                  travado pelo operador
                </span>
              )}
            </button>
            {hasCurrent && (
              <p className="text-[11px] text-slate-400 mt-1 ml-7">Atual: {formatContactValue(d.key, currentValue)}</p>
            )}
            <p className="text-xs text-slate-700 mt-1 ml-7">{formatContactValue(d.key, newValue)}</p>
            {isLocked && (
              <p className="text-[11px] text-amber-700 mt-1 ml-7">
                O nome foi editado manualmente e está protegido contra atualizações automáticas.
              </p>
            )}
          </div>
        )
      })}
    </>
  )
}

// ============================================================================
// Viajantes tab
// ============================================================================

function ViajantesTab({
  preview,
  decisions,
  onToggle,
}: {
  preview: ConversationPreview
  decisions: ViajanteDecision[]
  onToggle: (index: number) => void
}) {
  const hasExisting = preview.viajantes_existentes && preview.viajantes_existentes.length > 0

  if (decisions.length === 0 && !hasExisting) {
    return <EmptyState message="Nenhum acompanhante mencionado na conversa." />
  }

  return (
    <>
      {decisions.length === 0 && (
        <p className="text-xs text-slate-500 italic px-1">
          Julia não identificou novos acompanhantes na conversa.
        </p>
      )}

      {decisions.map((d) => {
        const v = preview.viajantes[d.index]
        if (!v) return null
        const isNew = v.match_type === 'new'
        return (
          <div
            key={d.index}
            className={cn(
              'p-3 rounded-lg border transition-colors',
              d.accepted ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50 opacity-70',
            )}
          >
            <button
              onClick={() => onToggle(d.index)}
              className="flex items-center gap-2 text-sm font-medium text-slate-900 w-full text-left"
            >
              <Checkbox checked={d.accepted} />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="truncate">{v.nome}</span>
                {isNew ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                    <UserPlus className="h-2.5 w-2.5" />
                    Novo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    Já vinculado
                  </span>
                )}
              </div>
            </button>
            <div className="mt-1.5 ml-7 text-xs text-slate-600 flex flex-wrap gap-2">
              {v.tipo_vinculo && (
                <Tag label={v.tipo_vinculo} />
              )}
              <Tag label={v.tipo_pessoa === 'crianca' ? 'Criança' : 'Adulto'} />
              {v.data_nascimento && <Tag label={`Nascimento ${formatContactValue('contato_data_nascimento', v.data_nascimento)}`} />}
              {v.telefone && <Tag label={`Tel ${v.telefone}`} />}
            </div>
          </div>
        )
      })}

      {hasExisting && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-[11px] font-medium text-slate-500 mb-2 flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            Já cadastrados neste card
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preview.viajantes_existentes.map((v) => (
              <span key={v.contato_id} className="text-[11px] bg-slate-100 text-slate-700 px-2 py-1 rounded-md">
                {v.nome}
                {v.tipo_vinculo ? ` · ${v.tipo_vinculo}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ============================================================================
// Small components
// ============================================================================

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0',
        checked ? 'bg-green-500 border-green-500' : 'border-slate-300',
      )}
    >
      {checked && <Check className="h-3 w-3 text-white" />}
    </span>
  )
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center text-[10px] font-medium text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
      {label}
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  )
}
