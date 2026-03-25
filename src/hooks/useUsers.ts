import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface User {
    id: string;
    email: string;
    nome: string;
    avatar_url?: string | null;
    active: boolean;
    role?: string;
    role_id?: string;
    team_id?: string | null;
    department_id?: string | null;
    created_at: string;
    produtos?: ('TRIPS' | 'WEDDING' | 'CORP')[] | null;
    teams_notify_enabled?: boolean;
    teams?: {
        id: string;
        name: string;
    } | null;
}

export function useUsers() {
    const queryClient = useQueryClient();

    const usersQuery = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select(`
                    *,
                    teams:teams!profiles_team_id_fkey (
                        id,
                        name
                    )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as User[];
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    const toggleUserStatus = useMutation({
        mutationFn: async ({ userId, currentStatus }: { userId: string; currentStatus: boolean }) => {
            const { error } = await supabase
                .from('profiles')
                .update({ active: !currentStatus })
                .eq('id', userId);

            if (error) throw error;
            return { userId, newStatus: !currentStatus };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });

    const deleteUser = useMutation({
        mutationFn: async (userId: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.rpc('delete_user' as any, { user_id: userId });

            if (error) throw error;
            return userId;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
    });

    const resetPassword = useMutation({
        mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.rpc('reset_user_password' as any, {
                p_user_id: userId,
                p_new_password: newPassword,
            });

            if (error) throw error;
        },
    });

    const updateEmail = useMutation({
        mutationFn: async ({ userId, newEmail }: { userId: string; newEmail: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase.rpc('update_user_email' as any, {
                p_user_id: userId,
                p_new_email: newEmail,
            });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['profiles'] });
        },
    });

    return {
        users: usersQuery.data || [],
        isLoading: usersQuery.isLoading,
        isError: usersQuery.isError,
        error: usersQuery.error,
        refetch: usersQuery.refetch,
        toggleUserStatus,
        deleteUser,
        resetPassword,
        updateEmail,
    };
}
