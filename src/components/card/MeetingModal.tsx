import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { X, Video, Calendar, Clock, FileText, Save, MapPin, MessageSquare, Sparkles, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const N8N_WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/transcript-process'

interface Reuniao {
    id: string
    card_id: string
    titulo: string
    data_inicio: string
    data_fim: string | null
    local: string | null
    notas: string | null
    status: string
    transcricao: string | null
}

interface MeetingModalProps {
    isOpen: boolean
    onClose: () => void
    cardId: string
    meeting?: Reuniao | null
    userId?: string
}

export default function MeetingModal({ isOpen, onClose, cardId, meeting, userId }: MeetingModalProps) {
    const queryClient = useQueryClient()
    const isEditing = !!meeting

    const [titulo, setTitulo] = useState('')
    const [dataInicio, setDataInicio] = useState('')
    const [horaInicio, setHoraInicio] = useState('')
    const [duracao, setDuracao] = useState('')
    const [local, setLocal] = useState('')
    const [notas, setNotas] = useState('')
    const [transcricao, setTranscricao] = useState('')
    const [status, setStatus] = useState('agendada')
    const [isProcessingAI, setIsProcessingAI] = useState(false)
    const [aiResult, setAiResult] = useState<{ status: string; campos_extraidos?: string[] } | null>(null)

    // Reset form when modal opens/closes or meeting changes
    useEffect(() => {
        setAiResult(null)
        setIsProcessingAI(false)

        if (isOpen && meeting) {
            setTitulo(meeting.titulo || '')
            const inicio = new Date(meeting.data_inicio)
            setDataInicio(meeting.data_inicio.split('T')[0])
            setHoraInicio(inicio.toTimeString().slice(0, 5))
            if (meeting.data_fim) {
                const fim = new Date(meeting.data_fim)
                const diff = Math.round((fim.getTime() - inicio.getTime()) / 60000)
                setDuracao(diff.toString())
            } else {
                setDuracao('')
            }
            setLocal(meeting.local || '')
            setNotas(meeting.notas || '')
            setTranscricao(meeting.transcricao || '')
            setStatus(meeting.status || 'agendada')
        } else if (isOpen && !meeting) {
            setTitulo('')
            setDataInicio(new Date().toISOString().split('T')[0])
            setHoraInicio('10:00')
            setDuracao('30')
            setLocal('')
            setNotas('')
            setTranscricao('')
            setStatus('agendada')
        }
    }, [isOpen, meeting])

    // Process transcription with AI
    const processTranscriptionWithAI = async (meetingId: string, transcriptionText: string) => {
        if (!transcriptionText || transcriptionText.trim().length < 50) {
            return null // Transcrição muito curta para processar
        }

        setIsProcessingAI(true)
        setAiResult(null)

        try {
            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    card_id: cardId,
                    meeting_id: meetingId,
                    transcription: transcriptionText
                })
            })

            if (!response.ok) {
                throw new Error('Erro ao processar transcrição')
            }

            const result = await response.json()
            // Normaliza: workflow pode retornar campos_extraidos (array) ou campos_atualizados (object)
            const camposRaw = result.campos_extraidos || result.campos_atualizados
            const campos: string[] = Array.isArray(camposRaw) ? camposRaw : (camposRaw ? Object.keys(camposRaw) : [])
            setAiResult({ ...result, campos_extraidos: campos })

            if (result.status === 'success' && campos.length > 0) {
                toast.success(`IA extraiu ${campos.length} campos!`)
                // Invalidar cache do card para mostrar dados atualizados
                queryClient.invalidateQueries({ queryKey: ['card', cardId] })
            } else if (result.status === 'no_update' || campos.length === 0) {
                toast.info('IA não encontrou novas informações na transcrição')
            }

            return result
        } catch (error) {
            console.error('Erro ao processar com IA:', error)
            toast.error('Erro ao processar transcrição com IA')
            return null
        } finally {
            setIsProcessingAI(false)
        }
    }

    // Save mutation
    const saveMutation = useMutation({
        mutationFn: async () => {
            const dataInicioFull = `${dataInicio}T${horaInicio}:00`
            let dataFim = null
            if (duracao) {
                const inicio = new Date(dataInicioFull)
                const fim = new Date(inicio.getTime() + parseInt(duracao) * 60000)
                dataFim = fim.toISOString()
            }

            const payload = {
                card_id: cardId,
                titulo: titulo || 'Reunião',
                data_inicio: dataInicioFull,
                data_fim: dataFim,
                local: local || null,
                notas: notas || null,
                transcricao: transcricao || null,
                status,
                created_by: userId
            }

            let meetingId: string

            if (isEditing && meeting) {
                const { error } = await supabase
                    .from('reunioes')
                    .update(payload)
                    .eq('id', meeting.id)
                if (error) throw error
                meetingId = meeting.id
            } else {
                const { data, error } = await supabase
                    .from('reunioes')
                    .insert(payload)
                    .select('id')
                    .single()
                if (error) throw error
                meetingId = data.id
            }

            // Se tem transcrição, processar com IA automaticamente
            if (transcricao && transcricao.trim().length >= 50) {
                await processTranscriptionWithAI(meetingId, transcricao)
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reunioes', cardId] })
            onClose()
        }
    })

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-purple-50 to-white">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-full bg-purple-100">
                            <Video className="h-4 w-4 text-purple-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            {isEditing ? 'Editar Reunião' : 'Nova Reunião'}
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 transition-colors">
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Título da Reunião
                        </label>
                        <Input
                            type="text"
                            value={titulo}
                            onChange={(e) => setTitulo(e.target.value)}
                            placeholder="Ex: Briefing Inicial, Follow-up..."
                        />
                    </div>

                    {/* Date, Time and Duration */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                                Data
                            </label>
                            <Input
                                type="date"
                                value={dataInicio}
                                onChange={(e) => setDataInicio(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                <Clock className="w-3.5 h-3.5 inline mr-1" />
                                Hora
                            </label>
                            <Input
                                type="time"
                                value={horaInicio}
                                onChange={(e) => setHoraInicio(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Duração (min)
                            </label>
                            <Input
                                type="number"
                                value={duracao}
                                onChange={(e) => setDuracao(e.target.value)}
                                placeholder="30"
                            />
                        </div>
                    </div>

                    {/* Local */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            <MapPin className="w-3.5 h-3.5 inline mr-1" />
                            Local (opcional)
                        </label>
                        <Input
                            type="text"
                            value={local}
                            onChange={(e) => setLocal(e.target.value)}
                            placeholder="Google Meet, Zoom, Presencial..."
                        />
                    </div>

                    {/* Status */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Status
                        </label>
                        <div className="flex gap-2">
                            {['agendada', 'realizada', 'cancelada'].map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setStatus(s)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                                        status === s
                                            ? s === 'realizada' ? "bg-green-500 text-white"
                                                : s === 'cancelada' ? "bg-red-500 text-white"
                                                    : "bg-blue-500 text-white"
                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    )}
                                >
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notas */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            <MessageSquare className="w-3.5 h-3.5 inline mr-1" />
                            Notas (opcional)
                        </label>
                        <textarea
                            value={notas}
                            onChange={(e) => setNotas(e.target.value)}
                            placeholder="Observações sobre a reunião..."
                            rows={2}
                            className={cn(
                                "w-full px-4 py-3 rounded-lg border border-gray-200",
                                "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent",
                                "resize-none text-sm leading-relaxed",
                                "placeholder:text-gray-400"
                            )}
                        />
                    </div>

                    {/* Transcription */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            <FileText className="w-3.5 h-3.5 inline mr-1" />
                            Transcrição
                        </label>
                        <textarea
                            value={transcricao}
                            onChange={(e) => {
                                setTranscricao(e.target.value)
                                setAiResult(null) // Reset AI result when transcription changes
                            }}
                            placeholder="Cole aqui a transcrição da reunião..."
                            rows={6}
                            className={cn(
                                "w-full px-4 py-3 rounded-lg border border-gray-200",
                                "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent",
                                "resize-none text-sm leading-relaxed",
                                "placeholder:text-gray-400"
                            )}
                        />
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-gray-400">
                                {transcricao.length > 0 ? `${transcricao.length} caracteres` : 'Cole a transcrição da reunião'}
                            </p>
                            {isEditing && meeting && transcricao.length >= 50 && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => processTranscriptionWithAI(meeting.id, transcricao)}
                                    disabled={isProcessingAI}
                                    className="text-xs h-7"
                                >
                                    {isProcessingAI ? (
                                        <>
                                            <span className="animate-spin h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full mr-1" />
                                            Processando...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-3 w-3 mr-1" />
                                            Processar com IA
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>

                        {/* AI Result feedback */}
                        {aiResult && (
                            <div className={cn(
                                "mt-2 p-3 rounded-lg text-sm flex items-start gap-2",
                                aiResult.status === 'success'
                                    ? "bg-green-50 text-green-700 border border-green-200"
                                    : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                            )}>
                                {aiResult.status === 'success' ? (
                                    <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                )}
                                <div>
                                    {aiResult.status === 'success' ? (
                                        <>
                                            <p className="font-medium">IA extraiu {aiResult.campos_extraidos?.length || 0} campos!</p>
                                            {aiResult.campos_extraidos && aiResult.campos_extraidos.length > 0 && (
                                                <p className="text-xs mt-1 opacity-80">
                                                    Campos: {aiResult.campos_extraidos.join(', ')}
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <p>Nenhuma informação nova encontrada na transcrição</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t bg-gray-50">
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                        className="bg-purple-600 hover:bg-purple-700"
                    >
                        {saveMutation.isPending ? (
                            <>
                                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-2" />
                                {isEditing ? 'Salvar' : 'Criar Reunião'}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
