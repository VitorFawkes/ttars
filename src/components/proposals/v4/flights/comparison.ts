/**
 * Helpers de comparação entre opções de voo do mesmo trecho.
 *
 * Determina, dado um array de opções, qual é a mais barata, a mais rápida
 * e quais são diretas — pra renderizar badges automáticos.
 *
 * Regras:
 * - "Mais barato" e "Mais rápido" só ganham badge se for UM vencedor único
 *   (se 2 voos empatam no preço, nenhum ganha badge — evita ruído visual).
 * - "Direto" é informativo (não comparativo); ganha badge se a opção tem
 *   stops === 0.
 * - Opções com price === 0 ou duração inválida são ignoradas pra comparação.
 */

interface ComparableOption {
    id: string
    price?: number
    departure_time?: string | null
    arrival_time?: string | null
    stops?: number
}

export interface ComparisonResult {
    cheapestId: string | null
    fastestId: string | null
    cheapestIdx: number | null
    fastestIdx: number | null
}

/** Extrai HH e MM de "23:40 (+1)" ou "22:30"; aceita "+N" como dias extras. */
function parseTime(raw?: string | null): { totalMinutes: number; extraDays: number } | null {
    if (!raw) return null
    const s = String(raw)
    const hhmm = s.match(/(\d{1,2}):(\d{2})/)
    if (!hhmm) return null
    const h = Number(hhmm[1])
    const m = Number(hhmm[2])
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    const plus = s.match(/\(?\+(\d+)\)?/)
    return { totalMinutes: h * 60 + m, extraDays: plus ? Number(plus[1]) : 0 }
}

/** Duração em minutos. Devolve null se inválido. */
function durationMinutes(dep?: string | null, arr?: string | null): number | null {
    const d = parseTime(dep)
    const a = parseTime(arr)
    if (!d || !a) return null
    let mins = a.totalMinutes - d.totalMinutes + a.extraDays * 24 * 60
    if (mins < 0) mins += 24 * 60
    return Number.isFinite(mins) && mins >= 0 ? mins : null
}

export function compareFlightOptions(options: ComparableOption[]): ComparisonResult {
    const empty: ComparisonResult = { cheapestId: null, fastestId: null, cheapestIdx: null, fastestIdx: null }
    if (!options || options.length < 2) return empty

    // Mais barato: menor price > 0 (ignora 0 ou ausente)
    const priced = options
        .map((o, idx) => ({ idx, id: o.id, price: o.price }))
        .filter((x): x is { idx: number; id: string; price: number } =>
            typeof x.price === 'number' && x.price > 0)
    let cheapestId: string | null = null
    let cheapestIdx: number | null = null
    if (priced.length >= 2) {
        const min = Math.min(...priced.map(o => o.price))
        const winners = priced.filter(o => o.price === min)
        if (winners.length === 1) {
            cheapestId = winners[0].id
            cheapestIdx = winners[0].idx
        }
    }

    // Mais rápido: menor duração calculada > 0
    const timed = options
        .map((o, idx) => ({ idx, id: o.id, dur: durationMinutes(o.departure_time, o.arrival_time) }))
        .filter((x): x is { idx: number; id: string; dur: number } => x.dur != null && x.dur > 0)
    let fastestId: string | null = null
    let fastestIdx: number | null = null
    if (timed.length >= 2) {
        const min = Math.min(...timed.map(o => o.dur))
        const winners = timed.filter(o => o.dur === min)
        if (winners.length === 1) {
            fastestId = winners[0].id
            fastestIdx = winners[0].idx
        }
    }

    return { cheapestId, fastestId, cheapestIdx, fastestIdx }
}
