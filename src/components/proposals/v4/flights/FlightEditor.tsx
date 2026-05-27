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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Star, Trash2, Sparkles, Pencil, ArrowRight, TrendingDown, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { type FlightsData, type FlightLeg, type FlightOption, AIRLINES, createInitialFlightData } from './types'
import { compareFlightOptions } from './comparison'
import { FlightImageExtractor } from './FlightImageExtractor'

// Deriva um código curto (2 letras) quando o usuário digita uma companhia fora da lista
function deriveAirlineCode(name: string): string {
    const letters = name.replace(/[^A-Za-zÀ-ú]/g, '').toUpperCase()
    return letters.slice(0, 2) || 'XX'
}

// Opções fixas pra bagagem (em vez de texto livre que vira bagunça)
const BAGGAGE_OPTIONS = [
    { value: '', label: 'Sem bagagem' },
    { value: 'Bagagem de mão 10kg', label: 'Bagagem de mão (10kg)' },
    { value: '1 mala 23kg', label: '1 mala despachada (23kg)' },
    { value: '2 malas 23kg', label: '2 malas despachadas (23kg)' },
    { value: '1 mala 32kg', label: '1 mala despachada (32kg)' },
    { value: '2 malas 32kg', label: '2 malas despachadas (32kg)' },
] as const

const CABIN_OPTIONS = [
    { value: 'economy', label: 'Econômica' },
    { value: 'premium_economy', label: 'Premium Economy' },
    { value: 'business', label: 'Executiva' },
    { value: 'first', label: 'Primeira Classe' },
] as const

const FARE_FAMILY_OPTIONS = [
    { value: 'light', label: 'Light' },
    { value: 'plus', label: 'Plus' },
    { value: 'max', label: 'Max' },
    { value: 'premium', label: 'Premium' },
] as const

interface FlightEditorProps {
    data: FlightsData | null
    onChange: (data: FlightsData) => void
}

export function FlightEditor({ data, onChange }: FlightEditorProps) {
    // Memoize initial data to avoid recreating on every render.
    // Default = roundtrip (padrão histórico, preserva compat com items sem trip_type definido).
    const initialData = useMemo(() => createInitialFlightData('roundtrip'), [])
    const flightsData = data?.legs?.length ? data : initialData

    // Persist initial data if none exists - ensures flights are saved even before user edits
    useEffect(() => {
        if (!data?.legs?.length) {
            onChange(initialData)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Run only on mount - intentionally ignoring deps to avoid infinite loops
    const [showAIExtractor, setShowAIExtractor] = useState(false)
    // ID da opção recém-criada via clique manual — usado pra abrir o popover de edição automaticamente
    const [justAddedOptionId, setJustAddedOptionId] = useState<string | null>(null)

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
            airline_code: '',
            airline_name: '',
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

        setJustAddedOptionId(newOption.id)
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
                    justAddedOptionId={justAddedOptionId}
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
    justAddedOptionId: string | null
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
    justAddedOptionId,
    onUpdate,
    onRemove,
    onAddOption,
    onUpdateOption,
    onRemoveOption,
    onSetRecommended
}: LegBlockProps) {
    // Support both 'leg_type' (builder) and 'type' (legacy) field names
    const legType = leg.leg_type || (leg as { type?: string }).type || 'outbound'
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
                ) : (() => {
                    const comparison = compareFlightOptions(leg.options || [])
                    return (leg.options || []).map((option) => (
                        <FlightRow
                            key={option.id}
                            option={option}
                            autoOpenEditor={option.id === justAddedOptionId}
                            onUpdate={(updates) => onUpdateOption(option.id, updates)}
                            onRemove={() => onRemoveOption(option.id)}
                            onSetRecommended={() => onSetRecommended(option.id)}
                            isCheapest={comparison.cheapestId === option.id}
                            isFastest={comparison.fastestId === option.id}
                        />
                    ))
                })()}

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
    autoOpenEditor?: boolean
    onUpdate: (updates: Partial<FlightOption>) => void
    onRemove: () => void
    onSetRecommended: () => void
    isCheapest?: boolean
    isFastest?: boolean
}

function FlightRow({ option, autoOpenEditor = false, onUpdate, onRemove, onSetRecommended, isCheapest = false, isFastest = false }: FlightRowProps) {
    // Duração tolerante a lixo tipo "23:40 (+1)"
    const duration = useMemo(() => {
        const parse = (raw?: string | null): { h: number; m: number; extraDays: number } | null => {
            if (!raw) return null
            const s = String(raw)
            const hhmm = s.match(/(\d{1,2}):(\d{2})/)
            if (!hhmm) return null
            const h = Number(hhmm[1])
            const m = Number(hhmm[2])
            if (!Number.isFinite(h) || !Number.isFinite(m)) return null
            const plus = s.match(/\(?\+(\d+)\)?/)
            return { h, m, extraDays: plus ? Number(plus[1]) : 0 }
        }
        const dep = parse(option.departure_time)
        const arr = parse(option.arrival_time)
        if (!dep || !arr) return ''
        let mins = (arr.h * 60 + arr.m) - (dep.h * 60 + dep.m) + arr.extraDays * 24 * 60
        if (mins < 0) mins += 24 * 60
        const h = Math.floor(mins / 60)
        const m = mins % 60
        if (!Number.isFinite(h) || h < 0) return ''
        return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`
    }, [option.departure_time, option.arrival_time])

    const formattedPrice = option.price > 0
        ? `R$ ${option.price.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        : ''

    const stopsLabel = (() => {
        const s = Number(option.stops ?? 0)
        if (!Number.isFinite(s) || s <= 0) return 'direto'
        return s === 1 ? '1 escala' : `${s} escalas`
    })()

    // Marca "(+1)" / "(+2)" no horário de chegada se o input do usuário tem o sufixo
    const arrivalSuffix = (() => {
        if (!option.arrival_time) return ''
        const plus = String(option.arrival_time).match(/\+(\d+)/)
        return plus ? ` (+${plus[1]})` : ''
    })()
    const arrivalDisplay = (option.arrival_time?.match(/(\d{1,2}:\d{2})/)?.[1]) || '--:--'
    const departureDisplay = (option.departure_time?.match(/(\d{1,2}:\d{2})/)?.[1]) || '--:--'

    const airline = AIRLINES.find(a => a.code === option.airline_code)

    return (
        <div
            className={cn(
                "grid items-center gap-3 rounded-lg border px-3 py-2 transition-all group",
                "grid-cols-[auto_minmax(150px,1.5fr)_minmax(180px,1.8fr)_minmax(80px,auto)_minmax(90px,auto)_auto]",
                option.is_recommended
                    ? "bg-amber-50 border-amber-200"
                    : "bg-white border-slate-200 hover:border-slate-300"
            )}
        >
            {/* Estrela "recomendado" */}
            <button
                onClick={onSetRecommended}
                className={cn(
                    "p-0.5 transition-colors",
                    option.is_recommended ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
                )}
                title={option.is_recommended ? "Opção recomendada" : "Marcar como recomendada"}
            >
                <Star className={cn("h-4 w-4", option.is_recommended && "fill-amber-500")} />
            </button>

            {/* Companhia + número do voo + badges comparativos */}
            <div className="flex items-center gap-2 min-w-0">
                <span className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0",
                    airline?.color || "bg-slate-100 text-slate-700"
                )}>
                    {option.airline_code || '--'}
                </span>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                        <span className="text-sm font-medium text-slate-900 truncate">
                            {option.airline_name || airline?.name || option.airline_code || 'Companhia'}
                        </span>
                        {isCheapest && (
                            <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 flex-shrink-0"
                                title="Menor preço entre as opções"
                            >
                                <TrendingDown className="h-2.5 w-2.5" />
                                Mais barato
                            </span>
                        )}
                        {isFastest && (
                            <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-700 flex-shrink-0"
                                title="Menor duração entre as opções"
                            >
                                <Zap className="h-2.5 w-2.5" />
                                Mais rápido
                            </span>
                        )}
                    </div>
                    <span className="font-mono text-xs text-slate-500 truncate">
                        {option.flight_number || '----'}
                    </span>
                </div>
            </div>

            {/* Horários + duração + escalas */}
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                    {departureDisplay}
                </span>
                <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-900 tabular-nums">
                    {arrivalDisplay}
                    {arrivalSuffix && (
                        <span className="ml-0.5 text-xs text-amber-600 font-semibold">{arrivalSuffix}</span>
                    )}
                </span>
                {duration && (
                    <span className="text-xs text-slate-500 ml-1">
                        · {duration}
                    </span>
                )}
            </div>

            {/* Escalas */}
            <span className="text-xs text-slate-500">
                {stopsLabel}
            </span>

            {/* Preço */}
            <span className={cn(
                "text-sm font-semibold tabular-nums text-right",
                option.is_recommended ? "text-amber-700" : "text-slate-900"
            )}>
                {formattedPrice || 'R$ --'}
            </span>

            {/* Ações: editar + remover */}
            <div className="flex items-center gap-1">
                <FlightOptionPopover option={option} onUpdate={onUpdate} defaultOpen={autoOpenEditor} />
                <button
                    onClick={onRemove}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="Remover esta opção"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        </div>
    )
}

// ============================================
// Popover de Edição (substitui o expand inline)
// ============================================

function FlightOptionPopover({
    option,
    onUpdate,
    defaultOpen = false,
}: {
    option: FlightOption
    onUpdate: (updates: Partial<FlightOption>) => void
    defaultOpen?: boolean
}) {
    return (
        <Popover defaultOpen={defaultOpen}>
            <PopoverTrigger asChild>
                <button
                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                    title="Editar detalhes desta opção"
                >
                    <Pencil className="h-3.5 w-3.5" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="bottom"
                className="w-[360px] p-0"
            >
                <div className="border-b border-slate-200 px-4 py-2.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Detalhes da opção
                    </h4>
                </div>

                <div className="px-4 py-3 space-y-3">
                    {/* Companhia + número */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                            <span className="mb-1 block text-[11px] font-medium text-slate-600">Companhia</span>
                            <AirlineCombobox
                                airlineCode={option.airline_code}
                                airlineName={option.airline_name}
                                autoFocus={defaultOpen}
                                onChange={(next) => onUpdate(next)}
                            />
                        </div>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-slate-600">Nº voo</span>
                            <input
                                type="text"
                                value={option.flight_number || ''}
                                onChange={(e) => onUpdate({ flight_number: e.target.value.toUpperCase() })}
                                placeholder="LA1234"
                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-mono text-center"
                            />
                        </label>
                    </div>

                    {/* Horários */}
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-slate-600">Saída</span>
                            <input
                                type="time"
                                value={(option.departure_time || '').match(/(\d{1,2}:\d{2})/)?.[1] || ''}
                                onChange={(e) => onUpdate({ departure_time: e.target.value })}
                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm tabular-nums"
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-slate-600">Chegada</span>
                            <input
                                type="time"
                                value={(option.arrival_time || '').match(/(\d{1,2}:\d{2})/)?.[1] || ''}
                                onChange={(e) => {
                                    // Preserva sufixo "+N" caso já existisse
                                    const existing = String(option.arrival_time || '')
                                    const plus = existing.match(/(\(?\+\d+\)?)$/)?.[0] || ''
                                    onUpdate({ arrival_time: plus ? `${e.target.value} ${plus}` : e.target.value })
                                }}
                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm tabular-nums"
                            />
                        </label>
                    </div>

                    {/* Dia seguinte */}
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                            type="checkbox"
                            checked={/\+\d+/.test(String(option.arrival_time || ''))}
                            onChange={(e) => {
                                const time = (option.arrival_time || '').match(/(\d{1,2}:\d{2})/)?.[1] || ''
                                onUpdate({ arrival_time: e.target.checked ? `${time} (+1)` : time })
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                        />
                        Chega no dia seguinte
                    </label>

                    {/* Escalas */}
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Paradas</span>
                        <select
                            value={String(option.stops ?? 0)}
                            onChange={(e) => onUpdate({ stops: Number(e.target.value) })}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                        >
                            <option value="0">Voo direto</option>
                            <option value="1">1 escala</option>
                            <option value="2">2 escalas</option>
                            <option value="3">3 escalas</option>
                        </select>
                    </label>

                    {/* Classe + tarifa */}
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-slate-600">Classe</span>
                            <select
                                value={option.cabin_class || 'economy'}
                                onChange={(e) => onUpdate({ cabin_class: e.target.value })}
                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                            >
                                {CABIN_OPTIONS.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-medium text-slate-600">Tarifa</span>
                            <select
                                value={option.fare_family || ''}
                                onChange={(e) => onUpdate({ fare_family: e.target.value })}
                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                            >
                                <option value="">—</option>
                                {FARE_FAMILY_OPTIONS.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {/* Bagagem */}
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Bagagem</span>
                        <select
                            value={option.baggage || ''}
                            onChange={(e) => onUpdate({ baggage: e.target.value })}
                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                        >
                            {BAGGAGE_OPTIONS.map(b => (
                                <option key={b.value} value={b.value}>{b.label}</option>
                            ))}
                        </select>
                    </label>

                    {/* Preço */}
                    <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-slate-600">Preço total (R$)</span>
                        <input
                            type="number"
                            value={option.price || ''}
                            onChange={(e) => onUpdate({ price: parseFloat(e.target.value) || 0 })}
                            placeholder="0"
                            className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold tabular-nums text-right"
                        />
                    </label>
                </div>
            </PopoverContent>
        </Popover>
    )
}

// ============================================
// Combobox de Companhia Aérea (typeahead + valor livre)
// ============================================

interface AirlineComboboxProps {
    airlineCode: string
    airlineName: string
    autoFocus?: boolean
    onChange: (update: { airline_code: string; airline_name: string }) => void
}

function AirlineCombobox({ airlineCode, airlineName, autoFocus = false, onChange }: AirlineComboboxProps) {
    const [open, setOpen] = useState(false)
    const [highlight, setHighlight] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Texto atual = valor externo (controlado). Sem state local pra evitar dessincronia.
    const query = airlineName || ''

    // Foca o input se o popover abriu por causa de "nova opção"
    useEffect(() => {
        if (autoFocus) {
            const t = setTimeout(() => {
                inputRef.current?.focus()
                inputRef.current?.select()
                setOpen(true)
            }, 50)
            return () => clearTimeout(t)
        }
    }, [autoFocus])

    useEffect(() => () => {
        if (closeTimer.current) clearTimeout(closeTimer.current)
    }, [])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return AIRLINES.filter(a => a.code !== 'OTHER')
        return AIRLINES.filter(a =>
            a.code !== 'OTHER' && (
                a.name.toLowerCase().includes(q) ||
                a.code.toLowerCase().includes(q)
            )
        )
    }, [query])

    const pick = useCallback((a: typeof AIRLINES[number]) => {
        onChange({ airline_code: a.code, airline_name: a.name })
        setOpen(false)
    }, [onChange])

    const handleType = useCallback((text: string) => {
        const trimmed = text.trim()
        if (!trimmed) {
            onChange({ airline_code: '', airline_name: text })
            return
        }
        const match = AIRLINES.find(a =>
            a.code !== 'OTHER' && (
                a.name.toLowerCase() === trimmed.toLowerCase() ||
                a.code.toLowerCase() === trimmed.toLowerCase()
            )
        )
        if (match) {
            onChange({ airline_code: match.code, airline_name: match.name })
            return
        }
        // Texto livre — guarda o nome digitado e deriva código de 2 letras
        onChange({ airline_code: deriveAirlineCode(trimmed), airline_name: text })
    }, [onChange])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setHighlight(h => Math.min(h + 1, Math.max(0, filtered.length - 1)))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight(h => Math.max(h - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (open && filtered[highlight]) {
                pick(filtered[highlight])
            } else {
                setOpen(false)
            }
        } else if (e.key === 'Escape') {
            setOpen(false)
        }
    }

    const knownAirline = AIRLINES.find(a => a.code === airlineCode && a.code !== 'OTHER')

    return (
        <div className="relative">
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                        handleType(e.target.value)
                        setOpen(true)
                        setHighlight(0)
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => {
                        // delay pra não engolir o click nas opções
                        closeTimer.current = setTimeout(() => setOpen(false), 150)
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite a companhia"
                    className={cn(
                        "h-9 w-full rounded-md border border-slate-200 bg-white pr-2 text-sm",
                        knownAirline ? "pl-10" : "pl-2"
                    )}
                />
                {knownAirline && (
                    <span
                        className={cn(
                            "absolute left-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-bold pointer-events-none",
                            knownAirline.color
                        )}
                    >
                        {knownAirline.code}
                    </span>
                )}
            </div>
            {open && filtered.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                    {filtered.map((a, i) => (
                        <button
                            key={a.code}
                            type="button"
                            onMouseDown={(e) => {
                                // evita o blur do input fechar o dropdown antes do click registrar
                                e.preventDefault()
                                if (closeTimer.current) clearTimeout(closeTimer.current)
                                pick(a)
                            }}
                            onMouseEnter={() => setHighlight(i)}
                            className={cn(
                                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
                                i === highlight ? "bg-slate-100" : "hover:bg-slate-50"
                            )}
                        >
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold flex-shrink-0", a.color)}>
                                {a.code}
                            </span>
                            <span className="truncate">{a.name}</span>
                        </button>
                    ))}
                </div>
            )}
            {open && filtered.length === 0 && query.trim() && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-slate-200 bg-white shadow-lg px-2 py-1.5 text-xs text-slate-500">
                    Usando “{query.trim()}” como companhia
                </div>
            )}
        </div>
    )
}

export default FlightEditor
