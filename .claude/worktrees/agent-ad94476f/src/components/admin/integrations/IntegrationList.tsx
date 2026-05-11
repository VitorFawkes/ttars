import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Zap, Database } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Novos componentes e hooks
import { useIntegrationProviders } from '@/hooks/useIntegrationProviders';
import { ProviderCard } from './ProviderCard';
import { CategoryFilterSimple } from './CategoryFilter';
import { ActiveConnectionCard } from './ActiveConnectionCard';

// Constante centralizada
import { AC_INTEGRATION_ID } from '@/lib/integrations';

interface Integration {
    id: string;
    name: string;
    type: 'input' | 'output';
    provider: string;
    is_active: boolean;
    updated_at: string | null;
}

interface IntegrationListProps {
    onSelect: (id: string | null, type?: 'input' | 'output') => void;
    onExploreFields: () => void;
}

export function IntegrationList({ onSelect, onExploreFields }: IntegrationListProps) {
    const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const queryClient = useQueryClient();

    // Busca providers do banco (com fallback para legados)
    const { data: providers, isLoading: providersLoading } = useIntegrationProviders({
        category: activeCategory,
        activeOnly: true,
        includeBeta: true, // Mostrar beta providers também
    });

    // Busca integrações ativas do usuário
    const { data: integrations, isLoading: integrationsLoading } = useQuery({
        queryKey: ['integrations'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integrations')
                .select('id, name, type, provider, is_active, updated_at')
                .not('name', 'ilike', '%(Rascunho)%')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as Integration[];
        },
    });

    // Identifica quais providers já estão conectados
    const connectedProviders = useMemo(() => {
        if (!integrations) return new Set<string>();
        return new Set(integrations.map(i => i.provider?.toLowerCase()));
    }, [integrations]);

    const handleDelete = async () => {
        if (!deleteConfirmation) return;

        try {
            const { error } = await supabase
                .from('integrations')
                .delete()
                .eq('id', deleteConfirmation);

            if (error) throw error;

            // Invalidate query to refresh list
            queryClient.invalidateQueries({ queryKey: ['integrations'] });
            setDeleteConfirmation(null);
        } catch (error) {
            console.error('Error deleting integration:', error);
            alert('Erro ao deletar integração');
        }
    };

    const handleProviderConnect = (providerSlug: string) => {
        // Determinar o tipo baseado na direção do provider
        const provider = providers?.find(p => p.slug === providerSlug);
        const type = provider?.direction.includes('inbound') ? 'input' : 'output';
        onSelect('new', type);
    };

    const isLoading = providersLoading || integrationsLoading;

    if (isLoading) {
        return (
            <div className="space-y-10">
                <div className="flex justify-between items-end">
                    <Skeleton className="h-12 w-64" />
                    <Skeleton className="h-10 w-40" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-32 w-full" />
                    ))}
                </div>
            </div>
        );
    }

    const activeIntegrations = integrations || [];
    // IDs protegidos que não podem ser deletados
    const protectedIds = [AC_INTEGRATION_ID];

    return (
        <div className="space-y-10">
            {/* Header Section */}
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-foreground tracking-tight">Integrations Hub</h2>
                    <p className="text-muted-foreground mt-2 text-lg">
                        Conecte suas ferramentas favoritas e automatize seu fluxo de trabalho.
                    </p>
                </div>
                <Button variant="outline" onClick={onExploreFields} className="border-border text-foreground hover:bg-muted hover:text-foreground">
                    <Database className="w-4 h-4 mr-2" />
                    Explorar Campos
                </Button>
            </div>

            {/* Active Integrations Section */}
            {activeIntegrations.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
                        <Zap className="w-5 h-5 text-yellow-500" />
                        Suas Conexões Ativas
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeIntegrations.map((integration) => (
                            <ActiveConnectionCard
                                key={integration.id}
                                integration={integration}
                                onClick={() => onSelect(integration.id)}
                                onDelete={() => setDeleteConfirmation(integration.id)}
                                protectedIds={protectedIds}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Catalog Section */}
            <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-4">
                    <h3 className="text-xl font-semibold text-foreground">Catálogo de Apps</h3>
                    <CategoryFilterSimple
                        active={activeCategory}
                        onChange={setActiveCategory}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {providers?.map((provider) => {
                        const isConnected = connectedProviders.has(provider.slug);

                        return (
                            <ProviderCard
                                key={provider.id}
                                provider={provider}
                                isConnected={isConnected}
                                onConnect={() => handleProviderConnect(provider.slug)}
                            />
                        );
                    })}

                    {/* Mensagem se não houver providers */}
                    {(!providers || providers.length === 0) && (
                        <div className="col-span-full text-center py-12 text-muted-foreground">
                            <p>Nenhum app disponível nesta categoria.</p>
                        </div>
                    )}
                </div>

                {/* Delete Confirmation Dialog */}
                <Dialog open={!!deleteConfirmation} onOpenChange={(open) => !open && setDeleteConfirmation(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Excluir Integração?</DialogTitle>
                            <DialogDescription>
                                Tem certeza que deseja excluir esta integração? Esta ação não pode ser desfeita e irá parar qualquer sincronização ativa.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteConfirmation(null)}>
                                Cancelar
                            </Button>
                            <Button variant="destructive" onClick={handleDelete}>
                                Excluir
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
