import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Notification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    body: string | null;
    url: string | null;
    read: boolean;
    created_at: string;
}

// Tabela notifications ainda não está no database.types.ts — usar client untyped
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useNotifications() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const { data: notifications = [], isLoading } = useQuery({
        queryKey: ['notifications', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data, error } = await db
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            return (data ?? []) as Notification[];
        },
        enabled: !!user?.id,
        staleTime: 30_000,
    });

    // Realtime subscription
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel('notifications-realtime')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, queryClient]);

    const unreadCount = notifications.filter(n => !n.read).length;

    const markAsRead = useMutation({
        mutationFn: async (notificationId: string) => {
            const { error } = await db
                .from('notifications')
                .update({ read: true })
                .eq('id', notificationId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
        },
    });

    const markAllAsRead = useMutation({
        mutationFn: async () => {
            if (!user?.id) return;
            const { error } = await db
                .from('notifications')
                .update({ read: true })
                .eq('user_id', user.id)
                .eq('read', false);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
        },
    });

    return {
        notifications,
        isLoading,
        unreadCount,
        markAsRead,
        markAllAsRead,
    };
}
