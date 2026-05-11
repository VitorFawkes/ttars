import { Video } from 'lucide-react'
import type { ProposalItemWithOptions } from '@/types/proposals'
import type { Json } from '@/database.types'

interface VideoBlockProps {
    item: ProposalItemWithOptions
    onUpdate: (updates: Partial<ProposalItemWithOptions>) => void
}

function getEmbedUrl(url: string): string | null {
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/)
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
    return null
}

export function VideoBlock({ item, onUpdate }: VideoBlockProps) {
    const rc = (item.rich_content as Record<string, unknown>) || {}
    const videoUrl = (rc.video_url as string) || ''
    const embedUrl = videoUrl ? getEmbedUrl(videoUrl) : null

    const handleUrlChange = (url: string) => {
        onUpdate({ rich_content: { ...rc, video_url: url, is_video_block: true } as unknown as Json })
    }

    if (embedUrl) {
        return (
            <div className="relative">
                <div className="aspect-video rounded-lg overflow-hidden bg-black">
                    <iframe
                        src={embedUrl}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>
                <div className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <input
                        type="url"
                        value={videoUrl}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        className="w-full text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-200"
                    />
                </div>
            </div>
        )
    }

    return (
        <div className="p-8 text-center">
            <Video className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-3">Cole a URL do video (YouTube ou Vimeo)</p>
            <input
                type="url"
                placeholder="https://youtube.com/watch?v=..."
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleUrlChange((e.target as HTMLInputElement).value) }}
                onChange={(e) => handleUrlChange(e.target.value)}
                className="w-full max-w-sm mx-auto text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
            />
        </div>
    )
}
