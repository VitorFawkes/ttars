/**
 * ProposalHero - Premium hero section for client proposal view
 * 
 * Features:
 * - Fullscreen background image (from cover or first item)
 * - Trip title with elegant typography
 * - Date range and travelers count
 * - Gradient overlay for readability
 */

import { useMemo } from 'react'
import { Calendar, Users } from 'lucide-react'

interface ProposalHeroProps {
    title: string
    subtitle?: string
    imageUrl?: string
    dates?: string
    travelers?: number
}

export function ProposalHero({
    title,
    subtitle,
    imageUrl,
    dates,
    travelers,
}: ProposalHeroProps) {
    // Fallback gradient when no image
    const backgroundStyle = useMemo(() => {
        if (imageUrl) {
            return {
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }
        }
        return {}
    }, [imageUrl])

    return (
        <div
            className="relative h-[30vh] min-h-[200px] max-h-[280px] w-full"
            style={backgroundStyle}
        >
            {/* Fallback gradient if no image */}
            {!imageUrl && (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900" />
            )}

            {/* Overlay gradient for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

            {/* Content */}
            <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8 lg:p-12">
                <div className="max-w-3xl mx-auto w-full">
                    {/* Subtitle/Agency */}
                    {subtitle && (
                        <p className="text-white/70 text-sm font-medium tracking-wider uppercase mb-2">
                            {subtitle}
                        </p>
                    )}

                    {/* Title */}
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight">
                        {title}
                    </h1>

                    {/* Meta info */}
                    {(dates || travelers) && (
                        <div className="flex flex-wrap items-center gap-4 mt-4">
                            {dates && (
                                <div className="flex items-center gap-2 text-white/80">
                                    <Calendar className="h-4 w-4" />
                                    <span className="text-sm">{dates}</span>
                                </div>
                            )}
                            {travelers && travelers > 0 && (
                                <div className="flex items-center gap-2 text-white/80">
                                    <Users className="h-4 w-4" />
                                    <span className="text-sm">
                                        {travelers} {travelers === 1 ? 'viajante' : 'viajantes'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Scroll indicator */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-bounce">
                    <div className="w-6 h-10 rounded-full border-2 border-white/50 flex items-start justify-center p-1.5">
                        <div className="w-1.5 h-2.5 bg-white/70 rounded-full animate-pulse" />
                    </div>
                </div>
            </div>
        </div>
    )
}
