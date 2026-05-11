import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    DndContext,
    DragOverlay,
    useSensor,
    useSensors,
    PointerSensor,
    KeyboardSensor,
    closestCorners,
    type DragStartEvent,
    type DragEndEvent
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
    Plus,
    RefreshCw,
    AlertCircle,
    Check,
    GripVertical,
    Phone,
    User,
    MessageSquare,
    Hash,
    Clock,
    Send,
    Tag,
    FileText,
    Link2,
    ChevronDown,
    ChevronRight,
    Sparkles,
    X,
    Search,
    Save,
    Trash2,
    Package,
    Building
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
} from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface FieldMapping {
    id: string;
    platform_id: string;
    external_path: string;
    internal_field: string;
    transform_type: string;
    transform_config: Record<string, unknown>;
    is_active: boolean;
}

// Pending change for batch save
interface PendingChange {
    type: 'add' | 'remove';
    internalField: string;
    externalPath?: string;
    mappingId?: string;
}

interface WhatsAppFieldMappingProps {
    platformId: string;
}

// Custom field from database
interface CustomField {
    id: string;
    platform_id: string;
    field_key: string;
    field_label: string;
    field_group: string;
    is_active: boolean;
}

// Field definition type (both static and custom)
interface InternalFieldDefinition {
    value: string;
    label: string;
    group: string;
    icon: React.ComponentType<{ className?: string }>;
    description?: string;
    required?: boolean;
    isCustom?: boolean;
    customFieldId?: string;
}

// Internal CRM fields with Lucide icons
const INTERNAL_FIELDS: InternalFieldDefinition[] = [
    { value: 'sender_phone', label: 'Telefone do Remetente', group: 'Contato', icon: Phone, required: true, description: 'Telefone de quem enviou a mensagem' },
    { value: 'sender_name', label: 'Nome do Remetente', group: 'Contato', icon: User, description: 'Nome de quem enviou (cliente ou agente)' },
    { value: 'body', label: 'Conteúdo da Mensagem', group: 'Mensagem', icon: MessageSquare, required: true, description: 'Conteúdo/texto da mensagem' },
    { value: 'external_id', label: 'ID Externo (WhatsApp)', group: 'Mensagem', icon: Hash, required: true, description: 'ID único da mensagem no WhatsApp (wamid.xxx)' },
    { value: 'conversation_id', label: 'ID da Conversa', group: 'Mensagem', icon: Link2, description: 'Agrupa todas as msgs de um chat cliente↔Welcome' },
    { value: 'session_id', label: 'ID da Sessão', group: 'Mensagem', icon: Link2, description: 'Período de interação contínua (legado ChatPro)' },
    { value: 'lead_id', label: 'ID do Lead (Externo)', group: 'Mensagem', icon: Tag, description: 'ID do lead na plataforma Ecko' },
    { value: 'direction', label: 'Direção (in/out)', group: 'Mensagem', icon: Send, description: 'inbound (cliente→Welcome) ou outbound (Welcome→cliente)' },
    { value: 'message_type', label: 'Tipo de Mensagem', group: 'Mensagem', icon: FileText, description: 'Tipo: text, image, document, audio, video, etc' },
    { value: 'is_from_me', label: 'Enviada por Mim?', group: 'Mensagem', icon: Send, description: 'true se a Welcome enviou' },
    { value: 'created_at', label: 'Data/Hora', group: 'Mensagem', icon: Clock, description: 'Data/hora da mensagem' },
    { value: 'ack_status', label: 'Status de Confirmação', group: 'Status', icon: Check, description: 'Status de entrega: sent, delivered, read, failed' },
    { value: 'origem', label: 'Origem (sdr-trips, etc)', group: 'Metadata', icon: Tag, description: 'Contexto da linha: sdr-trips, planner-weddings' },
    { value: 'produto', label: 'Produto (trips, weddings, etc)', group: 'Metadata', icon: Package, description: 'Produto: TRIPS, WEDDING, CORP' },
    { value: 'media_url', label: 'URL da Mídia', group: 'Mídia', icon: FileText, description: 'URL de mídia (imagem, vídeo, documento)' },
    { value: 'file_type', label: 'Tipo de Arquivo', group: 'Mídia', icon: FileText, description: 'Tipo MIME do arquivo' },
    { value: 'sector', label: 'Setor (Welcome)', group: 'Metadata', icon: Tag, description: 'Setor da pessoa da Welcome que enviou/recebeu' },
    { value: 'phone_number_id', label: 'ID da Linha', group: 'Metadata', icon: Hash, description: 'ID da linha no provedor (ex: Ecko phone_number_id)' },
    { value: 'phone_number_label', label: 'Nome da Linha', group: 'Metadata', icon: Tag, description: 'Nome da linha (ex: Concierge Welcome)' },
    { value: 'actor_type', label: 'Tipo de Ator', group: 'Metadata', icon: User, description: 'Tipo de ator: customer, agent, system' },
    { value: 'conversation_status', label: 'Status da Conversa', group: 'Mensagem', icon: Check, description: 'Status da conversa: active, closed, etc' },
    // NEW: Complete Ecko Fields (2026-01-20)
    { value: 'agent_email', label: 'Email do Agente', group: 'Agente', icon: User, description: 'Email do agente Welcome que atendeu' },
    { value: 'organization', label: 'Organização', group: 'Metadata', icon: Building, description: 'Organização no Ecko (ex: Welcome)' },
    { value: 'organization_id', label: 'ID da Organização', group: 'Metadata', icon: Hash, description: 'ID da organização no Ecko' },
    { value: 'whatsapp_message_id', label: 'ID WhatsApp (wamid)', group: 'Mensagem', icon: Hash, description: 'ID real do WhatsApp (wamid.xxx)' },
    { value: 'is_read', label: 'Mensagem Lida?', group: 'Status', icon: Check, description: 'Se a mensagem foi lida pelo destinatário' },
    { value: 'has_error', label: 'Tem Erro?', group: 'Status', icon: AlertCircle, description: 'Se houve erro no envio/recebimento' },
    { value: 'error_message', label: 'Mensagem de Erro', group: 'Status', icon: AlertCircle, description: 'Descrição do erro, se houver' },
    { value: 'contact_tags', label: 'Tags do Contato', group: 'Contato', icon: Tag, description: 'Tags do contato no Ecko (array JSON)' },
    { value: 'assigned_to', label: 'Atribuído Para', group: 'Agente', icon: User, description: 'ID do agente atribuído à conversa' },
];

const TRANSFORM_TYPES = [
    { value: 'direct', label: 'Direto' },
    { value: 'normalize_phone', label: 'Normalizar Telefone' },
    { value: 'map_direction', label: 'Mapear Direção' },
    { value: 'parse_timestamp', label: 'Parsear Timestamp' },
    { value: 'extract_json', label: 'Extrair JSON' },
];

// Draggable JSON Field Component
function DraggableJsonField({ path, value, type, searchTerm }: { path: string; value: string; type: string; searchTerm?: string }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `json-${path}`,
        data: { path, value, type }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
    };

    // Highlight search match
    const isMatch = searchTerm && (path.toLowerCase().includes(searchTerm.toLowerCase()) || value.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={cn(
                "flex items-center gap-2 px-2 py-1 rounded cursor-grab active:cursor-grabbing",
                "bg-slate-100 hover:bg-indigo-50 border border-transparent hover:border-indigo-300",
                "transition-all duration-150",
                isDragging && "ring-2 ring-indigo-400 shadow-lg",
                isMatch && "bg-yellow-100 border-yellow-400"
            )}
        >
            <GripVertical className="w-3 h-3 text-slate-400" />
            <code className="text-xs font-mono text-indigo-600">{path}</code>
            <span className="text-xs text-slate-400 truncate max-w-[120px]">= {value}</span>
        </div>
    );
}

// Droppable CRM Field Component
function DroppableCrmField({
    field,
    mapping,
    pendingChange,
    onRemove,
    onDeleteCustom,
    isOver
}: {
    field: InternalFieldDefinition;
    mapping?: FieldMapping;
    pendingChange?: PendingChange;
    onRemove: () => void;
    onDeleteCustom?: () => void;
    isOver: boolean;
}) {
    const Icon = field.icon;

    // Determine visual state based on pending changes
    const isAdding = pendingChange?.type === 'add';
    const isRemoving = pendingChange?.type === 'remove';
    const displayPath = isAdding ? pendingChange.externalPath : mapping?.external_path;
    const hasMapping = !!mapping || isAdding;

    return (
        <div
            className={cn(
                "p-4 rounded-xl border transition-all duration-200",
                isOver
                    ? "bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400 scale-[1.02]"
                    : isAdding
                        ? "bg-emerald-50 border-emerald-300 ring-1 ring-emerald-400"
                        : isRemoving
                            ? "bg-red-50 border-red-300 opacity-60 line-through"
                            : hasMapping
                                ? "bg-white border-slate-200 shadow-sm"
                                : "bg-slate-50 border-dashed border-slate-300"
            )}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "p-1.5 rounded-lg",
                        hasMapping && !isRemoving ? "bg-indigo-100" : "bg-slate-200"
                    )}>
                        <Icon className={cn(
                            "w-4 h-4",
                            hasMapping && !isRemoving ? "text-indigo-600" : "text-slate-500"
                        )} />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <p className={cn("font-medium text-sm", isRemoving && "line-through text-slate-400")}>
                                {field.label}
                            </p>
                            {field.description && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-xs">
                                            <p className="text-xs">{field.description}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono">{field.value}</p>
                    </div>
                </div>

                {field.required && !hasMapping && (
                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">
                        Obrigatório
                    </Badge>
                )}

                {isAdding && (
                    <Badge className="text-[10px] bg-emerald-500">+ Novo</Badge>
                )}

                {isRemoving && (
                    <Badge variant="destructive" className="text-[10px]">- Remover</Badge>
                )}

                {field.isCustom && onDeleteCustom && (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCustom();
                        }}
                        title="Excluir campo customizado"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>

            {(hasMapping && !isRemoving) ? (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-slate-100 p-2 rounded text-xs">
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            isAdding ? "bg-emerald-500 animate-pulse" : "bg-emerald-500"
                        )} />
                        <code className="font-mono text-slate-700 flex-1 truncate">
                            {displayPath}
                        </code>
                        {mapping?.transform_type && mapping.transform_type !== 'direct' && (
                            <Badge variant="secondary" className="text-[10px]">
                                {TRANSFORM_TYPES.find(t => t.value === mapping.transform_type)?.label}
                            </Badge>
                        )}
                    </div>
                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={onRemove}
                        >
                            <X className="w-3 h-3 mr-1" />
                            Remover
                        </Button>
                    </div>
                </div>
            ) : isRemoving ? (
                <div className="flex items-center gap-2 bg-red-100 p-2 rounded text-xs">
                    <code className="font-mono text-red-600 flex-1 truncate line-through">
                        {mapping?.external_path}
                    </code>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px] text-slate-600"
                        onClick={onRemove}
                    >
                        Desfazer
                    </Button>
                </div>
            ) : (
                <div className={cn(
                    "flex items-center justify-center py-3 rounded-lg border-2 border-dashed",
                    isOver ? "border-indigo-400 bg-indigo-100" : "border-slate-200"
                )}>
                    <span className="text-xs text-slate-400">
                        {isOver ? "Solte aqui!" : "Arraste um campo JSON aqui"}
                    </span>
                </div>
            )}
        </div>
    );
}

// Wrapper component for droppable CRM field
function CrmFieldDropZone({
    field,
    mapping,
    pendingChange,
    onRemove,
    onDeleteCustom
}: {
    field: InternalFieldDefinition;
    mapping?: FieldMapping;
    pendingChange?: PendingChange;
    onRemove: () => void;
    onDeleteCustom?: () => void;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: `crm-${field.value}`,
        data: { internalField: field.value }
    });

    return (
        <div ref={setNodeRef}>
            <DroppableCrmField
                field={field}
                mapping={mapping}
                pendingChange={pendingChange}
                onRemove={onRemove}
                onDeleteCustom={onDeleteCustom}
                isOver={isOver}
            />
        </div>
    );
}

// Recursive JSON Tree with Draggable nodes and search filtering
function JsonTree({ data, path = '', level = 0, searchTerm = '' }: {
    data: unknown;
    path: string;
    level: number;
    searchTerm?: string;
}) {
    const [expanded, setExpanded] = useState(level < 2);

    if (data === null || data === undefined) {
        return <span className="text-slate-400 text-xs">null</span>;
    }

    if (typeof data === 'object' && !Array.isArray(data)) {
        const entries = Object.entries(data as Record<string, unknown>);

        // Filter entries based on search
        const filteredEntries = searchTerm
            ? entries.filter(([key, value]) => {
                const currentPath = path ? `${path}.${key}` : key;
                const matchesKey = currentPath.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesValue = typeof value !== 'object' && String(value).toLowerCase().includes(searchTerm.toLowerCase());
                const hasMatchingChildren = typeof value === 'object' && value !== null &&
                    JSON.stringify(value).toLowerCase().includes(searchTerm.toLowerCase());
                return matchesKey || matchesValue || hasMatchingChildren;
            })
            : entries;

        if (filteredEntries.length === 0 && searchTerm) return null;

        return (
            <div className="space-y-0.5">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1 text-left hover:bg-slate-100 rounded px-1 -ml-1 w-full"
                >
                    {expanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                    <span className="text-slate-500 text-xs font-mono">{`{${filteredEntries.length}}`}</span>
                </button>
                {expanded && (
                    <div className="ml-3 border-l border-slate-200 pl-2 space-y-1">
                        {filteredEntries.map(([key, value]) => {
                            const currentPath = path ? `${path}.${key}` : key;
                            const isPrimitive = typeof value !== 'object' || value === null;

                            return (
                                <div key={key}>
                                    <div className="flex items-start gap-2">
                                        <span className="text-indigo-600 font-mono text-xs shrink-0">{key}:</span>
                                        {isPrimitive ? (
                                            <DraggableJsonField
                                                path={currentPath}
                                                value={String(value)}
                                                type={typeof value}
                                                searchTerm={searchTerm}
                                            />
                                        ) : (
                                            <JsonTree data={value} path={currentPath} level={level + 1} searchTerm={searchTerm} />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    if (Array.isArray(data)) {
        return (
            <div className="space-y-0.5">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1 text-left hover:bg-slate-100 rounded px-1 -ml-1"
                >
                    {expanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                    <span className="text-slate-500 text-xs font-mono">[{data.length}]</span>
                </button>
                {expanded && data.length > 0 && (
                    <div className="ml-3 border-l border-slate-200 pl-2">
                        <span className="text-xs text-slate-400">(primeiro item)</span>
                        <JsonTree data={data[0]} path={`${path}[0]`} level={level + 1} searchTerm={searchTerm} />
                    </div>
                )}
            </div>
        );
    }

    return <span className="text-emerald-600 font-mono text-xs">{String(data)}</span>;
}

export function WhatsAppFieldMapping({ platformId }: WhatsAppFieldMappingProps) {
    const queryClient = useQueryClient();
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeData, setActiveData] = useState<{ path: string; value: string } | null>(null);
    const [customFieldName, setCustomFieldName] = useState('');
    const [showCustomField, setShowCustomField] = useState(false);

    // Search states
    const [crmSearch, setCrmSearch] = useState('');
    const [jsonSearch, setJsonSearch] = useState('');

    // Pending changes (batch save)
    const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    );

    // Fetch mappings
    const { data: mappings, isLoading } = useQuery({
        queryKey: ['whatsapp-field-mappings', platformId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('whatsapp_field_mappings')
                .select('*')
                .eq('platform_id', platformId)
                .order('internal_field');
            if (error) throw error;
            return data as FieldMapping[];
        }
    });

    // Fetch custom fields from DB
    const { data: customFieldsFromDb } = useQuery({
        queryKey: ['whatsapp-custom-fields', platformId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('whatsapp_custom_fields')
                .select('*')
                .eq('platform_id', platformId)
                .eq('is_active', true)
                .order('field_label');
            if (error) throw error;
            return data as CustomField[];
        }
    });

    // History State
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

    // Fetch recent events (History)
    const { data: recentEvents } = useQuery({
        queryKey: ['whatsapp-recent-events', platformId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('whatsapp_raw_events')
                .select('id, event_type, created_at, raw_payload')
                .eq('platform_id', platformId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            return data;
        }
    });

    // Auto-select latest event on load
    useEffect(() => {
        if (recentEvents && recentEvents.length > 0 && !selectedEventId) {
            setSelectedEventId(recentEvents[0].id);
        }
    }, [recentEvents, selectedEventId]);

    // Get currently selected event payload
    const activeEvent = useMemo(() => {
        if (!recentEvents) return null;
        return recentEvents.find(e => e.id === selectedEventId) || recentEvents[0];
    }, [recentEvents, selectedEventId]);

    // ⚡ Realtime subscription: Auto-refresh when new webhook data arrives
    useEffect(() => {
        const channel = supabase
            .channel(`whatsapp-events-${platformId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'whatsapp_raw_events',
                    filter: `platform_id=eq.${platformId}`
                },
                () => {
                    // When a new event arrives, invalidate the query to refetch
                    queryClient.invalidateQueries({ queryKey: ['whatsapp-recent-events', platformId] });
                    toast.info('🔄 Novo payload recebido!', {
                        description: 'O histórico foi atualizado.'
                    });
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Realtime conectado para whatsapp_raw_events');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ Erro no canal Realtime whatsapp_raw_events');
                    toast.error('Erro na conexão Realtime. Tente recarregar a página.');
                } else if (status === 'TIMED_OUT') {
                    console.error('⚠️ Timeout no canal Realtime whatsapp_raw_events');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [platformId, queryClient]);

    // Get mapping for a field (considering pending changes)
    const getMappingForField = (fieldValue: string) => {
        return mappings?.find(m => m.internal_field === fieldValue);
    };

    // Get pending change for a field
    const getPendingChange = (fieldValue: string) => {
        return pendingChanges.find(c => c.internalField === fieldValue);
    };

    // Check if there are unsaved changes
    const hasUnsavedChanges = pendingChanges.length > 0;

    // Combine static fields with custom fields from DB
    const allFields = useMemo(() => {
        const customFields = (customFieldsFromDb || []).map(cf => ({
            value: cf.field_key,
            label: cf.field_label,
            group: cf.field_group,
            icon: Tag,
            required: false,
            isCustom: true,
            customFieldId: cf.id
        }));
        return [...INTERNAL_FIELDS, ...customFields];
    }, [customFieldsFromDb]);

    // Filter CRM fields based on search
    const filteredFields = useMemo(() => {
        if (!crmSearch) return allFields;
        const term = crmSearch.toLowerCase();
        return allFields.filter(f =>
            f.label.toLowerCase().includes(term) ||
            f.value.toLowerCase().includes(term) ||
            f.group.toLowerCase().includes(term)
        );
    }, [crmSearch, allFields]);

    // Group fields by group
    const groupedFields = useMemo(() => {
        const groups: Record<string, InternalFieldDefinition[]> = {};
        for (const field of filteredFields) {
            if (!groups[field.group]) groups[field.group] = [];
            groups[field.group].push(field);
        }
        return groups;
    }, [filteredFields]);

    // DnD handlers
    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
        setActiveData(event.active.data.current as { path: string; value: string });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveData(null);

        if (!over) return;

        const overId = over.id as string;
        if (!overId.startsWith('crm-')) return;

        const internalField = overId.replace('crm-', '');
        const externalPath = active.data.current?.path;

        if (externalPath && internalField) {
            // Add to pending changes instead of saving immediately
            setPendingChanges(prev => {
                // Remove any existing change for this field
                const filtered = prev.filter(c => c.internalField !== internalField);
                return [...filtered, { type: 'add', internalField, externalPath }];
            });
            toast.info(`Mapeamento adicionado. Clique em "Salvar" para confirmar.`);
        }
    };

    // Handle remove (add to pending changes)
    const handleRemove = (internalField: string, mappingId?: string) => {
        setPendingChanges(prev => {
            // Check if there's a pending add for this field
            const existingAdd = prev.find(c => c.internalField === internalField && c.type === 'add');
            if (existingAdd) {
                // Just remove the pending add
                return prev.filter(c => c.internalField !== internalField);
            }

            // Check if there's a pending remove (undo)
            const existingRemove = prev.find(c => c.internalField === internalField && c.type === 'remove');
            if (existingRemove) {
                // Undo the remove
                return prev.filter(c => c.internalField !== internalField);
            }

            // Add remove change
            return [...prev, { type: 'remove', internalField, mappingId }];
        });
    };

    // Save all pending changes
    const handleSave = async () => {
        if (pendingChanges.length === 0) return;

        setIsSaving(true);
        try {
            // Process removes first
            const removes = pendingChanges.filter(c => c.type === 'remove');
            for (const remove of removes) {
                if (remove.mappingId) {
                    const { error } = await supabase
                        .from('whatsapp_field_mappings')
                        .delete()
                        .eq('id', remove.mappingId);
                    if (error) throw error;
                }
            }

            // Process adds
            const adds = pendingChanges.filter(c => c.type === 'add');
            for (const add of adds) {
                const { error } = await supabase
                    .from('whatsapp_field_mappings')
                    .upsert({
                        platform_id: platformId,
                        external_path: add.externalPath!,
                        internal_field: add.internalField,
                        transform_type: 'direct',
                        is_active: true
                    }, { onConflict: 'platform_id,external_path' });
                if (error) throw error;
            }

            // Clear pending changes and refresh
            setPendingChanges([]);
            queryClient.invalidateQueries({ queryKey: ['whatsapp-field-mappings'] });
            toast.success(`${pendingChanges.length} alterações salvas com sucesso!`);
        } catch (error: any) {
            toast.error(`Erro ao salvar: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Discard all pending changes
    const handleDiscard = () => {
        setPendingChanges([]);
        toast.info('Alterações descartadas');
    };

    // Add custom field (persist to DB)
    const handleAddCustomField = async () => {
        if (!customFieldName.trim()) return;

        const fieldKey = customFieldName.toLowerCase().replace(/\s+/g, '_');

        try {
            const { error } = await supabase
                .from('whatsapp_custom_fields')
                .insert({
                    platform_id: platformId,
                    field_key: fieldKey,
                    field_label: customFieldName.trim(),
                    field_group: 'Customizado',
                    is_active: true
                });

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['whatsapp-custom-fields', platformId] });
            setCustomFieldName('');
            setShowCustomField(false);
            toast.success(`Campo "${customFieldName}" adicionado!`);
        } catch (error: any) {
            toast.error(`Erro ao adicionar campo: ${error.message}`);
        }
    };

    // Delete custom field
    const handleDeleteCustomField = async (customFieldId: string, fieldLabel: string) => {
        try {
            const { error } = await supabase
                .from('whatsapp_custom_fields')
                .delete()
                .eq('id', customFieldId);

            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['whatsapp-custom-fields', platformId] });
            toast.success(`Campo "${fieldLabel}" removido!`);
        } catch (error: any) {
            toast.error(`Erro ao remover campo: ${error.message}`);
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="space-y-6">
                {/* Header with Save Button */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-indigo-500" />
                            Mapeamento de Campos
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Arraste campos do JSON para os campos do CRM
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {hasUnsavedChanges && (
                            <>
                                <Badge variant="outline" className="text-amber-600 border-amber-300 animate-pulse">
                                    {pendingChanges.length} alteração(ões) pendente(s)
                                </Badge>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDiscard}
                                >
                                    Descartar
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                    {isSaving ? (
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-2" />
                                    )}
                                    Salvar
                                </Button>
                            </>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => queryClient.invalidateQueries({ queryKey: ['whatsapp-field-mappings'] })}
                        >
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: CRM Fields (Droppable) */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base">Campos do CRM</CardTitle>
                                    <CardDescription>
                                        {mappings?.length || 0} campos mapeados
                                    </CardDescription>
                                </div>
                            </div>
                            {/* Search CRM Fields */}
                            <div className="relative mt-3">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar campos CRM..."
                                    value={crmSearch}
                                    onChange={(e) => setCrmSearch(e.target.value)}
                                    className="pl-9 h-9"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[550px] px-6 pb-6">
                                {isLoading ? (
                                    <div className="flex items-center justify-center h-32">
                                        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {Object.entries(groupedFields).map(([group, fields]) => (
                                            <div key={group}>
                                                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                                    {group}
                                                </h4>
                                                <div className="space-y-3">
                                                    {fields.map((field) => (
                                                        <CrmFieldDropZone
                                                            key={field.value}
                                                            field={field}
                                                            mapping={getMappingForField(field.value)}
                                                            pendingChange={getPendingChange(field.value)}
                                                            onRemove={() => {
                                                                const mapping = getMappingForField(field.value);
                                                                handleRemove(field.value, mapping?.id);
                                                            }}
                                                            onDeleteCustom={field.isCustom && field.customFieldId ? () => handleDeleteCustomField(field.customFieldId!, field.label) : undefined}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}

                                        {/* Add Custom Field */}
                                        <div className="pt-4 border-t">
                                            {showCustomField ? (
                                                <div className="flex gap-2">
                                                    <Input
                                                        placeholder="Nome do campo..."
                                                        value={customFieldName}
                                                        onChange={(e) => setCustomFieldName(e.target.value)}
                                                        className="flex-1"
                                                    />
                                                    <Button size="sm" onClick={handleAddCustomField}>
                                                        <Check className="w-4 h-4" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => setShowCustomField(false)}>
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    className="w-full border-dashed"
                                                    onClick={() => setShowCustomField(true)}
                                                >
                                                    <Plus className="w-4 h-4 mr-2" />
                                                    Adicionar Campo Customizado
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    {/* Right: JSON Preview (Draggable) */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-col gap-3">
                                <div>
                                    <CardTitle className="text-base">Payload JSON</CardTitle>
                                    <CardDescription>
                                        Arraste os campos para mapear
                                    </CardDescription>
                                </div>

                                {/* History Selector */}
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <select
                                            className="w-full h-9 pl-3 pr-8 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            value={selectedEventId || ''}
                                            onChange={(e) => setSelectedEventId(e.target.value)}
                                            disabled={!recentEvents?.length}
                                        >
                                            {recentEvents?.map((event) => (
                                                <option key={event.id} value={event.id}>
                                                    {event.event_type || 'Desconhecido'} - {event.created_at ? new Date(event.created_at).toLocaleTimeString() : 'N/A'}
                                                </option>
                                            ))}
                                            {!recentEvents?.length && <option>Nenhum evento recente</option>}
                                        </select>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => queryClient.invalidateQueries({ queryKey: ['whatsapp-recent-events', platformId] })}
                                        title="Atualizar lista"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                </div>

                                {/* Search JSON Fields */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar no JSON..."
                                        value={jsonSearch}
                                        onChange={(e) => setJsonSearch(e.target.value)}
                                        className="pl-9 h-9"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[550px] px-6 pb-6">
                                {activeEvent?.raw_payload ? (
                                    <JsonTree data={activeEvent.raw_payload} path="" level={0} searchTerm={jsonSearch} />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                                        <AlertCircle className="w-8 h-8 mb-2" />
                                        <p>Nenhum payload selecionado</p>
                                    </div>
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>

                {/* Drag Overlay */}
                <DragOverlay>
                    {activeId && activeData && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-100 border border-indigo-400 shadow-xl">
                            <GripVertical className="w-4 h-4 text-indigo-600" />
                            <code className="text-sm font-mono text-indigo-700">{activeData.path}</code>
                        </div>
                    )}
                </DragOverlay>
            </div>
        </DndContext>
    );
}
