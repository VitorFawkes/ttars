/**
 * Utilitário puro para detecção de conflitos de horário em reuniões.
 * Sem dependências de React — pode ser usado em hooks, componentes ou testes.
 */

export interface MeetingTimeSlot {
    id: string
    titulo: string | null
    data_vencimento: string | null // ISO datetime
    duration_minutes: number
    responsavel_id: string | null
    status: string | null
}

export interface ConflictResult {
    meeting: MeetingTimeSlot
    overlapMinutes: number
}

const TERMINAL_STATUSES = ['cancelada', 'nao_compareceu']

/**
 * Encontra reuniões que conflitam com um horário proposto.
 * Fórmula: start1 < end2 AND start2 < end1
 * Exclui status terminais e opcionalmente um ID (para modo edição).
 */
export function findConflicts(
    proposedStart: Date,
    proposedDurationMinutes: number,
    responsavelId: string,
    existingMeetings: MeetingTimeSlot[],
    excludeId?: string,
): ConflictResult[] {
    const proposedEnd = new Date(proposedStart.getTime() + proposedDurationMinutes * 60_000)

    return existingMeetings
        .filter((m) => {
            if (m.responsavel_id !== responsavelId) return false
            if (TERMINAL_STATUSES.includes(m.status || '')) return false
            if (excludeId && m.id === excludeId) return false
            if (!m.data_vencimento) return false
            return true
        })
        .map((m) => {
            const mStart = new Date(m.data_vencimento!)
            const mEnd = new Date(mStart.getTime() + m.duration_minutes * 60_000)

            if (proposedStart < mEnd && mStart < proposedEnd) {
                const overlapStart = Math.max(proposedStart.getTime(), mStart.getTime())
                const overlapEnd = Math.min(proposedEnd.getTime(), mEnd.getTime())
                return { meeting: m, overlapMinutes: Math.round((overlapEnd - overlapStart) / 60_000) }
            }
            return null
        })
        .filter((r): r is ConflictResult => r !== null)
}

/**
 * Retorna Set de IDs de reuniões que têm pelo menos um conflito.
 * Usado por WeekView/DayView para marcar blocos com red dot.
 */
export function getConflictingMeetingIds(meetings: MeetingTimeSlot[]): Set<string> {
    const ids = new Set<string>()

    for (let i = 0; i < meetings.length; i++) {
        const a = meetings[i]
        if (!a.data_vencimento || TERMINAL_STATUSES.includes(a.status || '')) continue

        const aStart = new Date(a.data_vencimento)
        const aEnd = new Date(aStart.getTime() + a.duration_minutes * 60_000)

        for (let j = i + 1; j < meetings.length; j++) {
            const b = meetings[j]
            if (!b.data_vencimento || TERMINAL_STATUSES.includes(b.status || '')) continue
            if (a.responsavel_id !== b.responsavel_id) continue

            const bStart = new Date(b.data_vencimento)
            const bEnd = new Date(bStart.getTime() + b.duration_minutes * 60_000)

            if (aStart < bEnd && bStart < aEnd) {
                ids.add(a.id)
                ids.add(b.id)
            }
        }
    }

    return ids
}
