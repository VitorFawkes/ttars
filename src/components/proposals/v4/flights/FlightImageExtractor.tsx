/**
 * FlightImageExtractor - Extrator de voos por imagem com IA
 *
 * Componente exclusivo para voos que permite:
 * - Upload/drag-drop de screenshot de reserva
 * - Processamento por IA (GPT-5.1 Vision)
 * - SELEÇÃO DE MODO para agrupar corretamente
 *
 * Modos de extração:
 * - ida_volta: Agrupa por data/rota (tabelas = trechos, linhas = opções)
 * - ida_only: Todas as linhas são opções de um trecho IDA
 * - volta_only: Todas as linhas são opções de um trecho VOLTA
 * - separate_legs: Cada linha é um trecho separado
 */

import { useState, useCallback } from 'react'
import { useAIExtractFlights, fileToBase64, type ExtractionMode } from '@/hooks/useAIExtract'
import {
    Upload,
    Image as ImageIcon,
    Sparkles,
    Loader2,
    Check,
    X,
    Plane,
    AlertCircle,
    ArrowLeftRight,
    ArrowRight,
    ArrowLeft,
    List,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { FlightLeg, FlightOption } from './types'
import { AIRLINES } from './types'

// Estrutura de segmento extraído pela IA
interface ExtractedSegment {
    segment_order: number
    airline_code: string
    airline_name: string
    flight_number: string
    departure_date: string
    departure_time: string
    departure_airport: string
    departure_city: string
    arrival_date: string
    arrival_time: string
    arrival_airport: string
    arrival_city: string
    cabin_class?: string
    baggage_included?: string
    price?: number
}

// Configuração dos modos de extração
const EXTRACTION_MODES = [
    {
        value: 'ida_volta' as ExtractionMode,
        label: 'IDA + VOLTA',
        description: 'Tabelas separadas por data/rota = trechos, linhas = opções',
        icon: ArrowLeftRight,
        color: 'sky',
    },
    {
        value: 'ida_only' as ExtractionMode,
        label: 'Apenas IDA',
        description: 'Todas as linhas são opções do trecho de ida',
        icon: ArrowRight,
        color: 'blue',
    },
    {
        value: 'volta_only' as ExtractionMode,
        label: 'Apenas VOLTA',
        description: 'Todas as linhas são opções do trecho de volta',
        icon: ArrowLeft,
        color: 'green',
    },
    {
        value: 'separate_legs' as ExtractionMode,
        label: 'Trechos separados',
        description: 'Cada linha é um trecho diferente (conexões)',
        icon: List,
        color: 'purple',
    },
]

interface FlightImageExtractorProps {
    onExtractLegs: (legs: FlightLeg[]) => void
    onCancel: () => void
}

export function FlightImageExtractor({
    onExtractLegs,
    onCancel,
}: FlightImageExtractorProps) {
    // Step 1: Selecionar modo
    const [selectedMode, setSelectedMode] = useState<ExtractionMode | null>(null)

    // Step 2: Upload e processamento
    const [isDragging, setIsDragging] = useState(false)
    const [preview, setPreview] = useState<string | null>(null)
    const [extractedSegments, setExtractedSegments] = useState<ExtractedSegment[]>([])
    const [selectedSegments, setSelectedSegments] = useState<Set<number>>(new Set())
    const [isProcessing, setIsProcessing] = useState(false)

    const extractMutation = useAIExtractFlights()

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        if (!selectedMode) return

        const files = Array.from(e.dataTransfer.files)
        const imageFile = files.find(f => f.type.startsWith('image/'))

        if (imageFile) {
            await processImage(imageFile)
        }
    }, [selectedMode])

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file && selectedMode) {
            await processImage(file)
        }
    }

    const processImage = async (file: File) => {
        if (!selectedMode) return

        const previewUrl = URL.createObjectURL(file)
        setPreview(previewUrl)
        setExtractedSegments([])
        setIsProcessing(true)

        try {
            const base64 = await fileToBase64(file)

            toast.loading('Analisando imagem com IA...', { id: 'ai-flight-extract' })

            const result = await extractMutation.mutateAsync({
                image: base64,
                extractionMode: selectedMode,
            })

            if (result.success && result.segments && result.segments.length > 0) {
                setExtractedSegments(result.segments)
                setSelectedSegments(new Set(result.segments.map((_, i) => i)))

                // Mostrar resumo baseado no modo
                const summary = summarizeExtraction(result.segments, selectedMode)
                toast.success(summary, { id: 'ai-flight-extract' })
            } else {
                toast.warning('Nenhum voo identificado', {
                    id: 'ai-flight-extract',
                    description: result.error || 'A IA não encontrou informações de voo na imagem.',
                })
            }
        } catch (error) {
            console.error('[FlightImageExtractor] Error:', error)
            toast.error('Erro ao processar imagem', { id: 'ai-flight-extract' })
        } finally {
            setIsProcessing(false)
        }
    }

    const toggleSegment = (index: number) => {
        const newSelected = new Set(selectedSegments)
        if (newSelected.has(index)) {
            newSelected.delete(index)
        } else {
            newSelected.add(index)
        }
        setSelectedSegments(newSelected)
    }

    const handleConfirm = () => {
        if (!selectedMode) return

        const selected = extractedSegments.filter((_, i) => selectedSegments.has(i))
        const legs = convertSegmentsToLegs(selected, selectedMode)
        onExtractLegs(legs)
    }

    const handleReset = () => {
        setPreview(null)
        setExtractedSegments([])
        setSelectedSegments(new Set())
    }

    const handleBack = () => {
        setSelectedMode(null)
        handleReset()
    }

    // Mapear código de companhia para AIRLINES
    const getAirlineInfo = (code: string) => {
        return AIRLINES.find(a => a.code === code) || AIRLINES.find(a => a.code === 'OTHER')!
    }

    // Preview dos legs que serão criados
    const previewLegs = selectedMode && extractedSegments.length > 0
        ? getLegsPreview(extractedSegments.filter((_, i) => selectedSegments.has(i)), selectedMode)
        : []

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-sky-600" />
                </div>
                <div>
                    <h3 className="font-semibold text-slate-900">
                        Extrair Voos com IA
                    </h3>
                    <p className="text-xs text-slate-500">
                        {!selectedMode
                            ? 'Selecione como os voos devem ser organizados'
                            : 'Arraste um screenshot de reserva'
                        }
                    </p>
                </div>
                <button
                    onClick={onCancel}
                    className="ml-auto p-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            {/* Step 1: Mode Selection */}
            {!selectedMode && (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700 mb-3">
                        Como você quer extrair os voos?
                    </p>
                    {EXTRACTION_MODES.map((mode) => {
                        const Icon = mode.icon
                        return (
                            <button
                                key={mode.value}
                                onClick={() => setSelectedMode(mode.value)}
                                className={cn(
                                    'w-full p-3 rounded-lg border-2 text-left transition-all',
                                    'hover:border-sky-300 hover:bg-sky-50',
                                    'border-slate-200'
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        'w-8 h-8 rounded-lg flex items-center justify-center',
                                        `bg-${mode.color}-100`
                                    )}>
                                        <Icon className={cn('h-4 w-4', `text-${mode.color}-600`)} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-slate-900">{mode.label}</p>
                                        <p className="text-xs text-slate-500">{mode.description}</p>
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Step 2: Image Upload */}
            {selectedMode && !preview && (
                <>
                    {/* Back button */}
                    <button
                        onClick={handleBack}
                        className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Alterar modo
                    </button>

                    {/* Selected mode badge */}
                    <div className="flex items-center gap-2 p-2 bg-sky-50 rounded-lg border border-sky-200">
                        <span className="text-xs text-sky-700">
                            Modo: <strong>{EXTRACTION_MODES.find(m => m.value === selectedMode)?.label}</strong>
                        </span>
                    </div>

                    {/* Drop zone */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                            'relative border-2 border-dashed rounded-xl p-6 transition-all duration-200 text-center',
                            isDragging
                                ? 'border-sky-500 bg-sky-50'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        )}
                    >
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />

                        <div className={cn(
                            'w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center transition-colors',
                            isDragging ? 'bg-sky-100' : 'bg-slate-100'
                        )}>
                            {isDragging ? (
                                <Upload className="h-7 w-7 text-sky-600" />
                            ) : (
                                <ImageIcon className="h-7 w-7 text-slate-400" />
                            )}
                        </div>

                        <p className="font-medium text-slate-700 mb-1">
                            {isDragging ? 'Solte a imagem aqui' : 'Arraste uma imagem'}
                        </p>
                        <p className="text-sm text-slate-400">
                            ou clique para selecionar
                        </p>

                        <p className="text-xs text-slate-400 mt-3">
                            Suporta: PNG, JPG, WEBP (máx. 10MB)
                        </p>
                    </div>
                </>
            )}

            {/* Step 3: Results */}
            {selectedMode && preview && (
                <div className="space-y-3">
                    {/* Image Preview */}
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                        <img
                            src={preview}
                            alt="Preview"
                            className="w-full max-h-32 object-contain"
                        />
                        <button
                            onClick={handleReset}
                            className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow hover:bg-white transition-colors"
                        >
                            <X className="h-4 w-4 text-slate-500" />
                        </button>

                        {isProcessing && (
                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                <div className="text-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-sky-600 mx-auto mb-2" />
                                    <p className="text-sm font-medium text-slate-700">Analisando com IA...</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Legs Preview */}
                    {previewLegs.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-slate-700">
                                Trechos que serão criados:
                            </h4>
                            {previewLegs.map((leg, index) => (
                                <div
                                    key={index}
                                    className={cn(
                                        'p-3 rounded-lg border',
                                        leg.type === 'outbound' ? 'bg-blue-50 border-blue-200' :
                                        leg.type === 'return' ? 'bg-green-50 border-green-200' :
                                        'bg-purple-50 border-purple-200'
                                    )}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={cn(
                                            'px-2 py-0.5 rounded text-xs font-bold text-white',
                                            leg.type === 'outbound' ? 'bg-blue-600' :
                                            leg.type === 'return' ? 'bg-green-600' :
                                            'bg-purple-600'
                                        )}>
                                            {leg.label}
                                        </span>
                                        <span className="text-sm font-medium">
                                            {leg.route}
                                        </span>
                                        {leg.date && (
                                            <span className="text-xs text-slate-500 ml-auto">
                                                {leg.date}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-600">
                                        {leg.optionsCount} opção(ões) de voo
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Extracted Segments (collapsible details) */}
                    {extractedSegments.length > 0 && (
                        <details className="group">
                            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                                Ver {extractedSegments.length} voos extraídos
                            </summary>
                            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                {extractedSegments.map((segment, index) => {
                                    const airline = getAirlineInfo(segment.airline_code)
                                    const isSelected = selectedSegments.has(index)

                                    return (
                                        <div
                                            key={index}
                                            onClick={() => toggleSegment(index)}
                                            className={cn(
                                                'p-2 rounded-lg border cursor-pointer transition-all text-sm',
                                                isSelected
                                                    ? 'border-sky-300 bg-sky-50'
                                                    : 'border-slate-200 bg-slate-50 opacity-50'
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
                                                    isSelected ? 'border-sky-500 bg-sky-500' : 'border-slate-300'
                                                )}>
                                                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                                                </div>
                                                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', airline?.color)}>
                                                    {segment.airline_code}
                                                </span>
                                                <span className="font-mono text-xs">{segment.flight_number}</span>
                                                <span className="text-xs">
                                                    {segment.departure_airport} <Plane className="h-2.5 w-2.5 inline text-slate-400" /> {segment.arrival_airport}
                                                </span>
                                                <span className="text-xs text-slate-500 ml-auto">
                                                    {segment.departure_time}
                                                </span>
                                                {segment.price && segment.price > 0 && (
                                                    <span className="text-xs font-medium text-green-600">
                                                        R$ {segment.price.toLocaleString('pt-BR')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </details>
                    )}

                    {/* No results warning */}
                    {!isProcessing && extractedSegments.length === 0 && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-amber-800">Nenhum voo encontrado</p>
                                <p className="text-sm text-amber-600 mt-1">
                                    A IA não conseguiu identificar informações de voo nesta imagem.
                                    Tente com uma imagem mais clara ou adicione manualmente.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                    onClick={onCancel}
                    className="flex-1 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                    Cancelar
                </button>

                {selectedMode && previewLegs.length > 0 ? (
                    <button
                        onClick={handleConfirm}
                        disabled={selectedSegments.size === 0}
                        className={cn(
                            'flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2',
                            selectedSegments.size > 0
                                ? 'bg-sky-600 text-white hover:bg-sky-700'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        )}
                    >
                        <Check className="h-4 w-4" />
                        Adicionar {previewLegs.length} trecho(s)
                    </button>
                ) : preview && !isProcessing ? (
                    <button
                        onClick={handleReset}
                        className="flex-1 px-3 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Tentar outra imagem
                    </button>
                ) : null}
            </div>
        </div>
    )
}

// ============================================
// Helper Functions
// ============================================

function summarizeExtraction(segments: ExtractedSegment[], mode: ExtractionMode): string {
    if (mode === 'ida_volta') {
        const groups = groupSegmentsByRoute(segments)
        return `${Object.keys(groups).length} trecho(s) com ${segments.length} opções total`
    }
    if (mode === 'ida_only' || mode === 'volta_only') {
        return `1 trecho com ${segments.length} opções de voo`
    }
    return `${segments.length} trecho(s) encontrado(s)`
}

interface LegPreview {
    type: 'outbound' | 'return' | 'connection'
    label: string
    route: string
    date: string
    optionsCount: number
}

function getLegsPreview(segments: ExtractedSegment[], mode: ExtractionMode): LegPreview[] {
    if (segments.length === 0) return []

    if (mode === 'ida_volta') {
        const groups = groupSegmentsByRoute(segments)
        return Object.entries(groups).map(([_key, segs], index) => {
            const first = segs[0]
            return {
                type: index === 0 ? 'outbound' : index === 1 ? 'return' : 'connection',
                label: index === 0 ? 'IDA' : index === 1 ? 'VOLTA' : `Trecho ${index + 1}`,
                route: `${first.departure_airport} → ${first.arrival_airport}`,
                date: first.departure_date ? formatDate(first.departure_date) : '',
                optionsCount: segs.length,
            }
        })
    }

    if (mode === 'ida_only') {
        const first = segments[0]
        return [{
            type: 'outbound',
            label: 'IDA',
            route: `${first.departure_airport} → ${first.arrival_airport}`,
            date: first.departure_date ? formatDate(first.departure_date) : '',
            optionsCount: segments.length,
        }]
    }

    if (mode === 'volta_only') {
        const first = segments[0]
        return [{
            type: 'return',
            label: 'VOLTA',
            route: `${first.departure_airport} → ${first.arrival_airport}`,
            date: first.departure_date ? formatDate(first.departure_date) : '',
            optionsCount: segments.length,
        }]
    }

    // separate_legs
    return segments.map((seg, index) => ({
        type: index === 0 ? 'outbound' : index === 1 ? 'return' : 'connection',
        label: index === 0 ? 'IDA' : index === 1 ? 'VOLTA' : `Trecho ${index + 1}`,
        route: `${seg.departure_airport} → ${seg.arrival_airport}`,
        date: seg.departure_date ? formatDate(seg.departure_date) : '',
        optionsCount: 1,
    }))
}

function groupSegmentsByRoute(segments: ExtractedSegment[]): Record<string, ExtractedSegment[]> {
    const groups: Record<string, ExtractedSegment[]> = {}

    for (const segment of segments) {
        // Agrupar por data + rota (origem-destino)
        const key = `${segment.departure_date}-${segment.departure_airport}-${segment.arrival_airport}`
        if (!groups[key]) {
            groups[key] = []
        }
        groups[key].push(segment)
    }

    return groups
}

function formatDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
        })
    } catch {
        return dateStr
    }
}

/**
 * Converte segments extraídos em FlightLegs com base no modo
 */
function convertSegmentsToLegs(segments: ExtractedSegment[], mode: ExtractionMode): FlightLeg[] {
    if (segments.length === 0) return []

    const now = Date.now()

    if (mode === 'ida_volta') {
        // Agrupar por data + rota
        const groups = groupSegmentsByRoute(segments)

        return Object.entries(groups).map(([_key, segs], index) => {
            const first = segs[0]
            const legType: FlightLeg['leg_type'] =
                index === 0 ? 'outbound'
                : index === 1 ? 'return'
                : 'connection'
            const label = index === 0 ? 'IDA' : index === 1 ? 'VOLTA' : `Trecho ${index + 1}`

            return {
                id: `leg-${now}-${index}`,
                leg_type: legType,
                label,
                origin_code: first.departure_airport || '',
                origin_city: first.departure_city || '',
                destination_code: first.arrival_airport || '',
                destination_city: first.arrival_city || '',
                date: first.departure_date || '',
                options: segs.map((seg, optIndex) => convertSegmentToOption(seg, optIndex)),
                ordem: index,
                is_expanded: true,
            }
        })
    }

    if (mode === 'ida_only' || mode === 'volta_only') {
        // Um único leg com todas as opções
        const first = segments[0]
        const legType: FlightLeg['leg_type'] = mode === 'ida_only' ? 'outbound' : 'return'
        const label = mode === 'ida_only' ? 'IDA' : 'VOLTA'

        return [{
            id: `leg-${now}-0`,
            leg_type: legType,
            label,
            origin_code: first.departure_airport || '',
            origin_city: first.departure_city || '',
            destination_code: first.arrival_airport || '',
            destination_city: first.arrival_city || '',
            date: first.departure_date || '',
            options: segments.map((seg, index) => convertSegmentToOption(seg, index)),
            ordem: 0,
            is_expanded: true,
        }]
    }

    // separate_legs: cada segment vira um leg com uma option
    return segments.map((segment, index) => {
        const legType: FlightLeg['leg_type'] =
            index === 0 ? 'outbound'
            : index === 1 ? 'return'
            : 'connection'
        const label = index === 0 ? 'IDA' : index === 1 ? 'VOLTA' : `Trecho ${index + 1}`

        return {
            id: `leg-${now}-${index}`,
            leg_type: legType,
            label,
            origin_code: segment.departure_airport || '',
            origin_city: segment.departure_city || '',
            destination_code: segment.arrival_airport || '',
            destination_city: segment.arrival_city || '',
            date: segment.departure_date || '',
            options: [convertSegmentToOption(segment, 0)],
            ordem: index,
            is_expanded: true,
        }
    })
}

/**
 * Converte um segment em FlightOption
 */
function convertSegmentToOption(segment: ExtractedSegment, index: number): FlightOption {
    const fareFamilyMap: Record<string, string> = {
        'Economy': 'light',
        'Premium Economy': 'plus',
        'Business': 'top',
        'First': 'premium',
    }

    return {
        id: `opt-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
        airline_code: segment.airline_code || 'OTHER',
        airline_name: segment.airline_name || '',
        flight_number: segment.flight_number || '',
        departure_time: segment.departure_time || '',
        arrival_time: segment.arrival_time || '',
        cabin_class: segment.cabin_class?.toLowerCase() || 'economy',
        fare_family: fareFamilyMap[segment.cabin_class || ''] || 'light',
        equipment: '',
        stops: 0,
        baggage: segment.baggage_included || '',
        price: segment.price || 0,
        currency: 'BRL',
        is_recommended: index === 0, // Primeira opção é recomendada
        enabled: true,
        ordem: index,
    }
}

export default FlightImageExtractor
