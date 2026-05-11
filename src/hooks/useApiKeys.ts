import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// ============================================
// API Keys Hook
// Manages CRUD operations for API keys
// ============================================

export interface ApiKey {
    id: string;
    name: string;
    key_prefix: string;
    permissions: { read: boolean; write: boolean };
    rate_limit: number;
    is_active: boolean;
    last_used_at: string | null;
    request_count: number;
    created_by: string;
    created_at: string;
    expires_at: string | null;
}

export interface ApiKeyWithPlainText {
    api_key_id: string;
    plain_text_key: string;
}

export interface CreateApiKeyParams {
    name: string;
    permissions?: { read: boolean; write: boolean };
    rate_limit?: number;
    expires_at?: string | null;
}

// Fetch all API keys
export function useApiKeys() {
    return useQuery({
        queryKey: ['api-keys'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('api_keys')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as unknown as ApiKey[];
        }
    });
}

// Create a new API key
export function useCreateApiKey() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (params: CreateApiKeyParams): Promise<ApiKeyWithPlainText> => {
            const { data, error } = await supabase.rpc('generate_api_key', {
                p_name: params.name,
                p_permissions: params.permissions || { read: true, write: true },
                p_rate_limit: params.rate_limit || 5000,
                p_expires_at: params.expires_at || undefined
            });

            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Failed to generate API key');

            return data[0] as ApiKeyWithPlainText;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        }
    });
}

// Revoke an API key
export function useRevokeApiKey() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (keyId: string) => {
            const { error } = await supabase.rpc('revoke_api_key', {
                p_key_id: keyId
            });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        }
    });
}

// Delete an API key permanently
export function useDeleteApiKey() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (keyId: string) => {
            const { error } = await supabase
                .from('api_keys')
                .delete()
                .eq('id', keyId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['api-keys'] });
        }
    });
}

// Fetch API request logs for a specific key
export function useApiKeyLogs(keyId: string | null) {
    return useQuery({
        queryKey: ['api-key-logs', keyId],
        queryFn: async () => {
            if (!keyId) return [];

            const { data, error } = await supabase
                .from('api_request_logs')
                .select('*')
                .eq('api_key_id', keyId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            return data;
        },
        enabled: !!keyId
    });
}

// Fetch aggregated stats for API keys
export function useApiKeyStats() {
    return useQuery({
        queryKey: ['api-key-stats'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('api_request_logs')
                .select('api_key_id, status_code, created_at')
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

            if (error) throw error;

            const stats = {
                totalRequests: data?.length || 0,
                successfulRequests: data?.filter(r => r.status_code >= 200 && r.status_code < 300).length || 0,
                failedRequests: data?.filter(r => r.status_code >= 400).length || 0,
                requestsByKey: {} as Record<string, number>
            };

            data?.forEach(r => {
                if (r.api_key_id) {
                    stats.requestsByKey[r.api_key_id] = (stats.requestsByKey[r.api_key_id] || 0) + 1;
                }
            });

            return stats;
        }
    });
}
