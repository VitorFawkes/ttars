import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export type SuppressionReason = 'opt_out' | 'working_elsewhere' | 'bad_data' | 'wrong_profile' | 'other'

export const SUPPRESSION_REASON_LABELS: Record<SuppressionReason, string> = {
    opt_out: 'Pediu para não ser contactado',
    working_elsewhere: 'Já está sendo trabalhado em outro canal',
    bad_data: 'Dados errados / viagem não foi real',
    wrong_profile: 'Perfil não encaixa',
    other: 'Outro motivo',
}

export function useReactivationActions() {
    const [busy, setBusy] = useState(false)

    const suppressBulk = useCallback(
        async (contactIds: string[], reason: SuppressionReason, until?: Date | null, note?: string) => {
            setBusy(true)
            try {
                const { data, error } = await db.rpc('rpc_reactivation_suppress_bulk', {
                    p_contact_ids: contactIds,
                    p_reason: reason,
                    p_until: until ? until.toISOString() : null,
                    p_note: note ?? null,
                })
                if (error) throw error
                return data as number
            } finally {
                setBusy(false)
            }
        },
        []
    )

    const unsuppressBulk = useCallback(async (contactIds: string[]) => {
        setBusy(true)
        try {
            const { data, error } = await db.rpc('rpc_reactivation_unsuppress_bulk', {
                p_contact_ids: contactIds,
            })
            if (error) throw error
            return data as number
        } finally {
            setBusy(false)
        }
    }, [])

    const assignBulk = useCallback(async (contactIds: string[], responsavelId: string) => {
        setBusy(true)
        try {
            const { data, error } = await db.rpc('rpc_reactivation_assign_bulk', {
                p_contact_ids: contactIds,
                p_responsavel_id: responsavelId,
            })
            if (error) throw error
            return data as number
        } finally {
            setBusy(false)
        }
    }, [])

    const createCardsBulk = useCallback(
        async (
            contactIds: string[],
            pipelineId: string,
            stageId: string,
            vendasOwnerId?: string | null,
            tituloPrefix?: string
        ) => {
            setBusy(true)
            try {
                const { data, error } = await db.rpc('rpc_reactivation_create_cards_bulk', {
                    p_contact_ids: contactIds,
                    p_pipeline_id: pipelineId,
                    p_stage_id: stageId,
                    p_vendas_owner_id: vendasOwnerId ?? null,
                    p_titulo_prefix: tituloPrefix ?? 'Reativação',
                })
                if (error) throw error
                return data as { contact_id: string; card_id: string }[]
            } finally {
                setBusy(false)
            }
        },
        []
    )

    return {
        busy,
        suppressBulk,
        unsuppressBulk,
        assignBulk,
        createCardsBulk,
    }
}
