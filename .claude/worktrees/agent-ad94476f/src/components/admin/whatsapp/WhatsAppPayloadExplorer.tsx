import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    Search,
    ChevronRight,
    ChevronDown,
    Clock,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    Eye,
    Sparkles,
    Target,
    Save,
    X,
    MousePointerClick
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface RawEvent {
    id: string;
    platform_id: string;
    event_type: string | null;
    origem: string | null;
    idempotency_key: string | null;
    raw_payload: Record<string, unknown>;
    status: string;
    processed_at: string | null;
    error_message: string | null;
    created_at: string;
}

interface WhatsAppPayloadExplorerProps {
    platformId: string;
}

// Core fields we want to map
const CORE_FIELDS = [
    { key: 'sender_phone', label: 'Telefone do Remetente', required: true, icon: '📱' },
    { key: 'sender_name', label: 'Nome do Remetente', required: false, icon: '👤' },
    { key: 'body', label: 'Conteúdo da Mensagem', required: true, icon: '💬' },
    { key: 'external_id', label: 'ID da Mensagem (WhatsApp)', required: true, icon: '🆔' },
    { key: 'message_type', label: 'Tipo de Mensagem', required: false, icon: '📎' },
    { key: 'created_at', label: 'Timestamp', required: false, icon: '⏰' },
    { key: 'is_from_me', label: 'Enviada por Mim?', required: false, icon: '📤' }
];

// Heuristics for Auto-Mapping
const AUTO_MAPPING_HEURISTICS: Record<string, string[]> = {
    sender_phone: ['phone', 'number', 'wid', 'from', 'remoteJid', 'sender.phone', 'participant'],
    sender_name: ['name', 'pushName', 'notifyName', 'senderName', 'sender.name', 'profileName'],
    body: ['body', 'text', 'message', 'content', 'caption', 'message.text', 'conversation'],
    external_id: ['id', 'messageId', 'wamid', 'stanzaId'],
    message_type: ['type', 'mimetype'],
    created_at: ['timestamp', 't', 'time', 'messageTimestamp'],
    is_from_me: ['fromMe', 'is_from_me', 'outbound', 'key.fromMe']
};

interface MappingState {
    external_path: string;
    value_preview: string;
    is_auto: boolean;
}

// Recursive JSON Tree component with Selection Mode - LIGHT MODE
function JsonTree({ data, path = '', level = 0, onSelectPath, selectedPath, activeField }: {
    data: unknown;
    path: string;
    level: number;
    onSelectPath?: (path: string, value: string) => void;
    selectedPath?: string | null;
    activeField?: string | null;
}) {
    const [expanded, setExpanded] = useState(level < 3);

    if (data === null) return <span className="text-slate-400">null</span>;
    if (data === undefined) return <span className="text-slate-400">undefined</span>;

    if (typeof data === 'object' && !Array.isArray(data)) {
        const entries = Object.entries(data as Record<string, unknown>);
        return (
            <div className="space-y-0.5">
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className="flex items-center gap-1 text-left hover:bg-slate-100 rounded px-1 -ml-1 w-full"
                >
                    {expanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                    <span className="text-slate-500 text-xs font-mono">{`{${entries.length}}`}</span>
                </button>
                {expanded && (
                    <div className="ml-3 border-l border-slate-200 pl-2 space-y-0.5">
                        {entries.map(([key, value]) => {
                            const currentPath = path ? `${path}.${key}` : key;
                            const isPrimitive = typeof value !== 'object' || value === null;
                            const isSelected = selectedPath === currentPath;

                            return (
                                <div key={key} className="group relative">
                                    <div
                                        className={cn(
                                            "flex items-start gap-2 rounded px-1.5 py-0.5 transition-colors",
                                            isSelected ? "bg-indigo-100 ring-1 ring-indigo-400" : "hover:bg-slate-50",
                                            activeField && isPrimitive ? "cursor-pointer hover:bg-indigo-50" : ""
                                        )}
                                        onClick={(e) => {
                                            if (isPrimitive && onSelectPath && activeField) {
                                                e.stopPropagation();
                                                onSelectPath(currentPath, String(value));
                                            }
                                        }}
                                    >
                                        <span className="text-indigo-600 font-mono text-xs shrink-0 select-none">
                                            {key}:
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <JsonTree
                                                data={value}
                                                path={currentPath}
                                                level={level + 1}
                                                onSelectPath={onSelectPath}
                                                selectedPath={selectedPath}
                                                activeField={activeField}
                                            />
                                        </div>

                                        {/* Selection Indicator */}
                                        {activeField && isPrimitive && (
                                            <div className="opacity-0 group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2">
                                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200">
                                                    <MousePointerClick className="w-3 h-3 mr-1" />
                                                    Selecionar
                                                </Badge>
                                            </div>
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
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className="flex items-center gap-1 text-left hover:bg-slate-100 rounded px-1 -ml-1 w-full"
                >
                    {expanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                    <span className="text-slate-500 text-xs font-mono">{`[${data.length}]`}</span>
                </button>
                {expanded && (
                    <div className="ml-3 border-l border-slate-200 pl-2 space-y-0.5">
                        {data.map((item, index) => (
                            <div key={index} className="flex items-start gap-2">
                                <span className="text-slate-400 font-mono text-xs shrink-0 select-none">{index}:</span>
                                <JsonTree
                                    data={item}
                                    path={`${path}[${index}]`}
                                    level={level + 1}
                                    onSelectPath={onSelectPath}
                                    selectedPath={selectedPath}
                                    activeField={activeField}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Primitive values - LIGHT MODE COLORS
    if (typeof data === 'string') {
        return <span className="text-emerald-600 font-mono text-xs break-all">"{data}"</span>;
    }
    if (typeof data === 'number') {
        return <span className="text-amber-600 font-mono text-xs">{data}</span>;
    }
    if (typeof data === 'boolean') {
        return <span className="text-purple-600 font-mono text-xs">{data.toString()}</span>;
    }

    return <span className="text-slate-500 font-mono text-xs">{String(data)}</span>;
}

const STATUS_CONFIG = {
    pending: { icon: Clock, label: 'Pendente', color: 'text-yellow-600', bg: 'bg-yellow-500/10 border-yellow-200' },
    processing: { icon: RefreshCw, label: 'Processando', color: 'text-blue-600', bg: 'bg-blue-500/10 border-blue-200' },
    processed: { icon: CheckCircle2, label: 'Processado', color: 'text-green-600', bg: 'bg-green-500/10 border-green-200' },
    failed: { icon: AlertCircle, label: 'Falhou', color: 'text-red-600', bg: 'bg-red-500/10 border-red-200' },
    ignored: { icon: AlertCircle, label: 'Ignorado', color: 'text-gray-600', bg: 'bg-gray-500/10 border-gray-200' },
};

export function WhatsAppPayloadExplorer({ platformId }: WhatsAppPayloadExplorerProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<RawEvent | null>(null);

    // Mapping Studio State
    const [mappings, setMappings] = useState<Record<string, MappingState>>({});
    const [activeField, setActiveField] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const queryClient = useQueryClient();

    // Fetch events
    const { data: events, isLoading, refetch } = useQuery({
        queryKey: ['whatsapp-raw-events', platformId, statusFilter],
        queryFn: async () => {
            let query = supabase
                .from('whatsapp_raw_events')
                .select('*')
                .eq('platform_id', platformId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (statusFilter) {
                query = query.eq('status', statusFilter);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as RawEvent[];
        }
    });

    // Auto-Mapping Logic
    const detectMappings = (data: any, path = ''): Record<string, MappingState> => {
        let suggestions: Record<string, MappingState> = {};

        if (typeof data === 'object' && data !== null) {
            for (const [key, value] of Object.entries(data)) {
                const currentPath = path ? `${path}.${key}` : key;
                const lowerKey = key.toLowerCase();

                // Check heuristics
                for (const [internalField, keywords] of Object.entries(AUTO_MAPPING_HEURISTICS)) {
                    if (keywords.some(k => lowerKey === k.toLowerCase() || lowerKey.includes(k.toLowerCase()))) {
                        // Only set if not already found (first match wins for now)
                        if (!suggestions[internalField]) {
                            suggestions[internalField] = {
                                external_path: currentPath,
                                value_preview: String(value).slice(0, 50),
                                is_auto: true
                            };
                        }
                    }
                }

                // Recurse
                if (typeof value === 'object') {
                    const childSuggestions = detectMappings(value, currentPath);
                    suggestions = { ...suggestions, ...childSuggestions };
                }
            }
        }
        return suggestions;
    };

    // Run auto-detection when event is selected
    useEffect(() => {
        if (selectedEvent?.raw_payload) {
            const detected = detectMappings(selectedEvent.raw_payload);
            setMappings(detected);
        } else {
            setMappings({});
        }
        setActiveField(null);
    }, [selectedEvent]);

    const handleSaveMappings = async () => {
        setIsSaving(true);
        try {
            const toInsert = Object.entries(mappings).map(([internalField, state]) => ({
                platform_id: platformId,
                external_path: state.external_path,
                internal_field: internalField,
                transform_type: 'direct',
                is_active: true
            }));

            if (toInsert.length === 0) {
                toast.info('Nenhum mapeamento para salvar');
                return;
            }

            const { error } = await supabase
                .from('whatsapp_field_mappings')
                .upsert(toInsert, { onConflict: 'platform_id,external_path' });

            if (error) throw error;

            toast.success('Mapeamentos salvos com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['whatsapp-field-mappings'] });
            setSelectedEvent(null); // Close sheet
        } catch (error: any) {
            toast.error(`Erro ao salvar: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Filtered events
    const filteredEvents = useMemo(() => {
        if (!events) return [];
        if (!searchTerm) return events;

        const term = searchTerm.toLowerCase();
        return events.filter(event =>
            event.event_type?.toLowerCase().includes(term) ||
            event.origem?.toLowerCase().includes(term) ||
            event.idempotency_key?.toLowerCase().includes(term) ||
            JSON.stringify(event.raw_payload).toLowerCase().includes(term)
        );
    }, [events, searchTerm]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar eventos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <div className="flex gap-1">
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                        <Button
                            key={status}
                            variant={statusFilter === status ? "default" : "outline"}
                            size="sm"
                            onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                            className="text-xs"
                        >
                            <config.icon className="w-3 h-3 mr-1" />
                            {config.label}
                        </Button>
                    ))}
                </div>

                <Button variant="outline" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>

            {/* Events List */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Eventos Recebidos</CardTitle>
                    <CardDescription>
                        {filteredEvents.length} eventos {statusFilter ? `(${statusFilter})` : ''}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-48">
                            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : filteredEvents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 mb-2" />
                            <p>Nenhum evento encontrado</p>
                        </div>
                    ) : (
                        <ScrollArea className="h-[500px]">
                            <div className="divide-y">
                                {filteredEvents.map((event) => {
                                    const statusConfig = STATUS_CONFIG[event.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
                                    const StatusIcon = statusConfig.icon;

                                    return (
                                        <div
                                            key={event.id}
                                            className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                                            onClick={() => setSelectedEvent(event)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{event.event_type || 'Unknown Event'}</span>
                                                        {event.origem && (
                                                            <Badge variant="outline" className="text-xs">
                                                                {event.origem}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate">
                                                        {event.idempotency_key || event.id}
                                                    </p>
                                                </div>

                                                <div className="text-right text-xs text-muted-foreground">
                                                    {formatDistanceToNow(new Date(event.created_at), {
                                                        addSuffix: true,
                                                        locale: ptBR
                                                    })}
                                                </div>

                                                <Button variant="ghost" size="icon">
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </div>

                                            {event.error_message && (
                                                <p className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                                                    {event.error_message}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>

            {/* Mapping Studio Sheet */}
            <Sheet open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
                <SheetContent className="w-full sm:max-w-4xl overflow-hidden flex flex-col p-0 gap-0">
                    {/* Header */}
                    <div className="p-6 border-b bg-slate-50">
                        <SheetTitle className="flex items-center gap-2 text-xl">
                            <Sparkles className="w-5 h-5 text-indigo-500" />
                            Mapping Studio
                        </SheetTitle>
                        <SheetDescription>
                            Selecione os campos no JSON à esquerda para mapeá-los para o CRM à direita.
                        </SheetDescription>
                    </div>

                    {selectedEvent && (
                        <div className="flex-1 flex overflow-hidden">
                            {/* Left Column: JSON Explorer - LIGHT MODE */}
                            <div className="w-1/2 border-r bg-slate-50 flex flex-col">
                                <div className="p-3 border-b bg-slate-100 flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">Payload JSON</span>
                                    <Badge variant="outline" className="text-[10px] font-mono bg-white">
                                        {selectedEvent.event_type}
                                    </Badge>
                                </div>
                                <ScrollArea className="flex-1 p-4">
                                    <JsonTree
                                        data={selectedEvent.raw_payload}
                                        path=""
                                        level={0}
                                        onSelectPath={(path, value) => {
                                            if (activeField) {
                                                setMappings(prev => ({
                                                    ...prev,
                                                    [activeField]: {
                                                        external_path: path,
                                                        value_preview: value,
                                                        is_auto: false
                                                    }
                                                }));
                                                setActiveField(null); // Exit selection mode
                                                toast.success('Campo mapeado!');
                                            } else {
                                                toast.info('Selecione um campo à direita primeiro para mapear.');
                                            }
                                        }}
                                        selectedPath={activeField ? mappings[activeField]?.external_path : null}
                                        activeField={activeField}
                                    />
                                </ScrollArea>
                            </div>

                            {/* Right Column: Mapping Form - LIGHT MODE */}
                            <div className="w-1/2 flex flex-col bg-white">
                                <div className="p-3 border-b bg-slate-50 flex items-center justify-between">
                                    <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">Campos do CRM</span>
                                    {activeField && (
                                        <Badge className="bg-indigo-500 animate-pulse">
                                            Selecionando...
                                        </Badge>
                                    )}
                                </div>
                                <ScrollArea className="flex-1 p-6">
                                    <div className="space-y-6">
                                        {CORE_FIELDS.map((field) => {
                                            const mapping = mappings[field.key];
                                            const isMapped = !!mapping;
                                            const isActive = activeField === field.key;

                                            return (
                                                <div
                                                    key={field.key}
                                                    className={cn(
                                                        "p-4 rounded-xl border transition-all duration-200",
                                                        isActive
                                                            ? "bg-indigo-50 border-indigo-400 ring-1 ring-indigo-400 shadow-lg"
                                                            : isMapped
                                                                ? "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
                                                                : "bg-slate-50 border-dashed border-slate-300 opacity-70 hover:opacity-100"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg">{field.icon}</span>
                                                            <div>
                                                                <p className="font-medium text-sm text-slate-900">{field.label}</p>
                                                                <p className="text-[10px] text-slate-500 font-mono">{field.key}</p>
                                                            </div>
                                                        </div>

                                                        {mapping?.is_auto && (
                                                            <Badge variant="secondary" className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200">
                                                                Auto
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {isMapped ? (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2 bg-slate-100 p-2 rounded text-xs font-mono text-slate-600 break-all">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                                {mapping.external_path}
                                                            </div>
                                                            <div className="flex items-center justify-between gap-2">
                                                                <p className="text-xs text-slate-500 truncate pl-1">
                                                                    Valor: <span className="text-slate-700">{mapping.value_preview}</span>
                                                                </p>
                                                                <div className="flex gap-1">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-6 w-6 p-0 hover:text-red-500"
                                                                        onClick={() => {
                                                                            const newMappings = { ...mappings };
                                                                            delete newMappings[field.key];
                                                                            setMappings(newMappings);
                                                                        }}
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="secondary"
                                                                        className="h-6 text-[10px]"
                                                                        onClick={() => setActiveField(field.key)}
                                                                    >
                                                                        Alterar
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            variant="outline"
                                                            className="w-full border-dashed text-slate-500 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50"
                                                            onClick={() => setActiveField(field.key)}
                                                        >
                                                            <Target className="w-4 h-4 mr-2" />
                                                            Selecionar no JSON
                                                        </Button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                                <div className="p-4 border-t bg-slate-50">
                                    <Button
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
                                        size="lg"
                                        onClick={handleSaveMappings}
                                        disabled={isSaving || Object.keys(mappings).length === 0}
                                    >
                                        {isSaving ? (
                                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4 mr-2" />
                                        )}
                                        Salvar Mapeamentos
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
