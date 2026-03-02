import type { Database } from '../database.types'

type Product = Database['public']['Enums']['app_product']

interface ProductLabels {
    deal: string
    dealPlural: string
    mainDate: string
    notFound: string
}

const LABELS: Record<Product, ProductLabels> = {
    TRIPS: {
        deal: 'Viagem',
        dealPlural: 'Viagens',
        mainDate: 'Data da Viagem',
        notFound: 'Viagem não encontrada',
    },
    WEDDING: {
        deal: 'Casamento',
        dealPlural: 'Casamentos',
        mainDate: 'Data do Casamento',
        notFound: 'Casamento não encontrado',
    },
    CORP: {
        deal: 'Evento',
        dealPlural: 'Eventos',
        mainDate: 'Data do Evento',
        notFound: 'Evento não encontrado',
    },
}

export function getProductLabels(produto?: Product | string | null): ProductLabels {
    return LABELS[(produto as Product) || 'TRIPS'] || LABELS.TRIPS
}
