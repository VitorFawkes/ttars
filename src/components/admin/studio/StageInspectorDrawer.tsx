import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { X, Save, Eye, EyeOff, CheckSquare, Square, Loader2, Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { usePipelinePhases } from '../../../hooks/usePipelinePhases';
import { useProductContext } from '../../../hooks/useProductContext';
import { PRODUCT_PIPELINE_MAP } from '../../../lib/constants';
import { useSections } from '../../../hooks/useSections';
import type { Database } from '../../../database.types';

type PipelineStage = Database['public']['Tables']['pipeline_stages']['Row'];
type SystemField = Database['public']['Tables']['system_fields']['Row'];
type StageFieldConfig = Database['public']['Tables']['stage_field_config']['Row'];

interface StageInspectorDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    stage: PipelineStage | null;
}

export default function StageInspectorDrawer({ isOpen, onClose, stage }: StageInspectorDrawerProps) {
    const queryClient = useQueryClient();
    const { currentProduct } = useProductContext();
    const pipelineId = PRODUCT_PIPELINE_MAP[currentProduct] || PRODUCT_PIPELINE_MAP.TRIPS;
    const [activeTab, setActiveTab] = useState<'general' | 'data'>('general');

    // Local state for stage details
    const [formData, setFormData] = useState<Partial<PipelineStage>>({});

    const stageId = stage?.id;
    useEffect(() => {
        if (stage) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFormData(stage);
        }
    }, [stageId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sections for the current product — used to filter which fields to show
    const { data: productSections = [] } = useSections(currentProduct);

    // --- Data Fetching ---
    const { data: allFields } = useQuery({
        queryKey: ['system-fields-inspector'],
        queryFn: async () => {
            const { data } = await supabase.from('system_fields').select('*').order('order_index').order('label');
            return data as SystemField[];
        },
        enabled: isOpen
    });

    // Filter fields to only those belonging to sections of the current product
    const fields = allFields?.filter(f => {
        if (!f.section) return true
        return productSections.some(s => s.key === f.section)
    });

    const { data: configs } = useQuery({
        queryKey: ['stage-configs-inspector', stage?.id],
        queryFn: async () => {
            if (!stage) return [];
            const { data } = await supabase.from('stage_field_config').select('*').eq('stage_id', stage.id);
            return data as StageFieldConfig[];
        },
        enabled: isOpen && !!stage
    });

    const { data: phasesData } = usePipelinePhases(pipelineId);
    const phases = phasesData || [];

    // --- Mutations ---
    const [saveSuccess, setSaveSuccess] = useState(false);

    const updateStageMutation = useMutation({
        mutationFn: async (data: Partial<PipelineStage>) => {
            if (!stage) throw new Error('Nenhuma etapa selecionada');

            // Extract only editable fields (exclude id, created_at, etc.)
            const updatePayload = {
                nome: data.nome,
                phase_id: data.phase_id,
                fase: data.fase,
                is_won: data.is_won,
                is_lost: data.is_lost,
                is_sdr_won: data.is_sdr_won,
                is_planner_won: data.is_planner_won,
                is_pos_won: data.is_pos_won,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coluna nova, types não regenerados
                milestone_key: (data as any).milestone_key || null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coluna nova, types não regenerados
                auto_advance: (data as any).auto_advance ?? false
            };

            console.log('[StageInspector] Saving stage data:', updatePayload);
            const { data: result, error } = await supabase
                .from('pipeline_stages')
                .update(updatePayload)
                .eq('id', stage.id)
                .select();

            if (error) {
                console.error('[StageInspector] Save error:', error);
                throw error;
            }

            if (!result || result.length === 0) {
                console.error('[StageInspector] No rows updated - possible RLS issue');
                throw new Error('Sem permissão para editar. Verifique se você é admin.');
            }

            console.log('[StageInspector] Save success, updated:', result);
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-stages-studio'] });
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
        },
        onError: (error: Error) => {
            console.error('[StageInspector] Mutation error:', error);
            alert('Erro ao salvar: ' + error.message);
        }
    });

    const upsertConfigMutation = useMutation({
        mutationFn: async (newConfig: Partial<StageFieldConfig>) => {
            const { error } = await supabase
                .from('stage_field_config')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .upsert(newConfig as any, { onConflict: 'stage_id, field_key' });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stage-configs-inspector', stage?.id] });
            queryClient.invalidateQueries({ queryKey: ['stage-field-configs-unified'] }); // Sync Matrix
        }
    });

    // --- Helpers ---
    const getConfig = (fieldKey: string) => {
        return configs?.find(c => c.field_key === fieldKey);
    };

    const handleToggle = (fieldKey: string, type: 'visible' | 'required' | 'header') => {
        if (!stage) return;
        const current = getConfig(fieldKey);

        const nextValue = {
            stage_id: stage.id,
            field_key: fieldKey,
            is_visible: current?.is_visible ?? true,
            is_required: current?.is_required ?? false,
            show_in_header: current?.show_in_header ?? false
        };

        if (type === 'visible') nextValue.is_visible = !nextValue.is_visible;
        if (type === 'required') nextValue.is_required = !nextValue.is_required;
        if (type === 'header') nextValue.show_in_header = !nextValue.show_in_header;

        upsertConfigMutation.mutate(nextValue);
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col">
                {/* Header */}
                <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-gray-50/50">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Editar Etapa: {stage?.nome}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 px-6">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={cn(
                            "py-3 px-4 text-sm font-medium border-b-2 transition-colors",
                            activeTab === 'general' ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
                        )}
                    >
                        Geral
                    </button>
                    <button
                        onClick={() => setActiveTab('data')}
                        className={cn(
                            "py-3 px-4 text-sm font-medium border-b-2 transition-colors",
                            activeTab === 'data' ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"
                        )}
                    >
                        Coleta de Dados
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'general' ? (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Etapa</label>
                                <input
                                    type="text"
                                    value={formData.nome || ''}
                                    onChange={e => setFormData({ ...formData, nome: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Fase (Macro-Etapa)</label>
                                <select
                                    value={formData.phase_id || ''}
                                    onChange={e => {
                                        const phaseId = e.target.value;
                                        const phase = phases.find(p => p.id === phaseId);
                                        setFormData({
                                            ...formData,
                                            phase_id: phaseId,
                                            fase: phase?.name || 'SDR' // Keep legacy sync
                                        });
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    <option value="">Selecione uma fase...</option>
                                    {phases.map(phase => (
                                        <option key={phase.id} value={phase.id}>
                                            {phase.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Status Final — desativado: ganho/perdido agora são ações, não etapas */}
                            {/* is_won e is_lost mantidos no banco para compatibilidade, mas não editáveis */}

                            {/* Marcos por Seção */}
                            <div className="border-t border-gray-200 pt-4">
                                <label className="block text-sm font-medium text-gray-700 mb-3">Marcos de Ganho</label>
                                <p className="text-xs text-gray-500 mb-3">Badges visuais no card quando passar por esta etapa. Não altera status comercial.</p>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.is_sdr_won || false}
                                            onChange={e => setFormData({ ...formData, is_sdr_won: e.target.checked })}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <div>
                                            <span className="text-sm font-medium text-gray-900">Marco: Ganho SDR</span>
                                            <p className="text-xs text-gray-500">Badge "SDR" aparece no card</p>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.is_planner_won || false}
                                            onChange={e => setFormData({ ...formData, is_planner_won: e.target.checked })}
                                            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                        />
                                        <div>
                                            <span className="text-sm font-medium text-gray-900">Marco: Ganho Planner</span>
                                            <p className="text-xs text-gray-500">Badge "Planner" aparece no card</p>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.is_pos_won || false}
                                            onChange={e => setFormData({ ...formData, is_pos_won: e.target.checked })}
                                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <div>
                                            <span className="text-sm font-medium text-gray-900">Marco: Ganho Pós-Venda</span>
                                            <p className="text-xs text-gray-500">Badge "Pós" aparece no card</p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Milestone para Analytics */}
                            <div className="border-t border-gray-200 pt-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Milestone Analytics</label>
                                <p className="text-xs text-gray-500 mb-3">
                                    Vincula esta etapa a um KPI de conversão no Analytics. Cada milestone pode ser atribuído a apenas um stage ativo.
                                </p>
                                <select
                                    value={(formData as Record<string, unknown>).milestone_key as string || ''}
                                    onChange={e => setFormData({ ...formData, milestone_key: e.target.value || null } as typeof formData)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                >
                                    <option value="">Nenhum</option>
                                    <option value="taxa_paga">% Taxa Paga</option>
                                    <option value="briefing">% Oportunidade</option>
                                    <option value="proposta">% Proposta Enviada</option>
                                    <option value="viagem_confirmada">% Viagem Confirmada</option>
                                </select>
                            </div>

                            {/* Automação */}
                            <div className="border-t border-gray-200 pt-4">
                                <label className="block text-sm font-medium text-gray-700 mb-3">Automação</label>
                                <p className="text-xs text-gray-500 mb-3">
                                    Ao ativar, o card avança automaticamente para a próxima etapa ao entrar nesta.
                                    Útil para etapas de marco (Ganho SDR, Ganho Planner) onde o card não deve permanecer.
                                </p>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={(formData as Record<string, unknown>).auto_advance as boolean || false}
                                            onChange={e => setFormData({ ...formData, auto_advance: e.target.checked } as typeof formData)}
                                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div>
                                            <span className="text-sm font-medium text-gray-900">Auto-avanço</span>
                                            <p className="text-xs text-gray-500">Card avança automaticamente para a próxima etapa ativa</p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <button
                                onClick={() => updateStageMutation.mutate(formData)}
                                disabled={updateStageMutation.isPending || saveSuccess}
                                className={cn(
                                    "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:cursor-not-allowed",
                                    saveSuccess
                                        ? "bg-green-600 text-white"
                                        : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                                )}
                            >
                                {saveSuccess ? (
                                    <Check className="w-4 h-4" />
                                ) : updateStageMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {saveSuccess ? 'Salvo!' : updateStageMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-500 mb-4">
                                Defina quais campos devem ser preenchidos nesta etapa.
                                <br />
                                <span className="text-xs italic">Alterações são salvas automaticamente.</span>
                            </p>

                            {fields?.map(field => {
                                const config = getConfig(field.key);
                                const isVisible = config?.is_visible ?? true;
                                const isRequired = config?.is_required ?? false;

                                return (
                                    <div key={field.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{field.label}</p>
                                            <p className="text-xs text-gray-400">{field.section}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleToggle(field.key, 'visible')}
                                                className={cn(
                                                    "p-1.5 rounded transition-colors",
                                                    isVisible ? "text-blue-600 bg-blue-50" : "text-gray-300 hover:bg-gray-200"
                                                )}
                                                title="Visível"
                                            >
                                                {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => handleToggle(field.key, 'required')}
                                                className={cn(
                                                    "p-1.5 rounded transition-colors",
                                                    isRequired ? "text-red-600 bg-red-50" : "text-gray-300 hover:bg-gray-200"
                                                )}
                                                title="Obrigatório"
                                            >
                                                {isRequired ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
