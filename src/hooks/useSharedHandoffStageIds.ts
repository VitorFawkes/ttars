import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'

/**
 * Retorna stage_ids de etapas com handoff_compartilhado=true que pertencem
 * a fases onde o usuário tem time. Usado pra incluir esses cards no MY_QUEUE
 * mesmo sem owner setado (modelo: card visível pra todo o time da fase).
 */
export function useSharedHandoffStageIds() {
    const { session } = useAuth()
    const { org } = useOrg()
    const userId = session?.user?.id
    const orgId = org?.id

    return useQuery({
        queryKey: ['shared-handoff-stage-ids', userId, orgId],
        enabled: !!userId && !!orgId,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        queryFn: async () => {
            if (!userId || !orgId) return [] as string[]

            // 1. Fases em que o usuário tem time (na org ativa)
            const { data: memberships, error: mErr } = await supabase
                .from('team_members')
                .select('teams!inner(phase_id, org_id, is_active)')
                .eq('user_id', userId)
                .eq('org_id', orgId)
            if (mErr) throw mErr

            const phaseIds = Array.from(
                new Set(
                    ((memberships ?? []) as unknown as Array<{
                        teams: { phase_id: string | null; org_id: string | null; is_active: boolean | null } | null
                    }>)
                        .map(m => m.teams)
                        .filter((t): t is { phase_id: string | null; org_id: string | null; is_active: boolean | null } => !!t)
                        .filter(t => t.org_id === orgId && t.is_active !== false && t.phase_id)
                        .map(t => t.phase_id as string)
                )
            )

            if (phaseIds.length === 0) return [] as string[]

            // 2. Stages compartilhados ativos nessas fases (filtrar por org_id explicitamente)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coluna nova, types pendentes
            const { data: stages, error: sErr } = await (supabase as any)
                .from('pipeline_stages')
                .select('id, phase_id, ativo, handoff_compartilhado')
                .eq('org_id', orgId)
                .in('phase_id', phaseIds)
                .eq('ativo', true)
                .eq('handoff_compartilhado', true)
            if (sErr) throw sErr

            return ((stages ?? []) as Array<{ id: string }>).map(s => s.id)
        },
    })
}
