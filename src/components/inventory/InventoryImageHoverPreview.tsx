import { useState, type ReactNode } from 'react'
import { Package } from 'lucide-react'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'

interface Props {
    imagePath: string | null
    productName: string
    side?: 'top' | 'right' | 'bottom' | 'left'
    children: ReactNode
}

export default function InventoryImageHoverPreview({
    imagePath,
    productName,
    side = 'right',
    children,
}: Props) {
    const [imgError, setImgError] = useState(false)

    if (!imagePath) return <>{children}</>

    const imageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/inventory-images/${imagePath}`

    return (
        <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>{children}</HoverCardTrigger>
            <HoverCardContent side={side} className="w-auto p-2">
                <div className="flex flex-col gap-2">
                    <div className="h-64 w-64 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden">
                        {imgError ? (
                            <Package className="h-10 w-10 text-slate-300" />
                        ) : (
                            <img
                                src={imageUrl}
                                alt={productName}
                                className="h-full w-full object-cover"
                                onError={() => setImgError(true)}
                            />
                        )}
                    </div>
                    <p className="text-sm font-medium text-slate-900 max-w-64 truncate px-1">{productName}</p>
                </div>
            </HoverCardContent>
        </HoverCard>
    )
}
