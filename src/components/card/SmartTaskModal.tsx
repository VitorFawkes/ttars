import { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
    CheckCircle2,
    Phone,
    Users,
    RefreshCw,
    FileCheck,
    MessageSquare,
    Mail,
    ArrowLeft,
    ChevronDown,
    Check,
    FileText,
    Sparkles,
    ChevronsUpDown,
    Star,
    UserPlus,
    AlertTriangle,
    Video
} from 'lucide-react';
import { findConflicts, type MeetingTimeSlot } from '@/utils/meetingConflicts';
import { sendMeetingInvite } from '@/hooks/calendar/useMeetingMutation';
import { MultiSelectEmail } from '@/components/ui/MultiSelectEmail';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { processAIExtraction } from '@/hooks/useAIExtraction';

// Helper para formatar nomes de campos extraídos pela IA
const formatCampoLabel = (campo: string): string => {
    const labels: Record<string, string> = {
        destinos: 'Destinos',
        epoca_viagem: 'Época da viagem',
        motivo: 'Motivo',
        duracao_viagem: 'Duração',
        orcamento: 'Orçamento',
        quantidade_viajantes: 'Viajantes',
        servico_contratado: 'Serviço contratado',
        qual_servio_contratado: 'Qual serviço',
        momento_viagem: 'Momento especial',
        prioridade_viagem: 'Prioridades',
        o_que_e_importante: 'O que é importante',
        algo_especial_viagem: 'Algo especial',
        receio_ou_medo: 'Receios/medos',
        frequencia_viagem: 'Frequência de viagem',
        usa_agencia: 'Usa agência'
    };
    return labels[campo] || campo;
};

interface SmartTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    cardId?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialData?: any; // For edit mode
    mode?: 'create' | 'edit' | 'reschedule';
    defaultType?: TaskType;
    defaultDate?: string;
    defaultTime?: string;
    defaultDuration?: number;
    onSuccess?: () => void;
    /** Pre-fetched meetings for conflict detection (from CalendarPage) */
    existingMeetings?: MeetingTimeSlot[];
}

type TaskType = 'tarefa' | 'contato' | 'ligacao' | 'whatsapp' | 'email' | 'reuniao' | 'solicitacao_mudanca' | 'enviar_proposta' | 'coleta_documentos';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TASK_TYPES: { id: TaskType; label: string; icon: any; color: string; activeColor: string }[] = [
    { id: 'tarefa', label: 'Tarefa', icon: CheckCircle2, color: 'text-indigo-600 bg-indigo-50 border-indigo-200', activeColor: 'ring-2 ring-indigo-500 bg-indigo-100' },
    { id: 'contato', label: 'Contato', icon: Phone, color: 'text-blue-600 bg-blue-50 border-blue-200', activeColor: 'ring-2 ring-blue-500 bg-blue-100' },
    { id: 'ligacao', label: 'Ligação', icon: Phone, color: 'text-cyan-600 bg-cyan-50 border-cyan-200', activeColor: 'ring-2 ring-cyan-500 bg-cyan-100' },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-600 bg-green-50 border-green-200', activeColor: 'ring-2 ring-green-500 bg-green-100' },
    { id: 'email', label: 'E-mail', icon: Mail, color: 'text-blue-600 bg-blue-50 border-blue-200', activeColor: 'ring-2 ring-blue-500 bg-blue-100' },
    { id: 'reuniao', label: 'Reunião', icon: Users, color: 'text-purple-600 bg-purple-50 border-purple-200', activeColor: 'ring-2 ring-purple-500 bg-purple-100' },
    { id: 'solicitacao_mudanca', label: 'Mudança', icon: RefreshCw, color: 'text-orange-600 bg-orange-50 border-orange-200', activeColor: 'ring-2 ring-orange-500 bg-orange-100' },
    { id: 'enviar_proposta', label: 'Proposta', icon: FileCheck, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', activeColor: 'ring-2 ring-emerald-500 bg-emerald-100' },
    { id: 'coleta_documentos', label: 'Coleta Docs', icon: FileText, color: 'text-teal-600 bg-teal-50 border-teal-200', activeColor: 'ring-2 ring-teal-500 bg-teal-100' },
];

const TEMPLATES: Record<TaskType, string> = {
    tarefa: "Ex: Enviar briefing por e-mail...",
    contato: "Ex: Realizar contato inicial...",
    ligacao: "Ex: Ligar para confirmar detalhes...",
    whatsapp: "Ex: WhatsApp para follow-up...",
    email: "Ex: E-mail com proposta...",
    reuniao: "Ex: Reunião de alinhamento...",
    solicitacao_mudanca: "Ex: Mudança de destino / hotel...",
    enviar_proposta: "Ex: Enviar proposta...",
    coleta_documentos: "Ex: Coletar passaportes e documentos..."
};

export function SmartTaskModal({ isOpen, onClose, cardId, initialData, mode = 'create', defaultType, defaultDate, defaultTime, defaultDuration, onSuccess, existingMeetings }: SmartTaskModalProps) {
    const { user } = useAuth();
    // Step 1: Type Selection, Step 2: Form
    const [step, setStep] = useState<1 | 2>(1);

    // Common Fields
    const [type, setType] = useState<TaskType>('tarefa');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [responsibleId, setResponsibleId] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');

    // Card selector (when cardId is not provided)
    const [selectedCardId, setSelectedCardId] = useState('');
    const [cardSearch, setCardSearch] = useState('');
    const [cardDropdownOpen, setCardDropdownOpen] = useState(false);
    const cardDropdownRef = useRef<HTMLDivElement>(null);

    // Duration for meetings
    const [durationMinutes, setDurationMinutes] = useState(30);
    const [meetingLink, setMeetingLink] = useState('');

    // Meeting Specifics
    const [meetingStatus, setMeetingStatus] = useState('agendada');
    const [meetingResult, setMeetingResult] = useState('');
    const [meetingFeedback, setMeetingFeedback] = useState('');
    const [cancellationReason, setCancellationReason] = useState('');

    // Rescheduling
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleTime, setRescheduleTime] = useState('');

    // Change Request Specifics
    const [otherCategory, setOtherCategory] = useState('');

    // Meeting Specifics (New)
    const [externalParticipants, setExternalParticipants] = useState<string[]>([]);

    // Transcription for meetings
    const [transcricao, setTranscricao] = useState('');
    const [isProcessingAI, setIsProcessingAI] = useState(false);
    const [aiProcessResult, setAiProcessResult] = useState<{ status: string; campos_extraidos?: string[] } | null>(null);
    const [processWithAI, setProcessWithAI] = useState(true); // Toggle para processar com IA

    // Refs for native pickers
    const dateInputRef = useRef<HTMLInputElement>(null);
    const rescheduleDateInputRef = useRef<HTMLInputElement>(null);

    // Time Combobox State
    const [showRescheduleTimeList, setShowRescheduleTimeList] = useState(false);
    const rescheduleTimeListRef = useRef<HTMLDivElement>(null);

    // Metadata Fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [metadata, setMetadata] = useState<any>({});

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitPhase, setSubmitPhase] = useState<'idle' | 'saving' | 'processing_ai' | 'done'>('idle');
    const queryClient = useQueryClient();

    // Effective card ID: prop or user-selected
    const effectiveCardId = cardId || selectedCardId;

    // Search cards for card selector (when cardId not provided)
    const { data: searchedCards } = useQuery({
        queryKey: ['card-search', cardSearch],
        queryFn: async () => {
            let query = supabase
                .from('cards')
                .select('id, titulo')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(20);

            if (cardSearch.trim()) {
                query = query.ilike('titulo', `%${cardSearch.trim()}%`);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },
        enabled: !cardId && isOpen,
        staleTime: 1000 * 30,
    });

    // Close card dropdown on outside click
    useEffect(() => {
        if (!cardDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (cardDropdownRef.current && !cardDropdownRef.current.contains(e.target as Node)) {
                setCardDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [cardDropdownOpen]);

    // Selected card name for display
    const selectedCardName = useMemo(() => {
        if (!selectedCardId || !searchedCards) return null;
        const card = searchedCards.find(c => c.id === selectedCardId);
        return card?.titulo || null;
    }, [selectedCardId, searchedCards]);

    // Fetch profiles for responsible selection
    const { data: profiles } = useQuery({
        queryKey: ['active-profiles-list'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, nome, email')
                .eq('active', true)
                .order('nome');
            if (error) throw error;
            return data;
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    });

    // Fetch Change Categories
    const { data: changeCategories } = useQuery({
        queryKey: ['activity-categories', 'change_request'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('activity_categories')
                .select('key, label')
                .eq('scope', 'change_request')
                .eq('visible', true)
                .order('label');

            if (error) {
                // Fallback if table doesn't exist yet or error
                console.warn("Could not fetch categories, using defaults", error);
                return [
                    { key: 'voo', label: 'Voo' },
                    { key: 'hotel', label: 'Hotel' },
                    { key: 'datas', label: 'Datas' },
                    { key: 'financeiro', label: 'Financeiro' },
                    { key: 'outro', label: 'Outro' }
                ];
            }
            return data;
        },
        staleTime: 1000 * 60 * 60 // 1 hour
    });

    // Generate time options (every 15 minutes)
    const timeOptions = Array.from({ length: 96 }).map((_, i) => {
        const totalMinutes = i * 15;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const label = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        return { value: label, label };
    });

    // Helper to format local date/time strings
    const formatLocalDate = (dateObj: Date) => {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const formatLocalTime = (dateObj: Date) => {
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const mm = String(dateObj.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    // Fetch card owners + team members for grouped responsible options
    const { data: cardOwners } = useQuery({
        queryKey: ['card-owners', effectiveCardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('sdr_owner_id, vendas_owner_id, pos_owner_id, dono_atual_id')
                .eq('id', effectiveCardId!)
                .single();
            if (error) return null;
            return data;
        },
        staleTime: 1000 * 60,
        enabled: !!effectiveCardId,
    });

    // Fetch main contact email for meeting quick-add
    const { data: mainContact } = useQuery({
        queryKey: ['card-main-contact-email', effectiveCardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('contato:contatos!cards_pessoa_principal_id_fkey(id, nome, sobrenome, email)')
                .eq('id', effectiveCardId!)
                .single();
            if (error) throw error;
            return data?.contato as { id: string; nome: string; sobrenome: string | null; email: string | null } | null;
        },
        staleTime: 1000 * 60 * 5,
        enabled: !!effectiveCardId,
    });

    // Fetch card stage/phase context for smart meeting titles
    const { data: cardStageContext } = useQuery({
        queryKey: ['card-stage-context', effectiveCardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('cards')
                .select('titulo, pipeline_stages(nome, pipeline_phases!pipeline_stages_phase_id_fkey(slug))')
                .eq('id', effectiveCardId!)
                .single();
            if (error) return null;
            return data as {
                titulo: string | null;
                pipeline_stages: { nome: string; pipeline_phases: { slug: string } | null } | null;
            } | null;
        },
        staleTime: 1000 * 60 * 5,
        enabled: !!effectiveCardId && isOpen,
    });

    const { data: teamMemberIds } = useQuery({
        queryKey: ['card-team-ids', effectiveCardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('card_team_members')
                .select('profile_id')
                .eq('card_id', effectiveCardId!);
            if (error) return [];
            return data?.map(d => d.profile_id) || [];
        },
        staleTime: 1000 * 60,
        enabled: !!effectiveCardId,
    });

    // Build grouped responsible options: card team first, then others — alphabetically sorted
    const { teamProfiles, otherProfiles } = useMemo(() => {
        if (!profiles) return { teamProfiles: [], otherProfiles: [] };

        const cardTeamIds = new Set([
            cardOwners?.sdr_owner_id,
            cardOwners?.vendas_owner_id,
            cardOwners?.pos_owner_id,
            cardOwners?.dono_atual_id,
            ...(teamMemberIds || []),
        ].filter(Boolean) as string[]);

        const sortByName = (a: typeof profiles[0], b: typeof profiles[0]) =>
            (a.nome || a.email || '').localeCompare(b.nome || b.email || '', 'pt-BR');

        const team = profiles.filter(p => cardTeamIds.has(p.id)).sort(sortByName);
        const others = profiles.filter(p => !cardTeamIds.has(p.id)).sort(sortByName);

        return { teamProfiles: team, otherProfiles: others };
    }, [profiles, cardOwners, teamMemberIds]);

    // State for responsible searchable dropdown
    const [responsibleOpen, setResponsibleOpen] = useState(false);
    const [responsibleSearch, setResponsibleSearch] = useState('');
    const responsibleDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!responsibleOpen) return;
        const handler = (e: MouseEvent) => {
            if (responsibleDropdownRef.current && !responsibleDropdownRef.current.contains(e.target as Node)) {
                setResponsibleOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [responsibleOpen]);

    // Get selected user name for display
    const selectedResponsibleName = useMemo(() => {
        if (!responsibleId || !profiles) return null;
        const p = profiles.find(pr => pr.id === responsibleId);
        return p ? (p.nome || p.email || 'Sem nome') : null;
    }, [responsibleId, profiles]);

    // Filter profiles by search term
    const filteredTeamProfiles = useMemo(() => {
        if (!responsibleSearch) return teamProfiles;
        const q = responsibleSearch.toLowerCase();
        return teamProfiles.filter(p => (p.nome || p.email || '').toLowerCase().includes(q));
    }, [teamProfiles, responsibleSearch]);

    const filteredOtherProfiles = useMemo(() => {
        if (!responsibleSearch) return otherProfiles;
        const q = responsibleSearch.toLowerCase();
        return otherProfiles.filter(p => (p.nome || p.email || '').toLowerCase().includes(q));
    }, [otherProfiles, responsibleSearch]);

    // Conflict detection for meetings
    const meetingConflicts = useMemo(() => {
        if (type !== 'reuniao' || !date || !time || !responsibleId) return [];
        const proposedStart = new Date(`${date}T${time}:00`);
        if (isNaN(proposedStart.getTime())) return [];
        if (!existingMeetings || existingMeetings.length === 0) return [];
        return findConflicts(
            proposedStart,
            durationMinutes,
            responsibleId,
            existingMeetings,
            initialData?.id, // exclude self in edit mode
        );
    }, [type, date, time, durationMinutes, responsibleId, existingMeetings, initialData?.id]);

    // Reset or populate form
    useEffect(() => {
        if (isOpen) {
            if (initialData || mode === 'reschedule') {
                // Edit or Reschedule mode
                setStep(2);
                setTitle(initialData?.titulo || '');
                setDescription(initialData?.descricao || '');
                setType((initialData?.tipo as TaskType) || 'tarefa');
                setResponsibleId(initialData?.responsavel_id || '');
                setMetadata(initialData?.metadata || {});

                // Meeting fields
                setMeetingStatus(initialData?.status || 'agendada');
                setMeetingResult(initialData?.resultado || '');
                setMeetingFeedback(initialData?.feedback || '');
                setCancellationReason(initialData?.motivo_cancelamento || '');
                setOtherCategory(initialData?.categoria_outro || '');
                setExternalParticipants(initialData?.participantes_externos || []);
                const savedMeta = initialData?.metadata as Record<string, unknown> | undefined;
                const savedDuration = savedMeta?.duration_minutes;
                setDurationMinutes(typeof savedDuration === 'number' ? savedDuration : 30);
                const savedLink = savedMeta?.meeting_link;
                setMeetingLink(typeof savedLink === 'string' ? savedLink : '');
                setTranscricao(initialData?.transcricao || '');
                setAiProcessResult(null);
                setIsProcessingAI(false);
                setProcessWithAI(true); // Default: processar com IA
                setSubmitPhase('idle');

                if (initialData?.data_vencimento && mode !== 'reschedule') {
                    const dt = new Date(initialData.data_vencimento);
                    setDate(formatLocalDate(dt));
                    const minutes = dt.getMinutes();
                    const roundedMinutes = Math.round(minutes / 15) * 15;
                    dt.setMinutes(roundedMinutes);
                    setTime(formatLocalTime(dt));
                } else {
                    // In reschedule mode (or create with initialData?), default to today/now for the user to pick new date
                    // Or maybe pre-fill old date to let them shift it?
                    // Usually reschedule means "Pick a new date". Let's default to today to be easier,
                    // or keep old date if they just want to change time?
                    // Let's default to Today+Now for Reschedule to encourage moving it forward.
                    const now = new Date();
                    const minutes = now.getMinutes();
                    const roundedMinutes = Math.ceil(minutes / 15) * 15;
                    now.setMinutes(roundedMinutes);

                    setDate(formatLocalDate(now));
                    setTime(formatLocalTime(now));
                }
            } else {
                // Create mode - Reset everything
                setDescription('');
                setMetadata({});
                setResponsibleId(user?.id || '');
                setMeetingStatus('agendada');
                setMeetingResult('');
                setMeetingFeedback('');
                setCancellationReason('');
                setOtherCategory('');
                setExternalParticipants([]);
                setRescheduleDate('');
                setRescheduleTime('');
                setTranscricao('');
                setAiProcessResult(null);
                setIsProcessingAI(false);
                setProcessWithAI(true); // Default: processar com IA
                setSubmitPhase('idle');
                setSelectedCardId('');
                setCardSearch('');

                // Handle defaultType: skip step 1 if provided
                if (defaultType) {
                    setType(defaultType);
                    setStep(2);
                    if (defaultType === 'reuniao' && cardStageContext) {
                        setTitle(generateSmartMeetingTitle());
                    } else {
                        const typeLabel = TASK_TYPES.find(t => t.id === defaultType)?.label || '';
                        setTitle(typeLabel);
                    }
                } else {
                    setStep(1);
                    setType('tarefa');
                    setTitle('Tarefa');
                }

                // Handle defaultDuration
                setDurationMinutes(defaultDuration || 30);

                // Handle defaultDate/defaultTime or fallback to now
                if (defaultDate) {
                    setDate(defaultDate);
                    if (defaultTime) {
                        setTime(defaultTime);
                    } else {
                        const now = new Date();
                        const minutes = now.getMinutes();
                        const roundedMinutes = Math.ceil(minutes / 15) * 15;
                        now.setMinutes(roundedMinutes);
                        setTime(formatLocalTime(now));
                    }
                } else {
                    const now = new Date();
                    const minutes = now.getMinutes();
                    const roundedMinutes = Math.ceil(minutes / 15) * 15;
                    now.setMinutes(roundedMinutes);
                    setDate(formatLocalDate(now));
                    setTime(formatLocalTime(now));
                }
            }
        }
    }, [isOpen, initialData, mode, user?.id, defaultType, defaultDate, defaultTime, defaultDuration]); // eslint-disable-line react-hooks/exhaustive-deps

    // Update meeting title when card context loads (only for new meetings with default title)
    useEffect(() => {
        if (!isOpen || initialData || mode === 'reschedule') return;
        if (type !== 'reuniao' || !cardStageContext) return;
        // Only override if title is still a generic default (user hasn't customized it)
        const genericTitles = ['Reunião', ''];
        if (genericTitles.includes(title)) {
            setTitle(generateSmartMeetingTitle());
        }
    }, [cardStageContext, mainContact]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close time list when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (rescheduleTimeListRef.current && !rescheduleTimeListRef.current.contains(event.target as Node)) {
                setShowRescheduleTimeList(false);
            }
        };

        if (showRescheduleTimeList) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showRescheduleTimeList]);

    // Generate contextual meeting title based on card stage/phase
    const generateSmartMeetingTitle = () => {
        const phaseSlug = cardStageContext?.pipeline_stages?.pipeline_phases?.slug;
        const contactName = mainContact?.nome;
        const firstName = contactName?.split(' ')[0];

        let context: string;
        switch (phaseSlug) {
            case 'sdr':
                context = 'Consultoria de Viagem';
                break;
            case 'planner':
                context = 'Planejamento de Viagem';
                break;
            case 'pos_venda':
                context = 'Acompanhamento de Viagem';
                break;
            default:
                context = 'Reunião';
                break;
        }

        const parts = ['Welcome Trips', context];
        if (firstName) parts.push(firstName);
        return parts.join(' — ');
    };

    const handleTypeSelect = (selectedType: TaskType) => {
        // Reset metadata when switching types to avoid stale state
        setMetadata({});
        setOtherCategory('');

        // Update type
        setType(selectedType);
        setStep(2);

        // Smart title: context-aware for meetings, simple label for others
        if (!initialData) {
            if (selectedType === 'reuniao' && cardStageContext) {
                setTitle(generateSmartMeetingTitle());
            } else {
                const typeLabel = TASK_TYPES.find(t => t.id === selectedType)?.label || '';
                setTitle(typeLabel);
            }
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateMetadata = (key: string, value: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setMetadata((prev: any) => ({ ...prev, [key]: value }));

        // Clear other category if category changes
        if (key === 'change_category' && value !== 'outro') {
            setOtherCategory('');
        }
    };

    const handleWrapperClick = (ref: React.RefObject<HTMLInputElement | null>) => {
        if (ref.current) {
            ref.current.focus();
        }
    };



    const handleRescheduleTimeSelect = (timeValue: string) => {
        setRescheduleTime(timeValue);
        setShowRescheduleTimeList(false);
    };

    // Process transcription with AI
    const processTranscriptionWithAI = async (taskId: string | null, transcriptionText: string, showFeedback: boolean = true) => {
        if (!transcriptionText || transcriptionText.trim().length < 50) {
            if (showFeedback) {
                toast.error('Transcrição precisa ter pelo menos 50 caracteres');
            }
            return null;
        }

        setIsProcessingAI(true);
        setAiProcessResult(null);

        try {
            if (!user?.id) throw new Error('Usuário não autenticado');

            const result = await processAIExtraction(effectiveCardId!, 'meeting_transcript', user.id, {
                transcription: transcriptionText,
                meetingId: taskId || undefined
            });

            const campos = result.campos_extraidos || [];
            const normalizedResult = { ...result, campos_extraidos: campos };
            setAiProcessResult(normalizedResult);

            if (result.status === 'success' && campos.length > 0) {
                toast.success(
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">✨</span>
                            <p className="font-semibold">IA atualizou {campos.length} campos!</p>
                        </div>
                        <div className="bg-white/20 rounded-lg p-2">
                            <ul className="text-xs space-y-0.5">
                                {campos.slice(0, 6).map((campo: string) => (
                                    <li key={campo} className="flex items-center gap-1.5">
                                        <span className="text-green-300">✓</span>
                                        {formatCampoLabel(campo)}
                                    </li>
                                ))}
                                {campos.length > 6 && (
                                    <li className="text-white/70 pl-4">+{campos.length - 6} campos</li>
                                )}
                            </ul>
                        </div>
                    </div>,
                    { duration: 6000 }
                );
                queryClient.invalidateQueries({ queryKey: ['card', effectiveCardId] });
                queryClient.invalidateQueries({ queryKey: ['card-detail', effectiveCardId] });
            } else if (result.status === 'no_update' || campos.length === 0) {
                toast.info('IA não encontrou novas informações na transcrição');
            }

            return result;
        } catch (error) {
            console.error('Erro ao processar com IA:', error);
            toast.error('Erro ao processar transcrição com IA');
            return null;
        } finally {
            setIsProcessingAI(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubmitPhase('saving');

        try {
            // Card is required
            if (!effectiveCardId) {
                throw new Error("Selecione um card para vincular esta tarefa.");
            }

            // Combine date and time
            let finalDate = null;
            if (date && time) {
                finalDate = new Date(`${date}T${time}:00`).toISOString();
            } else if (date) {
                finalDate = new Date(`${date}T09:00:00`).toISOString(); // Default to 9am
            }

            // Get current user
            const { data: { user } } = await supabase.auth.getUser();

            // Determine responsible (use selected, fallback to current user)
            let finalResponsibleId = responsibleId;
            if (!finalResponsibleId) {
                finalResponsibleId = user?.id || '';
            }

            // Validations for Meeting
            if (type === 'reuniao') {
                // Se não tiver responsável, usa o usuário atual
                if (!finalResponsibleId) {
                    finalResponsibleId = user?.id || '';
                }

                // Apenas validação de reagendamento (precisa de nova data/hora)
                if (meetingStatus === 'reagendada' && (!rescheduleDate || !rescheduleTime)) {
                    throw new Error("Para reagendar, é necessário informar a nova data e hora.");
                }
            }

            if (!finalResponsibleId) {
                finalResponsibleId = initialData?.responsavel_id || user?.id;
                if (!finalResponsibleId) throw new Error("Não foi possível identificar o responsável.");
            }

            // Validation for Change Request
            if (type === 'solicitacao_mudanca') {
                if (metadata.change_category === 'outro' && !otherCategory) {
                    throw new Error("Por favor, especifique a categoria 'Outro'.");
                }
            }

            // Build metadata with duration and meeting link for meetings
            const finalMetadata = type === 'reuniao'
                ? { ...metadata, duration_minutes: durationMinutes, ...(meetingLink ? { meeting_link: meetingLink } : {}) }
                : metadata;

            // Prepare payload
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: any = {
                card_id: effectiveCardId,
                titulo: title,
                descricao: description,
                tipo: type,
                data_vencimento: finalDate,
                responsavel_id: finalResponsibleId,
                status: type === 'reuniao' ? meetingStatus : 'pendente',
                concluida: type === 'reuniao' ? ['realizada', 'cancelada', 'nao_compareceu', 'reagendada'].includes(meetingStatus) : false,
                metadata: finalMetadata,
                feedback: meetingFeedback || null,
                motivo_cancelamento: cancellationReason || null,
                resultado: meetingResult || null,
                categoria_outro: otherCategory || null,
                // Map status to outcome for workflow triggering
                outcome: type === 'reuniao' && ['realizada', 'cancelada', 'nao_compareceu'].includes(meetingStatus)
                    ? meetingStatus
                    : (type === 'reuniao' && meetingStatus === 'reagendada' ? 'remarcada' : null),
                // Transcription for meetings
                transcricao: type === 'reuniao' && meetingStatus === 'realizada' ? (transcricao || null) : null,
                // Track who created the task (only on create, not edit)
                ...(mode === 'create' ? { created_by: user?.id || null } : {}),
            };

            // Only add participantes_externos if it's a meeting and has values
            if (type === 'reuniao' && externalParticipants.length > 0) {
                payload.participantes_externos = externalParticipants;
            } else {
                payload.participantes_externos = null; // Or empty array, but null is safer if column is nullable
            }

            // Debug Logging
            console.log('Saving Payload:', JSON.stringify(payload, null, 2));

            if (type === 'reuniao' && meetingStatus === 'realizada') {
                payload.concluida_em = new Date().toISOString();
            }

            let error;
            let newMeetingId = null;

            // Handle Rescheduling Logic
            if (type === 'reuniao' && meetingStatus === 'reagendada') {
                // 1. Create NEW meeting with ORIGINAL data + NEW date
                const newDate = new Date(`${rescheduleDate}T${rescheduleTime}:00`).toISOString();

                // A NOVA reunião herda dados ORIGINAIS da tarefa antiga + nova data
                // Isso preserva o título, descrição, participantes originais
                const newTaskPayload = {
                    card_id: effectiveCardId,
                    tipo: 'reuniao',
                    titulo: initialData?.titulo || title, // Preserva título original
                    descricao: initialData?.descricao || description, // Preserva descrição original
                    responsavel_id: initialData?.responsavel_id || finalResponsibleId,
                    participantes_externos: initialData?.participantes_externos || externalParticipants,
                    metadata: initialData?.metadata || metadata,
                    status: 'agendada',
                    concluida: false,
                    data_vencimento: newDate,
                    rescheduled_from_id: initialData?.id || null,
                    feedback: null,
                    motivo_cancelamento: null,
                    resultado: null,
                    created_by: user?.id || null,
                };

                const { data: newMeeting, error: createError } = await supabase
                    .from('tarefas')
                    .insert([newTaskPayload])
                    .select('id')
                    .single();

                if (createError) throw createError;
                newMeetingId = newMeeting.id;

                // 2. Update OLD meeting - ONLY status and linking, preserve ALL original data
                if (initialData?.id) {
                    const oldTaskUpdatePayload = {
                        status: 'reagendada',
                        concluida: true,
                        concluida_em: new Date().toISOString(),
                        rescheduled_to_id: newMeetingId,
                        outcome: 'remarcada' // Trigger workflow
                        // Do NOT update title, description, date, participants, etc. to preserve history
                    };

                    const { error: updateError } = await supabase
                        .from('tarefas')
                        .update(oldTaskUpdatePayload)
                        .eq('id', initialData.id);
                    error = updateError;
                }
            } else {
                // Normal Save (Create or Update)
                if (initialData?.id) {
                    // Validar se o ID existe antes de atualizar
                    const taskId = initialData.id;
                    if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
                        throw new Error('ID da tarefa inválido');
                    }

                    // Verificar se a tarefa existe
                    const { data: existing, error: checkError } = await supabase
                        .from('tarefas')
                        .select('id')
                        .eq('id', taskId)
                        .maybeSingle();

                    if (checkError) {
                        console.error('Erro ao verificar tarefa:', checkError);
                        throw new Error('Erro ao verificar tarefa: ' + checkError.message);
                    }

                    if (!existing) {
                        console.error('Tarefa não encontrada:', taskId);
                        throw new Error('Tarefa não encontrada. Ela pode ter sido excluída. Por favor, feche e reabra o modal.');
                    }

                    const { error: updateError } = await supabase
                        .from('tarefas')
                        .update(payload)
                        .eq('id', taskId);
                    error = updateError;
                } else {
                    const { data: newTask, error: insertError } = await supabase
                        .from('tarefas')
                        .insert([payload])
                        .select('id')
                        .single();
                    error = insertError;
                    if (newTask) newMeetingId = newTask.id;
                }
            }

            if (error) throw error;

            // Enviar convite por email se é reunião com meeting_link
            if (type === 'reuniao' && meetingLink) {
                const previousLink = (initialData?.metadata as Record<string, unknown> | undefined)?.meeting_link as string | undefined;
                const isNewMeeting = !initialData?.id;
                const isReschedule = mode === 'reschedule';
                const linkWasAdded = !previousLink && !!meetingLink;
                if (isNewMeeting || isReschedule || linkWasAdded) {
                    const meetingId = newMeetingId || initialData?.id;
                    if (meetingId) {
                        const action = isReschedule ? 'rescheduled' : 'created';
                        // Fire-and-forget: não bloqueia o fluxo
                        sendMeetingInvite(meetingId, effectiveCardId!, action, user?.id || '')
                    }
                }
            }

            // Process transcription with AI if meeting is realized, has transcription, AND toggle is ON
            const taskId = initialData?.id || newMeetingId;
            const shouldProcessAI = type === 'reuniao' && meetingStatus === 'realizada' && transcricao && transcricao.trim().length >= 50 && taskId && processWithAI && !aiProcessResult;

            if (shouldProcessAI) {
                // AGUARDA a IA terminar - não processa em background
                setSubmitPhase('processing_ai');
                const aiResult = await processTranscriptionWithAI(taskId, transcricao, false); // false = não mostrar toast aqui

                if (aiResult?.status === 'success' && (aiResult.campos_extraidos?.length ?? 0) > 0) {
                    setSubmitPhase('done');
                    // Mostra resultado por 2 segundos antes de fechar
                    await new Promise(resolve => setTimeout(resolve, 2500));
                }
            }

            if (mode === 'reschedule') {
                toast.success("Re-agendamento confirmado!");
            } else if (!shouldProcessAI) {
                // Só mostra toast se não processou com IA (IA tem seu próprio feedback)
                toast.success(initialData ? "Item atualizado!" : "Item criado!");
            }

            queryClient.invalidateQueries({ queryKey: ['tasks', effectiveCardId] });
            queryClient.invalidateQueries({ queryKey: ['card-detail', effectiveCardId] });
            queryClient.invalidateQueries({ queryKey: ['card-tasks-completed', effectiveCardId] });
            queryClient.invalidateQueries({ queryKey: ['reunioes', effectiveCardId] }); // Refresh meetings tab
            queryClient.invalidateQueries({ queryKey: ['calendar-meetings'] });
            queryClient.invalidateQueries({ queryKey: ['today-meeting-count'] });
            queryClient.invalidateQueries({ queryKey: ['cards'] }); // Atualizar kanban (proxima_tarefa na view)

            onSuccess?.();
            onClose();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            console.error('Error saving task:', error);
            console.error('Payload:', {
                type,
                title,
                description,
                responsibleId,
                date,
                time,
                meetingStatus,
                metadata
            });
            // Log full error object
            console.error('Full Error Object:', JSON.stringify(error, null, 2));
            toast.error(`Erro ao salvar: ${error.message || 'Erro desconhecido'}`);
        } finally {
            setIsSubmitting(false);
            setSubmitPhase('idle');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        {step === 2 && !initialData && mode !== 'reschedule' && (
                            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="h-8 w-8 p-0">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <DialogTitle>
                            {mode === 'reschedule'
                                ? 'Re-agendar Item'
                                : (step === 1 ? 'Novo Item' : (initialData ? 'Editar Item' : `Nova ${TASK_TYPES.find(t => t.id === type)?.label}`))
                            }
                        </DialogTitle>
                    </div>
                </DialogHeader>

                {step === 1 && mode !== 'reschedule' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-4">
                        {TASK_TYPES.map((t) => {
                            const isSelected = type === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => handleTypeSelect(t.id)}
                                    role="radio"
                                    aria-checked={isSelected}
                                    className={`
                                        flex flex-col items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all
                                        ${isSelected ? t.activeColor : 'border-transparent hover:border-gray-200 bg-gray-50'}
                                        ${t.color.split(' ')[0]}
                                    `}
                                >
                                    <t.icon className={`w-8 h-8 ${isSelected ? 'scale-110' : ''}`} />
                                    <span className="font-medium text-sm">{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        {/* Card Selector (when cardId is not provided as prop) */}
                        {!cardId && (
                            <div className="grid gap-2">
                                <Label className="flex items-center gap-1">
                                    Card Vinculado
                                    <span className="text-red-500">*</span>
                                </Label>
                                <div className="relative" ref={cardDropdownRef}>
                                    <button
                                        type="button"
                                        onClick={() => { setCardDropdownOpen(!cardDropdownOpen); setCardSearch(''); }}
                                        className={cn(
                                            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer",
                                            !selectedCardName && "text-muted-foreground"
                                        )}
                                    >
                                        <span className="truncate">
                                            {selectedCardName || 'Buscar card...'}
                                        </span>
                                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                                    </button>

                                    {cardDropdownOpen && (
                                        <div className="absolute z-[9999] mt-1 w-full rounded-md border bg-popover shadow-lg">
                                            <div className="flex items-center border-b px-3">
                                                <Star className="h-3.5 w-3.5 shrink-0 opacity-40 mr-2" />
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={cardSearch}
                                                    onChange={e => setCardSearch(e.target.value)}
                                                    placeholder="Buscar por nome do card..."
                                                    className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                                />
                                            </div>
                                            <div className="max-h-[220px] overflow-y-auto p-1">
                                                {(!searchedCards || searchedCards.length === 0) && (
                                                    <p className="py-4 text-center text-sm text-muted-foreground">Nenhum card encontrado.</p>
                                                )}
                                                {searchedCards?.map((card: { id: string; titulo: string | null }) => (
                                                    <button
                                                        key={card.id}
                                                        type="button"
                                                        onClick={() => { setSelectedCardId(card.id); setCardDropdownOpen(false); }}
                                                        className={cn(
                                                            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
                                                            card.id === selectedCardId && "bg-accent/50 font-medium"
                                                        )}
                                                    >
                                                        <span className="truncate">{card.titulo || 'Sem título'}</span>
                                                        {card.id === selectedCardId && <Check className="h-4 w-4 text-primary ml-auto shrink-0" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Common Fields */}
                        <div className="grid gap-2">
                            <Label className="flex items-center gap-1">
                                Título
                                <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={TEMPLATES[type]}
                                required
                                className="font-medium"
                            />
                        </div>

                        {/* Date/Time - Hide if Reagendada (since we show new date picker) */}
                        {meetingStatus !== 'reagendada' && (
                            <>
                                <div className={cn("grid gap-4", type === 'reuniao' ? "grid-cols-3" : "grid-cols-2")}>
                                    <div className="grid gap-2">
                                        <Label>Data</Label>
                                        <div
                                            className="relative cursor-pointer"
                                            onClick={() => handleWrapperClick(dateInputRef)}
                                        >
                                            <input
                                                ref={dateInputRef}
                                                type="date"
                                                value={date}
                                                onChange={e => setDate(e.target.value)}
                                                className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Hora</Label>
                                        <Input
                                            type="time"
                                            value={time}
                                            onChange={e => setTime(e.target.value)}
                                            className="font-medium"
                                        />
                                    </div>
                                    {type === 'reuniao' && (
                                        <div className="grid gap-2">
                                            <Label>Duração</Label>
                                            <Select
                                                value={String(durationMinutes)}
                                                onChange={v => setDurationMinutes(Number(v))}
                                                options={[
                                                    { value: '15', label: '15 min' },
                                                    { value: '30', label: '30 min' },
                                                    { value: '45', label: '45 min' },
                                                    { value: '60', label: '1h' },
                                                    { value: '90', label: '1h30' },
                                                    { value: '120', label: '2h' },
                                                ]}
                                            />
                                        </div>
                                    )}
                                </div>
                                {type === 'reuniao' && (
                                    <div className="grid gap-2">
                                        <Label className="flex items-center gap-1">
                                            <Video className="w-3.5 h-3.5" />
                                            Link da reunião (opcional)
                                        </Label>
                                        <Input
                                            type="url"
                                            value={meetingLink}
                                            onChange={(e) => setMeetingLink(e.target.value)}
                                            placeholder="https://teams.microsoft.com/l/meetup-join/..."
                                        />
                                    </div>
                                )}

                                {/* Conflict warning */}
                                {meetingConflicts.length > 0 && type === 'reuniao' && (
                                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 animate-in fade-in slide-in-from-top-2">
                                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm text-amber-800 space-y-1">
                                            <p className="font-medium">Conflito de horário</p>
                                            {meetingConflicts.map((c) => {
                                                const cStart = new Date(c.meeting.data_vencimento!);
                                                const cEnd = new Date(cStart.getTime() + c.meeting.duration_minutes * 60_000);
                                                const hStart = `${String(cStart.getHours()).padStart(2, '0')}:${String(cStart.getMinutes()).padStart(2, '0')}`;
                                                const hEnd = `${String(cEnd.getHours()).padStart(2, '0')}:${String(cEnd.getMinutes()).padStart(2, '0')}`;
                                                return (
                                                    <p key={c.meeting.id} className="text-xs text-amber-700">
                                                        &ldquo;{c.meeting.titulo}&rdquo; das {hStart} às {hEnd}
                                                    </p>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Responsible - searchable dropdown */}
                        <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                            <Label className="font-medium">Responsável</Label>
                            <div className="relative" ref={responsibleDropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => { setResponsibleOpen(!responsibleOpen); setResponsibleSearch(''); }}
                                    className={cn(
                                        "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer",
                                        !selectedResponsibleName && "text-muted-foreground"
                                    )}
                                >
                                    <span className="truncate">
                                        {selectedResponsibleName || 'Buscar responsável...'}
                                    </span>
                                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                                </button>

                                {responsibleOpen && (
                                    <div className="absolute z-[9999] mt-1 w-full rounded-md border bg-popover shadow-lg">
                                        <div className="flex items-center border-b px-3">
                                            <Star className="h-3.5 w-3.5 shrink-0 opacity-40 mr-2" />
                                            <input
                                                autoFocus
                                                type="text"
                                                value={responsibleSearch}
                                                onChange={e => setResponsibleSearch(e.target.value)}
                                                placeholder="Buscar por nome..."
                                                className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                                            />
                                        </div>
                                        <div className="max-h-[220px] overflow-y-auto p-1">
                                            {filteredTeamProfiles.length === 0 && filteredOtherProfiles.length === 0 && (
                                                <p className="py-4 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
                                            )}
                                            {filteredTeamProfiles.length > 0 && (
                                                <>
                                                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Equipe do card</p>
                                                    {filteredTeamProfiles.map(p => (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            onClick={() => { setResponsibleId(p.id); setResponsibleOpen(false); }}
                                                            className={cn(
                                                                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
                                                                p.id === responsibleId && "bg-accent/50 font-medium"
                                                            )}
                                                        >
                                                            <Star className="h-3 w-3 text-amber-400 shrink-0" />
                                                            <span className="truncate">{p.nome || p.email || 'Sem nome'}</span>
                                                            {p.id === responsibleId && <Check className="h-4 w-4 text-primary ml-auto shrink-0" />}
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                            {filteredTeamProfiles.length > 0 && filteredOtherProfiles.length > 0 && (
                                                <div className="-mx-1 my-1 h-px bg-border" />
                                            )}
                                            {filteredOtherProfiles.length > 0 && (
                                                <>
                                                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Outros</p>
                                                    {filteredOtherProfiles.map(p => (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            onClick={() => { setResponsibleId(p.id); setResponsibleOpen(false); }}
                                                            className={cn(
                                                                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
                                                                p.id === responsibleId && "bg-accent/50 font-medium"
                                                            )}
                                                        >
                                                            <span className="truncate">{p.nome || p.email || 'Sem nome'}</span>
                                                            {p.id === responsibleId && <Check className="h-4 w-4 text-primary ml-auto shrink-0" />}
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Meeting-specific: External Participants */}
                        {type === 'reuniao' && (
                            <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                                <Label className="flex items-center gap-1">
                                    Participantes Externos (E-mails)
                                </Label>
                                {/* Quick-add main contact email */}
                                {mainContact?.email && !externalParticipants.includes(mainContact.email) && (
                                    <button
                                        type="button"
                                        onClick={() => setExternalParticipants(prev => [...prev, mainContact.email!])}
                                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full hover:bg-purple-100 transition-colors w-fit"
                                    >
                                        <UserPlus className="h-3 w-3" />
                                        <span>
                                            Adicionar {mainContact.nome}
                                            {mainContact.sobrenome ? ` ${mainContact.sobrenome}` : ''}
                                        </span>
                                        <span className="text-purple-400">({mainContact.email})</span>
                                    </button>
                                )}
                                {mainContact && !mainContact.email && (
                                    <p className="text-xs text-amber-600 flex items-center gap-1">
                                        <Mail className="h-3 w-3" />
                                        Contato principal sem e-mail cadastrado
                                    </p>
                                )}
                                <MultiSelectEmail
                                    value={externalParticipants}
                                    onChange={setExternalParticipants}
                                    placeholder="Digite o e-mail e pressione Enter..."
                                />
                            </div>
                        )}

                        {/* Email invite feedback banner */}
                        {type === 'reuniao' && meetingStatus === 'agendada' && (
                            (() => {
                                const emailCount = externalParticipants.length + (mainContact?.email && !externalParticipants.includes(mainContact.email) ? 1 : 0);
                                const hasLink = !!meetingLink;
                                const hasEmails = emailCount > 0;
                                if (hasLink && hasEmails) return (
                                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                                        <Mail className="h-3.5 w-3.5 shrink-0" />
                                        Um convite será enviado para {emailCount} email(s) ao salvar
                                    </p>
                                );
                                if (hasEmails && !hasLink) return (
                                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                                        <Mail className="h-3.5 w-3.5 shrink-0" />
                                        Adicione um link de reunião para enviar convite por email
                                    </p>
                                );
                                if (hasLink && !hasEmails) return (
                                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                                        <Mail className="h-3.5 w-3.5 shrink-0" />
                                        Adicione participantes para enviar convite por email
                                    </p>
                                );
                                return null;
                            })()
                        )}

                        {/* Meeting Status & Logic */}
                        {type === 'reuniao' && (
                            <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
                                <h4 className="font-medium text-purple-900 flex items-center gap-2">
                                    <Users className="h-4 w-4" /> Status da Reunião
                                </h4>
                                <div className="grid gap-2">
                                    <Label>Situação Atual</Label>
                                    <Select
                                        value={meetingStatus}
                                        onChange={setMeetingStatus}
                                        options={[
                                            { value: 'agendada', label: 'Agendada' },
                                            { value: 'realizada', label: 'Realizada' },
                                            { value: 'cancelada', label: 'Cancelada' },
                                            { value: 'reagendada', label: 'Re-Agendada' },
                                            { value: 'nao_compareceu', label: 'Não Compareceu' }
                                        ]}
                                    />
                                </div>

                                {meetingStatus === 'realizada' && (
                                    <div className="grid gap-3 animate-in fade-in slide-in-from-top-2">
                                        <div className="grid gap-2">
                                            <Label>Resumo / Ata</Label>
                                            <Input
                                                value={meetingResult}
                                                onChange={e => setMeetingResult(e.target.value)}
                                                placeholder="Resumo do que foi discutido..."
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label>Feedback</Label>
                                            <Textarea
                                                value={meetingFeedback}
                                                onChange={e => setMeetingFeedback(e.target.value)}
                                                placeholder="Detalhes do feedback..."
                                            />
                                        </div>

                                        {/* Transcription Field */}
                                        <div className="grid gap-2 pt-3 border-t border-purple-200">
                                            <Label className="flex items-center gap-2 text-purple-700">
                                                <FileText className="h-4 w-4" />
                                                Transcrição da Reunião
                                            </Label>
                                            <Textarea
                                                value={transcricao}
                                                onChange={e => setTranscricao(e.target.value)}
                                                placeholder="Cole aqui a transcrição completa da reunião para extração automática de dados..."
                                                className="min-h-[150px] text-sm"
                                            />
                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                <p className="text-xs text-gray-500">
                                                    {transcricao.length > 0
                                                        ? `${transcricao.length} caracteres ${transcricao.length >= 50 ? '✓' : '(mínimo 50 para IA)'}`
                                                        : 'Cole a transcrição para extração automática via IA'}
                                                </p>

                                                {/* Toggle para processar com IA ao salvar */}
                                                {transcricao.length >= 50 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setProcessWithAI(!processWithAI)}
                                                        disabled={isProcessingAI}
                                                        className={`
                                                            flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                                                            ${isProcessingAI
                                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                                : processWithAI
                                                                    ? 'bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 ring-2 ring-purple-300 shadow-sm'
                                                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                                            }
                                                        `}
                                                    >
                                                        {/* Toggle switch visual */}
                                                        <div className={`
                                                            relative w-8 h-4 rounded-full transition-colors
                                                            ${processWithAI ? 'bg-purple-500' : 'bg-gray-300'}
                                                        `}>
                                                            <div className={`
                                                                absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all
                                                                ${processWithAI ? 'left-[18px]' : 'left-0.5'}
                                                            `} />
                                                        </div>
                                                        <Sparkles className={`h-3.5 w-3.5 ${processWithAI ? 'text-purple-600' : 'text-gray-400'}`} />
                                                        <span>{processWithAI ? 'Extrair com IA ao salvar' : 'IA desativada'}</span>
                                                    </button>
                                                )}

                                                {/* Botão para reprocessar quando já tem ID (modo edição) */}
                                                {transcricao.length >= 50 && initialData?.id && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => processTranscriptionWithAI(initialData.id, transcricao)}
                                                        disabled={isProcessingAI}
                                                        className="h-7 px-3 text-xs bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                                                    >
                                                        {isProcessingAI ? (
                                                            <>
                                                                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                                                                Processando...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="h-3 w-3 mr-1" />
                                                                Reprocessar agora
                                                            </>
                                                        )}
                                                    </Button>
                                                )}
                                            </div>

                                            {/* AI Processing Result */}
                                            {aiProcessResult && (
                                                <div className={`mt-2 p-2 rounded-md text-xs ${
                                                    aiProcessResult.status === 'success'
                                                        ? 'bg-green-50 border border-green-200 text-green-700'
                                                        : 'bg-amber-50 border border-amber-200 text-amber-700'
                                                }`}>
                                                    {aiProcessResult.status === 'success' ? (
                                                        <>
                                                            <div className="font-medium flex items-center gap-1">
                                                                <Sparkles className="h-3 w-3" />
                                                                IA extraiu {aiProcessResult.campos_extraidos?.length || 0} campos:
                                                            </div>
                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                {aiProcessResult.campos_extraidos?.map((campo: string) => (
                                                                    <span key={campo} className="px-1.5 py-0.5 bg-green-100 rounded text-green-800">
                                                                        {campo}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <span>Nenhuma nova informação encontrada na transcrição</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {meetingStatus === 'cancelada' && (
                                    <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                                        <Label>Motivo do Cancelamento</Label>
                                        <Input
                                            value={cancellationReason}
                                            onChange={e => setCancellationReason(e.target.value)}
                                            placeholder="Por que foi cancelada?"
                                        />
                                    </div>
                                )}

                                {meetingStatus === 'reagendada' && (
                                    <div className="space-y-3 p-3 bg-white rounded border border-purple-200 animate-in fade-in slide-in-from-top-2">
                                        <Label className="text-purple-700 font-medium">Nova Data e Hora</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="grid gap-2">
                                                <div
                                                    className="relative cursor-pointer"
                                                    onClick={() => handleWrapperClick(rescheduleDateInputRef)}
                                                >
                                                    <input
                                                        ref={rescheduleDateInputRef}
                                                        type="date"
                                                        value={rescheduleDate}
                                                        onChange={e => setRescheduleDate(e.target.value)}
                                                        className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid gap-2">
                                                <div className="relative" ref={rescheduleTimeListRef}>
                                                    <Input
                                                        value={rescheduleTime}
                                                        onChange={e => setRescheduleTime(e.target.value)}
                                                        onFocus={() => setShowRescheduleTimeList(true)}
                                                        placeholder="00:00"
                                                        className="font-medium"
                                                        maxLength={5}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="absolute right-0 top-0 h-10 w-10 px-0 text-gray-400 hover:text-gray-600"
                                                        onClick={() => setShowRescheduleTimeList(!showRescheduleTimeList)}
                                                    >
                                                        <ChevronDown className="h-4 w-4" />
                                                    </Button>

                                                    {showRescheduleTimeList && (
                                                        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none animate-in fade-in-0 zoom-in-95 duration-100">
                                                            {timeOptions.map((option) => (
                                                                <div
                                                                    key={option.value}
                                                                    className={`
                                                                        relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none transition-colors hover:bg-gray-100 hover:text-gray-900
                                                                        ${option.value === rescheduleTime ? "bg-blue-50 text-blue-900 font-medium" : ""}
                                                                    `}
                                                                    onClick={() => handleRescheduleTimeSelect(option.value)}
                                                                >
                                                                    <span className="block truncate">{option.label}</span>
                                                                    {option.value === rescheduleTime && (
                                                                        <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                                                                            <Check className="h-4 w-4 text-blue-600" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Isso criará uma nova reunião e marcará a atual como reagendada.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Change Request Fields */}
                        {type === 'solicitacao_mudanca' && (
                            <div className="space-y-4 p-4 bg-orange-50 rounded-lg border border-orange-100">
                                <h4 className="font-medium text-orange-900 flex items-center gap-2">
                                    <RefreshCw className="h-4 w-4" /> Detalhes da Mudança
                                </h4>
                                <div className="grid gap-2">
                                    <Label>Categoria</Label>
                                    <Select
                                        value={metadata.change_category || ''}
                                        onChange={v => updateMetadata('change_category', v)}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        options={changeCategories?.map((c: any) => ({ value: c.key, label: c.label })) || []}
                                        placeholder="Selecione..."
                                    />
                                </div>

                                {metadata.change_category === 'outro' && (
                                    <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                                        <Label>Qual outra categoria?</Label>
                                        <Input
                                            value={otherCategory}
                                            onChange={e => setOtherCategory(e.target.value)}
                                            placeholder="Especifique..."
                                        />
                                    </div>
                                )}

                            </div>
                        )}


                        <div className="grid gap-2">
                            <Label>Descrição / Observações</Label>
                            <Textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                className="min-h-[100px]"
                            />
                        </div>

                        {/* Feedback visual de processamento da IA */}
                        {isSubmitting && submitPhase !== 'idle' && (
                            <div className="mb-4 p-4 rounded-lg border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
                                {submitPhase === 'saving' && (
                                    <div className="flex items-center gap-3">
                                        <RefreshCw className="h-5 w-5 text-purple-600 animate-spin" />
                                        <div>
                                            <p className="font-medium text-purple-900">Salvando reunião...</p>
                                            <p className="text-xs text-purple-600">Aguarde um momento</p>
                                        </div>
                                    </div>
                                )}

                                {submitPhase === 'processing_ai' && (
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <Sparkles className="h-5 w-5 text-purple-600 animate-pulse" />
                                            <div className="absolute inset-0 animate-ping">
                                                <Sparkles className="h-5 w-5 text-purple-400 opacity-50" />
                                            </div>
                                        </div>
                                        <div>
                                            <p className="font-medium text-purple-900">IA analisando transcrição...</p>
                                            <p className="text-xs text-purple-600">Extraindo informações da reunião</p>
                                        </div>
                                    </div>
                                )}

                                {submitPhase === 'done' && aiProcessResult && (
                                    <div className="space-y-3">
                                        {aiProcessResult.status === 'success' && (aiProcessResult.campos_extraidos?.length ?? 0) > 0 ? (
                                            <>
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 rounded-full bg-green-100">
                                                        <Check className="h-4 w-4 text-green-600" />
                                                    </div>
                                                    <p className="font-semibold text-green-800">
                                                        IA extraiu {aiProcessResult.campos_extraidos?.length ?? 0} campos!
                                                    </p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {(aiProcessResult.campos_extraidos ?? []).map((campo: string) => (
                                                        <div key={campo} className="flex items-center gap-1.5 px-2 py-1 bg-white rounded border border-green-200">
                                                            <span className="text-green-500 text-xs">✓</span>
                                                            <span className="text-xs text-gray-700">{formatCampoLabel(campo)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-gray-500 text-center">Fechando automaticamente...</p>
                                            </>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-full bg-amber-100">
                                                    <Check className="h-4 w-4 text-amber-600" />
                                                </div>
                                                <p className="font-medium text-amber-800">
                                                    Nenhuma nova informação identificada
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                                Cancelar
                            </Button>
                            {/* Botão com feedback visual de IA */}
                            {type === 'reuniao' && meetingStatus === 'realizada' && transcricao.length >= 50 && processWithAI ? (
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-md min-w-[180px]"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                            {submitPhase === 'saving' && 'Salvando...'}
                                            {submitPhase === 'processing_ai' && 'Processando IA...'}
                                            {submitPhase === 'done' && 'Concluído!'}
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4 mr-2" />
                                            Salvar e Extrair com IA
                                        </>
                                    )}
                                </Button>
                            ) : (
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Salvando...' : (mode === 'reschedule' ? 'Confirmar Re-agendamento' : 'Salvar Item')}
                                </Button>
                            )}
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog >
    );
}
