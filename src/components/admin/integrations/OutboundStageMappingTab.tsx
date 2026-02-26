import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { toast } from 'sonner';
import { ArrowUpRight, Check, RefreshCw, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WelcomeStage {
    id: string;
    nome: string;
    pipeline_id: string;
    phase_id: string | null;
    phase?: {
        label: string;
        color: string;
    };
}

interface ExternalStage {
    external_id: string;
    external_name: string;
    parent_external_id: string | null;
    metadata: {
        order?: number;
        [key: string]: unknown;
    } | null;
}

interface ExternalPipeline {
    external_id: string;
    external_name: string;
}

interface OutboundStageMap {
    id: string;
    integration_id: string;
    internal_stage_id: string;
    external_stage_id: string;
    external_stage_name: string | null;
    is_active: boolean;
}

interface OutboundStageMappingTabProps {
    integrationId: string;
}

export function OutboundStageMappingTab({ integrationId }: OutboundStageMappingTabProps) {
    const queryClient = useQueryClient();
    const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
    const [selectedPipelineFilter, setSelectedPipelineFilter] = useState<string>('');

    // Fetch Welcome stages
    const { data: welcomeStages, isLoading: stagesLoading } = useQuery({
        queryKey: ['welcome-stages-for-outbound'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipeline_stages')
                .select(`
                    id, nome, pipeline_id, phase_id, ordem,
                    phase:pipeline_phases(label, color, order_index)
                `)
                .eq('ativo', true)
                .order('ordem');
            if (error) throw error;
            // Sort by phase order_index then stage ordem
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return ((data || []) as any[]).sort((a, b) => {
                const phaseA = a.phase?.order_index ?? 999
                const phaseB = b.phase?.order_index ?? 999
                if (phaseA !== phaseB) return phaseA - phaseB
                return a.ordem - b.ordem
            }) as WelcomeStage[];
        }
    });

    // Fetch external stages from catalog (with parent pipeline info and metadata for ordering)
    const { data: externalStages, isLoading: externalLoading } = useQuery({
        queryKey: ['external-stages-catalog', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_catalog')
                .select('external_id, external_name, parent_external_id, metadata')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'stage');
            if (error) throw error;
            return (data || []) as ExternalStage[];
        }
    });

    // Fetch AC pipelines for name lookup
    const { data: acPipelines } = useQuery({
        queryKey: ['ac-pipelines-catalog', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_catalog')
                .select('external_id, external_name')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'pipeline')
                .order('external_name');
            if (error) throw error;
            return (data || []) as ExternalPipeline[];
        }
    });

    // Fetch existing outbound mappings
    const { data: existingMappings, isLoading: mappingsLoading } = useQuery({
        queryKey: ['outbound-stage-mappings', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_outbound_stage_map' as never)
                .select('*')
                .eq('integration_id', integrationId);
            if (error) throw error;
            return data as unknown as OutboundStageMap[];
        }
    });

    // Save mapping mutation
    const saveMappingMutation = useMutation({
        mutationFn: async ({ internalStageId, externalStageId }: { internalStageId: string, externalStageId: string | null }) => {
            // Delete existing mapping for this internal stage
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types
            await (supabase.from('integration_outbound_stage_map' as never).delete as any)()

            // If externalStageId is provided, create new mapping
            if (externalStageId) {
                const externalStage = externalStages?.find(s => s.external_id === externalStageId);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types
                const { error } = await (supabase.from('integration_outbound_stage_map' as never).insert as any)({
                        integration_id: integrationId,
                        internal_stage_id: internalStageId,
                        external_stage_id: externalStageId,
                        external_stage_name: externalStage?.external_name || null,
                        is_active: true
                    });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['outbound-stage-mappings'] });
            toast.success('Mapeamento salvo');
        },
        onError: (e) => toast.error(`Erro: ${e.message}`)
    });

    // Get current mapping for a stage
    const getMappingForStage = (stageId: string): string | null => {
        if (pendingChanges[stageId] !== undefined) {
            return pendingChanges[stageId] || null;
        }
        const mapping = existingMappings?.find(m => m.internal_stage_id === stageId && m.is_active);
        return mapping?.external_stage_id || null;
    };

    const handleExternalStageChange = (internalStageId: string, externalStageId: string) => {
        setPendingChanges(prev => ({
            ...prev,
            [internalStageId]: externalStageId
        }));
    };

    const saveAllChanges = async () => {
        for (const [internalStageId, externalStageId] of Object.entries(pendingChanges)) {
            await saveMappingMutation.mutateAsync({
                internalStageId,
                externalStageId: externalStageId || null
            });
        }
        setPendingChanges({});
    };

    const hasChanges = Object.keys(pendingChanges).length > 0;
    const isLoading = stagesLoading || externalLoading || mappingsLoading;

    // Pipeline filter options
    const pipelineOptions = useMemo(() => [
        { value: '', label: '📁 Todos os Pipelines' },
        ...(acPipelines || []).map(p => ({
            value: p.external_id,
            label: p.external_name
        }))
    ], [acPipelines]);

    // Filter stages by selected pipeline, deduplicate, and sort by order
    const filteredExternalStages = useMemo(() => {
        let stages = externalStages || [];

        // Filter by pipeline if selected
        if (selectedPipelineFilter) {
            stages = stages.filter(s => s.parent_external_id === selectedPipelineFilter);
        }

        // Deduplicate by external_id (same stage can appear multiple times)
        const seen = new Set<string>();
        const deduped = stages.filter(s => {
            if (seen.has(s.external_id)) return false;
            seen.add(s.external_id);
            return true;
        });

        // Sort by metadata.order (AC pipeline order)
        return deduped.sort((a, b) => {
            const orderA = a.metadata?.order ?? 9999;
            const orderB = b.metadata?.order ?? 9999;
            return orderA - orderB;
        });
    }, [externalStages, selectedPipelineFilter]);

    // Group stages by phase
    const stagesByPhase = welcomeStages?.reduce((acc, stage) => {
        const phase = stage.phase as Record<string, string> | null;
        const phaseLabel = phase?.label || 'Sem Fase';
        if (!acc[phaseLabel]) {
            acc[phaseLabel] = {
                color: phase?.color || '#888',
                stages: []
            };
        }
        acc[phaseLabel].stages.push(stage);
        return acc;
    }, {} as Record<string, { color: string; stages: WelcomeStage[] }>);

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
                            <ArrowUpRight className="w-5 h-5" />
                            Saída: Etapas (Welcome → Active)
                        </CardTitle>
                        <CardDescription>
                            Configure como as etapas do Welcome mapeiam para etapas no ActiveCampaign.
                            Mudanças de etapa serão sincronizadas automaticamente.
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
                            Salvar
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {/* Pipeline Filter */}
                <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-3">
                        <Filter className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Filtrar por Pipeline AC:</span>
                        <Select
                            value={selectedPipelineFilter}
                            onChange={setSelectedPipelineFilter}
                            options={pipelineOptions}
                            className="w-64"
                        />
                        {selectedPipelineFilter && (
                            <Badge variant="outline" className="text-xs">
                                {filteredExternalStages.length} etapas
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {stagesByPhase && Object.entries(stagesByPhase).map(([phaseName, { color, stages }]) => (
                        <div key={phaseName} className="space-y-2">
                            <div className="flex items-center gap-2 mb-3">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                                <h3 className="font-medium text-sm">{phaseName}</h3>
                                <Badge variant="outline" className="text-xs">
                                    {stages.length} etapas
                                </Badge>
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-muted/30">
                                        <tr>
                                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                                Etapa Welcome
                                            </th>
                                            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                                                → Etapa Active
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {stages.map((stage) => {
                                            const currentExternalId = getMappingForStage(stage.id);
                                            const hasChange = pendingChanges[stage.id] !== undefined;

                                            return (
                                                <tr
                                                    key={stage.id}
                                                    className={cn(
                                                        "transition-colors",
                                                        hasChange && "bg-yellow-500/5"
                                                    )}
                                                >
                                                    <td className="px-4 py-2">
                                                        <span className="text-sm font-medium">
                                                            {stage.nome}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <select
                                                            className="w-full px-3 py-1.5 border border-input rounded-md bg-background text-sm"
                                                            value={currentExternalId || ''}
                                                            onChange={(e) => handleExternalStageChange(stage.id, e.target.value)}
                                                        >
                                                            <option value="">Não sincronizar</option>
                                                            {filteredExternalStages.map((ext) => (
                                                                <option key={ext.external_id} value={ext.external_id}>
                                                                    {ext.external_name || ext.external_id}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}

                    {/* Warning */}
                    <div className="p-4 bg-amber-500/5 border border-amber-200/50 rounded-lg">
                        <h4 className="font-medium text-sm text-amber-700 mb-1">
                            ⚠️ Importante
                        </h4>
                        <p className="text-xs text-amber-600/80">
                            Apenas cards com <code className="px-1 bg-amber-100 rounded">external_id</code> (sincronizados do Active)
                            terão suas mudanças de etapa refletidas de volta. Cards criados internamente não são afetados.
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
