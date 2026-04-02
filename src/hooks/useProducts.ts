import { useQuery } from '@tanstack/react-query'
import { Plane, Heart, Building2, type LucideIcon, HelpCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
type Product = string

const ICON_MAP: Record<string, LucideIcon> = {
    Plane,
    Heart,
    Building2,
}

export interface ProductMetadata {
    id: string
    slug: Product
    name: string
    name_short: string
    icon: LucideIcon
    icon_name: string
    color_class: string
    pipeline_id: string | null
    deal_label: string | null
    deal_plural: string | null
    main_date_label: string | null
    not_found_label: string | null
    active: boolean
    display_order: number
}

// Fallback for when DB query hasn't loaded yet (prevents blank UI)
const FALLBACK_PRODUCTS: ProductMetadata[] = [
    { id: '', slug: 'TRIPS', name: 'Welcome Trips', name_short: 'Trips', icon: Plane, icon_name: 'Plane', color_class: 'text-teal-500', pipeline_id: null, deal_label: 'Viagem', deal_plural: 'Viagens', main_date_label: 'Data da Viagem', not_found_label: 'Viagem não encontrada', active: true, display_order: 1 },
    { id: '', slug: 'WEDDING', name: 'Welcome Wedding', name_short: 'Wedding', icon: Heart, icon_name: 'Heart', color_class: 'text-rose-500', pipeline_id: null, deal_label: 'Casamento', deal_plural: 'Casamentos', main_date_label: 'Data do Casamento', not_found_label: 'Casamento não encontrado', active: true, display_order: 2 },
    { id: '', slug: 'CORP', name: 'Welcome Corp', name_short: 'Corp', icon: Building2, icon_name: 'Building2', color_class: 'text-purple-500', pipeline_id: null, deal_label: 'Evento', deal_plural: 'Eventos', main_date_label: 'Data do Evento', not_found_label: 'Evento não encontrado', active: false, display_order: 3 },
]

export function useProducts(includeInactive = false) {
    const query = useQuery({
        queryKey: ['products', includeInactive],
        queryFn: async () => {
            let q = supabase
                .from('products')
                .select('*')
                .order('display_order')

            if (!includeInactive) {
                q = q.eq('active', true)
            }

            const { data, error } = await q
            if (error) throw error

            return (data ?? []).map((p): ProductMetadata => ({
                id: p.id,
                slug: p.slug as Product,
                name: p.name,
                name_short: p.name_short,
                icon: ICON_MAP[p.icon_name] ?? HelpCircle,
                icon_name: p.icon_name,
                color_class: p.color_class,
                pipeline_id: p.pipeline_id,
                deal_label: p.deal_label,
                deal_plural: p.deal_plural,
                main_date_label: p.main_date_label,
                not_found_label: p.not_found_label,
                active: p.active,
                display_order: p.display_order,
            }))
        },
        staleTime: 5 * 60 * 1000, // 5 min — products rarely change
    })

    return {
        products: query.data ?? FALLBACK_PRODUCTS.filter(p => includeInactive || p.active),
        isLoading: query.isLoading,
        error: query.error,
    }
}
