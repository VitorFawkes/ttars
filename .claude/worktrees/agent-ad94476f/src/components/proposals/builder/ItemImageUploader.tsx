import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import {
    Image as ImageIcon,
    Upload,
    Link,
    X,
    Loader2,
    Check,
    AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * ItemImageUploader - Component for uploading or pasting image URLs
 * 
 * Features:
 * - Paste URL with instant preview
 * - Drag-drop file upload
 * - Click to select file
 * - Upload to Supabase Storage
 * - Remove image
 */

interface ItemImageUploaderProps {
    imageUrl: string | null
    onImageChange: (url: string | null) => void
    itemId: string
    className?: string
}

type UploadMode = 'idle' | 'url' | 'uploading'

export function ItemImageUploader({
    imageUrl,
    onImageChange,
    itemId,
    className,
}: ItemImageUploaderProps) {
    const [mode, setMode] = useState<UploadMode>('idle')
    const [urlInput, setUrlInput] = useState('')
    const [isValidatingUrl, setIsValidatingUrl] = useState(false)
    const [urlError, setUrlError] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Validate image URL by trying to load it
    const validateImageUrl = useCallback(async (url: string): Promise<boolean> => {
        return new Promise((resolve) => {
            const img = new Image()
            img.onload = () => resolve(true)
            img.onerror = () => resolve(false)
            img.src = url
            // Timeout after 5 seconds
            setTimeout(() => resolve(false), 5000)
        })
    }, [])

    // Handle URL paste/input
    const handleUrlSubmit = async () => {
        if (!urlInput.trim()) {
            setUrlError('Cole uma URL de imagem')
            return
        }

        setIsValidatingUrl(true)
        setUrlError(null)

        try {
            // Basic URL validation
            let url = urlInput.trim()
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url
            }

            const isValid = await validateImageUrl(url)
            if (!isValid) {
                setUrlError('URL inválida ou imagem não acessível')
                setIsValidatingUrl(false)
                return
            }

            onImageChange(url)
            setUrlInput('')
            setMode('idle')
            toast.success('Imagem adicionada!')
        } catch {
            setUrlError('Erro ao validar URL')
        } finally {
            setIsValidatingUrl(false)
        }
    }

    // Handle file upload
    const handleFileUpload = async (file: File) => {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Apenas imagens são permitidas')
            return
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024
        if (file.size > maxSize) {
            toast.error('Imagem muito grande. Máximo 5MB.')
            return
        }

        setIsUploading(true)
        setMode('uploading')

        try {
            // Generate unique filename
            const fileExt = file.name.split('.').pop()
            const fileName = `proposal-items/${itemId}-${Date.now()}.${fileExt}`

            // Upload to Supabase Storage
            const { data, error } = await supabase.storage
                .from('proposals')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: true,
                })

            if (error) throw error

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('proposals')
                .getPublicUrl(data.path)

            onImageChange(publicUrl)
            toast.success('Imagem enviada!')
        } catch (error) {
            console.error('Upload error:', error)
            toast.error('Erro ao enviar imagem')
        } finally {
            setIsUploading(false)
            setMode('idle')
        }
    }

    // Handle drag events
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const files = e.dataTransfer.files
        if (files.length > 0) {
            handleFileUpload(files[0])
        }
    }

    // Handle remove image
    const handleRemove = () => {
        onImageChange(null)
        toast.success('Imagem removida')
    }

    // If image exists, show preview with remove option
    if (imageUrl) {
        return (
            <div className={cn('relative group', className)}>
                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100">
                    <img
                        src={imageUrl}
                        alt="Item preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f1f5f9" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="14">Erro</text></svg>'
                        }}
                    />

                    {/* Overlay with actions */}
                    <div className={cn(
                        'absolute inset-0 bg-black/50 flex items-center justify-center gap-2',
                        'opacity-0 group-hover:opacity-100 transition-opacity duration-200'
                    )}>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-white/90 hover:bg-white"
                        >
                            <Upload className="h-4 w-4 mr-1" />
                            Trocar
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleRemove}
                            className="bg-white/90 hover:bg-red-50 text-red-600 hover:text-red-700"
                        >
                            <X className="h-4 w-4 mr-1" />
                            Remover
                        </Button>
                    </div>
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileUpload(file)
                    }}
                />
            </div>
        )
    }

    // No image - show upload/URL options
    return (
        <div className={cn('space-y-3', className)}>
            {/* Drop zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                    if (mode === 'idle') fileInputRef.current?.click()
                }}
                className={cn(
                    'relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer',
                    'transition-all duration-200',
                    isDragging
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                )}
            >
                {mode === 'uploading' || isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                        <p className="text-sm text-slate-600">Enviando imagem...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <div className={cn(
                            'w-12 h-12 rounded-full flex items-center justify-center',
                            isDragging ? 'bg-blue-100' : 'bg-slate-200'
                        )}>
                            <ImageIcon className={cn(
                                'h-6 w-6',
                                isDragging ? 'text-blue-600' : 'text-slate-400'
                            )} />
                        </div>
                        <div>
                            <p className={cn(
                                'text-sm font-medium',
                                isDragging ? 'text-blue-600' : 'text-slate-600'
                            )}>
                                {isDragging ? 'Solte a imagem aqui' : 'Arraste uma imagem ou clique para enviar'}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                                PNG, JPG até 5MB
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* URL input toggle */}
            {mode === 'idle' && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        setMode('url')
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                >
                    <Link className="h-4 w-4" />
                    Ou cole uma URL de imagem
                </button>
            )}

            {/* URL input mode */}
            {mode === 'url' && (
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <Input
                            value={urlInput}
                            onChange={(e) => {
                                setUrlInput(e.target.value)
                                setUrlError(null)
                            }}
                            placeholder="https://exemplo.com/imagem.jpg"
                            className={cn(
                                'flex-1',
                                urlError && 'border-red-300 focus:border-red-500'
                            )}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleUrlSubmit()
                                if (e.key === 'Escape') {
                                    setMode('idle')
                                    setUrlInput('')
                                    setUrlError(null)
                                }
                            }}
                            autoFocus
                        />
                        <Button
                            onClick={handleUrlSubmit}
                            disabled={isValidatingUrl}
                            size="icon"
                            className="w-11"
                        >
                            {isValidatingUrl ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Check className="h-4 w-4" />
                            )}
                        </Button>
                        <Button
                            onClick={() => {
                                setMode('idle')
                                setUrlInput('')
                                setUrlError(null)
                            }}
                            variant="ghost"
                            size="icon"
                            className="w-11"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {urlError && (
                        <p className="flex items-center gap-1 text-xs text-red-500">
                            <AlertCircle className="h-3 w-3" />
                            {urlError}
                        </p>
                    )}
                </div>
            )}

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file)
                }}
            />
        </div>
    )
}

export default ItemImageUploader
