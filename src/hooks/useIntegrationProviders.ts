import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Interface para um provider de integração
 */
export interface IntegrationProvider {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    icon_name: string | null;
    color: string | null;
    category: string;
    direction: ('inbound' | 'outbound')[];
    builder_type: 'webhook' | 'oauth' | 'api_key' | 'basic_auth' | 'smtp' | 'custom';
    required_credentials: string[];
    is_active: boolean;
    is_beta: boolean;
    is_premium: boolean;
}

/**
 * Categorias disponíveis para providers
 */
export const PROVIDER_CATEGORIES = {
    all: { label: 'Todos', icon: 'Layers' },
    crm: { label: 'CRM', icon: 'Users' },
    erp: { label: 'ERP/Financeiro', icon: 'DollarSign' },
    communication: { label: 'Comunicação', icon: 'MessageSquare' },
    distribution: { label: 'Distribuição', icon: 'Plane' },
    finance: { label: 'Pagamentos', icon: 'CreditCard' },
    marketing: { label: 'Marketing', icon: 'Target' },
    developer: { label: 'Developer', icon: 'Code' },
} as const;

export type ProviderCategory = keyof typeof PROVIDER_CATEGORIES;

/**
 * Providers legados (fallback se tabela não existir)
 * Mantém compatibilidade com código existente
 */
const LEGACY_PROVIDERS: IntegrationProvider[] = [
    {
        id: 'legacy-webhook-in',
        slug: 'webhook_inbound',
        name: 'Receber Dados (Webhook)',
        description: 'Crie uma URL única para receber dados de qualquer ferramenta externa',
        icon_name: 'Webhook',
        color: '#64748B',
        category: 'developer',
        direction: ['inbound'],
        builder_type: 'webhook',
        required_credentials: [],
        is_active: true,
        is_beta: false,
        is_premium: false,
    },
    {
        id: 'legacy-webhook-out',
        slug: 'webhook_outbound',
        name: 'Enviar Dados (Disparo)',
        description: 'Envie dados do CRM para outras ferramentas quando eventos acontecerem',
        icon_name: 'Zap',
        color: '#64748B',
        category: 'developer',
        direction: ['outbound'],
        builder_type: 'webhook',
        required_credentials: ['target_url'],
        is_active: true,
        is_beta: false,
        is_premium: false,
    },
];

interface UseProvidersOptions {
    /** Filtrar por categoria (default: 'all') */
    category?: ProviderCategory | string;
    /** Mostrar apenas ativos (default: true) */
    activeOnly?: boolean;
    /** Incluir providers em beta (default: false) */
    includeBeta?: boolean;
    /** Habilitar query (default: true) */
    enabled?: boolean;
}

/**
 * Hook para buscar providers de integração do banco de dados.
 * Com fallback para providers legados se a tabela não existir.
 *
 * @example
 * // Buscar todos os providers ativos
 * const { data: providers } = useIntegrationProviders();
 *
 * @example
 * // Filtrar por categoria
 * const { data: crmProviders } = useIntegrationProviders({ category: 'crm' });
 */
export function useIntegrationProviders(options: UseProvidersOptions = {}) {
    const {
        category = 'all',
        activeOnly = true,
        includeBeta = false,
        enabled = true
    } = options;

    return useQuery({
        queryKey: ['integration-providers', category, activeOnly, includeBeta],
        queryFn: async (): Promise<IntegrationProvider[]> => {
            try {
                let query = supabase
                    .from('integration_provider_catalog')
                    .select('*')
                    .order('name');

                if (activeOnly) {
                    query = query.eq('is_active', true);
                }

                if (!includeBeta) {
                    query = query.eq('is_beta', false);
                }

                if (category && category !== 'all') {
                    query = query.eq('category', category);
                }

                const { data, error } = await query;

                // FALLBACK: Se tabela não existir ou erro, usa providers legados
                if (error) {
                    console.warn('[useIntegrationProviders] Fallback to legacy providers:', error.message);
                    return filterLegacyProviders(LEGACY_PROVIDERS, category, activeOnly);
                }

                // Se não retornou dados, usa fallback
                if (!data || data.length === 0) {
                    console.warn('[useIntegrationProviders] No providers found, using legacy');
                    return filterLegacyProviders(LEGACY_PROVIDERS, category, activeOnly);
                }

                return data as unknown as IntegrationProvider[];
            } catch (err) {
                console.error('[useIntegrationProviders] Error:', err);
                return filterLegacyProviders(LEGACY_PROVIDERS, category, activeOnly);
            }
        },
        enabled,
        staleTime: 5 * 60 * 1000, // 5 minutos
        gcTime: 30 * 60 * 1000, // 30 minutos (antigo cacheTime)
    });
}

/**
 * Filtra providers legados por categoria
 */
function filterLegacyProviders(
    providers: IntegrationProvider[],
    category: string,
    activeOnly: boolean
): IntegrationProvider[] {
    return providers.filter(p => {
        if (activeOnly && !p.is_active) return false;
        if (category !== 'all' && p.category !== category) return false;
        return true;
    });
}

/**
 * Hook para buscar um provider específico por slug
 */
export function useIntegrationProvider(slug: string | null) {
    return useQuery({
        queryKey: ['integration-provider', slug],
        queryFn: async (): Promise<IntegrationProvider | null> => {
            if (!slug) return null;

            try {
                const { data, error } = await supabase
                    .from('integration_provider_catalog')
                    .select('*')
                    .eq('slug', slug)
                    .single();

                if (error) {
                    // Fallback para legacy
                    const legacy = LEGACY_PROVIDERS.find(p => p.slug === slug);
                    return legacy || null;
                }

                return data as unknown as IntegrationProvider;
            } catch {
                const legacy = LEGACY_PROVIDERS.find(p => p.slug === slug);
                return legacy || null;
            }
        },
        enabled: !!slug,
    });
}
