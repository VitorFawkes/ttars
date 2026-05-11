/**
 * FlightLegsEditor - Editor principal de voos para o builder
 *
 * Design Philosophy:
 * - Simples: Arrasta bloco de voo → aparece editor pronto para usar
 * - Visual: Trechos são cards coloridos (azul=ida, verde=volta)
 * - Flexível: Suporta ida+volta simples ou rotas complexas
 * - Intuitivo: Botões claros para adicionar trechos e opções
 *
 * Fluxo:
 * 1. Usuário arrasta bloco de voo
 * 2. Editor aparece com 2 trechos vazios (IDA + VOLTA)
 * 3. Usuário preenche aeroportos, datas
 * 4. Usuário adiciona opções de voo em cada trecho
 * 5. Cliente visualiza e escolhe 1 opção por trecho
 */

import { useCallback, useMemo, useState } from 'react'
import {
    Plus,
    Plane,
    Upload,
    Sparkles,
    RotateCcw,
    ArrowDownUp
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
    type FlightsData,
    type FlightLeg,
    createEmptyLeg,
    formatPrice
} from './types'
import { FlightLegCard } from './FlightLegCard'

interface FlightLegsEditorProps {
    data: FlightsData | null
    onChange: (data: FlightsData) => void
}

// Estado inicial padrão
const DEFAULT_FLIGHTS_DATA: FlightsData = {
    legs: [],
    show_prices: true,
    allow_mix_airlines: true,
    default_selections: {}
}

export function FlightLegsEditor({ data, onChange }: FlightLegsEditorProps) {
    const [showAIExtractor, setShowAIExtractor] = useState(false)

    // Garantir que sempre temos dados válidos
    const flightsData = useMemo(() => {
        return data || DEFAULT_FLIGHTS_DATA
    }, [data])

    // Calcular totais
    const totals = useMemo(() => {
        const recommendedTotal = flightsData.legs.reduce((sum, leg) => {
            const legOptions = leg.options || []
            const recommended = legOptions.find(o => o.is_recommended)
            return sum + (recommended?.price || 0)
        }, 0)

        const lowestTotal = flightsData.legs.reduce((sum, leg) => {
            const legOptions = leg.options || []
            const prices = legOptions.map(o => o.price).filter(p => p > 0)
            return sum + (prices.length > 0 ? Math.min(...prices) : 0)
        }, 0)

        return { recommendedTotal, lowestTotal }
    }, [flightsData.legs])

    // Handlers
    const handleAddLeg = useCallback((legType: FlightLeg['leg_type'] = 'outbound') => {
        const lastLeg = flightsData.legs[flightsData.legs.length - 1]
        const newLeg = createEmptyLeg(legType, flightsData.legs.length, lastLeg)

        onChange({
            ...flightsData,
            legs: [...flightsData.legs, newLeg]
        })
    }, [flightsData, onChange])

    const handleUpdateLeg = useCallback((legId: string, updates: Partial<FlightLeg>) => {
        onChange({
            ...flightsData,
            legs: flightsData.legs.map(leg =>
                leg.id === legId ? { ...leg, ...updates } : leg
            )
        })
    }, [flightsData, onChange])

    const handleRemoveLeg = useCallback((legId: string) => {
        onChange({
            ...flightsData,
            legs: flightsData.legs.filter(leg => leg.id !== legId)
        })
    }, [flightsData, onChange])

    const handleDuplicateLeg = useCallback((legId: string) => {
        const legToDuplicate = flightsData.legs.find(l => l.id === legId)
        if (!legToDuplicate) return

        const legOptions = legToDuplicate.options || []
        const duplicatedLeg: FlightLeg = {
            ...legToDuplicate,
            id: `leg-${Date.now()}`,
            label: `${legToDuplicate.label} (cópia)`,
            options: legOptions.map(opt => ({
                ...opt,
                id: `opt-${Date.now()}-${opt.ordem}`
            })),
            ordem: flightsData.legs.length
        }

        onChange({
            ...flightsData,
            legs: [...flightsData.legs, duplicatedLeg]
        })
    }, [flightsData, onChange])

    const handleCreateIdaVolta = useCallback(() => {
        const idaLeg = createEmptyLeg('outbound', 0)
        const voltaLeg = createEmptyLeg('return', 1, idaLeg)

        onChange({
            ...flightsData,
            legs: [idaLeg, voltaLeg]
        })
    }, [flightsData, onChange])

    const handleResetAll = useCallback(() => {
        onChange(DEFAULT_FLIGHTS_DATA)
    }, [onChange])

    // Se não tem trechos, mostrar estado inicial
    if (flightsData.legs.length === 0) {
        return (
            <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-700">
                        <Plane className="h-5 w-5" />
                        <h3 className="font-semibold">Opções de Voo</h3>
                    </div>
                </div>

                {/* Estado vazio com ações */}
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center space-y-6">
                    <div>
                        <Plane className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-500 mb-1">Nenhum voo adicionado ainda</p>
                        <p className="text-sm text-slate-400">
                            Escolha como deseja adicionar os voos
                        </p>
                    </div>

                    {/* Opções de criação */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                        <button
                            onClick={handleCreateIdaVolta}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-sky-50 hover:bg-sky-100 border-2 border-sky-200 hover:border-sky-300 rounded-xl text-sky-700 font-medium transition-all"
                        >
                            <ArrowDownUp className="h-5 w-5" />
                            <span>Ida e Volta</span>
                        </button>

                        <button
                            onClick={() => handleAddLeg('outbound')}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl text-slate-700 font-medium transition-all"
                        >
                            <Plus className="h-5 w-5" />
                            <span>Apenas Ida</span>
                        </button>

                        <button
                            onClick={() => setShowAIExtractor(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-50 hover:bg-purple-100 border-2 border-purple-200 hover:border-purple-300 rounded-xl text-purple-700 font-medium transition-all"
                        >
                            <Sparkles className="h-5 w-5" />
                            <span>Extrair de Imagem</span>
                        </button>
                    </div>
                </div>

                {/* AI Extractor Modal (TODO: implementar) */}
                {showAIExtractor && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-lg">Extrair Voos de Imagem</h3>
                                <button
                                    onClick={() => setShowAIExtractor(false)}
                                    className="p-1 hover:bg-slate-100 rounded"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                                <Upload className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                                <p className="text-slate-500 mb-2">
                                    Cole ou arraste a imagem da cotação
                                </p>
                                <p className="text-xs text-slate-400">
                                    A IA irá extrair automaticamente os voos
                                </p>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setShowAIExtractor(false)}>
                                    Cancelar
                                </Button>
                                <Button>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Extrair
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Estado com trechos
    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700">
                    <Plane className="h-5 w-5" />
                    <h3 className="font-semibold">Opções de Voo</h3>
                    <span className="text-sm text-slate-400">
                        ({flightsData.legs.length} trecho{flightsData.legs.length !== 1 && 's'})
                    </span>
                </div>

                {/* Totais */}
                <div className="flex items-center gap-4">
                    {totals.lowestTotal > 0 && (
                        <div className="text-right">
                            <p className="text-xs text-slate-400">A partir de</p>
                            <p className="text-sm font-bold text-emerald-600">
                                {formatPrice(totals.lowestTotal)}
                            </p>
                        </div>
                    )}
                    {totals.recommendedTotal > 0 && totals.recommendedTotal !== totals.lowestTotal && (
                        <div className="text-right">
                            <p className="text-xs text-slate-400">Recomendado</p>
                            <p className="text-sm font-bold text-amber-600">
                                {formatPrice(totals.recommendedTotal)}
                            </p>
                        </div>
                    )}

                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAIExtractor(true)}
                            className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        >
                            <Sparkles className="h-4 w-4 mr-1" />
                            Extrair
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleResetAll}
                            className="text-slate-500 hover:text-red-600 hover:bg-red-50"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Lista de trechos */}
            <div className="space-y-4">
                {flightsData.legs.map((leg) => (
                    <FlightLegCard
                        key={leg.id}
                        leg={leg}
                        onChange={(updates) => handleUpdateLeg(leg.id, updates)}
                        onRemove={() => handleRemoveLeg(leg.id)}
                        onDuplicate={() => handleDuplicateLeg(leg.id)}
                    />
                ))}
            </div>

            {/* Botões para adicionar mais trechos */}
            <div className="flex gap-2">
                <button
                    onClick={() => handleAddLeg('connection')}
                    className="flex-1 py-3 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-all"
                >
                    <Plus className="h-4 w-4" />
                    Adicionar Trecho
                </button>

                {!flightsData.legs.some(l => l.leg_type === 'return') && (
                    <button
                        onClick={() => handleAddLeg('return')}
                        className="flex-1 py-3 border-2 border-dashed border-emerald-200 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 transition-all"
                    >
                        <Plus className="h-4 w-4" />
                        Adicionar Volta
                    </button>
                )}
            </div>
        </div>
    )
}

export default FlightLegsEditor
