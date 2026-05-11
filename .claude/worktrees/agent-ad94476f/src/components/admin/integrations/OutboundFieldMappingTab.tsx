import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { toast } from 'sonner';
import { Check, RefreshCw, Settings, ChevronDown, ChevronRight, Loader2, ArrowRightLeft, Search, StickyNote } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { useSections, useSectionLabelsMap } from '@/hooks/useSections';

// ── Notes AC config ──
interface NotesConfig {
    enabled: boolean;
    sections: {
        sdr: boolean;
        planner: boolean;
        pos_venda: boolean;
    };
}

const DEFAULT_NOTES_CONFIG: NotesConfig = {
    enabled: true,
    sections: { sdr: true, planner: true, pos_venda: true }
};

const NOTES_SECTIONS = [
    { key: 'sdr' as const, label: 'SDR / Briefing', description: 'Observações do briefing inicial (campo: briefing_inicial.observacoes)' },
    { key: 'planner' as const, label: 'Planner / Observações Críticas', description: 'Observações do planner (campo: produto_data.observacoes_criticas)' },
    { key: 'pos_venda' as const, label: 'Pós-Venda', description: 'Observações pós-venda (campo: produto_data.observacoes_pos_venda)' },
];

interface SystemField {
    key: string;
    label: string;
    type: string;
    section: string;
    is_system: boolean;
    active: boolean;
}

interface ExternalField {
    external_id: string;
    external_name: string;
    metadata: Record<string, unknown>;
}

interface ACPipeline {
    external_id: string;
    external_name: string;
}

interface OutboundFieldMap {
    id: string;
    integration_id: string;
    internal_field: string;
    internal_field_label: string | null;
    external_field_id: string;
    external_field_name: string | null;
    external_pipeline_id: string | null;
    sync_always: boolean;
    section?: string | null;
    is_active: boolean;
}

interface StageFieldConfig {
    stage_id: string;
    field_key: string;
    is_visible: boolean;
}

interface PipelinePhase {
    id: string;
    name: string;
    label: string;
}

interface PipelineStage {
    id: string;
    phase_id: string | null;
    fase: string | null;
}

interface OutboundFieldMappingTabProps {
    integrationId: string;
}

// Section labels are now fetched dynamically from useSectionLabelsMap hook

export function OutboundFieldMappingTab({ integrationId }: OutboundFieldMappingTabProps) {
    const queryClient = useQueryClient();
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['trip_info', 'observacoes_criticas']));
    const [syncingAC, setSyncingAC] = useState(false);
    const [syncingMappings, setSyncingMappings] = useState(false);
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('8');
    const [selectedFase, setSelectedFase] = useState<string>(''); // Empty = show ALL fields
    const [searchTerm, setSearchTerm] = useState('');

    // Fetch sections dynamically (replaces hardcoded SECTION_LABELS and GOVERNABLE_SECTIONS)
    const { data: sections = [], isLoading: loadingSections } = useSections();
    const { data: sectionLabelsMap = {} } = useSectionLabelsMap();
    const governableSectionKeys = sections.filter(s => s.is_governable).map(s => s.key);

    // 1. Fetch system_fields
    const { data: systemFields = [], isLoading: loadingFields } = useQuery({
        queryKey: ['system-fields-for-mapping'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('system_fields')
                .select('key, label, type, section, is_system, active')
                .eq('active', true)
                .order('section')
                .order('label');
            if (error) throw error;
            return data as SystemField[];
        }
    });

    // 2. Fetch AC pipelines
    const { data: acPipelines = [] } = useQuery({
        queryKey: ['ac-pipelines-catalog', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_catalog')
                .select('external_id, external_name')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'pipeline')
                .order('external_name');
            if (error) throw error;
            return data as ACPipeline[];
        }
    });

    // 3. Fetch external AC fields
    const { data: externalFields = [], isLoading: loadingExternal } = useQuery({
        queryKey: ['ac-fields-catalog', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_catalog')
                .select('external_id, external_name, metadata')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'field')
                .order('external_name');
            if (error) throw error;
            return data as ExternalField[];
        }
    });

    // 4. Fetch existing mappings
    const { data: existingMappings = [], isLoading: loadingMappings } = useQuery({
        queryKey: ['outbound-field-mappings', integrationId, selectedPipelineId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_outbound_field_map')
                .select('*')
                .eq('integration_id', integrationId)
                .eq('external_pipeline_id', selectedPipelineId);
            if (error) throw error;
            return (data || []) as unknown as OutboundFieldMap[];
        }
    });

    // 5. Fetch stage_field_config (governance)
    const { data: stageConfigs = [] } = useQuery({
        queryKey: ['stage-field-configs-full'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('stage_field_config')
                .select('stage_id, field_key, is_visible');
            if (error) throw error;
            return data as StageFieldConfig[];
        }
    });

    // 6. Fetch pipeline_phases
    const { data: phases = [] } = useQuery({
        queryKey: ['pipeline-phases-for-mapping'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipeline_phases')
                .select('id, name, label')
                .eq('active', true)
                .order('order_index');
            if (error) throw error;
            return data as PipelinePhase[];
        }
    });

    // 7. Fetch pipeline_stages
    const { data: pipelineStages = [] } = useQuery({
        queryKey: ['pipeline-stages-for-mapping'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipeline_stages')
                .select('id, phase_id, fase');
            if (error) throw error;
            return data as PipelineStage[];
        }
    });

    // ── Notes AC config (integration_settings) ──
    const { data: notesConfig = DEFAULT_NOTES_CONFIG } = useQuery({
        queryKey: ['outbound-notes-config'],
        queryFn: async () => {
            const { data } = await supabase
                .from('integration_settings')
                .select('value')
                .eq('key', 'OUTBOUND_NOTES_SECTIONS')
                .maybeSingle();
            if (data?.value) {
                try { return JSON.parse(data.value) as NotesConfig; } catch { /* fall through */ }
            }
            return DEFAULT_NOTES_CONFIG;
        }
    });

    const updateNotesConfig = useMutation({
        mutationFn: async (config: NotesConfig) => {
            const { error } = await supabase
                .from('integration_settings')
                .upsert({ key: 'OUTBOUND_NOTES_SECTIONS', value: JSON.stringify(config) }, { onConflict: 'key' });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['outbound-notes-config'] });
            toast.success('Configuração de Notas AC atualizada');
        },
        onError: (e) => toast.error(`Erro: ${e.message}`)
    });

    const toggleNoteSection = (sectionKey: 'sdr' | 'planner' | 'pos_venda') => {
        const next = {
            ...notesConfig,
            sections: { ...notesConfig.sections, [sectionKey]: !notesConfig.sections[sectionKey] }
        };
        // If all sections disabled, disable the feature entirely
        const anyEnabled = Object.values(next.sections).some(Boolean);
        next.enabled = anyEnabled;
        updateNotesConfig.mutate(next);
    };

    const toggleNotesEnabled = () => {
        if (notesConfig.enabled) {
            // Disable all
            updateNotesConfig.mutate({ enabled: false, sections: { sdr: false, planner: false, pos_venda: false } });
        } else {
            // Enable all
            updateNotesConfig.mutate(DEFAULT_NOTES_CONFIG);
        }
    };

    // Compute visible fields for the selected phase
    // Logic: Match useFieldConfig behavior - default visible = true if no config exists
    const visibleFieldsInPhase = useMemo(() => {
        if (!selectedFase) return null; // null = show ALL

        const phase = phases.find(p => p.name === selectedFase || p.label === selectedFase);
        if (!phase) return [];

        const stagesInPhase = pipelineStages.filter(s =>
            s.phase_id === phase.id || (!s.phase_id && s.fase === phase.name)
        );

        if (stagesInPhase.length === 0) return [];

        const stageIds = new Set(stagesInPhase.map(s => s.id));

        // Build a map of field_key -> is_visible for this phase's stages
        // If a field has is_visible = false in ANY stage, it's hidden
        // If a field has is_visible = true in ANY stage, it's visible
        // If a field has NO config for any stage, it's visible by default (useFieldConfig behavior)
        const fieldVisibility = new Map<string, boolean>();

        stageConfigs.forEach(config => {
            if (!stageIds.has(config.stage_id)) return;

            const currentValue = fieldVisibility.get(config.field_key);
            // If already visible in another stage, keep it visible
            if (currentValue === true) return;
            // Otherwise, set to this config's value
            fieldVisibility.set(config.field_key, config.is_visible);
        });

        // Now determine visible fields:
        // - If field has explicit config -> use that value
        // - If field has NO config -> default to visible (true)
        return systemFields
            .filter(field => {
                const explicitVisibility = fieldVisibility.get(field.key);
                // Default to true if no config exists (matches useFieldConfig)
                return explicitVisibility !== false;
            })
            .map(field => field.key);
    }, [selectedFase, phases, pipelineStages, stageConfigs, systemFields]);

    // Group fields by section
    // IMPORTANT: Phase filter only applies to GOVERNABLE sections (trip_info, observacoes_criticas)
    // Other sections (people, payment, system, etc.) always appear regardless of phase selection
    const fieldsBySection = useMemo(() => {
        const grouped: Record<string, SystemField[]> = {};

        systemFields.forEach(field => {
            const section = field.section || 'details';
            const isGovernableSection = governableSectionKeys.includes(section);

            // Search filter - filter by label or key
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const matchesSearch =
                    field.label.toLowerCase().includes(term) ||
                    field.key.toLowerCase().includes(term);
                if (!matchesSearch) return;
            }

            // If phase selected AND this is a governable section, apply filter
            if (visibleFieldsInPhase !== null && isGovernableSection) {
                if (!visibleFieldsInPhase.includes(field.key)) return;
            }

            if (!grouped[section]) grouped[section] = [];
            grouped[section].push(field);
        });

        return grouped;
    }, [systemFields, visibleFieldsInPhase, searchTerm, governableSectionKeys]);

    // Lookup for existing mappings
    const mappingByField = useMemo(() => {
        const lookup: Record<string, OutboundFieldMap> = {};
        existingMappings.forEach(m => {
            lookup[m.internal_field] = m;
        });
        return lookup;
    }, [existingMappings]);

    // AC field options for select (with standard deal fields)
    const acFieldOptions = useMemo(() => {
        return [
            { value: '', label: 'Não mapeado' },
            // Seção: General Details (campos padrão do AC)
            { value: '__section_general__', label: '▼ General Details' },
            { value: 'deal[value]', label: 'Deal Value' },
            { value: 'deal[title]', label: 'Deal Title' },
            { value: 'deal[status]', label: 'Deal Status' },
            { value: 'deal[stageid]', label: 'Deal Stage ID' },
            { value: 'deal[currency]', label: 'Deal Currency' },
            { value: 'deal[owner]', label: 'Deal Owner' },
            // Seção: Custom Fields
            { value: '__section_custom__', label: '▼ Custom Fields' },
            ...externalFields.map(f => ({
                value: f.external_id,
                label: f.external_name || f.external_id
            }))
        ];
    }, [externalFields]);

    // Upsert mapping mutation
    const upsertMapping = useMutation({
        mutationFn: async ({ fieldKey, externalFieldId, section }: { fieldKey: string; externalFieldId: string | null; section: string }) => {
            const fieldMeta = systemFields.find(f => f.key === fieldKey);
            const externalMeta = externalFields.find(f => f.external_id === externalFieldId);

            if (!externalFieldId) {
                const { error } = await supabase
                    .from('integration_outbound_field_map')
                    .delete()
                    .eq('integration_id', integrationId)
                    .eq('internal_field', fieldKey)
                    .eq('external_pipeline_id', selectedPipelineId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('integration_outbound_field_map')
                    .upsert({
                        integration_id: integrationId,
                        internal_field: fieldKey,
                        internal_field_label: fieldMeta?.label || null,
                        external_field_id: externalFieldId,
                        external_field_name: externalMeta?.external_name || null,
                        external_pipeline_id: selectedPipelineId,
                        section: section,
                        sync_always: false,
                        is_active: true
                    }, { onConflict: 'integration_id,internal_field,external_pipeline_id' });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['outbound-field-mappings'] });
        },
        onError: (e) => toast.error(`Erro: ${e.message}`)
    });

    // Toggle sync_always
    const toggleSyncAlways = useMutation({
        mutationFn: async ({ id, syncAlways }: { id: string; syncAlways: boolean }) => {
            const { error } = await supabase
                .from('integration_outbound_field_map')
                .update({ sync_always: syncAlways })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['outbound-field-mappings'] });
        }
    });

    // Sync AC fields
    const handleSyncACFields = async () => {
        setSyncingAC(true);
        try {
            const { data, error } = await supabase.functions.invoke('integration-sync-catalog', {
                body: { integration_id: integrationId }
            });
            if (error) throw error;
            toast.success(`Sincronizado: ${data.fields_synced || 0} campos do ActiveCampaign`);
            queryClient.invalidateQueries({ queryKey: ['ac-fields-catalog'] });
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : 'Erro desconhecido';
            toast.error(`Erro ao sincronizar: ${errorMessage}`);
        } finally {
            setSyncingAC(false);
        }
    };

    // Sync field mappings from inbound to outbound
    const handleSyncMappings = async () => {
        setSyncingMappings(true);
        try {
            const { data, error } = await supabase.functions.invoke('sync-field-mappings');
            if (error) throw error;

            const newCount = data?.new_outbound_created || 0;
            if (newCount === 0) {
                toast.info('Todos os campos já estão sincronizados!');
            } else {
                toast.success(`✅ ${newCount} novos mapeamentos criados a partir do inbound!`);
            }
            queryClient.invalidateQueries({ queryKey: ['outbound-field-mappings'] });
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : 'Erro desconhecido';
            toast.error(`Erro ao sincronizar mapeamentos: ${errorMessage}`);
        } finally {
            setSyncingMappings(false);
        }
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    };

    const isLoading = loadingFields || loadingExternal || loadingMappings || loadingSections;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const sectionKeys = Object.keys(fieldsBySection).sort();
    const totalFieldsVisible = Object.values(fieldsBySection).flat().length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="w-5 h-5" />
                                Mapeamento de Campos (Welcome → AC)
                            </CardTitle>
                            <CardDescription>
                                Configure quais campos do CRM sincronizam para o ActiveCampaign.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={handleSyncMappings}
                                disabled={syncingMappings}
                                title="Copia mapeamentos do Inbound para o Outbound"
                            >
                                {syncingMappings ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <ArrowRightLeft className="w-4 h-4 mr-2" />
                                )}
                                Espelhar do Inbound
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleSyncACFields}
                                disabled={syncingAC}
                            >
                                {syncingAC ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                )}
                                Sincronizar Campos AC
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Filters: Pipeline + Fase + Busca */}
            <Card className="border-2 border-blue-200 bg-blue-50/30">
                <CardContent className="py-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Pipeline AC Destino */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-blue-700">
                                🎯 Pipeline AC Destino
                            </label>
                            <Select
                                value={selectedPipelineId}
                                onChange={setSelectedPipelineId}
                                options={acPipelines.map(p => ({
                                    value: p.external_id,
                                    label: p.external_name
                                }))}
                            />
                            <span className="text-xs text-muted-foreground">
                                Os mapeamentos serão salvos para este pipeline.
                            </span>
                        </div>

                        {/* Fase Welcome */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-amber-700">
                                📋 Fase Welcome (Filtro)
                            </label>
                            <Select
                                value={selectedFase}
                                onChange={setSelectedFase}
                                options={[
                                    { value: '', label: '🔓 Todos os campos' },
                                    ...phases.map(p => ({
                                        value: p.name,
                                        label: p.label
                                    }))
                                ]}
                            />
                            <span className="text-xs text-muted-foreground">
                                {selectedFase
                                    ? `Mostrando ${totalFieldsVisible} campos visíveis em ${selectedFase}`
                                    : 'Mostrando todos os campos disponíveis'
                                }
                            </span>
                        </div>

                        {/* Buscar Campo */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-700">
                                🔍 Buscar Campo
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Filtrar por nome ou chave..."
                                    className="pl-9"
                                />
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {searchTerm
                                    ? `Filtrando por "${searchTerm}"`
                                    : 'Digite para filtrar campos'
                                }
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{totalFieldsVisible}</div>
                    <div className="text-xs text-muted-foreground">Campos CRM</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{externalFields.length}</div>
                    <div className="text-xs text-muted-foreground">Campos AC</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{existingMappings.length}</div>
                    <div className="text-xs text-muted-foreground">Mapeados</div>
                </div>
            </div>

            {/* Notes AC — Auto sync de observações para Notas do deal */}
            <Card className="border-violet-200 bg-violet-50/30">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <StickyNote className="w-5 h-5 text-violet-600" />
                            <div>
                                <CardTitle className="text-base text-violet-900">
                                    Notas do ActiveCampaign
                                </CardTitle>
                                <CardDescription className="text-violet-600/80">
                                    Observações do CRM são compiladas e enviadas como notas do deal no AC automaticamente.
                                </CardDescription>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                "text-xs h-8 border-violet-300",
                                notesConfig.enabled
                                    ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                                    : "text-slate-500 hover:bg-slate-100"
                            )}
                            onClick={toggleNotesEnabled}
                        >
                            {notesConfig.enabled ? 'Ativo' : 'Desativado'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <div className="border border-violet-200 rounded-lg divide-y divide-violet-100">
                        {NOTES_SECTIONS.map(ns => {
                            const enabled = notesConfig.sections[ns.key];
                            return (
                                <div
                                    key={ns.key}
                                    className={cn(
                                        "flex items-center justify-between px-4 py-3 transition-colors cursor-pointer hover:bg-violet-50",
                                        enabled && "bg-violet-50/50"
                                    )}
                                    onClick={() => toggleNoteSection(ns.key)}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-slate-800">{ns.label}</span>
                                        <span className="text-xs text-slate-500">{ns.description}</span>
                                    </div>
                                    <div className={cn(
                                        "w-9 h-5 rounded-full relative transition-colors",
                                        enabled ? "bg-violet-500" : "bg-slate-300"
                                    )}>
                                        <div className={cn(
                                            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                                            enabled ? "translate-x-4" : "translate-x-0.5"
                                        )} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-xs text-violet-500/80 mt-3">
                        Cada alteração cria uma nova nota no deal do AC com as seções habilitadas.
                        As notas são cumulativas (append-only).
                    </p>
                </CardContent>
            </Card>

            {/* Sections */}
            {sectionKeys.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                    <p>Nenhum campo visível para esta fase.</p>
                    <p className="text-sm mt-2">Selecione "Todos os campos" para ver todos os campos disponíveis.</p>
                </Card>
            ) : (
                sectionKeys.map(section => {
                    const fields = fieldsBySection[section];
                    const isExpanded = expandedSections.has(section);
                    const mappedCount = fields.filter(f => mappingByField[f.key]).length;

                    return (
                        <Card key={section} className="overflow-hidden">
                            <CardHeader
                                className="cursor-pointer hover:bg-muted/30 transition-colors"
                                onClick={() => toggleSection(section)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {isExpanded ? (
                                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                        )}
                                        <CardTitle className="text-base">
                                            {sectionLabelsMap[section] || section}
                                        </CardTitle>
                                        <Badge variant="outline" className="text-xs">
                                            {fields.length} campos
                                        </Badge>
                                        {mappedCount > 0 && (
                                            <Badge variant="default" className="text-xs bg-green-600">
                                                {mappedCount} mapeados
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>

                            {isExpanded && (
                                <CardContent className="pt-0">
                                    <div className="border rounded-lg">
                                        <table className="w-full">
                                            <thead className="bg-muted/50">
                                                <tr>
                                                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-[35%]">
                                                        Campo CRM
                                                    </th>
                                                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-[45%]">
                                                        → Campo ActiveCampaign
                                                    </th>
                                                    <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground w-[80px]">
                                                        Modo
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {fields.map(field => {
                                                    const mapping = mappingByField[field.key];

                                                    return (
                                                        <tr key={field.key} className={cn(
                                                            "transition-colors",
                                                            mapping && "bg-green-50/50"
                                                        )}>
                                                            <td className="px-4 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-medium">
                                                                        {field.label}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground font-mono">
                                                                        {field.key}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <SearchableSelect
                                                                    value={mapping?.external_field_id || ''}
                                                                    onChange={(val) => upsertMapping.mutate({
                                                                        fieldKey: field.key,
                                                                        externalFieldId: val || null,
                                                                        section: section
                                                                    })}
                                                                    options={acFieldOptions}
                                                                    placeholder="Selecione..."
                                                                    searchPlaceholder="Buscar campo AC..."
                                                                    className="w-full"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                {mapping ? (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className={cn(
                                                                            "text-xs h-7",
                                                                            mapping.sync_always
                                                                                ? "text-green-600"
                                                                                : "text-muted-foreground"
                                                                        )}
                                                                        onClick={() => toggleSyncAlways.mutate({
                                                                            id: mapping.id,
                                                                            syncAlways: !mapping.sync_always
                                                                        })}
                                                                    >
                                                                        {mapping.sync_always ? (
                                                                            <><Check className="w-3 h-3 mr-1" />Sempre</>
                                                                        ) : (
                                                                            'Na fase'
                                                                        )}
                                                                    </Button>
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">-</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    );
                })
            )}

            {/* Info */}
            <Card className="bg-blue-50/50 border-blue-200">
                <CardContent className="py-4">
                    <h4 className="font-medium text-sm text-blue-700 mb-2">
                        💡 Como funciona
                    </h4>
                    <ul className="text-xs text-blue-600/80 space-y-1">
                        <li><strong>Pipeline AC:</strong> Selecione o pipeline de destino no ActiveCampaign</li>
                        <li><strong>Fase Welcome:</strong> Filtre para ver apenas campos visíveis em uma fase específica (ou veja todos)</li>
                        <li><strong>Modo "Na fase":</strong> Sincroniza apenas quando o campo está visível na fase atual</li>
                        <li><strong>Modo "Sempre":</strong> Sincroniza independentemente da fase</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
