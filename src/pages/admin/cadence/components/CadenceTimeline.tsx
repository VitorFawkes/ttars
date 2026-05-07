import { Phone, Clock, Flag, CheckCircle, MessageSquare, ShieldCheck, FileText, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { EchoBadge } from '@/components/automations/EchoBadge';

interface CadenceStep {
    id: string;
    step_order: number;
    step_key: string;
    step_type: 'task' | 'wait' | 'end' | 'message' | 'send_media' | 'echo_action';
    day_offset?: number | null;
    task_config: {
        tipo?: string;
        titulo?: string;
        prioridade?: string;
    } | null;
    wait_config: {
        duration_minutes?: number;
        duration_type?: 'business' | 'calendar';
    } | null;
    end_config: {
        result?: string;
        move_to_stage_id?: string;
    } | null;
    message_config?: {
        send_mode?: 'hsm' | 'text';
        hsm_template_name?: string | null;
        corpo?: string | null;
    } | null;
    media_config?: {
        media_url?: string | null;
        mime_type?: string | null;
        filename?: string | null;
    } | null;
    echo_config?: {
        action?: string;
        status?: string;
        tag_id?: string | null;
    } | null;
    requires_previous_completed?: boolean;
}

const ECHO_ACTION_LABEL: Record<string, string> = {
    assign: 'Atribuir',
    release: 'Liberar',
    close: 'Fechar',
    set_status: 'Mudar status',
    add_tag: 'Adicionar tag',
    remove_tag: 'Remover tag',
    add_co_owner: 'Adicionar co-owner',
    remove_co_owner: 'Remover co-owner',
};

interface DayPattern {
    days: number[];
    description?: string;
}

interface CadenceTimelineProps {
    steps: CadenceStep[];
    dayPattern?: DayPattern | null;
    scheduleMode?: 'interval' | 'day_pattern';
    respectBusinessHours?: boolean;
}

export function CadenceTimeline({
    steps,
    dayPattern,
    scheduleMode = 'interval',
    respectBusinessHours = true
}: CadenceTimelineProps) {
    const formatDuration = (minutes: number) => {
        if (minutes < 60) return `${minutes}min`;
        if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
        return `${Math.round(minutes / 1440)}d`;
    };

    const getStepIcon = (type: string) => {
        switch (type) {
            case 'task':
                return <Phone className="w-4 h-4" />;
            case 'wait':
                return <Clock className="w-4 h-4" />;
            case 'end':
                return <Flag className="w-4 h-4" />;
            case 'message':
                return <MessageSquare className="w-4 h-4" />;
            case 'send_media':
                return <ImageIcon className="w-4 h-4" />;
            case 'echo_action':
                return <EchoBadge iconOnly size={14} />;
            default:
                return null;
        }
    };

    const getStepColor = (type: string, result?: string) => {
        switch (type) {
            case 'task':
                return 'bg-blue-500';
            case 'wait':
                return 'bg-amber-500';
            case 'message':
                return 'bg-emerald-500';
            case 'send_media':
                return 'bg-teal-500';
            case 'echo_action':
                return 'bg-violet-500';
            case 'end':
                if (result === 'success') return 'bg-green-500';
                if (result === 'failure' || result === 'ghosting') return 'bg-red-500';
                return 'bg-slate-500';
            default:
                return 'bg-slate-500';
        }
    };

    const getStepBgColor = (type: string, result?: string) => {
        switch (type) {
            case 'task':
                return 'bg-blue-50 border-blue-200';
            case 'wait':
                return 'bg-amber-50 border-amber-200';
            case 'message':
                return 'bg-emerald-50 border-emerald-200';
            case 'send_media':
                return 'bg-teal-50 border-teal-200';
            case 'echo_action':
                return 'bg-violet-50 border-violet-200';
            case 'end':
                if (result === 'success') return 'bg-green-50 border-green-200';
                if (result === 'failure' || result === 'ghosting') return 'bg-red-50 border-red-200';
                return 'bg-slate-50 border-slate-200';
            default:
                return 'bg-slate-50 border-slate-200';
        }
    };

    const getPriorityBadge = (prioridade?: string) => {
        switch (prioridade) {
            case 'high':
                return <Badge className="bg-red-100 text-red-700 text-xs">Alta</Badge>;
            case 'medium':
                return <Badge className="bg-amber-100 text-amber-700 text-xs">Média</Badge>;
            case 'low':
                return <Badge className="bg-slate-100 text-slate-700 text-xs">Baixa</Badge>;
            default:
                return null;
        }
    };

    // Calculate timeline based on mode
    const getStepTiming = (step: CadenceStep, index: number) => {
        if (scheduleMode === 'day_pattern' && dayPattern && step.day_offset !== undefined && step.day_offset !== null) {
            const dayNumber = step.day_offset + 1;
            return `Dia ${dayNumber}`;
        }

        // Interval mode - calculate cumulative time
        let totalMinutes = 0;
        for (let i = 0; i < index; i++) {
            const prevStep = steps[i];
            if (prevStep.step_type === 'wait' && prevStep.wait_config?.duration_minutes) {
                totalMinutes += prevStep.wait_config.duration_minutes;
            }
        }

        if (totalMinutes === 0) return 'Imediato';
        return `+${formatDuration(totalMinutes)}`;
    };

    if (steps.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p>Adicione steps para visualizar a timeline.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-slate-500 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span>Tarefa</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span>Mensagem</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-teal-500" />
                    <span>Mídia</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-violet-500" />
                    <span className="flex items-center gap-1">
                        <EchoBadge iconOnly size={10} />
                        Ação Echo
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span>Espera</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>Fim (sucesso)</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span>Fim (falha)</span>
                </div>
                {respectBusinessHours && (
                    <Badge variant="outline" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        Horário útil
                    </Badge>
                )}
            </div>

            {/* Timeline */}
            <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

                {/* Steps */}
                <div className="space-y-4">
                    {steps.map((step, index) => (
                        <div key={step.id} className="relative flex items-start gap-4">
                            {/* Dot */}
                            <div className={`relative z-10 w-8 h-8 rounded-full ${getStepColor(step.step_type, step.end_config?.result)} flex items-center justify-center text-white shadow-sm`}>
                                {getStepIcon(step.step_type)}
                            </div>

                            {/* Content */}
                            <div className={`flex-1 p-3 rounded-lg border ${getStepBgColor(step.step_type, step.end_config?.result)}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                        {/* Header */}
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="text-xs">
                                                {getStepTiming(step, index)}
                                            </Badge>
                                            <span className="font-medium text-slate-800">
                                                {step.step_type === 'task' && (step.task_config?.titulo || 'Tarefa')}
                                                {step.step_type === 'wait' && 'Espera'}
                                                {step.step_type === 'end' && 'Fim da Cadência'}
                                                {step.step_type === 'message' && (
                                                    step.message_config?.send_mode === 'hsm'
                                                        ? `Mensagem (HSM ${step.message_config?.hsm_template_name || ''})`
                                                        : 'Mensagem (texto livre)'
                                                )}
                                                {step.step_type === 'send_media' && (step.media_config?.filename || 'Enviar mídia')}
                                                {step.step_type === 'echo_action' && (ECHO_ACTION_LABEL[step.echo_config?.action || ''] || 'Ação Echo')}
                                            </span>
                                        </div>

                                        {/* Details */}
                                        <div className="flex items-center gap-2 flex-wrap text-sm text-slate-600">
                                            {step.step_type === 'task' && (
                                                <>
                                                    <Badge variant="secondary" className="text-xs">
                                                        {step.task_config?.tipo || 'contato'}
                                                    </Badge>
                                                    {getPriorityBadge(step.task_config?.prioridade)}
                                                    {step.requires_previous_completed && (
                                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                                            <CheckCircle className="w-3 h-3" />
                                                            Requer anterior
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                            {step.step_type === 'wait' && (
                                                <>
                                                    <span className="font-medium">
                                                        {formatDuration(step.wait_config?.duration_minutes || 0)}
                                                    </span>
                                                    <Badge variant="outline" className="text-xs">
                                                        {step.wait_config?.duration_type === 'business' ? 'Horário útil' : 'Calendário'}
                                                    </Badge>
                                                </>
                                            )}
                                            {step.step_type === 'message' && (
                                                <>
                                                    {step.message_config?.send_mode === 'hsm' ? (
                                                        <Badge className="bg-emerald-100 text-emerald-700 text-xs flex items-center gap-1">
                                                            <ShieldCheck className="w-3 h-3" />
                                                            HSM
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-emerald-100 text-emerald-700 text-xs flex items-center gap-1">
                                                            <FileText className="w-3 h-3" />
                                                            Texto livre
                                                        </Badge>
                                                    )}
                                                </>
                                            )}
                                            {step.step_type === 'send_media' && (
                                                <Badge className="bg-teal-100 text-teal-700 text-xs flex items-center gap-1">
                                                    <ImageIcon className="w-3 h-3" />
                                                    {step.media_config?.mime_type || 'mídia'}
                                                </Badge>
                                            )}
                                            {step.step_type === 'echo_action' && (
                                                <Badge className="bg-violet-100 text-violet-700 text-xs flex items-center gap-1">
                                                    <EchoBadge iconOnly size={10} />
                                                    Echo
                                                </Badge>
                                            )}
                                            {step.step_type === 'end' && (
                                                <>
                                                    <Badge className={`text-xs ${
                                                        step.end_config?.result === 'success' ? 'bg-green-100 text-green-700' :
                                                        step.end_config?.result === 'ghosting' ? 'bg-red-100 text-red-700' :
                                                        'bg-slate-100 text-slate-700'
                                                    }`}>
                                                        {step.end_config?.result === 'success' ? 'Sucesso' :
                                                         step.end_config?.result === 'failure' ? 'Falha' :
                                                         step.end_config?.result === 'ghosting' ? 'Ghosting' : 'Finalizado'}
                                                    </Badge>
                                                    {step.end_config?.move_to_stage_id && (
                                                        <span className="text-xs text-slate-500">
                                                            Move card para outra etapa
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* Step number */}
                                    <div className="text-xs text-slate-400">
                                        #{index + 1}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Summary */}
            <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center gap-6 text-sm text-slate-600">
                    <div>
                        <span className="font-medium">{steps.filter(s => s.step_type === 'task').length}</span>
                        <span className="text-slate-400 ml-1">tarefas</span>
                    </div>
                    <div>
                        <span className="font-medium">{steps.filter(s => s.step_type === 'message').length}</span>
                        <span className="text-slate-400 ml-1">mensagens</span>
                    </div>
                    <div>
                        <span className="font-medium">{steps.filter(s => s.step_type === 'send_media').length}</span>
                        <span className="text-slate-400 ml-1">mídias</span>
                    </div>
                    <div>
                        <span className="font-medium">{steps.filter(s => s.step_type === 'echo_action').length}</span>
                        <span className="text-slate-400 ml-1">ações Echo</span>
                    </div>
                    <div>
                        <span className="font-medium">{steps.filter(s => s.step_type === 'wait').length}</span>
                        <span className="text-slate-400 ml-1">pausas</span>
                    </div>
                    {dayPattern && (
                        <div>
                            <span className="font-medium">{Math.max(...dayPattern.days)}</span>
                            <span className="text-slate-400 ml-1">dias total</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CadenceTimeline;
