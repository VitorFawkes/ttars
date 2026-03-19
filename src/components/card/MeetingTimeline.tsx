import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Video, FileText, Calendar, Sparkles, AlertCircle, CheckCircle2, Users, X, Maximize2, Edit3, ExternalLink } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { processAIExtraction } from '@/hooks/useAIExtraction'

// Interface for meeting task (tarefa tipo reuniao)
interface MeetingTask {
    id: string
    card_id: string
    titulo: string
    descricao: string | null
    data_vencimento: string | null
    status: string | null
    concluida: boolean
    resultado: string | null
    feedback: string | null
    transcricao: string | null
    transcricao_metadata: { campos_extraidos?: string[]; processed_at?: string } | null
    metadata: { duration_minutes?: number; meeting_link?: string } | null
    responsavel_id: string | null
    participantes_externos: string[] | null
    created_at: string | null
}

interface MeetingTimelineProps {
    cardId: string
    className?: string
}

// Helper para formatar nomes de campos extraídos
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
    }
    return labels[campo] || campo
}

// Group meetings by date
function groupMeetingsByDate(meetings: MeetingTask[]) {
    const groups: { date: string; label: string; meetings: MeetingTask[] }[] = []

    for (const meeting of meetings) {
        const dateStr = meeting.data_vencimento || meeting.created_at
        if (!dateStr) continue
        const date = new Date(dateStr)
        const dateKey = format(date, 'yyyy-MM-dd')

        let label: string
        if (isToday(date)) {
            label = 'Hoje'
        } else if (isYesterday(date)) {
            label = 'Ontem'
        } else {
            label = format(date, "dd 'de' MMMM", { locale: ptBR })
        }

        const existingGroup = groups.find(g => g.date === dateKey)
        if (existingGroup) {
            existingGroup.meetings.push(meeting)
        } else {
            groups.push({ date: dateKey, label, meetings: [meeting] })
        }
    }

    // Sort groups by date (oldest first - like a chat conversation)
    return groups.sort((a, b) => a.date.localeCompare(b.date))
}

// Get status display info
function getStatusInfo(meeting: MeetingTask) {
    const status = meeting.status || (meeting.concluida ? 'realizada' : 'agendada')

    switch (status) {
        case 'realizada':
            return { label: 'Realizada', color: 'bg-green-100 text-green-700', icon: CheckCircle2 }
        case 'cancelada':
            return { label: 'Cancelada', color: 'bg-red-100 text-red-700', icon: AlertCircle }
        case 'reagendada':
            return { label: 'Reagendada', color: 'bg-orange-100 text-orange-700', icon: Calendar }
        case 'nao_compareceu':
            return { label: 'Não Compareceu', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle }
        default:
            return { label: 'Agendada', color: 'bg-blue-100 text-blue-700', icon: Calendar }
    }
}

// Meeting bubble component with inline transcription editing
function MeetingBubble({
    meeting,
    cardId,
    onTranscriptionSaved
}: {
    meeting: MeetingTask
    cardId: string
    onTranscriptionSaved: () => void
}) {
    const [isEditing, setIsEditing] = useState(false)
    const [transcricao, setTranscricao] = useState(meeting.transcricao || '')
    const [isProcessing, setIsProcessing] = useState(false)
    const [showFullTranscript, setShowFullTranscript] = useState(false)
    const [processWithAI, setProcessWithAI] = useState(true)

    const hasTranscription = meeting.transcricao && meeting.transcricao.length > 0
    const isRealized = meeting.status === 'realizada' || (meeting.concluida && !['cancelada', 'reagendada', 'nao_compareceu'].includes(meeting.status || ''))
    const canAddTranscription = isRealized
    const statusInfo = getStatusInfo(meeting)

    const handleSaveTranscription = async (processWithAI: boolean) => {
        if (!transcricao.trim()) {
            toast.error('Cole a transcrição da reunião')
            return
        }

        setIsProcessing(true)
        try {
            // Save transcription to task (tarefas table)
            const { error } = await supabase
                .from('tarefas')
                .update({ transcricao })
                .eq('id', meeting.id)

            if (error) throw error

            // Process with AI if requested (unified webhook)
            if (processWithAI && transcricao.length >= 50) {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) throw new Error('Usuário não autenticado')

                const result = await processAIExtraction(cardId, 'meeting_transcript', user.id, {
                    transcription: transcricao,
                    meetingId: meeting.id
                })

                const campos = result.campos_extraidos || []
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
                            <p className="text-[10px] opacity-70">Recarregue o card para ver os dados atualizados</p>
                        </div>,
                        { duration: 6000 }
                    )
                } else {
                    toast.success('Transcrição salva! Nenhuma informação nova identificada.')
                }
            } else {
                toast.success('Transcrição salva!')
            }

            setIsEditing(false)
            onTranscriptionSaved()
        } catch (error) {
            console.error('Erro ao salvar:', error)
            toast.error('Erro ao salvar transcrição')
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-purple-50 border border-purple-100 rounded-bl-sm space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-full bg-purple-100">
                            <Video className="w-3.5 h-3.5 text-purple-600" />
                        </div>
                        <span className="font-medium text-sm text-purple-900">
                            {meeting.titulo || 'Reunião'}
                        </span>
                    </div>
                    {canAddTranscription && !hasTranscription && !isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 hover:bg-purple-200 transition-colors text-xs text-purple-700 font-medium"
                        >
                            <FileText className="w-3 h-3" />
                            Adicionar Transcrição
                        </button>
                    )}
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-3 text-xs text-purple-600">
                    {meeting.data_vencimento && (
                        <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(meeting.data_vencimento), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                    )}
                    {meeting.participantes_externos && meeting.participantes_externos.length > 0 && (
                        <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {meeting.participantes_externos.length} participantes
                        </span>
                    )}
                </div>

                {/* Meeting Link */}
                {meeting.metadata?.meeting_link && (
                    <a
                        href={meeting.metadata.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-medium text-indigo-700 transition-colors"
                    >
                        <Video className="w-3 h-3" />
                        Entrar na reunião
                        <ExternalLink className="w-2.5 h-2.5 ml-auto text-indigo-400" />
                    </a>
                )}

                {/* Status badge */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1",
                        statusInfo.color
                    )}>
                        <statusInfo.icon className="w-3 h-3" />
                        {statusInfo.label}
                    </span>
                    {meeting.transcricao_metadata?.campos_extraidos && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            IA extraiu {meeting.transcricao_metadata.campos_extraidos.length} campos
                        </span>
                    )}
                </div>

                {/* Feedback/Result */}
                {meeting.resultado && (
                    <p className="text-xs text-gray-600">
                        <strong>Resumo:</strong> {meeting.resultado}
                    </p>
                )}
                {meeting.feedback && (
                    <p className="text-xs text-gray-600 italic">{meeting.feedback}</p>
                )}

                {/* Warning for non-realized meetings */}
                {!canAddTranscription && !hasTranscription && (
                    <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>Transcrição só pode ser adicionada quando a reunião for marcada como "Realizada"</span>
                    </div>
                )}

                {/* Inline transcription editor */}
                {isEditing && canAddTranscription && (
                    <div className="pt-2 border-t border-purple-100 space-y-2">
                        <textarea
                            value={transcricao}
                            onChange={(e) => setTranscricao(e.target.value)}
                            placeholder="Cole aqui a transcrição da reunião..."
                            rows={6}
                            className={cn(
                                "w-full px-3 py-2 rounded-lg border border-purple-200",
                                "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent",
                                "resize-none text-sm leading-relaxed",
                                "placeholder:text-gray-400"
                            )}
                            disabled={isProcessing}
                        />
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            {/* Switch toggle para IA */}
                            <button
                                type="button"
                                onClick={() => setProcessWithAI(!processWithAI)}
                                disabled={transcricao.length < 50 || isProcessing}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                                    transcricao.length < 50 || isProcessing
                                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                        : processWithAI
                                            ? "bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 ring-2 ring-purple-300"
                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                )}
                            >
                                {/* Toggle visual */}
                                <div className={cn(
                                    "relative w-8 h-4 rounded-full transition-colors",
                                    processWithAI && transcricao.length >= 50
                                        ? "bg-purple-500"
                                        : "bg-gray-300"
                                )}>
                                    <div className={cn(
                                        "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all",
                                        processWithAI && transcricao.length >= 50
                                            ? "left-[18px]"
                                            : "left-0.5"
                                    )} />
                                </div>
                                <Sparkles className={cn(
                                    "w-3.5 h-3.5",
                                    processWithAI && transcricao.length >= 50 ? "text-purple-600" : "text-gray-400"
                                )} />
                                <span>Extrair com IA</span>
                                {transcricao.length < 50 && (
                                    <span className="text-gray-400 font-normal">(mín. 50 chars)</span>
                                )}
                            </button>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">
                                    {transcricao.length} caracteres
                                </span>
                                <button
                                    onClick={() => {
                                        setIsEditing(false)
                                        setTranscricao(meeting.transcricao || '')
                                    }}
                                    disabled={isProcessing}
                                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleSaveTranscription(processWithAI && transcricao.length >= 50)}
                                    disabled={isProcessing || !transcricao.trim()}
                                    className={cn(
                                        "flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg transition-all disabled:opacity-50",
                                        processWithAI && transcricao.length >= 50
                                            ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 shadow-md shadow-purple-200"
                                            : "bg-purple-600 text-white hover:bg-purple-700"
                                    )}
                                >
                                    {isProcessing ? (
                                        <>
                                            <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                                            {processWithAI && transcricao.length >= 50 ? 'Extraindo...' : 'Salvando...'}
                                        </>
                                    ) : (
                                        <>
                                            {processWithAI && transcricao.length >= 50 && (
                                                <Sparkles className="w-3 h-3" />
                                            )}
                                            {processWithAI && transcricao.length >= 50 ? 'Salvar e Extrair' : 'Salvar'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Existing transcription view - Preview + Modal */}
                {hasTranscription && !isEditing && (
                    <div className="pt-2 border-t border-purple-100">
                        {/* Preview - 3 linhas */}
                        <p className="text-sm text-gray-700 line-clamp-3 leading-relaxed">
                            {meeting.transcricao}
                        </p>

                        {/* Ações */}
                        <div className="flex items-center justify-between mt-2">
                            <button
                                onClick={() => setShowFullTranscript(true)}
                                className="flex items-center gap-1 text-xs text-purple-600 font-medium hover:text-purple-800 transition-colors"
                            >
                                <Maximize2 className="w-3 h-3" />
                                Ver transcrição completa
                            </button>
                            {canAddTranscription && (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-1 text-xs text-purple-500 hover:text-purple-700 transition-colors"
                                >
                                    <Edit3 className="w-3 h-3" />
                                    Editar
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Modal Fullscreen para transcrição */}
                {showFullTranscript && (
                    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-purple-50 to-white">
                                <div>
                                    <h3 className="font-semibold text-gray-900">{meeting.titulo || 'Reunião'}</h3>
                                    {meeting.data_vencimento && (
                                        <p className="text-sm text-gray-500">
                                            {format(new Date(meeting.data_vencimento), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => setShowFullTranscript(false)}
                                    className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Body - scroll natural */}
                            <div className="flex-1 overflow-y-auto p-6">
                                <p className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                                    {meeting.transcricao}
                                </p>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between p-4 border-t bg-gray-50">
                                <span className="text-xs text-gray-400">
                                    {meeting.transcricao?.length || 0} caracteres
                                </span>
                                <div className="flex items-center gap-2">
                                    {canAddTranscription && (
                                        <button
                                            onClick={() => {
                                                setShowFullTranscript(false)
                                                setIsEditing(true)
                                            }}
                                            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                                        >
                                            <Edit3 className="w-4 h-4" />
                                            Editar
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowFullTranscript(false)}
                                        className="px-4 py-1.5 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded-lg transition-colors"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                {meeting.created_at && (
                    <div className="flex items-center justify-end text-[10px] text-purple-400">
                        <span>
                            Criada em {format(new Date(meeting.created_at), 'dd/MM HH:mm')}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}

export function MeetingTimeline({ cardId, className }: MeetingTimelineProps) {
    const queryClient = useQueryClient()

    // Fetch meeting tasks (tarefas where tipo = 'reuniao')
    const { data: meetings, isLoading } = useQuery({
        queryKey: ['reunioes', cardId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tarefas')
                .select('*')
                .eq('card_id', cardId)
                .eq('tipo', 'reuniao')
                .is('deleted_at', null)
                .order('data_vencimento', { ascending: false })

            if (error) throw error
            return data as MeetingTask[]
        },
        enabled: !!cardId
    })

    const handleTranscriptionSaved = () => {
        queryClient.invalidateQueries({ queryKey: ['reunioes', cardId] })
        queryClient.invalidateQueries({ queryKey: ['tasks', cardId] })
        queryClient.invalidateQueries({ queryKey: ['card', cardId] })
        queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
    }

    const groupedMeetings = meetings ? groupMeetingsByDate(meetings) : []
    const realizedMeetings = meetings?.filter(m => m.status === 'realizada' || (m.concluida && !['cancelada', 'reagendada'].includes(m.status || ''))) || []
    const hasRealizedMeetingWithoutTranscription = realizedMeetings.some(m => !m.transcricao)

    if (isLoading) {
        return (
            <div className={cn("flex items-center justify-center h-full", className)}>
                <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full" />
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium">{meetings?.length || 0} reuniões</span>
                    {realizedMeetings.length > 0 && (
                        <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                            {realizedMeetings.length} realizadas
                        </span>
                    )}
                </div>
                <span className="text-xs text-gray-400">
                    Crie reuniões em "Tarefas"
                </span>
            </div>

            {/* Info banner for pending transcriptions */}
            {hasRealizedMeetingWithoutTranscription && (
                <div className="mx-4 mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-purple-700">
                        <p className="font-medium">Você tem reuniões realizadas sem transcrição</p>
                        <p className="mt-0.5 opacity-80">Adicione a transcrição para extrair dados automaticamente via IA</p>
                    </div>
                </div>
            )}

            {/* Meetings */}
            <ScrollArea className="flex-1 px-4">
                <div className="py-4 space-y-4">
                    {groupedMeetings.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Video className="w-12 h-12 mb-3 opacity-50" />
                            <p className="text-sm font-medium">Nenhuma reunião registrada</p>
                            <p className="text-xs text-center mt-1 max-w-[200px]">
                                Crie uma tarefa do tipo "Reunião" em "Agenda & Tarefas".
                            </p>
                        </div>
                    ) : (
                        groupedMeetings.map((group) => (
                            <div key={group.date} className="space-y-2">
                                {/* Date separator */}
                                <div className="flex items-center justify-center">
                                    <span className="px-3 py-1 bg-purple-100 rounded-full text-xs text-purple-700 font-medium">
                                        {group.label}
                                    </span>
                                </div>

                                {/* Meetings in group */}
                                {group.meetings.map((meeting) => (
                                    <MeetingBubble
                                        key={meeting.id}
                                        meeting={meeting}
                                        cardId={cardId}
                                        onTranscriptionSaved={handleTranscriptionSaved}
                                    />
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}
