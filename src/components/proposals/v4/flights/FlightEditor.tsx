/**
 * FlightEditor - Editor SIMPLES de voos
 *
 * Princípios UX:
 * - Tudo visível (sem collapso)
 * - Uma linha por voo
 * - Click para editar
 * - Sem totais ou cálculos confusos
 * - Visual limpo e escaneável
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { Plus, Star, Trash2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type FlightsData, type FlightLeg, type FlightOption, AIRLINES } from './types'
import { FlightImageExtractor } from './FlightImageExtractor'

interface FlightEditorProps {
    data: FlightsData | null
    onChange: (data: FlightsData) => void
}

// Estado inicial
const createInitialData = (): FlightsData => ({
    legs: [
        {
            id: `leg-${Date.now()}-ida`,
            leg_type: 'outbound',
            label: 'IDA',
            origin_code: '',
            origin_city: '',
            destination_code: '',
            destination_city: '',
            date: '',
            options: [],
            ordem: 0,
            is_expanded: true
        },
        {
            id: `leg-${Date.now()}-volta`,
            leg_type: 'return',
            label: 'VOLTA',
            origin_code: '',
            origin_city: '',
            destination_code: '',
            destination_city: '',
            date: '',
            options: [],
            ordem: 1,
            is_expanded: true
        }
    ],
    show_prices: true,
    allow_mix_airlines: true,
    default_selections: {}
})

export function FlightEditor({ data, onChange }: FlightEditorProps) {
    // Memoize initial data to avoid recreating on every render
    const initialData = useMemo(() => createInitialData(), [])
    const flightsData = data?.legs?.length ? data : initialData

    // Persist initial data if none exists - ensures flights are saved even before user edits
    useEffect(() => {
        if (!data?.legs?.length) {
            onChange(initialData)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Run only on mount - intentionally ignoring deps to avoid infinite loops
    const [showAIExtractor, setShowAIExtractor] = useState(false)

    // Callback quando IA extrai trechos
    const handleExtractedLegs = useCallback((extractedLegs: FlightLeg[]) => {
        if (extractedLegs.length === 0) return

        // Se os legs atuais estão vazios (sem opções), substituir
        const currentLegsEmpty = flightsData.legs.every(leg =>
            (leg.options || []).length === 0 &&
            !leg.origin_code &&
            !leg.destination_code
        )

        if (currentLegsEmpty) {
            // Substituir todos os legs
            onChange({
                ...flightsData,
                legs: extractedLegs.map((leg, i) => ({
                    ...leg,
                    ordem: i
                }))
            })
        } else {
            // Adicionar aos legs existentes
            onChange({
                ...flightsData,
                legs: [
                    ...flightsData.legs,
                    ...extractedLegs.map((leg, i) => ({
                        ...leg,
                        ordem: flightsData.legs.length + i
                    }))
                ]
            })
        }

        setShowAIExtractor(false)
    }, [flightsData, onChange])

    // Atualizar leg
    const updateLeg = useCallback((legId: string, updates: Partial<FlightLeg>) => {
        onChange({
            ...flightsData,
            legs: flightsData.legs.map(leg =>
                leg.id === legId ? { ...leg, ...updates } : leg
            )
        })
    }, [flightsData, onChange])

    // Remover leg
    const removeLeg = useCallback((legId: string) => {
        onChange({
            ...flightsData,
            legs: flightsData.legs.filter(leg => leg.id !== legId)
        })
    }, [flightsData, onChange])

    // Adicionar leg
    const addLeg = useCallback(() => {
        const newLeg: FlightLeg = {
            id: `leg-${Date.now()}`,
            leg_type: 'connection',
            label: 'TRECHO',
            origin_code: '',
            origin_city: '',
            destination_code: '',
            destination_city: '',
            date: '',
            options: [],
            ordem: flightsData.legs.length,
            is_expanded: true
        }
        onChange({
            ...flightsData,
            legs: [...flightsData.legs, newLeg]
        })
    }, [flightsData, onChange])

    // Adicionar opção a um leg
    const addOption = useCallback((legId: string) => {
        const leg = flightsData.legs.find(l => l.id === legId)
        if (!leg) return

        const legOptions = leg.options || []
        const newOption: FlightOption = {
            id: `opt-${Date.now()}`,
            airline_code: 'G3',
            airline_name: 'GOL',
            flight_number: '',
            departure_time: '',
            arrival_time: '',
            cabin_class: 'economy',
            fare_family: 'light',
            equipment: '',
            stops: 0,
            baggage: '',
            price: 0,
            currency: 'BRL',
            is_recommended: legOptions.length === 0,
            enabled: true,
            ordem: legOptions.length
        }

        updateLeg(legId, { options: [...legOptions, newOption] })
    }, [flightsData.legs, updateLeg])

    // Atualizar opção
    const updateOption = useCallback((legId: string, optionId: string, updates: Partial<FlightOption>) => {
        const leg = flightsData.legs.find(l => l.id === legId)
        if (!leg) return

        updateLeg(legId, {
            options: (leg.options || []).map(opt =>
                opt.id === optionId ? { ...opt, ...updates } : opt
            )
        })
    }, [flightsData.legs, updateLeg])

    // Remover opção
    const removeOption = useCallback((legId: string, optionId: string) => {
        const leg = flightsData.legs.find(l => l.id === legId)
        if (!leg) return

        updateLeg(legId, {
            options: (leg.options || []).filter(opt => opt.id !== optionId)
        })
    }, [flightsData.legs, updateLeg])

    // Marcar como recomendado
    const setRecommended = useCallback((legId: string, optionId: string) => {
        const leg = flightsData.legs.find(l => l.id === legId)
        if (!leg) return

        updateLeg(legId, {
            options: (leg.options || []).map(opt => ({
                ...opt,
                is_recommended: opt.id === optionId
            }))
        })
    }, [flightsData.legs, updateLeg])

    return (
        <div className="space-y-6">
            {/* Lista de Trechos */}
            {flightsData.legs.map((leg, index) => (
                <LegBlock
                    key={leg.id}
                    leg={leg}
                    isFirst={index === 0}
                    onUpdate={(updates) => updateLeg(leg.id, updates)}
                    onRemove={() => removeLeg(leg.id)}
                    onAddOption={() => addOption(leg.id)}
                    onUpdateOption={(optId, updates) => updateOption(leg.id, optId, updates)}
                    onRemoveOption={(optId) => removeOption(leg.id, optId)}
                    onSetRecommended={(optId) => setRecommended(leg.id, optId)}
                />
            ))}

            {/* AI Extractor */}
            {showAIExtractor && (
                <FlightImageExtractor
                    onExtractLegs={handleExtractedLegs}
                    onCancel={() => setShowAIExtractor(false)}
                />
            )}

            {/* Adicionar Trecho */}
            {!showAIExtractor && (
                <div className="flex gap-2">
                    <button
                        onClick={addLeg}
                        className="flex-1 py-3 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                        <Plus className="h-4 w-4" />
                        Adicionar Trecho
                    </button>
                    <button
                        onClick={() => setShowAIExtractor(true)}
                        className="px-4 py-3 border-2 border-dashed border-sky-200 rounded-lg text-sky-500 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-colors flex items-center gap-2 text-sm"
                        title="Extrair voos de uma imagem com IA"
                    >
                        <Sparkles className="h-4 w-4" />
                        <span className="hidden sm:inline">IA</span>
                    </button>
                </div>
            )}
        </div>
    )
}

// ============================================
// Componente de Bloco de Trecho (Leg)
// ============================================

interface LegBlockProps {
    leg: FlightLeg
    isFirst: boolean
    onUpdate: (updates: Partial<FlightLeg>) => void
    onRemove: () => void
    onAddOption: () => void
    onUpdateOption: (optionId: string, updates: Partial<FlightOption>) => void
    onRemoveOption: (optionId: string) => void
    onSetRecommended: (optionId: string) => void
}

function LegBlock({
    leg,
    isFirst,
    onUpdate,
    onRemove,
    onAddOption,
    onUpdateOption,
    onRemoveOption,
    onSetRecommended
}: LegBlockProps) {
    // Support both 'leg_type' (builder) and 'type' (legacy) field names
    const legType = leg.leg_type || (leg as any).type || 'outbound'
    const colors = {
        outbound: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', label: 'bg-blue-600' },
        return: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', label: 'bg-green-600' },
        connection: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', label: 'bg-purple-600' }
    }[legType] || { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', label: 'bg-slate-600' }

    return (
        <div className={cn("rounded-xl border", colors.border, colors.bg)}>
            {/* Header do Trecho */}
            <div className="flex items-center gap-3 p-3 border-b border-white/50">
                {/* Badge do tipo */}
                <span className={cn("px-2 py-1 rounded text-xs font-bold text-white", colors.label)}>
                    {leg.label}
                </span>

                {/* Rota */}
                <div className="flex items-center gap-2">
                    {/* Origem */}
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={leg.origin_code}
                            onChange={(e) => onUpdate({ origin_code: e.target.value.toUpperCase() })}
                            placeholder="GRU"
                            maxLength={3}
                            className="w-14 px-2 py-1 text-sm font-bold text-center bg-white border border-slate-200 rounded uppercase"
                        />
                        <input
                            type="text"
                            value={leg.origin_city || ''}
                            onChange={(e) => onUpdate({ origin_city: e.target.value })}
                            placeholder="São Paulo"
                            className="w-24 px-2 py-1 text-xs bg-white border border-slate-200 rounded text-slate-600"
                        />
                    </div>
                    <span className="text-slate-400">→</span>
                    {/* Destino */}
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={leg.destination_code}
                            onChange={(e) => onUpdate({ destination_code: e.target.value.toUpperCase() })}
                            placeholder="MIA"
                            maxLength={3}
                            className="w-14 px-2 py-1 text-sm font-bold text-center bg-white border border-slate-200 rounded uppercase"
                        />
                        <input
                            type="text"
                            value={leg.destination_city || ''}
                            onChange={(e) => onUpdate({ destination_city: e.target.value })}
                            placeholder="Miami"
                            className="w-24 px-2 py-1 text-xs bg-white border border-slate-200 rounded text-slate-600"
                        />
                    </div>
                </div>

                {/* Data */}
                <input
                    type="date"
                    value={leg.date}
                    onChange={(e) => onUpdate({ date: e.target.value })}
                    className="px-2 py-1 text-sm bg-white border border-slate-200 rounded"
                />

                {/* Spacer */}
                <div className="flex-1" />

                {/* Remover (só se não for primeiro) */}
                {!isFirst && (
                    <button
                        onClick={onRemove}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* Lista de Opções */}
            <div className="p-3 space-y-2">
                {(leg.options || []).length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-2">
                        Nenhuma opção de voo ainda
                    </p>
                ) : (
                    (leg.options || []).map((option) => (
                        <FlightRow
                            key={option.id}
                            option={option}
                            onUpdate={(updates) => onUpdateOption(option.id, updates)}
                            onRemove={() => onRemoveOption(option.id)}
                            onSetRecommended={() => onSetRecommended(option.id)}
                        />
                    ))
                )}

                {/* Adicionar Opção */}
                <button
                    onClick={onAddOption}
                    className={cn(
                        "w-full py-2 border border-dashed rounded-lg text-sm transition-colors flex items-center justify-center gap-2",
                        colors.border, colors.text,
                        "hover:bg-white/50"
                    )}
                >
                    <Plus className="h-4 w-4" />
                    Nova opção de voo
                </button>
            </div>
        </div>
    )
}

// ============================================
// Componente de Linha de Voo (Opção)
// ============================================

interface FlightRowProps {
    option: FlightOption
    onUpdate: (updates: Partial<FlightOption>) => void
    onRemove: () => void
    onSetRecommended: () => void
}

function FlightRow({ option, onUpdate, onRemove, onSetRecommended }: FlightRowProps) {
    const [isEditing, setIsEditing] = useState(false)

    // Calcular duração
    const duration = (() => {
        if (!option.departure_time || !option.arrival_time) return ''
        const [dh, dm] = option.departure_time.split(':').map(Number)
        const [ah, am] = option.arrival_time.split(':').map(Number)
        let mins = (ah * 60 + am) - (dh * 60 + dm)
        if (mins < 0) mins += 24 * 60
        const h = Math.floor(mins / 60)
        const m = mins % 60
        return `${h}h${m > 0 ? m.toString().padStart(2, '0') : ''}`
    })()

    // Formatar preço
    const formattedPrice = option.price > 0
        ? `R$ ${option.price.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        : ''

    if (isEditing) {
        return (
            <FlightRowEdit
                option={option}
                onUpdate={onUpdate}
                onClose={() => setIsEditing(false)}
            />
        )
    }

    return (
        <div
            className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all group",
                option.is_recommended
                    ? "bg-amber-100 border border-amber-300"
                    : "bg-white border border-slate-200 hover:border-slate-300"
            )}
            onClick={() => setIsEditing(true)}
        >
            {/* Star */}
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onSetRecommended()
                }}
                className={cn(
                    "p-0.5 transition-colors",
                    option.is_recommended ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
                )}
            >
                <Star className={cn("h-4 w-4", option.is_recommended && "fill-amber-500")} />
            </button>

            {/* Companhia + Voo */}
            <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-slate-700">
                    {option.airline_name || AIRLINES.find(a => a.code === option.airline_code)?.name || option.airline_code}
                </span>
                <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold",
                    AIRLINES.find(a => a.code === option.airline_code)?.color || "bg-slate-100 text-slate-700"
                )}>
                    {option.airline_code}
                </span>
                <span className="font-mono text-sm text-slate-600">
                    {option.flight_number || '----'}
                </span>
            </div>

            {/* Separador */}
            <span className="text-slate-300">|</span>

            {/* Horários */}
            <div className="flex items-center gap-1">
                <span className="text-sm font-medium">
                    {option.departure_time || '--:--'}
                </span>
                <span className="text-slate-400 text-xs">→</span>
                <span className="text-sm font-medium">
                    {option.arrival_time || '--:--'}
                </span>
                {duration && (
                    <span className="text-xs text-slate-400 ml-1">
                        ({duration})
                    </span>
                )}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Preço */}
            <span className={cn(
                "font-bold text-sm",
                option.is_recommended ? "text-amber-700" : "text-slate-700"
            )}>
                {formattedPrice || 'R$ --'}
            </span>

            {/* Delete */}
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onRemove()
                }}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    )
}

// ============================================
// Componente de Edição de Linha
// ============================================

interface FlightRowEditProps {
    option: FlightOption
    onUpdate: (updates: Partial<FlightOption>) => void
    onClose: () => void
}

function FlightRowEdit({ option, onUpdate, onClose }: FlightRowEditProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    // Fechar ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

    // Fechar com Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    return (
        <div
            ref={containerRef}
            className="bg-white border-2 border-blue-400 rounded-lg p-3 shadow-lg space-y-3"
        >
            {/* Linha 1: Companhia, Voo, Horários */}
            <div className="flex items-center gap-3">
                <select
                    value={option.airline_code}
                    onChange={(e) => {
                        const airline = AIRLINES.find(a => a.code === e.target.value)
                        onUpdate({
                            airline_code: e.target.value,
                            airline_name: airline?.name || e.target.value
                        })
                    }}
                    className="px-2 py-1.5 text-sm font-medium border border-slate-200 rounded"
                >
                    {AIRLINES.map(a => (
                        <option key={a.code} value={a.code}>{a.name}</option>
                    ))}
                </select>

                <input
                    type="text"
                    value={option.flight_number}
                    onChange={(e) => onUpdate({ flight_number: e.target.value.toUpperCase() })}
                    placeholder="Voo"
                    className="w-20 px-2 py-1.5 text-sm font-mono border border-slate-200 rounded text-center"
                    autoFocus
                />

                <input
                    type="time"
                    value={option.departure_time}
                    onChange={(e) => onUpdate({ departure_time: e.target.value })}
                    className="px-2 py-1.5 text-sm border border-slate-200 rounded"
                />
                <span className="text-slate-400">→</span>
                <input
                    type="time"
                    value={option.arrival_time}
                    onChange={(e) => onUpdate({ arrival_time: e.target.value })}
                    className="px-2 py-1.5 text-sm border border-slate-200 rounded"
                />
            </div>

            {/* Linha 2: Classe, Bagagem, Preço */}
            <div className="flex items-center gap-3">
                <select
                    value={option.fare_family}
                    onChange={(e) => onUpdate({ fare_family: e.target.value })}
                    className="px-2 py-1.5 text-sm border border-slate-200 rounded"
                >
                    <option value="light">Light</option>
                    <option value="plus">Plus</option>
                    <option value="max">Max</option>
                    <option value="premium">Premium</option>
                </select>

                <input
                    type="text"
                    value={option.baggage}
                    onChange={(e) => onUpdate({ baggage: e.target.value })}
                    placeholder="Bagagem (ex: 23kg)"
                    className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded"
                />

                <div className="flex items-center gap-1">
                    <span className="text-sm text-slate-500">R$</span>
                    <input
                        type="number"
                        value={option.price || ''}
                        onChange={(e) => onUpdate({ price: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-24 px-2 py-1.5 text-sm font-bold border border-slate-200 rounded text-right"
                    />
                </div>

                <button
                    onClick={onClose}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                    OK
                </button>
            </div>
        </div>
    )
}

export default FlightEditor
