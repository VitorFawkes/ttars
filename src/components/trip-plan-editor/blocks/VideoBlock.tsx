import { Input } from '@/components/ui/Input'

interface VideoBlockProps {
    data: Record<string, unknown>
    onChange: (data: Record<string, unknown>) => void
}

export function VideoBlock({ data, onChange }: VideoBlockProps) {
    const url = String(data.url || '')
    const caption = String(data.caption || '')

    // Detectar provider e gerar embed URL
    const embedUrl = getEmbedUrl(url)

    return (
        <div className="space-y-2">
            <Input
                value={url}
                onChange={(e) => onChange({ ...data, url: e.target.value, provider: detectProvider(e.target.value) })}
                placeholder="URL do YouTube ou Vimeo"
                className="h-8 text-xs"
            />
            {embedUrl && (
                <div className="aspect-video rounded-lg overflow-hidden bg-black">
                    <iframe
                        src={embedUrl}
                        className="w-full h-full"
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    />
                </div>
            )}
            <Input
                value={caption}
                onChange={(e) => onChange({ ...data, caption: e.target.value })}
                placeholder="Legenda (opcional)"
                className="h-7 text-xs"
            />
        </div>
    )
}

function detectProvider(url: string): string {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
    if (url.includes('vimeo.com')) return 'vimeo'
    return 'other'
}

function getEmbedUrl(url: string): string | null {
    if (!url) return null

    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`

    return null
}
