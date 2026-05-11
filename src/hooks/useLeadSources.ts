import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { toast } from 'sonner'

export interface LeadSource {
    id: string
    org_id: string
    value: string
    label: string
    icon: string
    color: string
    is_system: boolean
    is_integration: boolean
    ordem: number
    ativa: boolean
    created_at: string
    updated_at: string
}

export interface LeadSourceInput {
    value: string
    label: string
    icon?: string
    color?: string
    ordem?: number
}

/** Lista todas as fontes da org ativa (inclusive inativas) — para tela de gestão */
export function useLeadSourcesAll() {
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useQuery({
        queryKey: ['lead-sources-all', activeOrgId],
        queryFn: async (): Promise<LeadSource[]> => {
            if (!activeOrgId) return []
            const { data, error } = await supabase
                .from('lead_sources')
                .select('*')
                .eq('org_id', activeOrgId)
                .order('ordem')
                .order('label')
            if (error) throw error
            return data as LeadSource[]
        },
        enabled: !!activeOrgId,
    })
}

/** Lista somente fontes ATIVAS e NÃO-integração — para pickers de origem manual */
export function useLeadSources() {
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useQuery({
        queryKey: ['lead-sources', activeOrgId],
        queryFn: async (): Promise<LeadSource[]> => {
            if (!activeOrgId) return []
            const { data, error } = await supabase
                .from('lead_sources')
                .select('*')
                .eq('org_id', activeOrgId)
                .eq('ativa', true)
                .eq('is_integration', false)
                .order('ordem')
                .order('label')
            if (error) throw error
            return data as LeadSource[]
        },
        enabled: !!activeOrgId,
    })
}

export function useCreateLeadSource() {
    const queryClient = useQueryClient()
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useMutation({
        mutationFn: async (input: LeadSourceInput) => {
            if (!activeOrgId) throw new Error('Workspace ativo não encontrado')
            if (!input.value.trim() || !input.label.trim()) throw new Error('Nome e identificador são obrigatórios')

            const value = input.value
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/[^a-z0-9_]/g, '_')
                .replace(/_+/g, '_')

            const { error } = await supabase.from('lead_sources').insert([{
                org_id: activeOrgId,
                value,
                label: input.label.trim(),
                icon: input.icon || 'Tag',
                color: input.color || 'bg-gray-100 text-gray-700 border-gray-200',
                ordem: input.ordem ?? 500,
                is_system: false,
                is_integration: false,
                ativa: true,
            }])
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Fonte adicionada')
            queryClient.invalidateQueries({ queryKey: ['lead-sources'] })
            queryClient.invalidateQueries({ queryKey: ['lead-sources-all'] })
        },
        onError: (e: Error) => toast.error(`Erro ao adicionar: ${e.message}`),
    })
}

export function useUpdateLeadSource() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...patch }: { id: string } & Partial<Pick<LeadSource, 'label' | 'icon' | 'color' | 'ordem' | 'ativa'>>) => {
            const { error } = await supabase.from('lead_sources').update(patch).eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Fonte atualizada')
            queryClient.invalidateQueries({ queryKey: ['lead-sources'] })
            queryClient.invalidateQueries({ queryKey: ['lead-sources-all'] })
        },
        onError: (e: Error) => toast.error(`Erro ao atualizar: ${e.message}`),
    })
}

export function useDeleteLeadSource() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('lead_sources').delete().eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            toast.success('Fonte removida')
            queryClient.invalidateQueries({ queryKey: ['lead-sources'] })
            queryClient.invalidateQueries({ queryKey: ['lead-sources-all'] })
        },
        onError: (e: Error) => toast.error(`Erro ao remover: ${e.message}`),
    })
}
