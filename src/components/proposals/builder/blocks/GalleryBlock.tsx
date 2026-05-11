import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
    Image as ImageIcon,
    Trash2,
    GripVertical,
    Grid2X2,
    LayoutGrid,
    Link,
    X,
    Check,
    Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * GalleryBlock - Block for displaying multiple images in various layouts
 * 
 * Features:
 * - Multiple images (2-6)
 * - Layout options: Grid 2x2, Hero + Grid, Masonry
 * - Drag to reorder
 * - Add via URL or upload
 */

interface GalleryBlockProps {
    images: string[]
    layout: 'grid-2x2' | 'hero-grid' | 'row'
    isPreview?: boolean
    onImagesChange?: (images: string[]) => void
    onLayoutChange?: (layout: 'grid-2x2' | 'hero-grid' | 'row') => void
}

type AddMode = 'idle' | 'url'

export function GalleryBlock({
    images,
    layout,
    isPreview = false,
    onImagesChange,
    onLayoutChange,
}: GalleryBlockProps) {
    const [addMode, setAddMode] = useState<AddMode>('idle')
    const [urlInput, setUrlInput] = useState('')
    const [isValidating, setIsValidating] = useState(false)
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

    // Validate image URL
    const validateImageUrl = useCallback(async (url: string): Promise<boolean> => {
        return new Promise((resolve) => {
            const img = new Image()
            img.onload = () => resolve(true)
            img.onerror = () => resolve(false)
            img.src = url
            setTimeout(() => resolve(false), 5000)
        })
    }, [])

    // Add image via URL
    const handleAddUrl = async () => {
        if (!urlInput.trim()) return

        setIsValidating(true)
        try {
            let url = urlInput.trim()
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url
            }

            const isValid = await validateImageUrl(url)
            if (!isValid) {
                toast.error('URL inválida ou imagem não acessível')
                return
            }

            onImagesChange?.([...images, url])
            setUrlInput('')
            setAddMode('idle')
            toast.success('Imagem adicionada!')
        } finally {
            setIsValidating(false)
        }
    }

    // Remove image
    const handleRemove = (index: number) => {
        const newImages = images.filter((_, i) => i !== index)
        onImagesChange?.(newImages)
    }

    // Drag handlers for reordering
    const handleDragStart = (index: number) => {
        setDraggedIndex(index)
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (draggedIndex === null || draggedIndex === index) return

        const newImages = [...images]
        const draggedImage = newImages[draggedIndex]
        newImages.splice(draggedIndex, 1)
        newImages.splice(index, 0, draggedImage)
        onImagesChange?.(newImages)
        setDraggedIndex(index)
    }

    const handleDragEnd = () => {
        setDraggedIndex(null)
    }

    // Render layout selector
    const renderLayoutSelector = () => (
        <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-slate-500">Layout:</span>
            <div className="flex gap-1">
                {[
                    { value: 'grid-2x2', icon: Grid2X2, label: '2x2' },
                    { value: 'hero-grid', icon: LayoutGrid, label: 'Hero' },
                    { value: 'row', icon: ImageIcon, label: 'Linha' },
                ].map(({ value, icon: Icon, label }) => (
                    <button
                        key={value}
                        onClick={() => onLayoutChange?.(value as any)}
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                            layout === value
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        )}
                    >
                        <Icon className="h-3 w-3" />
                        {label}
                    </button>
                ))}
            </div>
        </div>
    )

    // Render images in grid
    const renderGrid = () => {
        if (images.length === 0) {
            return (
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
                    <ImageIcon className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">
                        Adicione imagens à galeria
                    </p>
                </div>
            )
        }

        const gridClasses = {
            'grid-2x2': 'grid grid-cols-2 gap-2',
            'hero-grid': 'grid grid-cols-2 gap-2',
            'row': 'flex gap-2 overflow-x-auto',
        }

        return (
            <div className={cn(gridClasses[layout])}>
                {images.map((url, index) => {
                    // Hero layout: first image is larger
                    const isHero = layout === 'hero-grid' && index === 0
                    const imageClass = isHero
                        ? 'col-span-2 aspect-video'
                        : layout === 'row'
                            ? 'w-48 h-32 flex-shrink-0'
                            : 'aspect-square'

                    return (
                        <div
                            key={`${url}-${index}`}
                            draggable={!isPreview}
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                                'relative group rounded-lg overflow-hidden',
                                imageClass,
                                draggedIndex === index && 'opacity-50',
                                !isPreview && 'cursor-grab active:cursor-grabbing'
                            )}
                        >
                            <img
                                src={url}
                                alt={`Gallery image ${index + 1}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f1f5f9" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="14">Erro</text></svg>'
                                }}
                            />

                            {/* Overlay with actions */}
                            {!isPreview && (
                                <div className={cn(
                                    'absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100',
                                    'transition-opacity flex items-center justify-center gap-2'
                                )}>
                                    <div className="absolute top-2 left-2">
                                        <GripVertical className="h-4 w-4 text-white/80" />
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleRemove(index)}
                                        className="h-8 bg-white/90 hover:bg-red-50 text-red-600"
                                    >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        Remover
                                    </Button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        )
    }

    // Preview mode
    if (isPreview) {
        return (
            <div className="rounded-xl overflow-hidden">
                {renderGrid()}
            </div>
        )
    }

    return (
        <div className="space-y-4 p-4 rounded-xl border border-slate-200 bg-white">
            {/* Layout Selector */}
            {renderLayoutSelector()}

            {/* Image Grid */}
            {renderGrid()}

            {/* Add Image */}
            {images.length < 6 && (
                <div className="mt-4">
                    {addMode === 'idle' ? (
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAddMode('url')}
                                className="flex-1"
                            >
                                <Link className="h-4 w-4 mr-1" />
                                Adicionar URL
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Input
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder="https://exemplo.com/imagem.jpg"
                                className="flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddUrl()
                                    if (e.key === 'Escape') {
                                        setAddMode('idle')
                                        setUrlInput('')
                                    }
                                }}
                                autoFocus
                            />
                            <Button
                                size="icon"
                                onClick={handleAddUrl}
                                disabled={isValidating}
                                className="w-10"
                            >
                                {isValidating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Check className="h-4 w-4" />
                                )}
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                    setAddMode('idle')
                                    setUrlInput('')
                                }}
                                className="w-10"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    <p className="text-xs text-slate-400 text-center mt-2">
                        {images.length}/6 imagens
                    </p>
                </div>
            )}
        </div>
    )
}

export default GalleryBlock
