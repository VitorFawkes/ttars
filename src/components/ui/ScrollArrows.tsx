import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ScrollArrowsProps {
    showLeft: boolean
    showRight: boolean
    onScrollLeft: () => void
    onScrollRight: () => void
    className?: string
}

/**
 * Elegant floating scroll arrows that appear on edges when there's more content.
 * Styled with glassmorphism for premium look.
 */
export function ScrollArrows({
    showLeft,
    showRight,
    onScrollLeft,
    onScrollRight,
    className,
}: ScrollArrowsProps) {
    return (
        <>
            {/* Left Arrow */}
            <button
                onClick={onScrollLeft}
                className={cn(
                    "absolute left-2 top-1/2 -translate-y-1/2 z-40",
                    "w-10 h-10 rounded-full",
                    "bg-white/90 backdrop-blur-sm shadow-lg border border-gray-200/50",
                    "flex items-center justify-center",
                    "text-gray-600 hover:text-primary hover:bg-white hover:shadow-xl",
                    "transition-all duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30",
                    showLeft
                        ? "opacity-100 translate-x-0"
                        : "opacity-0 -translate-x-4 pointer-events-none",
                    className
                )}
                aria-label="Scroll left"
            >
                <ChevronLeft className="h-5 w-5" />
            </button>

            {/* Right Arrow */}
            <button
                onClick={onScrollRight}
                className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 z-40",
                    "w-10 h-10 rounded-full",
                    "bg-white/90 backdrop-blur-sm shadow-lg border border-gray-200/50",
                    "flex items-center justify-center",
                    "text-gray-600 hover:text-primary hover:bg-white hover:shadow-xl",
                    "transition-all duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30",
                    showRight
                        ? "opacity-100 translate-x-0"
                        : "opacity-0 translate-x-4 pointer-events-none",
                    className
                )}
                aria-label="Scroll right"
            >
                <ChevronRight className="h-5 w-5" />
            </button>
        </>
    )
}
