import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { X, Save, Eye, EyeOff, GripVertical } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { Database } from '../../../database.types';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type PipelinePhase = Database['public']['Tables']['pipeline_phases']['Row'];
type SystemField = Database['public']['Tables']['system_fields']['Row'];

interface PhaseSettingsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    phase: PipelinePhase | null;
}

interface SortableFieldProps {
    id: string;
    field: SystemField;
    isVisible: boolean;
    onToggle: () => void;
}

function SortableField({ id, field, isVisible, onToggle }: SortableFieldProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100",
                isDragging && "opacity-50 bg-gray-100 border-dashed"
            )}
        >
            <div className="flex items-center gap-3">
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                >
                    <GripVertical className="w-5 h-5" />
                </div>
                <div>
                    <p className="text-sm font-medium text-gray-900">{field.label}</p>
                    <p className="text-xs text-gray-400">{field.section}</p>
                </div>
            </div>
            <button
                onClick={onToggle}
                className={cn(
                    "p-1.5 rounded transition-colors",
                    isVisible ? "text-blue-600 bg-blue-50" : "text-gray-300 hover:bg-gray-200"
                )}
                title={isVisible ? "Visível" : "Oculto"}
            >
                {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
        </div>
    );
}

export default function PhaseSettingsDrawer({ isOpen, onClose, phase }: PhaseSettingsDrawerProps) {
    const queryClient = useQueryClient();
    const [orderedFields, setOrderedFields] = useState<string[]>([]);
    const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set());
    const [phaseConfig, setPhaseConfig] = useState({
        active: true,
        supports_win: false,
        win_action: 'advance_to_next' as string,
        owner_label: '',
    });

    useEffect(() => {
        if (phase) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPhaseConfig({
                active: phase.active ?? true,
                supports_win: phase.supports_win ?? false,
                win_action: phase.win_action ?? 'advance_to_next',
                owner_label: phase.owner_label ?? '',
            });
        }
    }, [phase?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // --- Data Fetching ---
    const { data: systemFields } = useQuery({
        queryKey: ['system-fields-phase-settings'],
        queryFn: async () => {
            const { data } = await supabase.from('system_fields').select('*').eq('active', true).order('label');
            return data as SystemField[];
        },
        enabled: isOpen
    });

    const { data: settings } = useQuery({
        queryKey: ['pipeline-card-settings', phase?.name],
        queryFn: async () => {
            if (!phase?.name) return null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (supabase.from('pipeline_card_settings') as any)
                .select('*')
                .eq('fase', phase.name)
                .single();
            return data;
        },
        enabled: isOpen && !!phase?.name
    });

    // --- Sync State ---


    useEffect(() => {
        if (systemFields) {
            // Default order: existing settings or alphabetical
            let initialOrder = systemFields.map(f => f.key);
            let initialVisible = new Set<string>();

            if (settings) {
                if (settings.ordem_kanban && Array.isArray(settings.ordem_kanban)) {
                    // Merge saved order with new fields
                    const savedOrder = settings.ordem_kanban;
                    const newFields = initialOrder.filter(f => !savedOrder.includes(f));
                    initialOrder = [...savedOrder, ...newFields];
                }

                if (settings.campos_kanban && Array.isArray(settings.campos_kanban)) {
                    initialVisible = new Set(settings.campos_kanban);
                }
            } else {
                // Default visible fields if no settings
                ['destinos', 'epoca_viagem', 'orcamento'].forEach(f => initialVisible.add(f));
            }

            // eslint-disable-next-line react-hooks/set-state-in-effect
            setOrderedFields(initialOrder);
            setVisibleFields(initialVisible);
        }
    }, [systemFields, settings]);

    // --- Mutation ---
    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!phase?.name) return;

            // 1. Salvar regras de ganho + flag ativa na pipeline_phases
            const { error: phaseError } = await supabase
                .from('pipeline_phases')
                .update({
                    active: phaseConfig.active,
                    supports_win: phaseConfig.supports_win,
                    win_action: phaseConfig.win_action || null,
                    owner_label: phaseConfig.owner_label || null,
                })
                .eq('id', phase.id);

            if (phaseError) throw phaseError;

            // 2. Salvar campos do Kanban em pipeline_card_settings
            //    Tabela não tem unique em `fase` (existem duplicatas) — fazer UPDATE por id ou INSERT.
            const basePayload = {
                fase: phase.name,
                campos_kanban: Array.from(visibleFields),
                ordem_kanban: orderedFields,
                updated_at: new Date().toISOString()
            };

            if (settings?.id) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error } = await (supabase.from('pipeline_card_settings') as any)
                    .update(basePayload)
                    .eq('id', settings.id);
                if (error) throw error;
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error } = await (supabase.from('pipeline_card_settings') as any)
                    .insert(basePayload);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-card-settings'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-settings'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-phases'] });
            alert('Configurações salvas com sucesso!');
            onClose();
        },
        onError: (err: Error) => {
            console.error(err);
            alert('Erro ao salvar: ' + err.message);
        }
    });

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setOrderedFields((items) => {
            const oldIndex = items.indexOf(String(active.id));
            const newIndex = items.indexOf(String(over.id));
            return arrayMove(items, oldIndex, newIndex);
        });
    };

    const toggleVisibility = (fieldKey: string) => {
        const next = new Set(visibleFields);
        if (next.has(fieldKey)) {
            next.delete(fieldKey);
        } else {
            next.add(fieldKey);
        }
        setVisibleFields(next);
    };

    if (!isOpen) return null;

    return (
        <>
            <div
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
                onClick={onClose}
            />
            <div className="fixed inset-y-0 right-0 w-[400px] bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col">
                <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-gray-50/50">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Cards: {phase?.name}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {/* Fase ativa/inativa */}
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-800 mb-3">Visibilidade</h3>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex-1">
                                <span className="text-sm font-medium text-gray-900">Fase ativa</span>
                                <p className="text-xs text-gray-500">
                                    Quando desativada, some do Kanban, Funil e Analytics. As etapas continuam no banco — é só esconder, não apagar.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPhaseConfig(prev => ({ ...prev, active: !prev.active }))}
                                className={cn(
                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-3",
                                    phaseConfig.active ? "bg-indigo-600" : "bg-gray-300"
                                )}
                            >
                                <span className={cn(
                                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                    phaseConfig.active ? "translate-x-6" : "translate-x-1"
                                )} />
                            </button>
                        </div>
                    </div>

                    {/* Win / Ganho configuration */}
                    <div className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-800 mb-3">Regras de Ganho</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                    <span className="text-sm font-medium text-gray-900">Esta fase tem ganho?</span>
                                    <p className="text-xs text-gray-500">Habilita o botão "Marcar como ganho" nos cards desta fase</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPhaseConfig(prev => ({ ...prev, supports_win: !prev.supports_win }))}
                                    className={cn(
                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                                        phaseConfig.supports_win ? "bg-indigo-600" : "bg-gray-300"
                                    )}
                                >
                                    <span className={cn(
                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                        phaseConfig.supports_win ? "translate-x-6" : "translate-x-1"
                                    )} />
                                </button>
                            </div>

                            {phaseConfig.supports_win && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Ao marcar ganho, o card...</label>
                                    <select
                                        value={phaseConfig.win_action}
                                        onChange={e => setPhaseConfig(prev => ({ ...prev, win_action: e.target.value }))}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                    >
                                        <option value="advance_to_next">Avança automaticamente para a próxima fase</option>
                                        <option value="choose">Fica na etapa atual (ganho apenas registrado)</option>
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Nome do responsável desta fase</label>
                                <input
                                    type="text"
                                    value={phaseConfig.owner_label}
                                    onChange={e => setPhaseConfig(prev => ({ ...prev, owner_label: e.target.value }))}
                                    placeholder="Ex: SDR, Closer, Wedding Planner"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 pt-5 mb-4">
                        <p className="text-sm text-gray-500">
                            Escolha quais campos aparecem nos cards desta fase e arraste para ordenar.
                        </p>
                    </div>

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={orderedFields}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {orderedFields.map(fieldKey => {
                                    const field = systemFields?.find(f => f.key === fieldKey);
                                    if (!field) return null;
                                    return (
                                        <SortableField
                                            key={fieldKey}
                                            id={fieldKey}
                                            field={field}
                                            isVisible={visibleFields.has(fieldKey)}
                                            onToggle={() => toggleVisibility(fieldKey)}
                                        />
                                    );
                                })}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>

                <div className="p-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={() => saveMutation.mutate()}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        Salvar Configuração
                    </button>
                </div>
            </div>
        </>
    );
}
