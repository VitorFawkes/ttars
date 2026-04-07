import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/** Emitted when a truly new notification arrives via realtime */
export const NOTIFICATION_NEW_EVENT = 'welcomecrm:notification-new';

export interface Notification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    body: string | null;
    url: string | null;
    read: boolean;
    card_id: string | null;
    created_at: string;
    metadata?: Record<string, unknown> | null;
}

// Tabela notifications ainda não está no database.types.ts — usar client untyped
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useNotifications() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Track the newest notification timestamp at initial load to detect truly new ones
    const baselineRef = useRef<string | null>(null);
    const initializedRef = useRef(false);

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

    // Set baseline from first successful fetch (so we know what's "old")
    useEffect(() => {
        if (!initializedRef.current && notifications.length > 0) {
            baselineRef.current = notifications[0].created_at; // newest
            initializedRef.current = true;
        }
    }, [notifications]);

    const updateBaseline = useCallback(() => {
        if (notifications.length > 0) {
            baselineRef.current = notifications[0].created_at;
        }
    }, [notifications]);

    // Realtime subscription (INSERT + UPDATE for cross-tab sync)
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
                (payload) => {
                    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
                    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'card-alerts' });
                    if (initializedRef.current && payload.new) {
                        const newTs = (payload.new as Notification).created_at;
                        if (!baselineRef.current || newTs > baselineRef.current) {
                            window.dispatchEvent(new CustomEvent(NOTIFICATION_NEW_EVENT));
                        }
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
                    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'card-alerts' });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, queryClient]);

    // Only count types that são visíveis na UI
    const VISIBLE_TYPES = new Set(['lead_assigned', 'card_alert', 'card_alert_rule']);
    const unreadCount = notifications.filter(n => !n.read && VISIBLE_TYPES.has(n.type)).length;

    const groupedByType = useMemo(() => {
        const groups: Record<string, Notification[]> = {};
        for (const n of notifications) {
            if (!groups[n.type]) groups[n.type] = [];
            groups[n.type].push(n);
        }
        return groups;
    }, [notifications]);

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

    const markGroupAsRead = useMutation({
        mutationFn: async (ids: string[]) => {
            if (!ids.length) return;
            const { error } = await db
                .from('notifications')
                .update({ read: true })
                .in('id', ids);
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
        groupedByType,
        updateBaseline,
        markAsRead,
        markGroupAsRead,
        markAllAsRead,
    };
}
