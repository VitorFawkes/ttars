import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import { Link2, Check, AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Phase {
    id: string;
    name: string;
    label: string;
    slug: string;
    color: string;
}

interface Platform {
    id: string;
    name: string;
    provider: string;
    instance_label: string | null;
    is_active: boolean;
    capabilities: {
        has_direct_link?: boolean;
        requires_instance?: boolean;
    } | null;
}

interface PhaseInstanceMap {
    id: string;
    phase_id: string;
    platform_id: string;
    priority: number;
    is_active: boolean;
}

export function PhaseInstanceMappingTab() {
    const queryClient = useQueryClient();
    const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});

    // Fetch pipeline phases
    const { data: phases, isLoading: phasesLoading } = useQuery({
        queryKey: ['pipeline-phases-for-mapping'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipeline_phases')
                .select('id, name, label, slug, color')
                .eq('active', true)
                .order('order_index');
            if (error) throw error;
            return data as Phase[];
        }
    });

    // Fetch WhatsApp platforms
    const { data: platforms, isLoading: platformsLoading } = useQuery({
        queryKey: ['whatsapp-platforms-for-mapping'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('whatsapp_platforms')
                .select('id, name, provider, instance_label, is_active, capabilities')
                .order('name');
            if (error) throw error;
            return data as unknown as Platform[];
        }
    });

    // Fetch existing mappings
    const { data: mappings, isLoading: mappingsLoading } = useQuery({
        queryKey: ['phase-instance-mappings'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('whatsapp_phase_instance_map' as never)
                .select('*');
            if (error) throw error;
            return data as unknown as PhaseInstanceMap[];
        }
    });

    // Save mapping mutation
    const saveMappingMutation = useMutation({
        mutationFn: async ({ phaseId, platformId }: { phaseId: string, platformId: string | null }) => {
            // Delete existing mapping for this phase
            await (supabase
                .from('whatsapp_phase_instance_map' as never)
                .delete as Function)()

            // If platformId is provided, create new mapping
            if (platformId) {
                const { error } = await (supabase
                    .from('whatsapp_phase_instance_map' as never)
                    .insert as Function)({
                        phase_id: phaseId,
                        platform_id: platformId,
                        priority: 1,
                        is_active: true
                    });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['phase-instance-mappings'] });
            toast.success('Mapeamento salvo');
        },
        onError: (e) => toast.error(`Erro: ${e.message}`)
    });

    // Get current mapping for a phase
    const getMappingForPhase = (phaseId: string): string | null => {
        // Check pending changes first
        if (pendingChanges[phaseId] !== undefined) {
            return pendingChanges[phaseId] || null;
        }
        // Then check saved mappings
        const mapping = mappings?.find(m => m.phase_id === phaseId && m.is_active);
        return mapping?.platform_id || null;
    };

    // Handle platform selection change
    const handlePlatformChange = (phaseId: string, platformId: string) => {
        setPendingChanges(prev => ({
            ...prev,
            [phaseId]: platformId
        }));
    };

    // Save all pending changes
    const saveAllChanges = async () => {
        for (const [phaseId, platformId] of Object.entries(pendingChanges)) {
            await saveMappingMutation.mutateAsync({
                phaseId,
                platformId: platformId || null
            });
        }
        setPendingChanges({});
    };

    // Check if there are unsaved changes
    const hasChanges = Object.keys(pendingChanges).length > 0;

    const isLoading = phasesLoading || platformsLoading || mappingsLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Link2 className="w-5 h-5" />
                            Fase → Instância WhatsApp
                        </CardTitle>
                        <CardDescription>
                            Configure qual instância de WhatsApp usar para cada fase do pipeline.
                            O botão de WhatsApp usará automaticamente a instância correta.
                        </CardDescription>
                    </div>
                    {hasChanges && (
                        <Button
                            onClick={saveAllChanges}
                            disabled={saveMappingMutation.isPending}
                        >
                            {saveMappingMutation.isPending ? (
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4 mr-2" />
                            )}
                            Salvar Alterações
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Legend */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-6 p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span>Instância ativa</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-gray-400" />
                            <span>Instância inativa</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Sem mapeamento = usa wa.me</span>
                        </div>
                    </div>

                    {/* Mapping Table */}
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left px-4 py-3 text-sm font-medium">Fase</th>
                                    <th className="text-center px-4 py-3 text-sm font-medium w-12"></th>
                                    <th className="text-left px-4 py-3 text-sm font-medium">Instância</th>
                                    <th className="text-center px-4 py-3 text-sm font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {phases?.map((phase) => {
                                    const currentPlatformId = getMappingForPhase(phase.id);
                                    const currentPlatform = platforms?.find(p => p.id === currentPlatformId);
                                    const hasChange = pendingChanges[phase.id] !== undefined;

                                    return (
                                        <tr
                                            key={phase.id}
                                            className={cn(
                                                "transition-colors",
                                                hasChange && "bg-yellow-500/5"
                                            )}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: phase.color }}
                                                    />
                                                    <span className="font-medium">{phase.label}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        ({phase.slug})
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <ArrowRight className="w-4 h-4 text-muted-foreground mx-auto" />
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                    value={currentPlatformId || ''}
                                                    onChange={(e) => handlePlatformChange(phase.id, e.target.value)}
                                                >
                                                    <option value="">Nenhum (usa wa.me)</option>
                                                    {platforms?.filter(p => p.is_active).map((platform) => (
                                                        <option key={platform.id} value={platform.id}>
                                                            {platform.name}
                                                            {platform.instance_label && ` (${platform.instance_label})`}
                                                        </option>
                                                    ))}
                                                    <optgroup label="Inativos">
                                                        {platforms?.filter(p => !p.is_active).map((platform) => (
                                                            <option key={platform.id} value={platform.id} disabled>
                                                                {platform.name} (inativo)
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {currentPlatformId ? (
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-xs",
                                                            currentPlatform?.is_active
                                                                ? "border-green-200 text-green-700 bg-green-500/10"
                                                                : "border-gray-200 text-gray-500"
                                                        )}
                                                    >
                                                        {currentPlatform?.is_active ? 'Mapeado' : 'Inativo'}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-xs border-amber-200 text-amber-600 bg-amber-500/10">
                                                        Fallback
                                                    </Badge>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Info Box */}
                    <div className="mt-4 p-4 bg-blue-500/5 border border-blue-200/50 rounded-lg">
                        <h4 className="font-medium text-sm text-blue-700 mb-2">
                            Como funciona?
                        </h4>
                        <ul className="text-xs text-blue-600/80 space-y-1">
                            <li>• Quando um usuário clica no botão WhatsApp em um card, o sistema verifica a fase atual</li>
                            <li>• Se a fase tem uma instância mapeada, abre o dashboard dessa instância</li>
                            <li>• Se não há mapeamento, usa o link universal wa.me (fallback)</li>
                            <li>• Você pode trocar de plataforma (ChatPro → Echo) apenas mudando os mapeamentos aqui</li>
                        </ul>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
