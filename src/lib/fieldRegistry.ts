import TextFieldInput from '../components/pipeline/fields/TextFieldInput'
import DateRangeField from '../components/pipeline/fields/DateRangeField'
import DestinosField from '../components/pipeline/fields/DestinosField'
import PessoasField from '../components/pipeline/fields/PessoasField'
import OrcamentoField from '../components/pipeline/fields/OrcamentoField'
import TaxaPlanejamentoField from '../components/pipeline/fields/TaxaPlanejamentoField'

export interface FieldConfig {
    name: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: React.ComponentType<any>
    label: string
}

// Registry mapping field names to their components
export const TRIPS_FIELD_REGISTRY: Record<string, FieldConfig> = {
    destinos: {
        name: 'destinos',
        component: DestinosField,
        label: 'Destinos'
    },
    epoca_viagem: {
        name: 'epoca_viagem',
        component: DateRangeField,
        label: 'Época da Viagem'
    },
    pessoas: {
        name: 'pessoas',
        component: PessoasField,
        label: 'Viajantes'
    },
    motivo: {
        name: 'motivo',
        component: TextFieldInput,
        label: 'Motivo da Viagem'
    },
    orcamento: {
        name: 'orcamento',
        component: OrcamentoField,
        label: 'Orçamento'
    },
    taxa_planejamento: {
        name: 'taxa_planejamento',
        component: TaxaPlanejamentoField,
        label: 'Taxa de Planejamento'
    }
}

// For WEDDING product — key fields for proposal auto-fill and card defaults
export const WEDDING_FIELD_REGISTRY: Record<string, FieldConfig> = {
    ww_data_casamento: {
        name: 'ww_data_casamento',
        component: TextFieldInput,
        label: 'Data do Casamento'
    },
    ww_destino: {
        name: 'ww_destino',
        component: TextFieldInput,
        label: 'Destino'
    },
    ww_tipo_casamento: {
        name: 'ww_tipo_casamento',
        component: TextFieldInput,
        label: 'Tipo de Casamento'
    },
    ww_orcamento_faixa: {
        name: 'ww_orcamento_faixa',
        component: TextFieldInput,
        label: 'Orçamento'
    },
    ww_num_convidados: {
        name: 'ww_num_convidados',
        component: TextFieldInput,
        label: 'Número de Convidados'
    },
    ww_nome_parceiro: {
        name: 'ww_nome_parceiro',
        component: TextFieldInput,
        label: 'Nome do(a) Noivo(a) 2'
    },
    ww_closer_valor_contrato: {
        name: 'ww_closer_valor_contrato',
        component: TextFieldInput,
        label: 'Valor do Contrato'
    }
}

// For CORP product (future expansion)
export const CORP_FIELD_REGISTRY: Record<string, FieldConfig> = {
    tipo_evento: {
        name: 'tipo_evento',
        component: TextFieldInput,
        label: 'Tipo de Evento'
    },
    empresa: {
        name: 'empresa',
        component: TextFieldInput,
        label: 'Empresa'
    },
    num_participantes: {
        name: 'num_participantes',
        component: TextFieldInput,
        label: 'Número de Participantes'
    }
}

export function getFieldRegistry(produto: 'TRIPS' | 'WEDDING' | 'CORP'): Record<string, FieldConfig> {
    switch (produto) {
        case 'TRIPS':
            return TRIPS_FIELD_REGISTRY
        case 'WEDDING':
            return WEDDING_FIELD_REGISTRY
        case 'CORP':
            return CORP_FIELD_REGISTRY
        default:
            return TRIPS_FIELD_REGISTRY
    }
}

// ============================================
// Proposal Auto-Fill from Card Data
// ============================================

interface DestinationData {
    nome?: string
    pais?: string
}

interface PessoasData {
    adultos?: number
    criancas?: number
    bebes?: number
}

interface EpocaViagemData {
    inicio?: string
    fim?: string
    flexivel?: boolean
}

export interface CardProposalDefaults {
    // For proposal cover/header
    destination: string | null
    destinationCountry: string | null
    travelDates: { start: string | null; end: string | null; flexible: boolean } | null
    pax: { adults: number; children: number; infants: number } | null
    tripMotivo: string | null

    // Computed
    totalPax: number
    formattedDates: string | null
}

/**
 * Extracts proposal defaults from a card's produto_data.
 * Uses the modular fieldRegistry pattern - reads from JSONB, never hardcoded columns.
 * 
 * @param card - The card object with produto and produto_data
 * @returns CardProposalDefaults object with extracted values
 */
export function getCardDefaults(card: {
    produto?: string | null
    produto_data?: Record<string, unknown> | null
}): CardProposalDefaults {
    const defaults: CardProposalDefaults = {
        destination: null,
        destinationCountry: null,
        travelDates: null,
        pax: null,
        tripMotivo: null,
        totalPax: 0,
        formattedDates: null
    }

    if (!card.produto_data) return defaults

    const data = card.produto_data as Record<string, unknown>
    const produto = (card.produto || 'TRIPS') as 'TRIPS' | 'WEDDING' | 'CORP'
    const registry = getFieldRegistry(produto)

    // Extract DESTINOS if field exists in registry
    if (registry.destinos && data.destinos) {
        const destinos = data.destinos as DestinationData[]
        if (Array.isArray(destinos) && destinos.length > 0) {
            const first = destinos[0]
            defaults.destination = first.nome || null
            defaults.destinationCountry = first.pais || null
        }
    }

    // Extract EPOCA_VIAGEM if field exists in registry
    if (registry.epoca_viagem && data.epoca_viagem) {
        const epoca = data.epoca_viagem as EpocaViagemData
        defaults.travelDates = {
            start: epoca.inicio || null,
            end: epoca.fim || null,
            flexible: epoca.flexivel || false
        }

        // Format dates for display
        if (epoca.inicio && epoca.fim) {
            try {
                const start = new Date(epoca.inicio)
                const end = new Date(epoca.fim)
                const formatter = new Intl.DateTimeFormat('pt-BR', {
                    day: '2-digit',
                    month: 'short'
                })
                defaults.formattedDates = `${formatter.format(start)} - ${formatter.format(end)}`
            } catch {
                // If date parsing fails, leave as null
            }
        }
    }

    // Extract PESSOAS if field exists in registry
    if (registry.pessoas && data.pessoas) {
        const pessoas = data.pessoas as PessoasData
        defaults.pax = {
            adults: pessoas.adultos || 0,
            children: pessoas.criancas || 0,
            infants: pessoas.bebes || 0
        }
        defaults.totalPax = (pessoas.adultos || 0) + (pessoas.criancas || 0)
    }

    // Extract MOTIVO if field exists in registry
    if (registry.motivo && data.motivo) {
        defaults.tripMotivo = data.motivo as string
    }

    return defaults
}
