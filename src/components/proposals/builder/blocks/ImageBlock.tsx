import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
    GripVertical,
    Trash2,
    Upload,
    Image as ImageIcon,
    Link,
    X,
    Loader2,
    Maximize2,
    Minimize2,
} from 'lucide-react'

/**
 * ImageBlock - Standalone image with upload/URL support
 * 
 * Features:
 * - Drag & drop upload
 * - URL paste support
 * - Size options (full/medium/small)
 * - Caption editing
 */
interface ImageBlockProps {
    id: string
    imageUrl?: string | null
    caption?: string
    size?: 'full' | 'medium' | 'small'
    isPreview?: boolean
    onUpdate?: (data: { imageUrl?: string; caption?: string; size?: string }) => void
    onDelete?: () => void
}

export function ImageBlock({
    imageUrl,
    caption = '',
    size = 'full',
    isPreview,
    onUpdate,
    onDelete,
}: ImageBlockProps) {
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [showUrlInput, setShowUrlInput] = useState(false)
    const [urlValue, setUrlValue] = useState('')
    const [localCaption, setLocalCaption] = useState(caption)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleUpload = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            console.error('File must be an image')
            return
        }

        setIsUploading(true)
        try {
            const fileName = `${Date.now()}-${file.name}`
            const { data, error } = await supabase.storage
                .from('proposals')
                .upload(fileName, file)

            if (error) throw error

            const { data: urlData } = supabase.storage
                .from('proposals')
                .getPublicUrl(data.path)

            onUpdate?.({ imageUrl: urlData.publicUrl })
        } catch (error) {
            console.error('Upload error:', error)
        } finally {
            setIsUploading(false)
        }
    }, [onUpdate])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleUpload(file)
    }, [handleUpload])

    const handleUrlSubmit = useCallback(() => {
        if (urlValue) {
            onUpdate?.({ imageUrl: urlValue })
            setUrlValue('')
            setShowUrlInput(false)
        }
    }, [urlValue, onUpdate])

    const handleCaptionBlur = useCallback(() => {
        if (localCaption !== caption) {
            onUpdate?.({ caption: localCaption })
        }
    }, [localCaption, caption, onUpdate])

    const sizeClasses = {
        full: 'w-full',
        medium: 'w-2/3 mx-auto',
        small: 'w-1/2 mx-auto',
    }

    // Preview mode
    if (isPreview && imageUrl) {
        return (
            <figure className={cn(sizeClasses[size])}>
                <img
                    src={imageUrl}
                    alt={caption || 'Imagem'}
                    className="w-full rounded-xl object-cover"
                />
                {caption && (
                    <figcaption className="text-center text-sm text-slate-500 mt-2">
                        {caption}
                    </figcaption>
                )}
            </figure>
        )
    }

    return (
        <div
            className={cn(
                'group relative bg-white border border-slate-200 rounded-xl overflow-hidden',
                'transition-all duration-200',
                isDragging && 'ring-2 ring-blue-500 border-transparent'
            )}
        >
            {/* Drag Handle + Actions */}
            <div className={cn(
                'absolute -left-10 top-3 flex flex-col gap-1 z-10',
                'opacity-0 group-hover:opacity-100 transition-opacity'
            )}>
                <button className="p-1 rounded hover:bg-slate-100 cursor-grab active:cursor-grabbing">
                    <GripVertical className="h-4 w-4 text-slate-400" />
                </button>
                <button
                    onClick={onDelete}
                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            {/* Size Toggle */}
            {imageUrl && (
                <div className={cn(
                    'absolute top-3 right-3 flex items-center gap-1 z-10',
                    'opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-lg p-1'
                )}>
                    <button
                        onClick={() => onUpdate?.({ size: 'small' })}
                        className={cn(
                            'p-1.5 rounded hover:bg-slate-100',
                            size === 'small' && 'bg-slate-200'
                        )}
                        title="Pequeno"
                    >
                        <Minimize2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={() => onUpdate?.({ size: 'full' })}
                        className={cn(
                            'p-1.5 rounded hover:bg-slate-100',
                            size === 'full' && 'bg-slate-200'
                        )}
                        title="Tela cheia"
                    >
                        <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {imageUrl ? (
                /* Image Display */
                <div className={cn(sizeClasses[size], 'transition-all')}>
                    <img
                        src={imageUrl}
                        alt={localCaption || 'Imagem'}
                        className="w-full object-cover"
                    />
                    {/* Caption */}
                    <div className="p-3 bg-slate-50">
                        <input
                            type="text"
                            value={localCaption}
                            onChange={(e) => setLocalCaption(e.target.value)}
                            onBlur={handleCaptionBlur}
                            placeholder="Adicionar legenda..."
                            className="w-full text-sm text-center text-slate-600 bg-transparent border-none outline-none focus:ring-0"
                        />
                    </div>
                </div>
            ) : (
                /* Upload Area */
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className="p-8"
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                        className="hidden"
                    />

                    {isUploading ? (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-3" />
                            <p className="text-sm text-slate-500">Fazendo upload...</p>
                        </div>
                    ) : showUrlInput ? (
                        <div className="flex items-center gap-2">
                            <Input
                                value={urlValue}
                                onChange={(e) => setUrlValue(e.target.value)}
                                placeholder="Cole a URL da imagem..."
                                className="flex-1"
                                autoFocus
                            />
                            <Button onClick={handleUrlSubmit} size="sm">
                                Adicionar
                            </Button>
                            <Button
                                onClick={() => setShowUrlInput(false)}
                                variant="ghost"
                                size="sm"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className={cn(
                                'w-16 h-16 rounded-2xl flex items-center justify-center mb-4',
                                isDragging ? 'bg-blue-100' : 'bg-slate-100'
                            )}>
                                <ImageIcon className={cn(
                                    'h-8 w-8',
                                    isDragging ? 'text-blue-500' : 'text-slate-400'
                                )} />
                            </div>
                            <p className="text-sm text-slate-600 mb-1">
                                {isDragging ? 'Solte a imagem aqui' : 'Arraste uma imagem ou'}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <Button
                                    onClick={() => fileInputRef.current?.click()}
                                    variant="outline"
                                    size="sm"
                                >
                                    <Upload className="h-4 w-4 mr-2" />
                                    Upload
                                </Button>
                                <Button
                                    onClick={() => setShowUrlInput(true)}
                                    variant="ghost"
                                    size="sm"
                                >
                                    <Link className="h-4 w-4 mr-2" />
                                    Colar URL
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default ImageBlock
