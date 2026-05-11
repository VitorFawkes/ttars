/**
 * SectionNav - Sticky navigation for quick section jumping
 * 
 * Features:
 * - Horizontal scrollable pills on mobile
 * - Sticky positioning after hero
 * - Active section indicator
 * - Smooth scroll to section
 */

import { useEffect, useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Plane, Building2, Bus, Star, Shield, FileText, Check } from 'lucide-react'

interface Section {
    id: string
    title: string
    section_type: string
}

interface SectionNavProps {
    sections: Section[]
    activeSection?: string
    completedSections?: string[]
    incompleteSections?: string[]
    onSectionClick: (sectionId: string) => void
}

const SECTION_ICONS: Record<string, React.ElementType> = {
    flights: Plane,
    hotels: Building2,
    transfers: Bus,
    experiences: Star,
    insurance: Shield,
    custom: FileText,
}

// Remove emoji from title
function cleanTitle(title: string): string {
    return title.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim()
}

export function SectionNav({
    sections,
    activeSection,
    completedSections = [],
    incompleteSections = [],
    onSectionClick,
}: SectionNavProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [showLeftFade, setShowLeftFade] = useState(false)
    const [showRightFade, setShowRightFade] = useState(false)

    // Check scroll position for fade indicators
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        const checkScroll = () => {
            setShowLeftFade(el.scrollLeft > 10)
            setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
        }

        checkScroll()
        el.addEventListener('scroll', checkScroll)
        return () => el.removeEventListener('scroll', checkScroll)
    }, [sections])

    if (sections.length <= 1) return null

    return (
        <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
            <div className="relative">
                {/* Left fade */}
                {showLeftFade && (
                    <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
                )}

                {/* Right fade */}
                {showRightFade && (
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
                )}

                {/* Scrollable pills */}
                <div
                    ref={scrollRef}
                    className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide"
                >
                    {sections.map((section) => {
                        const Icon = SECTION_ICONS[section.section_type] || FileText
                        const isActive = activeSection === section.id
                        const isCompleted = completedSections.includes(section.id)
                        const isIncomplete = incompleteSections.includes(section.id)

                        return (
                            <button
                                key={section.id}
                                onClick={() => onSectionClick(section.id)}
                                className={cn(
                                    "relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                                    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                                    isActive
                                        ? "bg-slate-900 text-white shadow-sm"
                                        : isIncomplete
                                            ? "bg-red-50 text-red-700 hover:bg-red-100"
                                            : isCompleted
                                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                            >
                                {/* Indicador de status */}
                                {!isActive && (
                                    <div className={cn(
                                        "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center",
                                        isIncomplete && "bg-red-500",
                                        isCompleted && !isIncomplete && "bg-emerald-500"
                                    )}>
                                        {isIncomplete ? (
                                            <span className="text-white text-xs font-bold">!</span>
                                        ) : isCompleted ? (
                                            <Check className="h-2.5 w-2.5 text-white" />
                                        ) : null}
                                    </div>
                                )}
                                <Icon className="h-4 w-4 flex-shrink-0" />
                                <span>{cleanTitle(section.title)}</span>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
