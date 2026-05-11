import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface Role {
    id: string;
    name: string;
    display_name: string;
    description: string | null;
    permissions: Record<string, unknown>;
    is_system: boolean;
    color: string;
    created_at: string;
    updated_at: string;
}

export interface CreateRoleData {
    name: string;
    display_name: string;
    description?: string;
    color?: string;
    permissions?: Record<string, boolean>;
}

export interface UpdateRoleData extends Partial<CreateRoleData> {
    id: string;
}

/**
 * Hook for fetching and managing roles from the database
 */
export function useRoles() {
    const queryClient = useQueryClient();

    const rolesQuery = useQuery({
        queryKey: ['roles'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('roles')
                .select('*')
                .order('name');

            if (error) throw error;
            return data as Role[];
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    const createRole = useMutation({
        mutationFn: async (data: CreateRoleData) => {
            const { data: result, error } = await supabase
                .from('roles')
                .insert({
                    name: data.name.toLowerCase().replace(/\s+/g, '_'),
                    display_name: data.display_name,
                    description: data.description || null,
                    color: data.color || 'bg-gray-100 text-gray-800',
                    is_system: false,
                })
                .select()
                .single();

            if (error) throw error;
            return result as Role;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
        },
    });

    const updateRole = useMutation({
        mutationFn: async ({ id, ...data }: UpdateRoleData) => {
            const updates: Record<string, unknown> = {};
            if (data.name !== undefined) {
                updates.name = data.name.toLowerCase().replace(/\s+/g, '_');
            }
            if (data.display_name !== undefined) {
                updates.display_name = data.display_name;
            }
            if (data.description !== undefined) {
                updates.description = data.description;
            }
            if (data.color !== undefined) {
                updates.color = data.color;
            }
            if (data.permissions !== undefined) {
                updates.permissions = data.permissions;
            }

            const { data: result, error } = await supabase
                .from('roles')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return result as Role;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
        },
    });

    const deleteRole = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('roles')
                .delete()
                .eq('id', id)
                .eq('is_system', false); // Only allow deleting non-system roles

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] });
        },
    });

    return {
        roles: rolesQuery.data || [],
        isLoading: rolesQuery.isLoading,
        isError: rolesQuery.isError,
        error: rolesQuery.error,
        refetch: rolesQuery.refetch,
        createRole,
        updateRole,
        deleteRole,
    };
}

/**
 * Hook for getting role options formatted for Select components
 */
export function useRoleOptions() {
    const { roles, isLoading } = useRoles();

    const options = roles.map(role => ({
        value: role.id,
        label: role.display_name,
        color: role.color,
    }));

    return { options, isLoading };
}
