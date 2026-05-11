/**
 * MobileImageGallery - Galeria de imagens mobile-first para propostas públicas
 *
 * Features:
 * - Swipe para navegar (touch gestures nativo)
 * - Dots indicadores
 * - Tap para fullscreen lightbox
 * - Lazy loading com placeholder
 * - Keyboard navigation (acessibilidade)
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileImageGalleryProps {
    images: string[]
    altText?: string
    aspectRatio?: '16/9' | '4/3' | '1/1' | '3/2'
    onSlideChange?: (index: number) => void
    className?: string
}

const ASPECT_CLASSES = {
    '16/9': 'aspect-[16/9]',
    '4/3': 'aspect-[4/3]',
    '1/1': 'aspect-square',
    '3/2': 'aspect-[3/2]',
}

const SWIPE_THRESHOLD = 50

export function MobileImageGallery({
    images,
    altText = 'Imagem',
    aspectRatio = '16/9',
    onSlideChange,
    className,
}: MobileImageGalleryProps) {
    // Early return for empty/single image
    if (images.length === 0) return null
    if (images.length === 1) {
        return (
            <SingleImage
                src={images[0]}
                alt={altText}
                aspectRatio={aspectRatio}
                className={className}
            />
        )
    }

    // State
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
    const [touchStart, setTouchStart] = useState<number | null>(null)
    const [touchDelta, setTouchDelta] = useState(0)

    // Refs
    const containerRef = useRef<HTMLDivElement>(null)

    // Preload adjacent images
    useEffect(() => {
        const preloadIndices = [
            currentIndex - 1,
            currentIndex,
            currentIndex + 1,
        ].filter(i => i >= 0 && i < images.length)

        preloadIndices.forEach(index => {
            if (!loadedImages.has(index)) {
                const img = new Image()
                img.src = images[index]
                img.onload = () => {
                    setLoadedImages(prev => new Set([...prev, index]))
                }
            }
        })
    }, [currentIndex, images, loadedImages])

    // Notify parent of slide change
    useEffect(() => {
        onSlideChange?.(currentIndex)
    }, [currentIndex, onSlideChange])

    // Navigation handlers
    const goToSlide = useCallback((index: number) => {
        setCurrentIndex(Math.max(0, Math.min(index, images.length - 1)))
    }, [images.length])

    const goNext = useCallback(() => {
        if (currentIndex < images.length - 1) {
            setCurrentIndex(prev => prev + 1)
        }
    }, [currentIndex, images.length])

    const goPrev = useCallback(() => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1)
        }
    }, [currentIndex])

    // Touch handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStart(e.touches[0].clientX)
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStart === null) return
        setTouchDelta(e.touches[0].clientX - touchStart)
    }

    const handleTouchEnd = () => {
        if (Math.abs(touchDelta) > SWIPE_THRESHOLD) {
            if (touchDelta > 0) goPrev()
            else goNext()
        }
        setTouchStart(null)
        setTouchDelta(0)
    }

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowLeft':
                goPrev()
                break
            case 'ArrowRight':
                goNext()
                break
            case 'Escape':
                setIsFullscreen(false)
                break
        }
    }

    return (
        <>
            {/* Main Gallery */}
            <div
                ref={containerRef}
                className={cn('relative overflow-hidden', className)}
                role="region"
                aria-roledescription="carousel"
                aria-label={`Galeria: ${altText}`}
                tabIndex={0}
                onKeyDown={handleKeyDown}
            >
                {/* Slides Track */}
                <div
                    className={cn(
                        ASPECT_CLASSES[aspectRatio],
                        'relative w-full overflow-hidden'
                    )}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <div
                        className="flex transition-transform duration-300 ease-out h-full"
                        style={{
                            transform: `translateX(calc(-${currentIndex * 100}% + ${touchDelta}px))`,
                        }}
                    >
                        {images.map((src, index) => (
                            <div
                                key={src}
                                className="w-full h-full flex-shrink-0 relative"
                                role="group"
                                aria-roledescription="slide"
                                aria-label={`${altText} ${index + 1} de ${images.length}`}
                            >
                                {/* Placeholder skeleton */}
                                {!loadedImages.has(index) && (
                                    <div className="absolute inset-0 bg-slate-200 animate-pulse" />
                                )}

                                {/* Image */}
                                <img
                                    src={src}
                                    alt={`${altText} ${index + 1}`}
                                    className={cn(
                                        'w-full h-full object-cover',
                                        loadedImages.has(index) ? 'opacity-100' : 'opacity-0',
                                        'transition-opacity duration-200'
                                    )}
                                    loading={index <= currentIndex + 1 ? 'eager' : 'lazy'}
                                    onLoad={() => {
                                        setLoadedImages(prev => new Set([...prev, index]))
                                    }}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Tap to fullscreen overlay */}
                    <button
                        onClick={() => setIsFullscreen(true)}
                        className="absolute inset-0 z-10"
                        aria-label="Abrir em tela cheia"
                    >
                        {/* Zoom icon hint */}
                        <div className="absolute top-3 right-12 p-2 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <ZoomIn className="h-4 w-4 text-white" />
                        </div>
                    </button>
                </div>

                {/* Navigation Arrows (desktop) */}
                <button
                    onClick={(e) => { e.stopPropagation(); goPrev() }}
                    disabled={currentIndex === 0}
                    className={cn(
                        'hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-20',
                        'w-10 h-10 items-center justify-center rounded-full',
                        'bg-white/90 shadow-lg hover:bg-white transition-colors',
                        'disabled:opacity-30 disabled:cursor-not-allowed'
                    )}
                    aria-label="Imagem anterior"
                >
                    <ChevronLeft className="h-5 w-5 text-slate-700" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); goNext() }}
                    disabled={currentIndex === images.length - 1}
                    className={cn(
                        'hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-20',
                        'w-10 h-10 items-center justify-center rounded-full',
                        'bg-white/90 shadow-lg hover:bg-white transition-colors',
                        'disabled:opacity-30 disabled:cursor-not-allowed'
                    )}
                    aria-label="Próxima imagem"
                >
                    <ChevronRight className="h-5 w-5 text-slate-700" />
                </button>

                {/* Counter badge */}
                <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/50 rounded-full text-xs text-white font-medium z-20">
                    {currentIndex + 1} / {images.length}
                </div>
            </div>

            {/* Dots indicator */}
            <Dots
                total={images.length}
                current={currentIndex}
                onSelect={goToSlide}
            />

            {/* Fullscreen Lightbox */}
            {isFullscreen && (
                <Lightbox
                    images={images}
                    currentIndex={currentIndex}
                    altText={altText}
                    onClose={() => setIsFullscreen(false)}
                    onNavigate={goToSlide}
                />
            )}
        </>
    )
}

// ============================================
// Sub-components
// ============================================

function SingleImage({
    src,
    alt,
    aspectRatio,
    className,
}: {
    src: string
    alt: string
    aspectRatio: string
    className?: string
}) {
    const [loaded, setLoaded] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)

    return (
        <>
            <div
                className={cn(
                    'relative overflow-hidden cursor-pointer group',
                    ASPECT_CLASSES[aspectRatio as keyof typeof ASPECT_CLASSES],
                    className
                )}
                onClick={() => setIsFullscreen(true)}
            >
                {!loaded && <div className="absolute inset-0 bg-slate-200 animate-pulse" />}
                <img
                    src={src}
                    alt={alt}
                    className={cn(
                        'w-full h-full object-cover transition-opacity duration-200',
                        loaded ? 'opacity-100' : 'opacity-0'
                    )}
                    loading="lazy"
                    onLoad={() => setLoaded(true)}
                />
                <div className="absolute top-3 right-3 p-2 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="h-4 w-4 text-white" />
                </div>
            </div>

            {isFullscreen && (
                <Lightbox
                    images={[src]}
                    currentIndex={0}
                    altText={alt}
                    onClose={() => setIsFullscreen(false)}
                    onNavigate={() => {}}
                />
            )}
        </>
    )
}

function Dots({
    total,
    current,
    onSelect,
}: {
    total: number
    current: number
    onSelect: (index: number) => void
}) {
    return (
        <div
            className="flex items-center justify-center gap-1.5 mt-3"
            role="tablist"
            aria-label="Navegação da galeria"
        >
            {Array.from({ length: total }).map((_, index) => (
                <button
                    key={index}
                    onClick={() => onSelect(index)}
                    role="tab"
                    aria-selected={index === current}
                    aria-label={`Ir para imagem ${index + 1}`}
                    tabIndex={index === current ? 0 : -1}
                    className={cn(
                        'w-2 h-2 rounded-full transition-all duration-200',
                        index === current
                            ? 'w-6 bg-blue-600'
                            : 'bg-slate-300 hover:bg-slate-400'
                    )}
                />
            ))}
        </div>
    )
}

function Lightbox({
    images,
    currentIndex,
    altText,
    onClose,
    onNavigate,
}: {
    images: string[]
    currentIndex: number
    altText: string
    onClose: () => void
    onNavigate: (index: number) => void
}) {
    const [index, setIndex] = useState(currentIndex)
    const [touchStart, setTouchStart] = useState<number | null>(null)
    const [touchDelta, setTouchDelta] = useState(0)

    // Sync with parent
    useEffect(() => {
        onNavigate(index)
    }, [index, onNavigate])

    // Touch handlers
    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStart(e.touches[0].clientX)
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStart === null) return
        setTouchDelta(e.touches[0].clientX - touchStart)
    }

    const handleTouchEnd = () => {
        if (Math.abs(touchDelta) > SWIPE_THRESHOLD) {
            if (touchDelta > 0 && index > 0) {
                setIndex(prev => prev - 1)
            } else if (touchDelta < 0 && index < images.length - 1) {
                setIndex(prev => prev + 1)
            }
        }
        setTouchStart(null)
        setTouchDelta(0)
    }

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowLeft':
                    if (index > 0) setIndex(prev => prev - 1)
                    break
                case 'ArrowRight':
                    if (index < images.length - 1) setIndex(prev => prev + 1)
                    break
                case 'Escape':
                    onClose()
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [index, images.length, onClose])

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = ''
        }
    }, [])

    return (
        <div
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-label="Visualizador de imagens"
        >
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-50 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                aria-label="Fechar"
            >
                <X className="h-6 w-6 text-white" />
            </button>

            {/* Counter */}
            <div className="absolute top-4 left-4 z-50 px-3 py-1.5 bg-white/10 rounded-full text-sm text-white font-medium">
                {index + 1} / {images.length}
            </div>

            {/* Image container */}
            <div
                className="w-full h-full flex items-center justify-center"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <img
                    src={images[index]}
                    alt={`${altText} ${index + 1}`}
                    className="max-w-full max-h-full object-contain"
                    style={{
                        transform: `translateX(${touchDelta}px)`,
                        transition: touchDelta ? 'none' : 'transform 0.3s ease-out',
                    }}
                />
            </div>

            {/* Navigation arrows */}
            {images.length > 1 && (
                <>
                    <button
                        onClick={() => index > 0 && setIndex(prev => prev - 1)}
                        disabled={index === 0}
                        className={cn(
                            'absolute left-4 top-1/2 -translate-y-1/2 z-50',
                            'w-12 h-12 flex items-center justify-center rounded-full',
                            'bg-white/10 hover:bg-white/20 transition-colors',
                            'disabled:opacity-20 disabled:cursor-not-allowed'
                        )}
                        aria-label="Imagem anterior"
                    >
                        <ChevronLeft className="h-6 w-6 text-white" />
                    </button>
                    <button
                        onClick={() => index < images.length - 1 && setIndex(prev => prev + 1)}
                        disabled={index === images.length - 1}
                        className={cn(
                            'absolute right-4 top-1/2 -translate-y-1/2 z-50',
                            'w-12 h-12 flex items-center justify-center rounded-full',
                            'bg-white/10 hover:bg-white/20 transition-colors',
                            'disabled:opacity-20 disabled:cursor-not-allowed'
                        )}
                        aria-label="Próxima imagem"
                    >
                        <ChevronRight className="h-6 w-6 text-white" />
                    </button>
                </>
            )}

            {/* Dots */}
            {images.length > 1 && (
                <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2">
                    {images.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setIndex(i)}
                            className={cn(
                                'w-2 h-2 rounded-full transition-all',
                                i === index ? 'w-6 bg-white' : 'bg-white/40'
                            )}
                            aria-label={`Ir para imagem ${i + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export default MobileImageGallery
