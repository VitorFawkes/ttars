// Espelha public.fn_calcular_etapa_pos_venda
// (migration 20260506a_roteamento_aceita_epoca_legado.sql).
// Mantenha sincronizado se a regra do banco mudar.
//
// O cron diário fn_roteamento_pos_venda_trips reposiciona os cards.
// Esta função existe só para o frontend exibir alerta visual entre runs.

export const PIPELINE_TRIPS_ID = 'c8022522-4a1d-411c-9387-efe03ca725ee'

export const STAGE_APP_CONTEUDO = 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36'
export const STAGE_PRE_30_PLUS = '1f684773-f8f3-434a-a44d-4994750c41aa'
export const STAGE_PRE_30_MINUS = '3ce80249-b579-4a9c-9b82-f8569735cea9'
export const STAGE_EM_VIAGEM = '0ebab355-6d0e-4b19-af13-b4b31268275f'
export const STAGE_POS_VIAGEM = '2c07134a-cb83-4075-bc86-4750beec9393'

const STAGES_TO_CHECK = new Set<string>([
    STAGE_PRE_30_PLUS,
    STAGE_PRE_30_MINUS,
    STAGE_EM_VIAGEM,
    STAGE_POS_VIAGEM,
])

type DateRange = { start: Date; end: Date }

function parseDate(value: unknown): Date | null {
    if (typeof value !== 'string') return null
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!match) return null
    const y = Number(match[1])
    const m = Number(match[2])
    const d = Number(match[3])
    if (!y || !m || !d || m > 12 || d > 31) return null
    return new Date(Date.UTC(y, m - 1, d))
}

function tryRange(rawStart: unknown, rawEnd: unknown): DateRange | null {
    const start = parseDate(rawStart)
    const end = parseDate(rawEnd)
    if (!start || !end) return null
    if (start.getTime() > end.getTime()) return null
    return { start, end }
}

export function extractTripDates(produtoData: unknown): DateRange | null {
    if (!produtoData || typeof produtoData !== 'object') return null
    const pd = produtoData as Record<string, unknown>
    const ev = (pd.epoca_viagem ?? null) as Record<string, unknown> | null
    const dev = (pd.data_exata_da_viagem ?? null) as Record<string, unknown> | null

    if (ev) {
        const novo = tryRange(ev.start, ev.end)
        if (novo) return novo

        const tipo = typeof ev.tipo === 'string' ? ev.tipo : 'data_exata'
        if (tipo === 'data_exata') {
            const legado = tryRange(ev.data_inicio, ev.data_fim)
            if (legado) return legado
        }
    }

    if (dev) {
        const fallback = tryRange(dev.start, dev.end)
        if (fallback) return fallback
    }

    return null
}

function todayUTC(): Date {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function calculateExpectedPosVendaStage(
    produtoData: unknown,
    pipelineId: string | null | undefined
): string | null {
    if (pipelineId !== PIPELINE_TRIPS_ID) return null

    const range = extractTripDates(produtoData)
    if (!range) return null

    const today = todayUTC().getTime()
    const startMs = range.start.getTime()
    const endMs = range.end.getTime()
    const dayMs = 86400000

    if (today > endMs) return STAGE_POS_VIAGEM
    if (today >= startMs && today <= endMs) return STAGE_EM_VIAGEM

    const daysToStart = Math.ceil((startMs - today) / dayMs)
    if (daysToStart <= 30) return STAGE_PRE_30_MINUS
    return STAGE_PRE_30_PLUS
}

export function isStageMismatch(
    currentStageId: string | null | undefined,
    expectedStageId: string | null | undefined
): boolean {
    if (!currentStageId || !expectedStageId) return false
    if (!STAGES_TO_CHECK.has(currentStageId)) return false
    return currentStageId !== expectedStageId
}
