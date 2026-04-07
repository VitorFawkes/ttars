import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type AlertSeverity = 'info' | 'warning' | 'critical'
export type TriggerMode = 'daily_cron' | 'on_card_enter' | 'on_card_open' | 'on_field_change'

export interface CardAlertRule {
    id: string
    org_id: string
    name: string
    description: string | null
    severity: AlertSeverity
    is_active: boolean
    pipeline_id: string | null
    phase_id: string | null
    stage_id: string | null
    product: string | null
    condition: Record<string, unknown>
    trigger_mode: TriggerMode
    daily_time: string | null
    title_template: string
    body_template: string | null
    send_email: boolean
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface CardAlertRuleInput {
    name: string
    description?: string | null
    severity?: AlertSeverity
    is_active?: boolean
    pipeline_id?: string | null
    phase_id?: string | null
    stage_id?: string | null
    product?: string | null
    condition: Record<string, unknown>
    trigger_mode?: TriggerMode
    daily_time?: string | null
    title_template: string
    body_template?: string | null
    send_email?: boolean
}

export interface PreviewResult {
    scope_total: number
    would_alert: number
    sample: Array<{ id: string; titulo: string; has_owner: boolean }>
    capped: boolean
    error?: string
}

export interface GenerateResult {
    rule_id: string
    created: number
    removed: number
    skipped: number
    error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela nova fora dos types gerados
const db = supabase as any

export function useCardAlertRules() {
    const queryClient = useQueryClient()

    const query = useQuery<CardAlertRule[]>({
        queryKey: ['card-alert-rules'],
        queryFn: async () => {
            const { data, error } = await db
                .from('card_alert_rules')
                .select('*')
                .order('created_at', { ascending: false })
            if (error) throw error
            return (data ?? []) as CardAlertRule[]
        },
    })

    const createMutation = useMutation({
        mutationFn: async (input: CardAlertRuleInput) => {
            const { data, error } = await db
                .from('card_alert_rules')
                .insert({
                    name: input.name.trim(),
                    description: input.description?.trim() || null,
                    severity: input.severity ?? 'warning',
                    is_active: input.is_active ?? false,
                    pipeline_id: input.pipeline_id ?? null,
                    phase_id: input.phase_id ?? null,
                    stage_id: input.stage_id ?? null,
                    product: input.product ?? null,
                    condition: input.condition,
                    trigger_mode: input.trigger_mode ?? 'daily_cron',
                    daily_time: input.daily_time ?? '06:00',
                    title_template: input.title_template,
                    body_template: input.body_template ?? null,
                    send_email: input.send_email ?? false,
                })
                .select()
                .single()
            if (error) throw error
            return data as CardAlertRule
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-alert-rules'] })
        },
    })

    const updateMutation = useMutation({
        mutationFn: async ({ id, ...input }: Partial<CardAlertRuleInput> & { id: string }) => {
            const { error } = await db
                .from('card_alert_rules')
                .update(input)
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-alert-rules'] })
        },
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await db
                .from('card_alert_rules')
                .delete()
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-alert-rules'] })
        },
    })

    const previewRule = async (ruleDef: Partial<CardAlertRuleInput>): Promise<PreviewResult> => {
        const { data, error } = await db.rpc('preview_alert_rule', {
            p_rule_def: {
                pipeline_id: ruleDef.pipeline_id ?? null,
                phase_id: ruleDef.phase_id ?? null,
                stage_id: ruleDef.stage_id ?? null,
                product: ruleDef.product ?? null,
                condition: ruleDef.condition ?? { type: 'stage_requirements' },
            },
        })
        if (error) throw error
        return data as PreviewResult
    }

    const runRuleNow = useMutation({
        mutationFn: async (ruleId: string): Promise<GenerateResult> => {
            const { data, error } = await db.rpc('generate_card_alerts', {
                p_rule_id: ruleId,
                p_card_id: null,
            })
            if (error) throw error
            return data as GenerateResult
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
    })

    return {
        rules: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        createRule: createMutation.mutateAsync,
        updateRule: updateMutation.mutateAsync,
        deleteRule: deleteMutation.mutateAsync,
        previewRule,
        runRuleNow: runRuleNow.mutateAsync,
        isRunning: runRuleNow.isPending,
        isMutating:
            createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    }
}
