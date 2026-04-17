/**
 * OptimizedImage - Componente de imagem otimizada para mobile
 *
 * Features:
 * - Lazy loading nativo
 * - Placeholder animado durante carregamento
 * - Otimização de URL para Supabase Storage
 * - Aspect ratio configurável
 * - Fallback quando não há imagem
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import * as LucideIcons from 'lucide-react'

interface OptimizedImageProps {
    src?: string | null
    alt: string
    aspectRatio?: '16/9' | '4/3' | '1/1' | '3/2'
    className?: string
    fallbackIcon?: keyof typeof LucideIcons
    fallbackColor?: string
    priority?: boolean
}

export function OptimizedImage({
    src,
    alt,
    aspectRatio = '16/9',
    className,
    fallbackIcon = 'Image',
    fallbackColor = 'bg-slate-100',
    priority = false,
}: OptimizedImageProps) {
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState(false)

    // Map aspect ratio to Tailwind class
    const aspectClass = {
        '16/9': 'aspect-[16/9]',
        '4/3': 'aspect-[4/3]',
        '1/1': 'aspect-square',
        '3/2': 'aspect-[3/2]',
    }[aspectRatio]

    // Optimize Supabase storage URLs
    const optimizedSrc = src && src.includes('supabase.co/storage')
        ? `${src}${src.includes('?') ? '&' : '?'}width=800&quality=80`
        : src

    // Get fallback icon component
    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[fallbackIcon] || LucideIcons.Image

    // Show fallback if no src or error
    if (!src || error) {
        return (
            <div className={cn(
                'relative overflow-hidden',
                aspectClass,
                fallbackColor,
                'flex items-center justify-center',
                className
            )}>
                <IconComponent className="h-12 w-12 text-slate-300" />
            </div>
        )
    }

    return (
        <div className={cn(
            'relative overflow-hidden',
            aspectClass,
            className
        )}>
            {/* Placeholder animado */}
            {!loaded && (
                <div className="absolute inset-0 bg-slate-200 animate-pulse" />
            )}

            {/* Imagem */}
            <img
                src={optimizedSrc!}
                alt={alt}
                loading={priority ? 'eager' : 'lazy'}
                onLoad={() => setLoaded(true)}
                onError={() => setError(true)}
                className={cn(
                    'w-full h-full object-cover transition-opacity duration-300',
                    loaded ? 'opacity-100' : 'opacity-0'
                )}
            />
        </div>
    )
}
