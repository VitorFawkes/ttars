import { useState, useCallback } from 'react'
import { useAIExtractImage, fileToBase64 } from '@/hooks/useAIExtract'
import type { ExtractedItem, ExtractionResult } from '@/hooks/useAIExtract'
import { Button } from '@/components/ui/Button'
import {
    Upload,
    Image as ImageIcon,
    Sparkles,
    Loader2,
    Check,
    X,
    Plus,
    AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AIImageExtractorProps {
    onExtractComplete: (items: ExtractedItem[]) => void
    onCancel?: () => void
}

export function AIImageExtractor({ onExtractComplete, onCancel }: AIImageExtractorProps) {
    const [isDragging, setIsDragging] = useState(false)
    const [preview, setPreview] = useState<string | null>(null)
    const [result, setResult] = useState<ExtractionResult | null>(null)
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())

    const extractMutation = useAIExtractImage()

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

        const files = Array.from(e.dataTransfer.files)
        const imageFile = files.find(f => f.type.startsWith('image/'))

        if (imageFile) {
            await processImage(imageFile)
        }
    }, [])

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            await processImage(file)
        }
    }

    const processImage = async (file: File) => {
        // Show preview
        const previewUrl = URL.createObjectURL(file)
        setPreview(previewUrl)
        setResult(null)

        try {
            const base64 = await fileToBase64(file)

            toast.loading('Analisando imagem com IA...', { id: 'ai-extract' })

            const extractResult = await extractMutation.mutateAsync({ image: base64 })

            setResult(extractResult)

            if (extractResult.success && extractResult.items?.length > 0) {
                // Select all items by default
                setSelectedItems(new Set(extractResult.items.map((_, i) => i)))
                toast.success(`${extractResult.items.length} item(s) encontrado(s)!`, { id: 'ai-extract' })
            } else {
                if (extractResult.error) {
                    console.error('[AI Extract] Error:', extractResult.error, extractResult.details)
                    toast.error(`Erro: ${extractResult.error}`, {
                        id: 'ai-extract',
                        description: extractResult.details ? String(extractResult.details).slice(0, 100) : 'Verifique o console para mais detalhes.',
                        duration: 5000,
                    })
                } else {
                    toast.warning('Nenhum item identificado', {
                        id: 'ai-extract',
                        description: 'A IA não conseguiu extrair itens desta imagem.',
                    })
                }
            }
        } catch (error) {
            toast.error('Erro ao processar imagem', { id: 'ai-extract' })
        }
    }

    const toggleItem = (index: number) => {
        const newSelected = new Set(selectedItems)
        if (newSelected.has(index)) {
            newSelected.delete(index)
        } else {
            newSelected.add(index)
        }
        setSelectedItems(newSelected)
    }

    const handleConfirm = () => {
        if (!result) return

        const itemsToAdd = result.items.filter((_, i) => selectedItems.has(i))
        onExtractComplete(itemsToAdd)
    }

    const handleReset = () => {
        setPreview(null)
        setResult(null)
        setSelectedItems(new Set())
    }

    const formatCurrency = (price?: number, currency?: string) => {
        if (!price) return null
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: currency || 'BRL',
        }).format(price)
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 mb-4">
                    <Sparkles className="h-6 w-6 text-purple-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                    Extração com IA
                </h2>
                <p className="text-sm text-slate-500">
                    Arraste um screenshot ou imagem de orçamento para extrair automaticamente
                </p>
            </div>

            {/* Drop Zone / Preview */}
            {!preview ? (
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                        'relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 text-center',
                        isDragging
                            ? 'border-purple-500 bg-purple-50'
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
                        'w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center transition-colors',
                        isDragging ? 'bg-purple-100' : 'bg-slate-100'
                    )}>
                        {isDragging ? (
                            <Upload className="h-8 w-8 text-purple-600" />
                        ) : (
                            <ImageIcon className="h-8 w-8 text-slate-400" />
                        )}
                    </div>

                    <p className="font-medium text-slate-700 mb-1">
                        {isDragging ? 'Solte a imagem aqui' : 'Arraste uma imagem'}
                    </p>
                    <p className="text-sm text-slate-400">
                        ou clique para selecionar
                    </p>

                    <p className="text-xs text-slate-400 mt-4">
                        Suporta: PNG, JPG, WEBP (máx. 10MB)
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Image Preview */}
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                        <img
                            src={preview}
                            alt="Preview"
                            className="w-full max-h-48 object-contain"
                        />
                        <button
                            onClick={handleReset}
                            className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow hover:bg-white transition-colors"
                        >
                            <X className="h-4 w-4 text-slate-500" />
                        </button>

                        {extractMutation.isPending && (
                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                <div className="text-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-2" />
                                    <p className="text-sm font-medium text-slate-700">Analisando com GPT-5.1...</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Extraction Results */}
                    {result && (
                        <div className="space-y-3">
                            {result.items.length === 0 ? (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-amber-800">Nenhum item encontrado</p>
                                        <p className="text-sm text-amber-600 mt-1">
                                            A IA não conseguiu identificar itens de viagem nesta imagem.
                                            Tente com outra imagem ou adicione manualmente.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-medium text-slate-700">
                                            {result.items.length} item(s) encontrado(s)
                                        </h3>
                                        {result.confidence && (
                                            <span className="text-xs text-slate-400">
                                                Confiança: {Math.round(result.confidence * 100)}%
                                            </span>
                                        )}
                                    </div>

                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {result.items.map((item, index) => (
                                            <div
                                                key={index}
                                                onClick={() => toggleItem(index)}
                                                className={cn(
                                                    'p-3 rounded-lg border cursor-pointer transition-all duration-200',
                                                    selectedItems.has(index)
                                                        ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                                                        : 'border-slate-200 hover:border-slate-300'
                                                )}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={cn(
                                                        'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors',
                                                        selectedItems.has(index)
                                                            ? 'border-purple-500 bg-purple-500'
                                                            : 'border-slate-300'
                                                    )}>
                                                        {selectedItems.has(index) && (
                                                            <Check className="h-3 w-3 text-white" />
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-medium text-slate-900 text-sm truncate">
                                                                {item.title}
                                                            </p>
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                                                                {item.category || 'custom'}
                                                            </span>
                                                        </div>

                                                        {item.description && (
                                                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                                                {item.description}
                                                            </p>
                                                        )}

                                                        <div className="flex items-center gap-3 mt-1">
                                                            {item.price && (
                                                                <span className="text-sm font-medium text-green-600">
                                                                    {formatCurrency(item.price, item.currency)}
                                                                </span>
                                                            )}
                                                            {item.dates && (
                                                                <span className="text-xs text-slate-400">
                                                                    {item.dates}
                                                                </span>
                                                            )}
                                                            {item.location && (
                                                                <span className="text-xs text-slate-400">
                                                                    {item.location}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-slate-200">
                {onCancel && (
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        className="flex-1"
                    >
                        Cancelar
                    </Button>
                )}

                {result && result.items.length > 0 ? (
                    <Button
                        onClick={handleConfirm}
                        disabled={selectedItems.size === 0}
                        className="flex-1"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar {selectedItems.size} item(s)
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        onClick={handleReset}
                        className="flex-1"
                        disabled={!preview}
                    >
                        Tentar outra imagem
                    </Button>
                )}
            </div>
        </div>
    )
}
