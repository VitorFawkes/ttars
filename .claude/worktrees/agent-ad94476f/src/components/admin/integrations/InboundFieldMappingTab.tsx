import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { toast } from 'sonner';
import { Download, RefreshCw, ChevronDown, ChevronRight, Loader2, ArrowRightLeft, Search, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/Input';

// Contact fields from contatos table
const CONTACT_FIELDS = [
    { key: 'nome', label: 'Nome', type: 'text', section: 'basic' },
    { key: 'sobrenome', label: 'Sobrenome', type: 'text', section: 'basic' },
    { key: 'email', label: 'Email', type: 'email', section: 'basic' },
    { key: 'telefone', label: 'Telefone', type: 'phone', section: 'basic' },
    { key: 'data_nascimento', label: 'Data de Nascimento', type: 'date', section: 'basic' },
    { key: 'cpf', label: 'CPF', type: 'text', section: 'documents' },
    { key: 'passaporte', label: 'Passaporte', type: 'text', section: 'documents' },
    { key: 'observacoes', label: 'Observações', type: 'textarea', section: 'other' },
    { key: 'tags', label: 'Tags', type: 'array', section: 'other' },
];

const CONTACT_SECTION_LABELS: Record<string, string> = {
    basic: '👤 Dados Básicos',
    documents: '📄 Documentos',
    other: '📝 Outros',
};

// ============================================
// STANDARD AC CONTACT FIELDS (campos padrão que sempre existem no payload)
// Estes não vêm do catálogo, são fixos do ActiveCampaign
// ============================================
const AC_STANDARD_CONTACT_FIELDS = [
    { external_id: 'contact[id]', external_name: 'Contact ID (AC)', inferred_section: 'contact_standard' },
    { external_id: 'contact[first_name]', external_name: 'First Name', inferred_section: 'contact_standard' },
    { external_id: 'contact[last_name]', external_name: 'Last Name', inferred_section: 'contact_standard' },
    { external_id: 'contact[email]', external_name: 'Email', inferred_section: 'contact_standard' },
    { external_id: 'contact[phone]', external_name: 'Phone', inferred_section: 'contact_standard' },
    { external_id: 'contact[orgname]', external_name: 'Account (Organization)', inferred_section: 'contact_standard' },
    { external_id: 'contact[tags]', external_name: 'Tags (AC)', inferred_section: 'contact_standard' },
];
// NOTA: Campos customizados de contato (contact[fields][X]) vêm do catálogo dinâmico

// AC Section labels based on AC structure
const AC_SECTION_LABELS: Record<string, string> = {
    // Contact sections
    'contact_standard': '👤 Contato - Padrão',
    'contact_personal': '📋 Contato - Dados Pessoais',
    'contact_tracking': '📊 Contato - Rastreamento',
    'contact_marketing': '📈 Contato - Marketing',
    'contact_preferences': '🎯 Contato - Preferências',
    'contact_custom': '🔧 Contato - Campos Custom',
    // Deal sections
    'general': '📋 General Details',
    'trips_sdr': '✈️ Trips | SDR',
    'trips_vendas_lazer': '🏖️ Trips | Vendas Lazer',
    'trips_infos_marketing': '📊 Trips | Infos Marketing',
    'weddings_sdr': '💒 Weddings | SDR',
    'weddings_closer': '💍 Weddings | Closer',
    'weddings_infos_marketing': '💐 Weddings | Infos Marketing',
    'general_marketing': '📈 Marketing (UTM)',
};

interface SystemField {
    key: string;
    label: string;
    type: string;
    section: string;
}

interface ExternalField {
    external_id: string;
    external_name: string;
    metadata: Record<string, unknown>;
    inferred_section?: string;
}

interface ACPipeline {
    external_id: string;
    external_name: string;
}

interface InboundFieldMap {
    id: string;
    integration_id: string | null;
    external_field_id: string;
    local_field_key: string;
    entity_type: string;
    source: string;
    direction: string | null;
    section?: string | null;
    external_pipeline_id?: string | null;
    sync_always?: boolean;
    is_active?: boolean;
}

interface InboundFieldMappingTabProps {
    integrationId: string;
}

// Helper to infer AC section from field name
function inferACSection(fieldName: string): string {
    const name = fieldName.toLowerCase();

    // SDR fields
    if (name.includes('sdr wt') || name.includes('sdr-') || name.includes('| sdr') ||
        name.includes('quali') || name.includes('reunião sdr') || name.includes('1a. reunião')) {
        return 'trips_sdr';
    }

    // Vendas/Closer fields
    if (name.includes('vnd wt') || name.includes('vendas lazer') || name.includes('closer')) {
        return name.includes('ww') ? 'weddings_closer' : 'trips_vendas_lazer';
    }

    // Marketing fields
    if (name.includes('utm') || name.includes('origem') || name.includes('campanha')) {
        return 'general_marketing';
    }

    // WT/WTN fields (Trips marketing/general)
    if (name.includes('wt ') || name.includes('wtn ') || name.includes('wtn-') ||
        name.includes('[wt]') || name.includes('tempo para viagem')) {
        return 'trips_infos_marketing';
    }

    // Weddings fields
    if (name.includes('ww') || name.includes('weddings') || name.includes('noivo') ||
        name.includes('casamento') || name.includes('convidados')) {
        if (name.includes('sdr')) return 'weddings_sdr';
        if (name.includes('closer')) return 'weddings_closer';
        return 'weddings_infos_marketing';
    }

    return 'general';
}

export function InboundFieldMappingTab({ integrationId }: InboundFieldMappingTabProps) {
    const queryClient = useQueryClient();
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['trips_sdr', 'general_marketing', 'basic']));
    const [syncingAC, setSyncingAC] = useState(false);
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
    const [selectedEntityType, setSelectedEntityType] = useState<string>('deal');
    const [searchTerm, setSearchTerm] = useState('');

    // 1. Fetch system_fields (CRM deal fields) - always load for cross-entity mapping
    const { data: systemFields = [], isLoading: loadingFields } = useQuery({
        queryKey: ['system-fields-for-inbound-mapping'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('system_fields')
                .select('key, label, type, section')
                .eq('active', true)
                .order('section')
                .order('label');
            if (error) throw error;
            return data as SystemField[];
        },
        // Always load - needed for cross-entity mapping (AC contact -> CRM card)
    });

    // Get CRM fields based on entity type
    const crmFields = useMemo(() => {
        if (selectedEntityType === 'contact') {
            return CONTACT_FIELDS;
        }
        return systemFields;
    }, [selectedEntityType, systemFields]);

    // 2. Fetch AC pipelines
    const { data: acPipelines = [] } = useQuery({
        queryKey: ['ac-pipelines-catalog-inbound', integrationId],
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

    // 3. Fetch external AC fields with inferred sections
    const { data: externalFields = [], isLoading: loadingExternal } = useQuery({
        queryKey: ['ac-fields-catalog-inbound', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_catalog')
                .select('external_id, external_name, metadata')
                .eq('integration_id', integrationId)
                .eq('entity_type', 'field')
                .order('external_name');
            if (error) throw error;

            // Infer section for each field
            return (data || []).map(f => ({
                ...f,
                inferred_section: inferACSection(f.external_name || '')
            })) as ExternalField[];
        }
    });

    // 3.1 Fetch recent webhook logs for Field Discovery
    const { data: recentEvents = [] } = useQuery({
        queryKey: ['integration-events-discovery', integrationId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_events')
                .select('payload')
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            return data || [];
        }
    });

    // 3.2 Discover fields from logs
    const discoveredFields = useMemo(() => {
        const discovered: ExternalField[] = [];
        const existingIds = new Set(externalFields.map(f => f.external_id));
        // Add standard contact fields to existing IDs to avoid duplicates
        AC_STANDARD_CONTACT_FIELDS.forEach(f => existingIds.add(f.external_id));

        const seenInLogs = new Set<string>();

        recentEvents.forEach(event => {
            const payload = event.payload;
            if (!payload) return;

            // Helper to check keys
            const checkKey = (key: string, value: any) => {
                // Regex for contact[fields][ID] or deal[fields][ID]
                const match = key.match(/(contact|deal)\[fields\]\[(\d+)\]/);
                if (match) {
                    const type = match[1]; // 'contact' or 'deal'
                    const id = match[2];

                    // Determine the external_id based on type pattern
                    // Contact fields use the full path: contact[fields][123]
                    // Deal fields use just the ID: 123
                    const externalId = type === 'contact' ? key : id;

                    if (!existingIds.has(externalId) && !seenInLogs.has(externalId)) {
                        seenInLogs.add(externalId);
                        discovered.push({
                            external_id: externalId,
                            external_name: `[Descoberto] ${type === 'contact' ? 'Contato' : 'Deal'} ${id}`,
                            metadata: { discovered: true, sample_value: value, entity_type: type },
                            inferred_section: 'contact_custom' // Default to custom
                        });
                    }
                }
            };

            // Recursive traversal
            const traverse = (obj: any) => {
                if (!obj || typeof obj !== 'object') return;
                Object.entries(obj).forEach(([key, value]) => {
                    checkKey(key, value);
                    if (typeof value === 'object') traverse(value);
                });
            };

            traverse(payload);
        });

        return discovered;
    }, [recentEvents, externalFields]);

    // 4. Fetch existing inbound mappings
    // NOTE: Due to historical data inconsistency, external_pipeline_id can be either NULL or ''
    // for records without a pipeline. The constraint uses COALESCE(external_pipeline_id, '')
    // which treats both as equivalent.
    const { data: existingMappings = [], isLoading: loadingMappings } = useQuery({
        queryKey: ['inbound-field-mappings', integrationId, selectedPipelineId, selectedEntityType],
        queryFn: async () => {
            let query = supabase
                .from('integration_field_map')
                .select('*')
                .eq('source', 'active_campaign')
                .eq('entity_type', selectedEntityType)
                .eq('integration_id', integrationId)
                .eq('direction', 'inbound');

            // Only filter by pipeline for deals (contacts don't have pipeline)
            if (selectedEntityType === 'deal' && selectedPipelineId) {
                query = query.eq('external_pipeline_id', selectedPipelineId);
            }

            // For contacts (or deals without selected pipeline), get mappings without pipeline
            // Must match BOTH null AND '' due to legacy data inconsistency
            if (selectedEntityType === 'contact' || !selectedPipelineId) {
                query = query.or('external_pipeline_id.is.null,external_pipeline_id.eq.');
            }

            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as InboundFieldMap[];
        }
    });

    // Group AC fields by their inferred section
    // 100% DYNAMIC - uses catalog + standard fields only
    const acFieldsBySection = useMemo(() => {
        const grouped: Record<string, ExternalField[]> = {};

        // All catalog fields + discovered fields
        const allCatalogFields = [...externalFields, ...discoveredFields];

        let fieldsToGroup: ExternalField[] = [];

        if (selectedEntityType === 'contact') {
            // For contacts: standard fields + contact[*] from catalog
            const standardFields = AC_STANDARD_CONTACT_FIELDS as ExternalField[];
            const standardIds = new Set(standardFields.map(f => f.external_id));

            // Contact custom fields from catalog (contact[fields][X])
            const catalogContactFields = allCatalogFields.filter(f =>
                f.external_id?.startsWith('contact[') && !standardIds.has(f.external_id)
            );

            fieldsToGroup = [...standardFields, ...catalogContactFields];
        } else {
            // For deals: only deal fields (NOT contact[*])
            fieldsToGroup = allCatalogFields.filter(f =>
                !f.external_id?.startsWith('contact[')
            );
        }

        // Filter by search term
        if (searchTerm) {
            fieldsToGroup = fieldsToGroup.filter(f =>
                f.external_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.external_id?.includes(searchTerm)
            );
        }

        fieldsToGroup.forEach(f => {
            const section = f.inferred_section || 'general';
            if (!grouped[section]) grouped[section] = [];
            grouped[section].push(f);
        });

        return grouped;
    }, [externalFields, searchTerm, selectedEntityType, discoveredFields]);

    // Lookup for existing mappings by external_field_id
    const mappingByExternalField = useMemo(() => {
        const lookup: Record<string, InboundFieldMap> = {};
        existingMappings.forEach(m => {
            lookup[m.external_field_id] = m;
        });
        return lookup;
    }, [existingMappings]);

    // CRM field options for select
    const crmFieldOptions = useMemo(() => {
        const options = [
            { value: '', label: '— Não mapeado —' }
        ];

        if (selectedEntityType === 'contact') {
            // ====== CONTACT FIELDS ======
            options.push({ value: '__header_contact__', label: '═══ 👤 CAMPOS DE CONTATO ═══' });

            Object.entries(CONTACT_SECTION_LABELS).forEach(([sectionKey, sectionLabel]) => {
                const sectionFields = CONTACT_FIELDS.filter(f => f.section === sectionKey);
                if (sectionFields.length > 0) {
                    options.push({ value: `__section_${sectionKey}__`, label: `── ${sectionLabel} ──` });
                    sectionFields.forEach(f => {
                        options.push({ value: `contact.${f.key}`, label: `👤 ${f.label} (contato.${f.key})` });
                    });
                }
            });

            // ====== DEAL/CARD FIELDS (from system_fields) ======
            options.push({ value: '__header_deal__', label: '═══ 💼 CAMPOS DO CARD ═══' });

            // Add JSONB storage options
            options.push({ value: '__briefing_inicial__', label: '📝 briefing_inicial (JSONB SDR)' });
            options.push({ value: '__produto_data__', label: '📦 produto_data (JSONB Planner)' });
            options.push({ value: '__marketing_data__', label: '📊 marketing_data (JSONB Raw)' });

            // Group system fields by section
            const grouped: Record<string, SystemField[]> = {};
            systemFields.forEach(f => {
                const section = f.section || 'other';
                if (!grouped[section]) grouped[section] = [];
                grouped[section].push(f);
            });

            Object.entries(grouped).forEach(([section, fields]) => {
                options.push({ value: `__section_deal_${section}__`, label: `── 💼 ${section} ──` });
                fields.forEach(f => {
                    options.push({ value: `card.${f.key}`, label: `💼 ${f.label} (card.${f.key})` });
                });
            });
        } else {
            // Deal fields - group by section
            const grouped: Record<string, SystemField[]> = {};
            systemFields.forEach(f => {
                const section = f.section || 'other';
                if (!grouped[section]) grouped[section] = [];
                grouped[section].push(f);
            });

            // Add JSONB storage options
            options.push({ value: '__briefing_inicial__', label: '📝 briefing_inicial (JSONB SDR)' });
            options.push({ value: '__produto_data__', label: '📦 produto_data (JSONB Planner)' });
            options.push({ value: '__marketing_data__', label: '📊 marketing_data (JSONB Raw)' });

            Object.entries(grouped).forEach(([section, fields]) => {
                options.push({ value: `__section_${section}__`, label: `── ${section} ──` });
                fields.forEach(f => {
                    options.push({ value: f.key, label: `${f.label} (${f.key})` });
                });
            });
        }

        return options;
    }, [selectedEntityType, systemFields]);

    // Helper: Infer storage_location from local_field_key
    const inferStorageLocation = (localFieldKey: string): string => {
        if (localFieldKey.startsWith('__briefing_inicial__')) return 'briefing_inicial';
        if (localFieldKey.startsWith('__produto_data__')) return 'produto_data';
        if (localFieldKey.startsWith('__marketing_data__')) return 'marketing_data';
        if (localFieldKey.startsWith('contact.')) return 'marketing_data'; // Contact fields go to marketing_data on card
        if (localFieldKey.startsWith('card.')) return 'marketing_data'; // Card custom fields go to marketing_data
        // Default: marketing_data (safe fallback for all inbound mappings)
        return 'marketing_data';
    };

    // Helper: Infer correct entity_type from external_field_id
    const inferEntityType = (externalFieldId: string, selectedType: string): string => {
        // If external field is from contact (contact[fields][X] or contact[X]), entity should be 'contact'
        if (externalFieldId.startsWith('contact[')) return 'contact';
        // If external field is from deal (deal[fields][X] or just numeric ID), entity should be 'deal'
        if (externalFieldId.startsWith('deal[') || /^\d+$/.test(externalFieldId)) return 'deal';
        // Fallback to user selection
        return selectedType;
    };

    // Upsert mapping mutation
    // ===================================================================================
    // CONSTRAINT: (integration_id, external_field_id, entity_type, COALESCE(external_pipeline_id, ''))
    //
    // CRITICAL UNDERSTANDING:
    // - The constraint uses COALESCE, which means NULL and '' are treated as EQUIVALENT
    // - Supabase JS .upsert() with onConflict does NOT support COALESCE expressions
    // - Historical data has BOTH null AND '' (empty string) for contacts without pipeline
    //
    // SOLUTION: DELETE + INSERT with proper handling of NULL vs '' equivalence
    // - DELETE must match BOTH null AND '' when no pipeline (to handle legacy data)
    // - INSERT uses '' (empty string) to be consistent with COALESCE behavior
    // ===================================================================================
    const upsertMapping = useMutation({
        mutationFn: async ({ externalFieldId, localFieldKey }: { externalFieldId: string; localFieldKey: string | null }) => {
            // Infer correct entity_type based on external_field_id
            const correctEntityType = inferEntityType(externalFieldId, selectedEntityType);

            // Determine pipeline_id:
            // - For deals with selected pipeline: use the pipeline ID
            // - For contacts or deals without pipeline: use '' (empty string) to match COALESCE behavior
            const pipelineId = correctEntityType === 'deal' && selectedPipelineId
                ? selectedPipelineId
                : '';  // Use empty string, not null, to match COALESCE(external_pipeline_id, '')

            // Step 1: DELETE existing mapping(s)
            // For no-pipeline case, we must delete BOTH null AND '' records (legacy data inconsistency)
            if (pipelineId === '') {
                // Delete records with NULL external_pipeline_id
                const { error: deleteNullError } = await supabase
                    .from('integration_field_map')
                    .delete()
                    .eq('integration_id', integrationId)
                    .eq('external_field_id', externalFieldId)
                    .eq('entity_type', correctEntityType)
                    .is('external_pipeline_id', null);

                if (deleteNullError) {
                    console.error('Delete (null) error:', deleteNullError);
                    throw deleteNullError;
                }

                // Delete records with empty string external_pipeline_id
                const { error: deleteEmptyError } = await supabase
                    .from('integration_field_map')
                    .delete()
                    .eq('integration_id', integrationId)
                    .eq('external_field_id', externalFieldId)
                    .eq('entity_type', correctEntityType)
                    .eq('external_pipeline_id', '');

                if (deleteEmptyError) {
                    console.error('Delete (empty) error:', deleteEmptyError);
                    throw deleteEmptyError;
                }
            } else {
                // For specific pipeline, just delete exact match
                const { error: deleteError } = await supabase
                    .from('integration_field_map')
                    .delete()
                    .eq('integration_id', integrationId)
                    .eq('external_field_id', externalFieldId)
                    .eq('entity_type', correctEntityType)
                    .eq('external_pipeline_id', pipelineId);

                if (deleteError) {
                    console.error('Delete error:', deleteError);
                    throw deleteError;
                }
            }

            // Step 2: If localFieldKey provided, insert new mapping
            if (localFieldKey) {
                const storageLocation = inferStorageLocation(localFieldKey);

                // Table schema: id, source, entity_type, external_field_id, local_field_key,
                // direction, integration_id, section, external_pipeline_id, sync_always,
                // is_active, updated_at, storage_location, db_column_name
                // NOTE: No created_at column exists in this table
                const newMapping = {
                    integration_id: integrationId,
                    external_field_id: externalFieldId,
                    local_field_key: localFieldKey,
                    entity_type: correctEntityType,
                    source: 'active_campaign',
                    direction: 'inbound',
                    external_pipeline_id: pipelineId,  // '' for no pipeline, actual ID for deals
                    sync_always: true,
                    is_active: true,
                    storage_location: storageLocation,
                    updated_at: new Date().toISOString()
                };

                const { error: insertError } = await supabase
                    .from('integration_field_map')
                    .insert(newMapping);

                if (insertError) {
                    console.error('Insert error:', insertError);
                    throw insertError;
                }
            }
            // If localFieldKey is null/empty, the delete already removed the mapping
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inbound-field-mappings'] });
            toast.success('Mapeamento salvo');
        },
        onError: (e) => toast.error(`Erro: ${e.message}`)
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
            queryClient.invalidateQueries({ queryKey: ['ac-fields-catalog-inbound'] });
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : 'Erro desconhecido';
            toast.error(`Erro ao sincronizar: ${errorMessage}`);
        } finally {
            setSyncingAC(false);
        }
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    const isLoading = loadingFields || loadingExternal || loadingMappings;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const sectionKeys = Object.keys(acFieldsBySection).sort((a, b) => {
        // Priority order - contact sections first, then deal sections
        const order = [
            'contact_standard', 'contact_personal', 'contact_tracking', 'contact_marketing', 'contact_preferences',
            'trips_sdr', 'trips_vendas_lazer', 'trips_infos_marketing', 'general_marketing', 'general'
        ];
        const aIdx = order.indexOf(a);
        const bIdx = order.indexOf(b);
        // If not found in order, put at end
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    // Count total fields from catalog (dynamic)
    const allCatalogFields = [...externalFields, ...discoveredFields];
    const totalACFields = selectedEntityType === 'contact'
        ? AC_STANDARD_CONTACT_FIELDS.length + allCatalogFields.filter(f => f.external_id?.startsWith('contact[')).length
        : allCatalogFields.filter(f => !f.external_id?.startsWith('contact[')).length;
    const mappedCount = existingMappings.length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Download className="w-5 h-5" />
                                Mapeamento de Campos (AC → Welcome)
                            </CardTitle>
                            <CardDescription>
                                Selecione o campo AC e defina para qual campo do CRM ele deve ser mapeado.
                            </CardDescription>
                        </div>
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
                </CardHeader>
            </Card>

            {/* Filters */}
            <Card className="border-2 border-slate-200 bg-slate-50/50">
                <CardContent className="py-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Entity Type */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-700">
                                📋 Tipo de Entidade
                            </label>
                            <Select
                                value={selectedEntityType}
                                onChange={(val) => {
                                    setSelectedEntityType(val);
                                    // Clear pipeline when switching to contact
                                    if (val === 'contact') setSelectedPipelineId('');
                                }}
                                options={[
                                    { value: 'deal', label: '💼 Deals (Negócios)' },
                                    { value: 'contact', label: '👤 Contacts (Contatos)' },
                                ]}
                            />
                            <span className="text-xs text-muted-foreground">
                                {selectedEntityType === 'contact'
                                    ? 'Campos da tabela contatos'
                                    : 'Campos da tabela cards (system_fields)'}
                            </span>
                        </div>

                        {/* Pipeline AC - Only for deals */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-blue-700">
                                🎯 Pipeline AC Origem
                            </label>
                            <Select
                                value={selectedPipelineId}
                                onChange={setSelectedPipelineId}
                                options={[
                                    { value: '', label: '— Todos os pipelines —' },
                                    ...acPipelines.map(p => ({
                                        value: p.external_id,
                                        label: p.external_name
                                    }))
                                ]}
                                disabled={selectedEntityType === 'contact'}
                            />
                            <span className="text-xs text-muted-foreground">
                                {selectedEntityType === 'contact'
                                    ? 'Contatos não pertencem a pipeline'
                                    : selectedPipelineId
                                        ? 'Mapeamentos específicos deste pipeline'
                                        : 'Mostrando mapeamentos globais'}
                            </span>
                        </div>

                        {/* Search */}
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-700">
                                🔍 Buscar Campo AC
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Filtrar por nome..."
                                    className="pl-9"
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold">{totalACFields}</div>
                    <div className="text-xs text-muted-foreground">Campos AC</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold">{discoveredFields.length}</div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-yellow-500" />
                        Descobertos (Logs)
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold">{crmFields.length}</div>
                    <div className="text-xs text-muted-foreground">
                        Campos CRM ({selectedEntityType === 'contact' ? 'Contatos' : 'Deals'})
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4 text-center shadow-sm">
                    <div className="text-2xl font-bold text-green-600">{mappedCount}</div>
                    <div className="text-xs text-muted-foreground">Mapeados</div>
                </div>
            </div>

            {/* AC Fields grouped by AC sections */}
            {sectionKeys.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                    <p>Nenhum campo encontrado.</p>
                    <p className="text-sm mt-2">Clique em "Sincronizar Campos AC" para buscar os campos.</p>
                </Card>
            ) : (
                sectionKeys.map(section => {
                    const fields = acFieldsBySection[section];
                    const isExpanded = expandedSections.has(section);
                    const mappedInSection = fields.filter(f => mappingByExternalField[f.external_id]).length;

                    return (
                        <Card key={section} className="overflow-hidden border border-slate-200 shadow-sm">
                            <CardHeader
                                className="cursor-pointer hover:bg-slate-50 transition-colors py-3"
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
                                            {AC_SECTION_LABELS[section] || section}
                                        </CardTitle>
                                        <Badge variant="outline" className="text-xs">
                                            {fields.length} campos
                                        </Badge>
                                        {mappedInSection > 0 && (
                                            <Badge variant="default" className="text-xs bg-green-600">
                                                {mappedInSection} mapeados
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>

                            {isExpanded && (
                                <CardContent className="pt-0">
                                    <div className="border rounded-lg overflow-hidden">
                                        <table className="w-full">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-1/2">
                                                        Campo ActiveCampaign (origem)
                                                    </th>
                                                    <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground w-8">
                                                        →
                                                    </th>
                                                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-1/2">
                                                        Campo CRM (destino)
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {fields.map(field => {
                                                    const mapping = mappingByExternalField[field.external_id];
                                                    const currentValue = mapping?.local_field_key || '';

                                                    return (
                                                        <tr key={field.external_id} className={cn(
                                                            "transition-colors",
                                                            mapping && "bg-green-50/50"
                                                        )}>
                                                            <td className="px-4 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-medium flex items-center gap-2">
                                                                        {field.external_name}
                                                                        {(field.metadata as any)?.discovered && (
                                                                            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-yellow-50 text-yellow-700 border-yellow-200">
                                                                                Descoberto
                                                                            </Badge>
                                                                        )}
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground font-mono">
                                                                        ID: {field.external_id}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-3 text-center">
                                                                <ArrowRightLeft className="w-4 h-4 text-muted-foreground mx-auto" />
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <Select
                                                                    value={currentValue}
                                                                    onChange={(val) => upsertMapping.mutate({
                                                                        externalFieldId: field.external_id,
                                                                        localFieldKey: val || null
                                                                    })}
                                                                    options={crmFieldOptions.filter(o => !o.value.startsWith('__section_'))}
                                                                    placeholder="Selecione campo CRM..."
                                                                    className="w-full"
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            )
                            }
                        </Card>
                    );
                })
            )}

            {/* Info */}
            <Card className="bg-slate-50 border-slate-200">
                <CardContent className="py-4">
                    <h4 className="font-medium text-sm text-slate-700 mb-2">
                        💡 Como funciona
                    </h4>
                    <ul className="text-xs text-slate-600 space-y-1">
                        <li><strong>Tipo de Entidade:</strong> Deals = campos do card, Contacts = campos do contato</li>
                        <li><strong>Pipeline AC:</strong> Para deals, filtra mapeamentos por pipeline de origem</li>
                        <li><strong>Seções AC:</strong> Os campos são agrupados pelas seções do ActiveCampaign</li>
                        <li><strong>Destinos JSONB:</strong> Use <code>__briefing_inicial__</code> ou <code>__produto_data__</code> para armazenar em JSONB</li>
                    </ul>
                </CardContent>
            </Card>
        </div >
    );
}
