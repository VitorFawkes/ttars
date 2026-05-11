import { useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
    Video,
    Play,
    X,
    Check,
    Loader2,
    ExternalLink,
    Youtube,
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * VideoBlock - Block for embedding YouTube/Vimeo videos
 * 
 * Features:
 * - Paste YouTube or Vimeo URL
 * - Auto-extract video ID
 * - Responsive embed
 * - Preview thumbnail
 */

interface VideoBlockProps {
    videoUrl: string | null
    isPreview?: boolean
    onVideoChange?: (url: string | null) => void
}

// Extract video info from URL
function parseVideoUrl(url: string): { platform: 'youtube' | 'vimeo' | null; id: string | null } {
    if (!url) return { platform: null, id: null }

    // YouTube patterns
    const youtubePatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/,
        /youtube\.com\/shorts\/([^&\?\/]+)/,
    ]

    for (const pattern of youtubePatterns) {
        const match = url.match(pattern)
        if (match) return { platform: 'youtube', id: match[1] }
    }

    // Vimeo patterns
    const vimeoPatterns = [
        /vimeo\.com\/(\d+)/,
        /player\.vimeo\.com\/video\/(\d+)/,
    ]

    for (const pattern of vimeoPatterns) {
        const match = url.match(pattern)
        if (match) return { platform: 'vimeo', id: match[1] }
    }

    return { platform: null, id: null }
}

export function VideoBlock({
    videoUrl,
    isPreview = false,
    onVideoChange,
}: VideoBlockProps) {
    const [urlInput, setUrlInput] = useState('')
    const [isEditing, setIsEditing] = useState(!videoUrl)
    const [isValidating, setIsValidating] = useState(false)

    // Parse current video
    const videoInfo = useMemo(() => {
        if (!videoUrl) return { platform: null, id: null }
        return parseVideoUrl(videoUrl)
    }, [videoUrl])

    // Get embed URL
    const embedUrl = useMemo(() => {
        if (!videoInfo.platform || !videoInfo.id) return null

        if (videoInfo.platform === 'youtube') {
            return `https://www.youtube.com/embed/${videoInfo.id}?rel=0`
        }
        if (videoInfo.platform === 'vimeo') {
            return `https://player.vimeo.com/video/${videoInfo.id}`
        }
        return null
    }, [videoInfo])

    // Get thumbnail URL (for edit mode preview)
    const thumbnailUrl = useMemo(() => {
        if (!videoInfo.platform || !videoInfo.id) return null

        if (videoInfo.platform === 'youtube') {
            return `https://img.youtube.com/vi/${videoInfo.id}/maxresdefault.jpg`
        }
        // Vimeo thumbnails require API call, skip for now
        return null
    }, [videoInfo])

    // Handle URL submission
    const handleSubmit = useCallback(async () => {
        if (!urlInput.trim()) return

        setIsValidating(true)
        try {
            const info = parseVideoUrl(urlInput.trim())

            if (!info.platform || !info.id) {
                toast.error('URL inválida. Use YouTube ou Vimeo.')
                return
            }

            onVideoChange?.(urlInput.trim())
            setUrlInput('')
            setIsEditing(false)
            toast.success(`Vídeo do ${info.platform === 'youtube' ? 'YouTube' : 'Vimeo'} adicionado!`)
        } finally {
            setIsValidating(false)
        }
    }, [urlInput, onVideoChange])

    // Handle remove
    const handleRemove = useCallback(() => {
        onVideoChange?.(null)
        setIsEditing(true)
    }, [onVideoChange])

    // Preview mode - just show the embed
    if (isPreview && embedUrl) {
        return (
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-900">
                <iframe
                    src={embedUrl}
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Video embed"
                />
            </div>
        )
    }

    // No video - show input
    if (!videoUrl || isEditing) {
        return (
            <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                            <Youtube className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-slate-900">
                                Adicionar Vídeo
                            </h4>
                            <p className="text-xs text-slate-500">
                                Cole um link do YouTube ou Vimeo
                            </p>
                        </div>
                    </div>

                    {/* URL Input */}
                    <div className="flex items-center gap-2">
                        <Input
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            placeholder="https://youtube.com/watch?v=..."
                            className="flex-1"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSubmit()
                                if (e.key === 'Escape' && videoUrl) {
                                    setIsEditing(false)
                                    setUrlInput('')
                                }
                            }}
                            autoFocus
                        />
                        <Button
                            size="icon"
                            onClick={handleSubmit}
                            disabled={isValidating || !urlInput.trim()}
                            className="w-10"
                        >
                            {isValidating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Check className="h-4 w-4" />
                            )}
                        </Button>
                        {videoUrl && (
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                    setIsEditing(false)
                                    setUrlInput('')
                                }}
                                className="w-10"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    {/* Preview of input */}
                    {urlInput && parseVideoUrl(urlInput).platform && (
                        <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                            <Check className="h-4 w-4 text-green-600" />
                            <span className="text-xs text-green-700">
                                {parseVideoUrl(urlInput).platform === 'youtube' ? 'YouTube' : 'Vimeo'} detectado
                            </span>
                        </div>
                    )}

                    {/* Examples */}
                    <div className="text-xs text-slate-400 space-y-1">
                        <p>Exemplos de links suportados:</p>
                        <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                            <li>youtube.com/watch?v=abc123</li>
                            <li>youtu.be/abc123</li>
                            <li>vimeo.com/123456789</li>
                        </ul>
                    </div>
                </div>
            </div>
        )
    }

    // Has video - show preview with edit option
    return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* Video Preview */}
            <div className="relative aspect-video bg-slate-900">
                {embedUrl ? (
                    <iframe
                        src={embedUrl}
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="Video embed"
                    />
                ) : thumbnailUrl ? (
                    <>
                        <img
                            src={thumbnailUrl}
                            alt="Video thumbnail"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center">
                                <Play className="h-8 w-8 text-white ml-1" />
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Video className="h-12 w-12 text-slate-500" />
                    </div>
                )}
            </div>

            {/* Actions */}
            {!isPreview && (
                <div className="p-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {videoInfo.platform === 'youtube' && (
                            <Youtube className="h-4 w-4 text-red-500" />
                        )}
                        <span className="text-xs text-slate-500 truncate max-w-[200px]">
                            {videoUrl}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(videoUrl!, '_blank')}
                            className="h-8"
                        >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Abrir
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsEditing(true)}
                            className="h-8"
                        >
                            Trocar
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleRemove}
                            className="h-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default VideoBlock
