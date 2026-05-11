import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
    Tags,
    GitPullRequest,
    AlertCircle
} from 'lucide-react';
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader';
import { CategoryContextCard } from '../../components/admin/categories/CategoryContextCard';
import { Loader2 } from 'lucide-react';

// Configuration for the different contexts
const CONTEXTS = [
    {
        id: 'change_request',
        title: 'Solicitações de Mudança',
        description: 'Define as opções disponíveis para o agente ao classificar o motivo de uma alteração em uma reserva ou ficha.',
        icon: <GitPullRequest className="w-5 h-5" />
    },
    // Future contexts can be added here easily
    // {
    //     id: 'task_type',
    //     title: 'Tipos de Tarefa',
    //     description: 'Categorias gerais para organização de tarefas do dia a dia.',
    //     icon: <Layers className="w-5 h-5" />
    // }
];

export default function CategoryManagement() {
    const queryClient = useQueryClient();

    // Fetch Categories
    const { data: categories, isLoading } = useQuery({
        queryKey: ['activity-categories'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('activity_categories')
                .select('*')
                .order('label');
            if (error) throw error;
            return data;
        }
    });

    // Fetch Usage Counts (Intelligence)
    const { data: usageCounts } = useQuery({
        queryKey: ['category-usage'],
        queryFn: async () => {
            if (!categories) return {};
            const counts: Record<string, number> = {};

            // Parallel queries for each category
            await Promise.all((categories as any[]).map(async (cat: any) => {
                if (cat.scope === 'change_request') {
                    const { count } = await supabase
                        .from('tarefas')
                        .select('*', { count: 'exact', head: true })
                        .eq('tipo', 'solicitacao_mudanca')
                        .eq('metadata->>change_category', cat.key);
                    counts[cat.key] = count || 0;
                } else {
                    counts[cat.key] = 0;
                }
            }));

            return counts;
        },
        enabled: !!categories && categories.length > 0
    });

    // Create Mutation
    const createMutation = useMutation({
        mutationFn: async ({ scope, label }: { scope: string, label: string }) => {
            // Auto-generate key
            const key = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

            const { error } = await supabase
                .from('activity_categories')
                .insert([{
                    scope,
                    key,
                    label,
                    visible: true
                }]);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Opção adicionada com sucesso!");
            queryClient.invalidateQueries({ queryKey: ['activity-categories'] });
        },
        onError: (error: Error) => {
            toast.error(`Erro ao criar: ${error.message}`);
        }
    });

    // Toggle Visibility Mutation
    const toggleVisibilityMutation = useMutation({
        mutationFn: async ({ key, visible }: { key: string, visible: boolean }) => {
            const { error } = await supabase
                .from('activity_categories')
                .update({ visible })
                .eq('key', key);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Visibilidade atualizada!");
            queryClient.invalidateQueries({ queryKey: ['activity-categories'] });
        },
        onError: (error: Error) => {
            toast.error(`Erro ao atualizar: ${error.message}`);
        }
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async (key: string) => {
            const { error } = await supabase
                .from('activity_categories')
                .delete()
                .eq('key', key);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Opção removida!");
            queryClient.invalidateQueries({ queryKey: ['activity-categories'] });
        },
        onError: (error: Error) => {
            toast.error(`Erro ao remover: ${error.message}`);
        }
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    // Group categories by scope
    const getCategoriesByScope = (scope: string) => {
        return ((categories || []) as any[]).filter((c: any) => c.scope === scope) || [];
    };

    // Find categories that don't match any known context (orphans)
    const knownScopes = CONTEXTS.map(c => c.id);
    const orphanCategories = ((categories || []) as any[]).filter((c: any) => !knownScopes.includes(c.scope)) || [];

    return (
        <div className="p-8 max-w-[1600px] mx-auto space-y-8">
            <AdminPageHeader
                title="Categorias & Motivos"
                subtitle="Configure as opções de classificação disponíveis em cada contexto do sistema."
                icon={<Tags className="w-6 h-6 text-indigo-400" />}
                actions={null} // Actions are now contextual
                stats={[]} // Removed global stats to focus on context
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {CONTEXTS.map(context => (
                    <CategoryContextCard
                        key={context.id}
                        title={context.title}
                        description={context.description}
                        icon={context.icon}
                        categories={(getCategoriesByScope(context.id) || []).map((c: any) => ({ ...c, visible: c.visible ?? false }))}
                        usageCounts={usageCounts || {}}
                        onAdd={async (label) => {
                            await createMutation.mutateAsync({ scope: context.id, label });
                        }}
                        onToggleVisibility={(key, visible) => toggleVisibilityMutation.mutate({ key, visible })}
                        onDelete={(key) => deleteMutation.mutate(key)}
                    />
                ))}

                {/* Fallback for unknown scopes if any exist */}
                {orphanCategories.length > 0 && (
                    <CategoryContextCard
                        title="Outros / Legado"
                        description="Categorias encontradas no sistema que não pertencem a um contexto ativo."
                        icon={<AlertCircle className="w-5 h-5 text-amber-500" />}
                        categories={orphanCategories.map((c: any) => ({ ...c, visible: c.visible ?? false }))}
                        usageCounts={usageCounts || {}}
                        onAdd={async (label) => {
                            // Default to 'other' scope for orphans
                            await createMutation.mutateAsync({ scope: 'other', label });
                        }}
                        onToggleVisibility={(key, visible) => toggleVisibilityMutation.mutate({ key, visible })}
                        onDelete={(key) => deleteMutation.mutate(key)}
                    />
                )}
            </div>
        </div>
    );
}
