/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic field renderer handles arbitrary data shapes */
import React from 'react'
import {
    MapPin, Calendar, DollarSign, Tag, X, Check, Edit2, AlertCircle,
    Eraser, Type, Hash, CalendarDays, List, CheckSquare, Banknote, Clock
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/textarea'
import { Select } from '../ui/Select'
import { Checkbox } from '../ui/checkbox'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../database.types'
import FlexibleDateField, { type EpocaViagem } from '../pipeline/fields/FlexibleDateField'
import FlexibleDurationField, { type DuracaoViagem } from '../pipeline/fields/FlexibleDurationField'
import SmartBudgetField, { type OrcamentoViagem } from '../pipeline/fields/SmartBudgetField'
import { FieldLockButton } from '../card/FieldLockButton'
import { useFieldLock } from '../../hooks/useFieldLock'

type SystemField = Database['public']['Tables']['system_fields']['Row']

interface UniversalFieldRendererProps {
    field: Partial<SystemField>
    value: any
    onChange?: (value: any) => void
    mode?: 'display' | 'edit'
    status?: 'ok' | 'blocking' | 'attention'
    sdrValue?: any
    onEdit?: () => void
    correctionMode?: boolean
    isPlanner?: boolean // To show SDR section
    cardId?: string // ID do card para controle de lock
    showLockButton?: boolean // Mostrar botão de bloqueio de atualização automática
}

// --- HELPER FUNCTIONS ---
const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    // Handle simple date strings YYYY-MM-DD to avoid timezone issues
    const [year, month, day] = dateStr.split('-').map(Number)
    if (!year || !month || !day) return dateStr
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatBudget = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const LossReasonSelector = ({ value, onChange }: { value: any, onChange?: (val: any) => void }) => {
    const { data: reasons = [] } = useQuery({
        queryKey: ['loss-reasons', 'active'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('motivos_perda')
                .select('*')
                .eq('ativo', true)
                .order('nome')
            if (error) throw error
            return data
        }
    })

    return (
        <Select
            value={value || ''}
            onChange={(val) => onChange?.(val)}
            options={reasons.map(r => ({ value: r.id, label: r.nome }))}
            placeholder="Selecione o motivo..."
        />
    )
}

const LossReasonDisplay = ({ value }: { value: any }) => {
    const { data: reason } = useQuery({
        queryKey: ['loss-reason', value],
        queryFn: async () => {
            if (!value) return null
            const { data, error } = await supabase
                .from('motivos_perda')
                .select('nome')
                .eq('id', value)
                .single()
            if (error) return null
            return data
        },
        enabled: !!value
    })

    if (!value) return null
    return <>{reason?.nome || '...'}</>
}

// --- SUB-COMPONENTS ---

const FieldCard = ({
    icon: Icon,
    iconColor,
    label,
    value,
    subValue,
    status = 'ok',
    sdrValue,
    onEdit,
    correctionMode,
    showSdrSection,
    cardId,
    showLockButton,
    fieldKey,
    isLocked
}: any) => {
    return (
        <div
            className={cn(
                "group relative p-2.5 rounded-xl border transition-all duration-300",
                correctionMode
                    ? "bg-[#fdfbf7] border-amber-200/50 border-dashed hover:border-amber-300 hover:bg-[#fffdf9] cursor-pointer"
                    : cn(
                        "bg-white",
                        status === 'blocking' ? "border-red-300 bg-red-50/30" :
                            status === 'attention' ? "border-orange-300 bg-orange-50/30" :
                                isLocked ? "border-amber-200 bg-amber-50/20" :
                                    "border-gray-200",
                        "hover:shadow-md cursor-pointer hover:border-indigo-300"
                    )
            )}
            onClick={onEdit}
        >
            <div className={cn(
                "absolute top-2 right-2 flex items-center gap-1.5 transition-opacity duration-300",
                correctionMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}>
                {correctionMode ? (
                    <div className="flex items-center gap-1 text-amber-600 bg-amber-100 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm">
                        <Eraser className="h-3 w-3" /> Corrigir
                    </div>
                ) : (
                    <div className="p-1.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                    </div>
                )}
            </div>

            {status !== 'ok' && !correctionMode && (
                <div className={cn(
                    "absolute -top-2 -right-2 p-1 rounded-full shadow-sm border",
                    status === 'blocking' ? "bg-red-100 border-red-200 text-red-600" : "bg-orange-100 border-orange-200 text-orange-600"
                )}>
                    <AlertCircle className="h-3 w-3" />
                </div>
            )}

            <div className="flex items-start gap-3">
                <div className={cn(
                    "p-1.5 rounded-lg transition-colors shadow-sm",
                    correctionMode ? "bg-gray-100 text-gray-400 grayscale" : iconColor
                )}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                    <p className={cn(
                        "text-xs font-bold uppercase tracking-wide mb-1 flex items-center gap-2",
                        correctionMode ? "text-gray-400 font-mono" : "text-gray-500"
                    )}>
                        {label}
                        {status === 'blocking' && <span className="text-[10px] text-red-600 font-bold font-sans bg-red-50 px-1.5 py-0.5 rounded-full">Obrigatório</span>}
                        {/* Lock Button - Sempre visível ao lado do nome */}
                        {showLockButton && cardId && fieldKey && !correctionMode && (
                            <FieldLockButton
                                fieldKey={fieldKey}
                                cardId={cardId}
                                size="sm"
                            />
                        )}
                    </p>

                    {/* Main Value */}
                    <div className={cn(
                        "text-xs font-medium leading-relaxed break-words",
                        correctionMode ? "font-mono text-gray-700 font-medium" : "text-gray-900"
                    )}>
                        {(() => {
                            if (value === null || value === undefined || value === '') {
                                return status === 'blocking' ?
                                    <span className="text-red-500 italic font-medium font-sans">Obrigatório</span> :
                                    <span className="text-gray-400 italic font-normal font-sans">Não informado</span>
                            }
                            if (typeof value === 'object' && !React.isValidElement(value)) {
                                return JSON.stringify(value)
                            }
                            return value
                        })()}
                    </div>
                    {subValue && <p className="text-xs text-gray-500 mt-1 font-medium">{subValue}</p>}

                    {/* SDR Reference Section */}
                    {showSdrSection && (
                        <div className="mt-3 pt-2 border-t border-gray-100">
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-wider">
                                    Original SDR
                                </span>
                            </div>
                            <div className="text-xs text-gray-600 bg-gray-50/80 p-2 rounded-lg border border-gray-200/60">
                                {sdrValue || <span className="text-gray-400 italic">Não informado pelo SDR</span>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function UniversalFieldRenderer({
    field,
    value,
    onChange,
    mode = 'display',
    status = 'ok',
    sdrValue,
    onEdit,
    correctionMode = false,
    isPlanner = false,
    cardId,
    showLockButton = false
}: UniversalFieldRendererProps) {
    // Hook para verificar se o campo está bloqueado
    // O hook é seguro para chamar mesmo sem cardId (retorna valores padrão)
    const { isLocked: checkIsLocked } = useFieldLock(cardId || '')
    const isLocked = showLockButton && cardId ? checkIsLocked(field.key || '') : false

    // Parse options
    let options: any[] = []
    try {
        if (typeof field.options === 'string') {
            options = JSON.parse(field.options)
        } else if (Array.isArray(field.options)) {
            options = field.options
        }
    } catch (e) {
        console.error("Error parsing options for field", field.key, e)
        options = []
    }

    // --- EDIT MODE ---
    if (mode === 'edit') {
        // Special case: destinos field uses comma-separated text input
        if (field.key === 'destinos') {
            const destinos = Array.isArray(value) ? value : []
            const textValue = destinos.join(', ')

            return (
                <div className="space-y-3">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <MapPin className="h-4 w-4 text-gray-400" />
                        </div>
                        <Input
                            type="text"
                            defaultValue={textValue}
                            onBlur={(e) => {
                                const newDestinos = e.target.value
                                    .split(',')
                                    .map((s: string) => s.trim())
                                    .filter((s: string) => s.length > 0)
                                onChange?.(newDestinos)
                            }}
                            placeholder="Ex: Paris, Londres, Roma"
                            className="pl-10 bg-white border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
                        />
                    </div>
                    <p className="text-xs text-gray-500">
                        Separe os destinos por vírgula para identificá-los individualmente.
                    </p>
                </div>
            )
        }

        switch (field.type) {
            case 'textarea':
                return (
                    <Textarea
                        value={value || ''}
                        onChange={(e) => onChange?.(e.target.value)}
                        className="min-h-[60px] bg-white border border-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 transition-colors"
                        placeholder={field.label || ''}
                    />
                )
            case 'select':
                return (
                    <Select
                        value={value || ''}
                        onChange={(val) => onChange?.(val)}
                        options={options.map((opt: any) => ({
                            value: typeof opt === 'object' ? opt.value : opt,
                            label: typeof opt === 'object' ? opt.label : opt
                        }))}
                        placeholder="Selecione..."
                    />
                )
            case 'multiselect': {
                // Support for value structure with explanations: { selected: [...], explanations: {...} }
                // Backward compatible with old structure: [...]
                const hasExplanations = options.some((opt: any) => opt.requiresExplanation)

                let selectedValues: string[] = []
                let explanations: Record<string, string> = {}

                if (hasExplanations && typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    selectedValues = Array.isArray(value.selected) ? value.selected : []
                    explanations = value.explanations || {}
                } else {
                    selectedValues = Array.isArray(value) ? value : (value ? [value] : [])
                }

                const updateValue = (newSelected: string[], newExplanations: Record<string, string>) => {
                    if (hasExplanations) {
                        onChange?.({ selected: newSelected, explanations: newExplanations })
                    } else {
                        onChange?.(newSelected)
                    }
                }

                return (
                    <div className="space-y-3">
                        {/* Premium Chip Grid - No internal scroll */}
                        <div className="flex flex-wrap gap-2 p-3 bg-gray-50/80 rounded-lg border border-gray-100">
                            {options.map((opt: any, idx: number) => {
                                const optValue = typeof opt === 'object' ? opt.value : opt
                                const optLabel = typeof opt === 'object' ? opt.label : opt
                                const optColor = typeof opt === 'object' ? opt.color : 'gray'
                                const requiresExplanation = typeof opt === 'object' ? opt.requiresExplanation : false
                                const isSelected = selectedValues.includes(optValue)

                                // Color mapping for chips
                                const colorClasses: Record<string, { bg: string, text: string, selectedBg: string, selectedText: string }> = {
                                    gray: { bg: 'bg-gray-100', text: 'text-gray-700', selectedBg: 'bg-gray-600', selectedText: 'text-white' },
                                    blue: { bg: 'bg-blue-50', text: 'text-blue-700', selectedBg: 'bg-blue-600', selectedText: 'text-white' },
                                    green: { bg: 'bg-green-50', text: 'text-green-700', selectedBg: 'bg-green-600', selectedText: 'text-white' },
                                    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', selectedBg: 'bg-yellow-500', selectedText: 'text-white' },
                                    red: { bg: 'bg-red-50', text: 'text-red-700', selectedBg: 'bg-red-600', selectedText: 'text-white' },
                                    purple: { bg: 'bg-purple-50', text: 'text-purple-700', selectedBg: 'bg-purple-600', selectedText: 'text-white' },
                                    pink: { bg: 'bg-pink-50', text: 'text-pink-700', selectedBg: 'bg-pink-600', selectedText: 'text-white' },
                                }
                                const colors = colorClasses[optColor] || colorClasses.gray

                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => {
                                            const newExplanations = { ...explanations }
                                            let newSelected: string[]

                                            if (isSelected) {
                                                newSelected = selectedValues.filter((v: string) => v !== optValue)
                                                delete newExplanations[optValue]
                                            } else {
                                                newSelected = [...selectedValues, optValue]
                                            }
                                            updateValue(newSelected, newExplanations)
                                        }}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
                                            "border-2 hover:scale-105 active:scale-95",
                                            isSelected
                                                ? `${colors.selectedBg} ${colors.selectedText} border-transparent shadow-sm`
                                                : `${colors.bg} ${colors.text} border-transparent hover:border-gray-300`
                                        )}
                                    >
                                        {isSelected && <Check className="h-3.5 w-3.5" />}
                                        {optLabel}
                                        {requiresExplanation && !isSelected && (
                                            <span className="text-[10px] opacity-60">💬</span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Explanation Textareas for selected items that require it */}
                        {selectedValues.some(val =>
                            options.find((opt: any) => (typeof opt === 'object' ? opt.value : opt) === val)?.requiresExplanation
                        ) && (
                                <div className="space-y-3 pt-2 border-t border-gray-200">
                                    <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                                        💬 Justifique suas seleções:
                                    </p>
                                    {selectedValues.map((val: string) => {
                                        const opt = options.find((o: any) => (typeof o === 'object' ? o.value : o) === val)
                                        if (!opt?.requiresExplanation) return null

                                        const optLabel = typeof opt === 'object' ? opt.label : opt

                                        return (
                                            <div key={val} className="animate-in slide-in-from-top-2 duration-200">
                                                <label className="block text-xs font-medium text-gray-700 mb-0.5">
                                                    {optLabel}
                                                </label>
                                                <Textarea
                                                    value={explanations[val] || ''}
                                                    onChange={(e) => {
                                                        const newExplanations = { ...explanations, [val]: e.target.value }
                                                        updateValue(selectedValues, newExplanations)
                                                    }}
                                                    placeholder={`Por que "${optLabel}"?`}
                                                    className="min-h-[70px] bg-amber-50/50 border-amber-200 focus:border-amber-500 focus:ring-amber-500"
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                    </div>
                )
            }
            case 'checklist': {
                // Support for new value structure: { selected: [...], explanations: {...} }
                // Backward compatible with old structure: [...]
                const hasExplanations = options.some((opt: any) => opt.requiresExplanation)

                let checkedValues: string[] = []
                let explanations: Record<string, string> = {}

                if (hasExplanations && typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    checkedValues = Array.isArray(value.selected) ? value.selected : []
                    explanations = value.explanations || {}
                } else {
                    checkedValues = Array.isArray(value) ? value : (value ? [value] : [])
                }

                const updateValue = (newSelected: string[], newExplanations: Record<string, string>) => {
                    if (hasExplanations) {
                        onChange?.({ selected: newSelected, explanations: newExplanations })
                    } else {
                        onChange?.(newSelected)
                    }
                }

                return (
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Marque os itens aplicáveis:</label>
                        <div className="space-y-2 bg-gray-50/50 p-3 rounded-lg border border-gray-200">
                            {options.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">Nenhuma opção configurada.</p>
                            ) : (
                                options.map((opt: any, idx: number) => {
                                    const optValue = typeof opt === 'object' ? opt.value : opt
                                    const optLabel = typeof opt === 'object' ? opt.label : opt
                                    const requiresExplanation = typeof opt === 'object' ? opt.requiresExplanation : false
                                    const isChecked = checkedValues.includes(optValue)

                                    return (
                                        <div key={idx} className="space-y-2">
                                            <label
                                                className={cn(
                                                    "flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors",
                                                    isChecked ? "bg-green-50 border border-green-200" : "bg-white border border-gray-100 hover:bg-gray-50"
                                                )}
                                            >
                                                <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={() => {
                                                        const newExplanations = { ...explanations }
                                                        let newSelected: string[]

                                                        if (isChecked) {
                                                            newSelected = checkedValues.filter((v: string) => v !== optValue)
                                                            delete newExplanations[optValue]
                                                        } else {
                                                            newSelected = [...checkedValues, optValue]
                                                        }
                                                        updateValue(newSelected, newExplanations)
                                                    }}
                                                />
                                                <span className={cn(
                                                    "text-xs font-medium flex-1",
                                                    isChecked ? "text-green-800" : "text-gray-700"
                                                )}>
                                                    {optLabel}
                                                </span>
                                                {requiresExplanation && (
                                                    <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                                        Porquê?
                                                    </span>
                                                )}
                                            </label>

                                            {/* Explanation textarea for options that require it */}
                                            {isChecked && requiresExplanation && (
                                                <div className="ml-7 animate-in slide-in-from-top-2 duration-200">
                                                    <Textarea
                                                        value={explanations[optValue] || ''}
                                                        onChange={(e) => {
                                                            const newExplanations = { ...explanations, [optValue]: e.target.value }
                                                            updateValue(checkedValues, newExplanations)
                                                        }}
                                                        placeholder="Explique o motivo..."
                                                        className="min-h-[80px] bg-amber-50/50 border-amber-200 focus:border-amber-500 focus:ring-amber-500"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                )
            }
            case 'boolean':
                return (
                    <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                        <Checkbox
                            checked={!!value}
                            onCheckedChange={(checked) => onChange?.(!!checked)}
                        />
                        <span className="text-xs font-medium text-gray-900">{field.label}</span>
                    </div>
                )
            case 'date':
                return (
                    <Input
                        type="date"
                        value={value || ''}
                        onChange={(e) => onChange?.(e.target.value)}
                    />
                )
            case 'datetime': {
                // Handle various datetime string formats from integrations
                // Convert "YYYY-MM-DD HH:MM:SS" to "YYYY-MM-DDTHH:MM" for input
                const normalizedDatetime = (() => {
                    if (!value) return ''
                    // Already in ISO format with T
                    if (value.includes('T')) return value.slice(0, 16)
                    // Format: "YYYY-MM-DD HH:MM:SS" (from AC)
                    if (value.includes(' ')) return value.replace(' ', 'T').slice(0, 16)
                    return value
                })()
                return (
                    <Input
                        type="datetime-local"
                        value={normalizedDatetime}
                        onChange={(e) => onChange?.(e.target.value)}
                    />
                )
            }
            case 'date_range': {
                const rangeValue = typeof value === 'object' ? value : { start: '', end: '' }
                // Check if field options has includeTime flag
                const fieldOpts = typeof field.options === 'object' && !Array.isArray(field.options) ? field.options : {}
                const includeTime = (fieldOpts as any)?.includeTime || false
                const inputType = includeTime ? 'datetime-local' : 'date'

                return (
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-500 mb-0.5 block">{includeTime ? 'Data/Hora Início' : 'Início'}</label>
                            <Input
                                type={inputType}
                                value={rangeValue?.start || ''}
                                onChange={(e) => onChange?.({ ...rangeValue, start: e.target.value })}
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-medium text-gray-500 mb-0.5 block">{includeTime ? 'Data/Hora Fim' : 'Fim'}</label>
                            <Input
                                type={inputType}
                                value={rangeValue?.end || ''}
                                onChange={(e) => onChange?.({ ...rangeValue, end: e.target.value })}
                            />
                        </div>
                    </div>
                )
            }
            case 'currency':
                return (
                    <div>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                            <Input
                                type="number"
                                value={value || ''}
                                onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
                                className="pl-12 text-xs font-semibold"
                                placeholder="0,00"
                            />
                        </div>
                    </div>
                )
            case 'currency_range': {
                const currencyRangeValue = typeof value === 'object' ? value : { min: '', max: '' }
                return (
                    <div className="space-y-3">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Faixa de Valor</label>
                        <div className="flex gap-3 items-center">
                            <div className="flex-1">
                                <label className="text-xs font-medium text-gray-500 mb-0.5 block">Mínimo</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-medium">R$</span>
                                    <Input
                                        type="number"
                                        value={currencyRangeValue?.min ?? ''}
                                        onChange={(e) => onChange?.({ ...currencyRangeValue, min: parseFloat(e.target.value) || 0 })}
                                        className="pl-10"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <span className="text-gray-400 font-medium mt-5">até</span>
                            <div className="flex-1">
                                <label className="text-xs font-medium text-gray-500 mb-0.5 block">Máximo</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-medium">R$</span>
                                    <Input
                                        type="number"
                                        value={currencyRangeValue?.max ?? ''}
                                        onChange={(e) => onChange?.({ ...currencyRangeValue, max: parseFloat(e.target.value) || 0 })}
                                        className="pl-10"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
            case 'json':
                return (
                    <Textarea
                        value={typeof value === 'object' ? JSON.stringify(value, null, 2) : (value || '')}
                        onChange={(e) => {
                            try {
                                const parsed = JSON.parse(e.target.value)
                                onChange?.(parsed)
                            } catch {
                                onChange?.(e.target.value)
                            }
                        }}
                        className="font-mono min-h-[80px]"
                        placeholder="{}"
                    />
                )
            case 'loss_reason_selector':
                return <LossReasonSelector value={value} onChange={onChange} />
            case 'flexible_date':
                return (
                    <FlexibleDateField
                        label={field.label || ''}
                        value={value}
                        onChange={onChange}
                    />
                )
            case 'flexible_duration':
                return (
                    <FlexibleDurationField
                        label={field.label || ''}
                        value={value}
                        onChange={onChange}
                    />
                )
            case 'smart_budget':
                return (
                    <SmartBudgetField
                        label={field.label || ''}
                        value={value}
                        onChange={onChange}
                    />
                )
            default: // text, number
                return (
                    <Input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={value || ''}
                        onChange={(e) => onChange?.(e.target.value)}
                        placeholder={field.label || ''}
                    />
                )
        }
    }

    // --- DISPLAY MODE (Card) ---

    // 1. Specialized Fields
    if (field.key === 'motivo') {
        return <FieldCard icon={Tag} iconColor="bg-purple-100 text-purple-600" label={field.label} value={value} status={status} sdrValue={sdrValue} onEdit={onEdit} correctionMode={correctionMode} showSdrSection={isPlanner} cardId={cardId} showLockButton={showLockButton} fieldKey={field.key} isLocked={isLocked} />
    }
    if (field.key === 'destinos') {
        return <FieldCard icon={MapPin} iconColor="bg-blue-100 text-blue-600" label={field.label} value={Array.isArray(value) ? value.join(' • ') : value} status={status} sdrValue={Array.isArray(sdrValue) ? sdrValue.join(' • ') : sdrValue} onEdit={onEdit} correctionMode={correctionMode} showSdrSection={isPlanner} cardId={cardId} showLockButton={showLockButton} fieldKey={field.key} isLocked={isLocked} />
    }
    // Skip if using new flexible_date type (handled below)
    if ((field.type === 'date_range' || field.key === 'epoca_viagem') && field.type !== 'flexible_date') {
        // Handle all date range formats: {start, end}, {inicio, fim}, or raw string
        let startStr = ''
        let endStr = ''
        let isFlexible = false

        if (value) {
            if (typeof value === 'object') {
                startStr = value.start || value.inicio
                endStr = value.end || value.fim
                isFlexible = value.flexivel
            } else if (typeof value === 'string') {
                // Try to parse raw string if it looks like a date
                // Match "YYYY-MM-DD... até YYYY-MM-DD..." or just "YYYY-MM-DD"
                const rangeMatch = value.match(/^(\d{4}-\d{2}-\d{2}).*?até\s+(\d{4}-\d{2}-\d{2})/)
                const singleMatch = value.match(/^(\d{4}-\d{2}-\d{2})/)

                if (rangeMatch) {
                    startStr = rangeMatch[1]
                    endStr = rangeMatch[2]
                } else if (singleMatch) {
                    startStr = singleMatch[1]
                }
            }
        }

        const displayVal = startStr ? (
            <>
                {formatDate(startStr)}
                {endStr && ` até ${formatDate(endStr)}`}
            </>
        ) : (typeof value === 'string' ? value : undefined) // Fallback to raw string if parsing failed but it has content

        const subVal = isFlexible ? '📌 Datas flexíveis' : undefined

        // SDR Value Parsing
        let sdrDisplay = undefined
        if (sdrValue) {
            if (typeof sdrValue === 'object') {
                const sStart = sdrValue.start || sdrValue.inicio
                if (sStart) sdrDisplay = formatDate(sStart)
            } else if (typeof sdrValue === 'string' && sdrValue.match(/^\d{4}-\d{2}-\d{2}/)) {
                sdrDisplay = formatDate(sdrValue)
            }
        }

        return <FieldCard icon={Calendar} iconColor="bg-orange-100 text-orange-600" label={field.label} value={displayVal} subValue={subVal} status={status} sdrValue={sdrDisplay} onEdit={onEdit} correctionMode={correctionMode} showSdrSection={isPlanner} cardId={cardId} showLockButton={showLockButton} fieldKey={field.key} isLocked={isLocked} />
    }
    // Skip if using new smart_budget type (handled below)
    if (field.key === 'orcamento' && field.type !== 'smart_budget') {
        const displayVal = value?.total ? formatBudget(value.total) : undefined
        const subVal = value?.por_pessoa ? `${formatBudget(value.por_pessoa)} por pessoa` : undefined
        const sdrDisplay = sdrValue?.total ? formatBudget(sdrValue.total) : undefined

        return <FieldCard icon={DollarSign} iconColor="bg-green-100 text-green-600" label={field.label} value={displayVal} subValue={subVal} status={status} sdrValue={sdrDisplay} onEdit={onEdit} correctionMode={correctionMode} showSdrSection={isPlanner} cardId={cardId} showLockButton={showLockButton} fieldKey={field.key} isLocked={isLocked} />
    }
    if (field.key === 'taxa_planejamento') {
        const displayValue = value === 'Cortesia' ? 'Cortesia' : (typeof value === 'number' ? formatBudget(value) : value)
        const sdrDisplay = sdrValue === 'Cortesia' ? 'Cortesia' : (typeof sdrValue === 'number' ? formatBudget(sdrValue) : sdrValue)

        return <FieldCard icon={Banknote} iconColor="bg-emerald-100 text-emerald-600" label={field.label} value={displayValue} status={status} sdrValue={sdrDisplay} onEdit={onEdit} correctionMode={correctionMode} showSdrSection={isPlanner} cardId={cardId} showLockButton={showLockButton} fieldKey={field.key} isLocked={isLocked} />
    }
    if (field.type === 'loss_reason_selector') {
        return <FieldCard icon={Tag} iconColor="bg-red-100 text-red-600" label={field.label} value={<LossReasonDisplay value={value} />} status={status} sdrValue={sdrValue} onEdit={onEdit} correctionMode={correctionMode} showSdrSection={isPlanner} cardId={cardId} showLockButton={showLockButton} fieldKey={field.key} isLocked={isLocked} />
    }

    // New Flexible Field Types
    if (field.type === 'flexible_date') {
        const epocaValue = value as EpocaViagem | null
        const displayVal = epocaValue?.display || null
        const subVal = epocaValue?.flexivel ? '📌 Datas flexíveis' : undefined
        const sdrEpoca = sdrValue as EpocaViagem | null
        const sdrDisplay = sdrEpoca?.display || undefined

        return <FieldCard icon={Calendar} iconColor="bg-orange-100 text-orange-600" label={field.label} value={displayVal} subValue={subVal} status={status} sdrValue={sdrDisplay} onEdit={onEdit} correctionMode={correctionMode} showSdrSection={isPlanner} cardId={cardId} showLockButton={showLockButton} fieldKey={field.key} isLocked={isLocked} />
    }

    if (field.type === 'flexible_duration') {
        const duracaoValue = value as DuracaoViagem | null
        const displayVal = duracaoValue?.display || null
        const sdrDuracao = sdrValue as DuracaoViagem | null
        const sdrDisplay = sdrDuracao?.display || undefined

        return <FieldCard icon={Clock} iconColor="bg-purple-100 text-purple-600" label={field.label} value={displayVal} status={status} sdrValue={sdrDisplay} onEdit={onEdit} correctionMode={correctionMode} showSdrSection={isPlanner} cardId={cardId} showLockButton={showLockButton} fieldKey={field.key} isLocked={isLocked} />
    }

    if (field.type === 'smart_budget') {
        const orcamentoValue = value as OrcamentoViagem | null
        const displayVal = orcamentoValue?.display || null
        const sdrOrcamento = sdrValue as OrcamentoViagem | null
        const sdrDisplay = sdrOrcamento?.display || undefined

        return <FieldCard icon={DollarSign} iconColor="bg-green-100 text-green-600" label={field.label} value={displayVal} status={status} sdrValue={sdrDisplay} onEdit={onEdit} correctionMode={correctionMode} showSdrSection={isPlanner} cardId={cardId} showLockButton={showLockButton} fieldKey={field.key} isLocked={isLocked} />
    }

    // 2. Generic Fields
    let GenericIcon = Type
    let genericColor = "bg-gray-100 text-gray-600"
    let displayValue = value
    let sdrDisplayValue = sdrValue

    if (field.type === 'number') {
        GenericIcon = Hash
        genericColor = "bg-gray-100 text-gray-600"
    }
    if (field.type === 'currency') {
        GenericIcon = DollarSign
        genericColor = "bg-emerald-100 text-emerald-600"
        if (typeof displayValue === 'number') displayValue = formatBudget(displayValue)
        if (typeof sdrDisplayValue === 'number') sdrDisplayValue = formatBudget(sdrDisplayValue)
    }
    if (field.type === 'currency_range') {
        GenericIcon = DollarSign
        genericColor = "bg-emerald-100 text-emerald-600"
        if (typeof displayValue === 'object' && (displayValue?.min !== undefined || displayValue?.max !== undefined)) {
            const minVal = displayValue.min !== undefined ? formatBudget(displayValue.min) : '?'
            const maxVal = displayValue.max !== undefined ? formatBudget(displayValue.max) : '?'
            displayValue = `${minVal} — ${maxVal}`
        } else {
            displayValue = undefined
        }
        if (typeof sdrDisplayValue === 'object' && (sdrDisplayValue?.min !== undefined || sdrDisplayValue?.max !== undefined)) {
            const minVal = sdrDisplayValue.min !== undefined ? formatBudget(sdrDisplayValue.min) : '?'
            const maxVal = sdrDisplayValue.max !== undefined ? formatBudget(sdrDisplayValue.max) : '?'
            sdrDisplayValue = `${minVal} — ${maxVal}`
        }
    }
    if (field.type === 'date') {
        GenericIcon = CalendarDays
        genericColor = "bg-orange-100 text-orange-600"
        if (typeof displayValue === 'string') displayValue = formatDate(displayValue)
        if (typeof sdrDisplayValue === 'string') sdrDisplayValue = formatDate(sdrDisplayValue)
    }
    if (field.type === 'datetime') {
        GenericIcon = CalendarDays
        genericColor = "bg-orange-100 text-orange-600"
        // Format datetime string "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM"
        const formatDateTime = (str: string) => {
            if (!str) return ''
            // Normalize the string - replace space with T if needed
            const normalized = str.includes('T') ? str : str.replace(' ', 'T')
            const [datePart, timePart] = normalized.split('T')
            const formattedDate = formatDate(datePart)
            const formattedTime = timePart ? ` às ${timePart.substring(0, 5)}` : ''
            return formattedDate + formattedTime
        }
        if (typeof displayValue === 'string') displayValue = formatDateTime(displayValue)
        if (typeof sdrDisplayValue === 'string') sdrDisplayValue = formatDateTime(sdrDisplayValue)
    }
    if (field.type === 'date_range') {
        GenericIcon = CalendarDays
        genericColor = "bg-orange-100 text-orange-600"

        // Check if field has includeTime option
        const fieldOpts = typeof field.options === 'object' && !Array.isArray(field.options) ? field.options : {}
        const includeTime = (fieldOpts as any)?.includeTime || false

        const formatDateTime = (str: string) => {
            if (!str) return ''
            // Check if it's a datetime-local string (contains T)
            if (str.includes('T') && includeTime) {
                const [datePart, timePart] = str.split('T')
                const formattedDate = formatDate(datePart)
                const formattedTime = timePart ? ` às ${timePart.substring(0, 5)}` : ''
                return formattedDate + formattedTime
            }
            return formatDate(str)
        }

        if (typeof displayValue === 'object' && displayValue?.start && displayValue?.end) {
            displayValue = `${formatDateTime(displayValue.start)} — ${formatDateTime(displayValue.end)}`
        } else if (typeof displayValue === 'object' && displayValue?.start) {
            displayValue = formatDateTime(displayValue.start)
        } else {
            displayValue = undefined
        }

        if (typeof sdrDisplayValue === 'object' && sdrDisplayValue?.start && sdrDisplayValue?.end) {
            sdrDisplayValue = `${formatDateTime(sdrDisplayValue.start)} — ${formatDateTime(sdrDisplayValue.end)}`
        }
    }
    if (field.type === 'select') {
        GenericIcon = List
        genericColor = "bg-indigo-100 text-indigo-600"
    }
    if (field.type === 'multiselect') {
        GenericIcon = List
        genericColor = "bg-indigo-100 text-indigo-600"
        if (Array.isArray(displayValue)) displayValue = displayValue.join(' • ')
        if (Array.isArray(sdrDisplayValue)) sdrDisplayValue = sdrDisplayValue.join(' • ')
    }
    if (field.type === 'checklist') {
        // Checklist needs custom rendering - show actual items with check/uncheck status
        // Support for new value structure: { selected: [...], explanations: {...} }
        const hasExplanations = options.some((opt: any) => opt.requiresExplanation)

        let checkedValues: string[] = []
        let explanations: Record<string, string> = {}

        if (hasExplanations && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            checkedValues = Array.isArray(value.selected) ? value.selected : []
            explanations = value.explanations || {}
        } else {
            checkedValues = Array.isArray(value) ? value : (value ? [value] : [])
        }

        return (
            <div
                className={cn(
                    "group relative p-2.5 rounded-xl border transition-all duration-200 bg-white",
                    "border-gray-300 hover:shadow-md cursor-pointer hover:border-indigo-400"
                )}
                onClick={onEdit}
            >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Edit2 className="h-3.5 w-3.5 text-indigo-500" />
                </div>

                <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-green-100 text-green-600">
                        <CheckSquare className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide mb-1 text-gray-500">
                            {field.label}
                        </p>

                        {/* Render each checklist item */}
                        <div className="space-y-1.5">
                            {options.length === 0 ? (
                                <span className="text-gray-400 italic text-xs">Nenhum item configurado</span>
                            ) : (
                                options.map((opt: any, idx: number) => {
                                    const optValue = typeof opt === 'object' ? opt.value : opt
                                    const optLabel = typeof opt === 'object' ? opt.label : opt
                                    const requiresExplanation = typeof opt === 'object' ? opt.requiresExplanation : false
                                    const isChecked = checkedValues.includes(optValue)
                                    const explanation = explanations[optValue]

                                    return (
                                        <div key={idx} className="space-y-1">
                                            <div
                                                className={cn(
                                                    "flex items-center gap-2 px-2 py-1 rounded-md text-xs",
                                                    isChecked
                                                        ? "bg-green-50 text-green-800"
                                                        : "bg-gray-50 text-gray-500"
                                                )}
                                            >
                                                {isChecked ? (
                                                    <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                                ) : (
                                                    <X className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                                )}
                                                <span className={isChecked ? "font-medium" : ""}>{optLabel}</span>
                                                {isChecked && requiresExplanation && explanation && (
                                                    <span className="ml-auto text-xs text-amber-600">📝</span>
                                                )}
                                            </div>
                                            {/* Show explanation if exists */}
                                            {isChecked && requiresExplanation && explanation && (
                                                <div className="ml-6 px-3 py-2 bg-amber-50 border border-amber-100 rounded-md">
                                                    <p className="text-xs text-amber-800 italic">{explanation}</p>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    }
    if (field.type === 'boolean') {
        GenericIcon = CheckSquare
        genericColor = "bg-teal-100 text-teal-600"
        displayValue = displayValue === true ? 'Sim' : (displayValue === false ? 'Não' : undefined)
        sdrDisplayValue = sdrDisplayValue === true ? 'Sim' : (sdrDisplayValue === false ? 'Não' : undefined)
    }
    if (field.type === 'json') {
        GenericIcon = Type
        genericColor = "bg-gray-100 text-gray-600"
        if (typeof displayValue === 'object') displayValue = JSON.stringify(displayValue)
    }

    return (
        <FieldCard
            icon={GenericIcon}
            iconColor={genericColor}
            label={field.label}
            value={displayValue}
            status={status}
            sdrValue={sdrDisplayValue}
            onEdit={onEdit}
            correctionMode={correctionMode}
            showSdrSection={isPlanner}
            cardId={cardId}
            showLockButton={showLockButton}
            fieldKey={field.key}
            isLocked={isLocked}
        />
    )
}
