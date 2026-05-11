import { useState, useMemo, useCallback, useEffect } from 'react'
import { X, Sparkles, Loader2, CheckCircle, AlertCircle, ArrowDownToLine, Replace, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ExtractionPreview, FieldDecision, FieldDef, ReviewStep } from '@/hooks/useAIExtractionReview'

interface AIExtractionReviewModalProps {
  isOpen: boolean
  onClose: () => void
  step: ReviewStep
  preview: ExtractionPreview | null
  onApply: (decisions: FieldDecision[], approveBriefing: boolean) => void
  onCancel: () => void
}

// Field labels for display
const FIELD_LABELS: Record<string, string> = {
  destinos: 'Destinos',
  orcamento: 'Orçamento',
  epoca_viagem: 'Época da Viagem',
  data_exata_da_viagem: 'Data Exata',
  duracao_viagem: 'Duração',
  quantidade_viajantes: 'Viajantes',
  interesses: 'Interesses',
  tipo_hospedagem: 'Hospedagem',
  classe_voo: 'Classe do Voo',
  briefing: 'Briefing',
  observacoes: 'Observações',
  observacoes_criticas: 'Observações Críticas',
  observacoes_pos_venda: 'Observações Pós-Venda',
  acompanhantes: 'Acompanhantes',
  necessidades_especiais: 'Necessidades Especiais',
  restricoes_alimentares: 'Restrições Alimentares',
  seguro_viagem: 'Seguro Viagem',
  transfer: 'Transfer',
}

const TEXT_FIELDS = ['briefing', 'observacoes', 'observacoes_criticas', 'observacoes_pos_venda']
const ARRAY_FIELDS = ['destinos', 'interesses', 'acompanhantes']

function getFieldLabel(key: string, fields: FieldDef[]): string {
  const fieldDef = fields.find(f => f.key === key)
  return fieldDef?.label || FIELD_LABELS[key] || key
}

const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    // data_exata_da_viagem: { data_inicio: "2026-08-15", data_fim: "2026-08-30" }
    // Must check before mes_inicio/mes_fim since data_exata objects may also contain those fields
    if (obj.data_inicio && obj.data_fim) {
      const fmtDate = (d: unknown) => {
        if (typeof d !== 'string') return String(d)
        const [y, m, day] = d.split('-')
        return `${day}/${m}/${y}`
      }
      return `${fmtDate(obj.data_inicio)} a ${fmtDate(obj.data_fim)}`
    }
    // epoca_viagem: { mes: 7, ano: 2026 }
    if (obj.mes && obj.ano) {
      return `${MONTH_NAMES[Number(obj.mes)] || obj.mes}/${obj.ano}`
    }
    // epoca_viagem range: { mes_inicio: 6, mes_fim: 8, ano: 2026 }
    if (obj.mes_inicio && obj.mes_fim && obj.ano) {
      return `${MONTH_NAMES[Number(obj.mes_inicio)] || obj.mes_inicio} a ${MONTH_NAMES[Number(obj.mes_fim)] || obj.mes_fim}/${obj.ano}`
    }
    // smart_budget: { min: 80000, max: 100000 } or { min: 50000 }
    if (typeof obj.min === 'number') {
      if (typeof obj.max === 'number') {
        return `R$ ${Number(obj.min).toLocaleString('pt-BR')} a R$ ${Number(obj.max).toLocaleString('pt-BR')}`
      }
      return `a partir de R$ ${Number(obj.min).toLocaleString('pt-BR')}`
    }
    if (typeof obj.max === 'number') {
      return `até R$ ${Number(obj.max).toLocaleString('pt-BR')}`
    }
    if (obj.display) return String(obj.display)
    if (obj.tipo) return String(obj.display || obj.valor || obj.tipo)
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') {
    // Format currency for common money fields
    if (value >= 1000) return `R$ ${value.toLocaleString('pt-BR')}`
    return String(value)
  }
  return String(value)
}

interface FieldState {
  key: string
  accepted: boolean
  mergeMode: 'replace' | 'append'
  // For arrays: which items are checked
  arrayItems?: { value: string; checked: boolean }[]
}

export default function AIExtractionReviewModal({
  isOpen,
  onClose,
  step,
  preview,
  onApply,
  onCancel,
}: AIExtractionReviewModalProps) {
  const [approveBriefing, setApproveBriefing] = useState(true)

  // Build initial field states from preview
  const initialFieldStates = useMemo((): FieldState[] => {
    if (!preview) return []

    return Object.entries(preview.campos_extraidos).map(([key, value]) => {
      const isArray = ARRAY_FIELDS.includes(key) || Array.isArray(value)
      const isText = TEXT_FIELDS.includes(key)
      const currentValue = preview.campos_atuais[key]
      const hasCurrentValue = currentValue !== null && currentValue !== undefined && currentValue !== ''

      const state: FieldState = {
        key,
        accepted: true,
        mergeMode: (isArray || isText) && hasCurrentValue ? 'append' : 'replace',
      }

      if (isArray && Array.isArray(value)) {
        const currentArray = Array.isArray(currentValue) ? currentValue as string[] : []
        state.arrayItems = (value as string[]).map(item => {
          const isNew = !currentArray.some(c =>
            typeof c === 'string' && c.toLowerCase().trim() === (item as string).toLowerCase().trim()
          )
          return { value: String(item), checked: isNew } // new items checked, existing items unchecked (already in card)
        })
      }

      return state
    })
  }, [preview])

  const [fieldStates, setFieldStates] = useState<FieldState[]>(initialFieldStates)

  // Reset field states when preview changes
  useEffect(() => {
    setFieldStates(initialFieldStates)
    setApproveBriefing(true)
  }, [initialFieldStates])

  const toggleField = useCallback((key: string) => {
    setFieldStates(prev => prev.map(f =>
      f.key === key ? { ...f, accepted: !f.accepted } : f
    ))
  }, [])

  const toggleMergeMode = useCallback((key: string) => {
    setFieldStates(prev => prev.map(f =>
      f.key === key ? { ...f, mergeMode: f.mergeMode === 'append' ? 'replace' : 'append' } : f
    ))
  }, [])

  const toggleArrayItem = useCallback((fieldKey: string, itemValue: string) => {
    setFieldStates(prev => prev.map(f => {
      if (f.key !== fieldKey || !f.arrayItems) return f
      return {
        ...f,
        arrayItems: f.arrayItems.map(item =>
          item.value === itemValue ? { ...item, checked: !item.checked } : item
        )
      }
    }))
  }, [])

  const acceptAll = useCallback(() => {
    setFieldStates(prev => prev.map(f => ({
      ...f,
      accepted: true,
      arrayItems: f.arrayItems?.map(item => ({ ...item, checked: true }))
    })))
    setApproveBriefing(true)
  }, [])

  const acceptedCount = useMemo(() => {
    return fieldStates.filter(f => f.accepted).length + (approveBriefing && preview?.briefing_text ? 1 : 0)
  }, [fieldStates, approveBriefing, preview])

  const handleApply = useCallback(() => {
    if (!preview) return

    const decisions: FieldDecision[] = fieldStates.map(f => {
      let value: unknown = undefined

      // For arrays with item-level selection, build filtered value
      if (f.arrayItems) {
        const checkedItems = f.arrayItems.filter(item => item.checked).map(item => item.value)
        if (checkedItems.length === 0) {
          return { key: f.key, accepted: false, merge_mode: f.mergeMode }
        }
        value = checkedItems
      }

      return {
        key: f.key,
        accepted: f.accepted,
        merge_mode: f.mergeMode,
        ...(value !== undefined ? { value } : {})
      }
    })

    onApply(decisions, approveBriefing)
  }, [fieldStates, approveBriefing, preview, onApply])

  if (!isOpen) return null

  const isExtracting = step === 'extracting'
  const isReviewing = step === 'reviewing'
  const isApplying = step === 'applying'
  const isDone = step === 'done'
  const isError = step === 'error'

  const fields = preview?.field_config.fields || []
  const sourceLabel = preview?.source === 'whatsapp' ? 'conversa WhatsApp'
    : preview?.source === 'briefing_audio' ? 'áudio'
    : 'reunião'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-50 to-white border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-100 rounded-lg">
              <Sparkles className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Revisão da Extração IA</h3>
              <p className="text-xs text-slate-500">
                {isExtracting ? 'Julia analisando...' :
                 isReviewing ? `${Object.keys(preview?.campos_extraidos || {}).length} campos encontrados na ${sourceLabel}` :
                 isApplying ? 'Aplicando campos...' :
                 isDone ? 'Concluído' :
                 isError ? 'Erro' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isApplying}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              isApplying ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* Extracting */}
          {isExtracting && (
            <div className="flex flex-col items-center gap-4 py-12 px-5">
              <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-900">Julia está analisando...</p>
                <p className="text-xs text-slate-500 mt-1">Isso pode levar até 30 segundos</p>
              </div>
            </div>
          )}

          {/* Reviewing */}
          {isReviewing && preview && (
            <ScrollArea className="max-h-[60vh]">
              <div className="px-5 py-4 space-y-3">
                {/* Briefing text (if audio/meeting source) */}
                {preview.briefing_text && preview.briefing_text.length > 20 && (
                  <div className={cn(
                    'p-3 rounded-lg border transition-colors',
                    approveBriefing ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50 opacity-60'
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => setApproveBriefing(!approveBriefing)}
                        className="flex items-center gap-2 text-sm font-medium text-slate-900"
                      >
                        <div className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                          approveBriefing ? 'bg-green-500 border-green-500' : 'border-slate-300'
                        )}>
                          {approveBriefing && <Check className="h-3 w-3 text-white" />}
                        </div>
                        Briefing
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">
                      {preview.briefing_text}
                    </p>
                  </div>
                )}

                {/* Fields */}
                {fieldStates.map(fieldState => {
                  const currentValue = preview.campos_atuais[fieldState.key]
                  const newValue = preview.campos_extraidos[fieldState.key]
                  const isArray = !!fieldState.arrayItems
                  const isText = TEXT_FIELDS.includes(fieldState.key)
                  const hasCurrentValue = currentValue !== null && currentValue !== undefined && currentValue !== ''
                  const showMergeToggle = (isArray || isText) && hasCurrentValue

                  return (
                    <div
                      key={fieldState.key}
                      className={cn(
                        'p-3 rounded-lg border transition-colors',
                        fieldState.accepted ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50 opacity-60'
                      )}
                    >
                      {/* Field header */}
                      <div className="flex items-center justify-between mb-1.5">
                        <button
                          onClick={() => toggleField(fieldState.key)}
                          className="flex items-center gap-2 text-sm font-medium text-slate-900"
                        >
                          <div className={cn(
                            'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                            fieldState.accepted ? 'bg-green-500 border-green-500' : 'border-slate-300'
                          )}>
                            {fieldState.accepted && <Check className="h-3 w-3 text-white" />}
                          </div>
                          {getFieldLabel(fieldState.key, fields)}
                        </button>

                        {/* Merge mode toggle */}
                        {showMergeToggle && fieldState.accepted && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => { if (fieldState.mergeMode !== 'append') toggleMergeMode(fieldState.key) }}
                              className={cn(
                                'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                                fieldState.mergeMode === 'append'
                                  ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                                  : 'bg-white border-slate-200 text-slate-500'
                              )}
                            >
                              <ArrowDownToLine className="w-2.5 h-2.5" />
                              Adicionar
                            </button>
                            <button
                              onClick={() => { if (fieldState.mergeMode !== 'replace') toggleMergeMode(fieldState.key) }}
                              className={cn(
                                'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                                fieldState.mergeMode === 'replace'
                                  ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                                  : 'bg-white border-slate-200 text-slate-500'
                              )}
                            >
                              <Replace className="w-2.5 h-2.5" />
                              Substituir
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Current value */}
                      {hasCurrentValue && (
                        <p className="text-[11px] text-slate-400 mb-1">
                          Atual: {formatDisplayValue(currentValue)}
                        </p>
                      )}

                      {/* New value — array items as chips */}
                      {isArray && fieldState.arrayItems ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {fieldState.arrayItems.map(item => {
                            const isExisting = Array.isArray(currentValue) && (currentValue as string[]).some(
                              c => typeof c === 'string' && c.toLowerCase().trim() === item.value.toLowerCase().trim()
                            )
                            return (
                              <button
                                key={item.value}
                                onClick={() => !isExisting && toggleArrayItem(fieldState.key, item.value)}
                                disabled={!fieldState.accepted || isExisting}
                                className={cn(
                                  'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors',
                                  isExisting
                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-default'
                                    : item.checked
                                      ? 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200'
                                      : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 line-through',
                                  !fieldState.accepted && 'opacity-50'
                                )}
                              >
                                {isExisting ? (
                                  <span className="text-[10px] text-slate-400">atual</span>
                                ) : item.checked ? (
                                  <CheckCircle className="h-3 w-3" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                                {item.value}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-700">
                          {isText && typeof newValue === 'string' && newValue.length > 100
                            ? newValue.substring(0, 100) + '...'
                            : formatDisplayValue(newValue)
                          }
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}

          {/* Applying */}
          {isApplying && (
            <div className="flex flex-col items-center gap-4 py-12 px-5">
              <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-900">Aplicando campos...</p>
            </div>
          )}

          {/* Done */}
          {isDone && (
            <div className="flex flex-col items-center gap-3 py-12 px-5">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="text-sm font-medium text-slate-900">Campos atualizados!</p>
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="flex flex-col items-center gap-3 py-12 px-5">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm font-medium text-red-800">Erro ao processar</p>
              <p className="text-xs text-red-600">Tente novamente</p>
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
                disabled={acceptedCount === 0}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all',
                  acceptedCount > 0
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                )}
              >
                <Sparkles className="h-4 w-4" />
                Aplicar {acceptedCount > 0 ? `(${acceptedCount})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
