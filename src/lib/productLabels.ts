interface ProductLabels {
    deal: string
    dealPlural: string
    mainDate: string
    notFound: string
}

const LABELS: Record<string, ProductLabels> = {
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

export function getProductLabels(produto?: string | null): ProductLabels {
    return LABELS[produto || 'TRIPS'] || LABELS.TRIPS
}
