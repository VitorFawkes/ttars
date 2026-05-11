import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface TemplateSection {
    type: string
    title: string
    order: number
}

export interface ProposalTemplate {
    id: string
    name: string
    description: string | null
    icon: string
    sections: TemplateSection[]
    created_by: string | null
    is_global: boolean
    usage_count: number
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
}

// ============================================
// Query Keys
// ============================================
export const templateKeys = {
    all: ['proposal-templates'] as const,
    lists: () => [...templateKeys.all, 'list'] as const,
}

// ============================================
// Fetch All Templates (user's + global)
// ============================================
export function useProposalTemplates() {
    return useQuery({
        queryKey: templateKeys.lists(),
        queryFn: async () => {
            // Fetch global templates and user's templates
            const { data, error } = await supabase
                .from('proposal_templates')
                .select('*')
                .order('is_global', { ascending: false })
                .order('name')

            if (error) throw error
            return (data || []).map((item: any) => ({
                ...item,
                sections: item.sections || [],
                icon: item.icon || 'file-text',
                usage_count: item.usage_count || 0,
                is_global: item.is_global || false,
            })) as ProposalTemplate[]
        },
    })
}

// ============================================
// Create Template from Proposal
// ============================================
export function useSaveAsTemplate() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            name,
            description,
            sections,
            icon = 'file-text',
        }: {
            name: string
            description?: string
            sections: TemplateSection[]
            icon?: string
        }) => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuário não autenticado')

            const { data, error } = await supabase
                .from('proposal_templates')
                .insert({
                    name,
                    description,
                    icon,
                    sections: sections as any,
                    created_by: user.id,
                    is_global: false,
                } as any)
                .select()
                .single()

            if (error) throw error
            return {
                ...data,
                sections: (data as any).sections || [],
            } as ProposalTemplate
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: templateKeys.lists() })
            toast.success('Template salvo!', {
                description: 'Você pode reutilizar este template em novas propostas.',
            })
        },
        onError: (error: Error) => {
            toast.error('Erro ao salvar template', {
                description: error.message,
            })
        },
    })
}

// ============================================
// Delete Template
// ============================================
export function useDeleteTemplate() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (templateId: string) => {
            const { error } = await supabase
                .from('proposal_templates')
                .delete()
                .eq('id', templateId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: templateKeys.lists() })
            toast.success('Template excluído')
        },
        onError: (error: Error) => {
            toast.error('Erro ao excluir template', {
                description: error.message,
            })
        },
    })
}

// ============================================
// Increment Usage Count
// ============================================
export function useIncrementTemplateUsage() {
    return useMutation({
        mutationFn: async (templateId: string) => {
            // Fetch current count then update
            // This is a simple approach - ideally use a DB function
            try {
                const { data } = await supabase
                    .from('proposal_templates')
                    .select('usage_count')
                    .eq('id', templateId)
                    .single()

                const currentCount = (data as any)?.usage_count || 0

                await supabase
                    .from('proposal_templates')
                    .update({ usage_count: currentCount + 1 })
                    .eq('id', templateId)
            } catch (error) {
                // Silently fail
                console.warn('Could not increment template usage')
            }
        },
    })
}
