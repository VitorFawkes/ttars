/**
 * Resolve o valor de um campo arbitrário de um card para exibição no modal
 * de confirmação. Lê, em ordem:
 *   1. Coluna direta de `cards` (valor_final, valor_estimado, titulo, ...)
 *   2. card.produto_data[fieldKey] (JSONB do produto)
 *   3. card.briefing_inicial[fieldKey] (fallback legado)
 *   4. Containers de seção do widget ObservacoesEstruturadas
 *      (produto_data.observacoes_criticas, briefing_inicial.observacoes, ...)
 *
 * Devolve um objeto { raw, display } — display é a string pronta para UI.
 */

type UnknownCard = Record<string, unknown> & {
    produto_data?: Record<string, unknown> | null
    briefing_inicial?: Record<string, unknown> | null
}

// Fields da mesma seção podem viver sob aliases diferentes por fase.
const SECTION_ALIASES = ['observacoes_criticas', 'observacoes_pos_venda', 'observacoes']

function findInContainer(container: unknown, fieldKey: string): unknown {
    if (!container || typeof container !== 'object') return undefined
    const obj = container as Record<string, unknown>

    if (fieldKey in obj) {
        const direct = obj[fieldKey]
        if (direct !== null && direct !== undefined && direct !== '') return direct
    }

    for (const alias of SECTION_ALIASES) {
        const sub = obj[alias]
        if (sub && typeof sub === 'object' && fieldKey in (sub as Record<string, unknown>)) {
            const nested = (sub as Record<string, unknown>)[fieldKey]
            if (nested !== null && nested !== undefined && nested !== '') return nested
        }
    }

    return undefined
}

export interface FieldValue {
    raw: unknown
    display: string
    isEmpty: boolean
}

const EMPTY: FieldValue = { raw: null, display: '—', isEmpty: true }

function formatDateBR(iso: string): string {
    if (!iso || typeof iso !== 'string') return ''
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return iso
    return `${m[3]}/${m[2]}/${m[1]}`
}

function formatCurrencyBRL(n: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
    }).format(n)
}

function formatValue(raw: unknown): string {
    if (raw === null || raw === undefined || raw === '') return '—'

    // Date range objects { start, end } | { data_inicio, data_fim } | { inicio, fim }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>
        const start = (obj.start || obj.data_inicio || obj.inicio) as string | undefined
        const end = (obj.end || obj.data_fim || obj.fim) as string | undefined
        if (start || end) {
            const s = start ? formatDateBR(start) : ''
            const e = end ? formatDateBR(end) : ''
            if (s && e && s !== e) return `${s} — ${e}`
            return s || e || '—'
        }

        // Orçamento { min, max } | { valor }
        if ('min' in obj || 'max' in obj) {
            const min = typeof obj.min === 'number' ? formatCurrencyBRL(obj.min) : null
            const max = typeof obj.max === 'number' ? formatCurrencyBRL(obj.max) : null
            if (min && max) return `${min} — ${max}`
            return min || max || '—'
        }
        if ('valor' in obj && typeof obj.valor === 'number') return formatCurrencyBRL(obj.valor)

        // Pessoas { adultos, criancas, bebes }
        if ('adultos' in obj || 'criancas' in obj) {
            const adultos = Number(obj.adultos) || 0
            const criancas = Number(obj.criancas) || 0
            const bebes = Number(obj.bebes) || 0
            const parts: string[] = []
            if (adultos) parts.push(`${adultos} adulto${adultos > 1 ? 's' : ''}`)
            if (criancas) parts.push(`${criancas} criança${criancas > 1 ? 's' : ''}`)
            if (bebes) parts.push(`${bebes} bebê${bebes > 1 ? 's' : ''}`)
            return parts.length > 0 ? parts.join(', ') : '—'
        }

        // Generic object fallback
        return JSON.stringify(raw)
    }

    // Array of destinos [{ nome, pais }]
    if (Array.isArray(raw)) {
        if (raw.length === 0) return '—'
        return raw
            .map(item => {
                if (typeof item === 'string') return item
                if (item && typeof item === 'object') {
                    const obj = item as Record<string, unknown>
                    const nome = obj.nome || obj.name || obj.cidade
                    const pais = obj.pais || obj.country
                    if (nome && pais) return `${nome}, ${pais}`
                    return (nome || pais || JSON.stringify(item)) as string
                }
                return String(item)
            })
            .join(' • ')
    }

    // Numbers with heuristic: keys like valor_* → currency
    if (typeof raw === 'number') return String(raw)

    // ISO date string
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return formatDateBR(raw)

    return String(raw)
}

export function getCardFieldValue(card: UnknownCard | null | undefined, fieldKey: string): FieldValue {
    if (!card) return EMPTY

    // 1. Direct column
    if (fieldKey in card && card[fieldKey] !== undefined) {
        const raw = card[fieldKey]
        if (raw !== null && raw !== '') {
            const display =
                typeof raw === 'number' && fieldKey.startsWith('valor')
                    ? formatCurrencyBRL(raw)
                    : formatValue(raw)
            return { raw, display, isEmpty: false }
        }
    }

    // 2. produto_data[fieldKey] (flat ou em container de seção)
    const fromProduto = findInContainer(card.produto_data, fieldKey)
    if (fromProduto !== undefined) {
        return { raw: fromProduto, display: formatValue(fromProduto), isEmpty: false }
    }

    // 3. briefing_inicial[fieldKey] (flat ou em container de seção)
    const fromBriefing = findInContainer(card.briefing_inicial, fieldKey)
    if (fromBriefing !== undefined) {
        return { raw: fromBriefing, display: formatValue(fromBriefing), isEmpty: false }
    }

    return EMPTY
}
