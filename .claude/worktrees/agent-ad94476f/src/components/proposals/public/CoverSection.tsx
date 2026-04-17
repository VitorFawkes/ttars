import type { ProposalSectionWithItems } from '@/types/proposals'

interface CoverSectionProps {
    section: ProposalSectionWithItems
    title: string
}

export function CoverSection({ section, title }: CoverSectionProps) {
    // Get cover image from section config if available
    const coverImage = (section.config as { coverImage?: string })?.coverImage
    const subtitle = (section.config as { subtitle?: string })?.subtitle

    return (
        <div className="relative">
            {/* Background */}
            <div
                className="h-64 bg-gradient-to-br from-blue-600 to-indigo-700 relative overflow-hidden"
                style={coverImage ? {
                    backgroundImage: `url(${coverImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                } : undefined}
            >
                {coverImage && (
                    <div className="absolute inset-0 bg-black/40" />
                )}

                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
                    <h1 className="text-3xl font-bold mb-2 drop-shadow-lg">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-white/90 text-lg drop-shadow">
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>

            {/* Curved bottom edge */}
            <div className="absolute -bottom-4 left-0 right-0 h-8 bg-gradient-to-br from-slate-50 to-blue-50 rounded-t-[2rem]" />
        </div>
    )
}
