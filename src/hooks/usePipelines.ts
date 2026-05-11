import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useOrg } from '../contexts/OrgContext'

export interface Pipeline {
    id: string
    nome: string
    produto: string
    ativo: boolean | null
}

export function usePipelines() {
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useQuery({
        queryKey: ['pipelines', activeOrgId],
        queryFn: async (): Promise<Pipeline[]> => {
            if (!activeOrgId) return []
            const { data, error } = await supabase
                .from('pipelines')
                .select('id, nome, produto, ativo')
                .eq('ativo', true)
                .eq('org_id', activeOrgId)
                .order('nome')

            if (error) throw error
            return data || []
        },
        staleTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false,
        enabled: !!activeOrgId,
    })
}
