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

            setOrderedFields(initialOrder);
            setVisibleFields(initialVisible);
        }
    }, [systemFields, settings]);

    // --- Mutation ---
    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!phase?.name) return;

            const payload = {
                fase: phase.name,
                campos_kanban: Array.from(visibleFields),
                ordem_kanban: orderedFields,
                updated_at: new Date().toISOString()
            };

            // Check if exists first to decide insert vs update (or use upsert if we had ID)
            // Since we don't have unique constraint on 'fase' in types, let's try upsert on 'fase' if possible,
            // but 'fase' might not be a unique key in the schema definition we can't see.
            // Assuming 'fase' is unique or we use the ID from fetched settings.

            const { error } = await (supabase.from('pipeline_card_settings') as any)
                .upsert(payload, { onConflict: 'fase' });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pipeline-card-settings'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline-settings'] }); // Invalidate KanbanCard cache
            alert('Configurações salvas com sucesso!');
            onClose();
        },
        onError: (err: any) => {
            console.error(err);
            alert('Erro ao salvar: ' + err.message);
        }
    });

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setOrderedFields((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
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
                    <p className="text-sm text-gray-500 mb-4">
                        Escolha quais campos aparecem nos cards desta fase e arraste para ordenar.
                    </p>

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
