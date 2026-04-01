export const SystemPhase = {
    SDR: 'sdr',
    PLANNER: 'planner',
    POS_VENDA: 'pos_venda',
    RESOLUCAO: 'resolucao'
} as const

export type SystemPhase = typeof SystemPhase[keyof typeof SystemPhase]

export interface PipelinePhase {
    id: string
    name: string
    label: string
    color: string
    order_index: number
    org_id: string
    active: boolean
    slug: string | null
    visible_in_card: boolean | null
    created_at: string | null
    updated_at: string | null
}

export interface PipelineStage {
    id: string
    pipeline_id: string
    phase_id: string | null
    nome: string
    ordem: number
    cor: string
    /** @deprecated Use phase_id FK. Mantido apenas por sync trigger. */
    fase: string
    created_at: string
    updated_at: string
}
