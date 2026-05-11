import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

export interface Department {
    id: string
    name: string
    slug: string
    description: string | null
    org_id: string
    created_at: string
}

export interface DepartmentInput {
    name: string
    slug?: string
    description?: string
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
}

export function useDepartments() {
    const queryClient = useQueryClient()
    const { org } = useOrg()
    const activeOrgId = org?.id

    const query = useQuery<Department[]>({
        queryKey: ['departments', activeOrgId],
        queryFn: async () => {
            if (!activeOrgId) return []
            const { data, error } = await supabase
                .from('departments')
                .select('*')
                .eq('org_id', activeOrgId)
                .order('name')
            if (error) throw error
            return (data ?? []) as Department[]
        },
        enabled: !!activeOrgId,
    })

    const createMutation = useMutation({
        mutationFn: async (input: DepartmentInput) => {
            if (!activeOrgId) throw new Error('Workspace ativo não encontrado')
            const payload = {
                org_id: activeOrgId,
                name: input.name.trim(),
                slug: input.slug?.trim() || slugify(input.name),
                description: input.description?.trim() || null,
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any)
                .from('departments')
                .insert(payload)
                .select()
                .single()
            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['departments'] })
        },
    })

    const updateMutation = useMutation({
        mutationFn: async ({ id, ...input }: DepartmentInput & { id: string }) => {
            const payload = {
                name: input.name.trim(),
                slug: input.slug?.trim() || slugify(input.name),
                description: input.description?.trim() || null,
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
                .from('departments')
                .update(payload)
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['departments'] })
        },
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('departments')
                .delete()
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['departments'] })
            queryClient.invalidateQueries({ queryKey: ['teams'] }) // teams referenciam department
        },
    })

    return {
        departments: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        createDepartment: createMutation.mutateAsync,
        updateDepartment: updateMutation.mutateAsync,
        deleteDepartment: deleteMutation.mutateAsync,
        isMutating: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    }
}
