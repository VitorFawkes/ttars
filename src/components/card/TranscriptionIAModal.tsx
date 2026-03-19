import { useState } from 'react'
import { X, FileText, Sparkles, CheckCircle, AlertCircle, Video, Calendar, Clock, ChevronDown, ChevronUp, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { processAIExtraction, type AIExtractionResult } from '@/hooks/useAIExtraction'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TranscriptionIAModalProps {
  isOpen: boolean
  onClose: () => void
  cardId: string
  cardTitle?: string
}

type Step = 'input' | 'processing' | 'done' | 'error'

function getDefaultDate(): string {
  return new Date().toISOString().split('T')[0]
}

function getDefaultTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export default function TranscriptionIAModal({ isOpen, onClose, cardId, cardTitle }: TranscriptionIAModalProps) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // Transcription
  const [transcricao, setTranscricao] = useState('')

  // Task creation toggle
  const [createTask, setCreateTask] = useState(true)

  // Meeting form fields (match SmartTaskModal)
  const [taskTitle, setTaskTitle] = useState('')
  const [meetingDate, setMeetingDate] = useState(getDefaultDate)
  const [meetingTime, setMeetingTime] = useState(getDefaultTime)
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [participantInput, setParticipantInput] = useState('')
  const [externalParticipants, setExternalParticipants] = useState<string[]>([])

  // Flow state
  const [step, setStep] = useState<Step>('input')
  const [result, setResult] = useState<AIExtractionResult | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const canProcess = transcricao.trim().length >= 50

  const handleClose = () => {
    setTranscricao('')
    setCreateTask(true)
    setTaskTitle('')
    setMeetingDate(getDefaultDate())
    setMeetingTime(getDefaultTime())
    setDurationMinutes(30)
    setParticipantInput('')
    setExternalParticipants([])
    setStep('input')
    setResult(null)
    setShowDetails(false)
    onClose()
  }

  const addParticipant = () => {
    const email = participantInput.trim().toLowerCase()
    if (email && !externalParticipants.includes(email)) {
      setExternalParticipants(prev => [...prev, email])
      setParticipantInput('')
    }
  }

  const removeParticipant = (email: string) => {
    setExternalParticipants(prev => prev.filter(p => p !== email))
  }

  const handleParticipantKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addParticipant()
    }
  }

  const handleProcess = async () => {
    if (!canProcess) return

    setStep('processing')
    setResult(null)

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) throw new Error('Usuário não autenticado')

      let meetingId: string | undefined

      // Create meeting task matching SmartTaskModal's exact payload
      if (createTask) {
        const title = taskTitle.trim() || `Reunião — ${cardTitle || 'Card'}`
        const dataVencimento = new Date(`${meetingDate}T${meetingTime}:00`).toISOString()
        const now = new Date().toISOString()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: any = {
          card_id: cardId,
          tipo: 'reuniao',
          titulo: title,
          descricao: '',
          data_vencimento: dataVencimento,
          responsavel_id: authUser.id,
          status: 'realizada',
          concluida: true,
          concluida_em: now,
          outcome: 'realizada',
          metadata: { duration_minutes: durationMinutes },
          transcricao,
          participantes_externos: externalParticipants.length > 0 ? externalParticipants : null,
          feedback: null,
          motivo_cancelamento: null,
          resultado: null,
          categoria_outro: null,
          created_by: authUser.id,
        }

        const { data: task, error } = await supabase
          .from('tarefas')
          .insert([payload])
          .select('id')
          .single()

        if (error) throw error
        meetingId = task.id
      }

      // Process with AI
      const aiResult = await processAIExtraction(cardId, 'meeting_transcript', authUser.id, {
        transcription: transcricao,
        meetingId
      })

      setResult(aiResult)

      if (aiResult.status === 'success') {
        const count = aiResult.campos_extraidos?.length || 0
        setStep('done')
        toast.success(`IA extraiu ${count} campo${count !== 1 ? 's' : ''} da transcrição!`)
        queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
        queryClient.invalidateQueries({ queryKey: ['card', cardId] })
        queryClient.invalidateQueries({ queryKey: ['activity-feed', cardId] })
        if (createTask) {
          queryClient.invalidateQueries({ queryKey: ['tasks', cardId] })
          queryClient.invalidateQueries({ queryKey: ['reunioes', cardId] })
        }
      } else if (aiResult.status === 'no_update') {
        setStep('done')
        toast.info('Nenhuma informação nova encontrada na transcrição')
      } else {
        setStep('error')
        toast.error('Erro ao processar transcrição')
      }
    } catch (error) {
      console.error('[TranscriptionIA] Erro:', error)
      setStep('error')
      setResult({ status: 'error', error: (error as Error).message })
      toast.error('Erro ao processar transcrição com IA')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={step === 'processing' ? undefined : handleClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-purple-50 to-white">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-purple-100">
              <FileText className="h-4 w-4 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Transcrição de Reunião
            </h3>
          </div>
          {step !== 'processing' && (
            <button onClick={handleClose} className="p-1 rounded-full hover:bg-black/5 transition-colors">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Step: Input */}
          {step === 'input' && (
            <>
              {/* Transcription textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Cole a transcrição da reunião
                </label>
                <textarea
                  value={transcricao}
                  onChange={(e) => setTranscricao(e.target.value)}
                  placeholder="Cole aqui a transcrição completa da reunião (Fireflies, Otter, Google Meet, etc.)"
                  rows={6}
                  className={cn(
                    "w-full px-4 py-3 rounded-lg border border-gray-200",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent",
                    "resize-none text-sm leading-relaxed",
                    "placeholder:text-gray-400"
                  )}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">
                  {transcricao.length} caracteres {transcricao.length > 0 && transcricao.length < 50 && '(mín. 50)'}
                </p>
              </div>

              {/* Create task toggle + form */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                <button
                  type="button"
                  onClick={() => setCreateTask(!createTask)}
                  className="flex items-center gap-3 w-full"
                >
                  <div className={cn(
                    "relative w-9 h-5 rounded-full transition-colors",
                    createTask ? "bg-purple-500" : "bg-gray-300"
                  )}>
                    <div className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                      createTask ? "left-[18px]" : "left-0.5"
                    )} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Criar tarefa de reunião</span>
                  </div>
                </button>

                {createTask && (
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    {/* Title */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
                      <input
                        type="text"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder={`Reunião — ${cardTitle || 'Card'}`}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm",
                          "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent",
                          "placeholder:text-gray-400"
                        )}
                      />
                    </div>

                    {/* Date, Time, Duration */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          <Calendar className="w-3 h-3 inline mr-1" />
                          Data
                        </label>
                        <input
                          type="date"
                          value={meetingDate}
                          onChange={(e) => setMeetingDate(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Hora
                        </label>
                        <input
                          type="time"
                          value={meetingTime}
                          onChange={(e) => setMeetingTime(e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Duração</label>
                        <select
                          value={durationMinutes}
                          onChange={(e) => setDurationMinutes(Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                        >
                          <option value={15}>15 min</option>
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>1h</option>
                          <option value={90}>1h30</option>
                          <option value={120}>2h</option>
                        </select>
                      </div>
                    </div>

                    {/* External Participants */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <Users className="w-3 h-3 inline mr-1" />
                        Participantes (e-mail)
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="email"
                          value={participantInput}
                          onChange={(e) => setParticipantInput(e.target.value)}
                          onKeyDown={handleParticipantKeyDown}
                          onBlur={() => { if (participantInput.trim()) addParticipant() }}
                          placeholder="email@exemplo.com"
                          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder:text-gray-400"
                        />
                        <button
                          type="button"
                          onClick={addParticipant}
                          disabled={!participantInput.trim()}
                          className="px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                        >
                          Adicionar
                        </button>
                      </div>
                      {externalParticipants.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {externalParticipants.map(email => (
                            <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-200">
                              {email}
                              <button onClick={() => removeParticipant(email)} className="hover:text-red-500 transition-colors">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-gray-400">
                      Será criada como "Realizada" com a transcrição vinculada.
                      Responsável: {user?.email || 'você'}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step: Processing */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-purple-100 flex items-center justify-center">
                  <Sparkles className="h-7 w-7 text-purple-600 animate-pulse" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-purple-300 border-t-transparent animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">
                  {createTask ? 'Criando reunião e analisando...' : 'Analisando transcrição...'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  A IA está extraindo informações da reunião
                </p>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && result && (
            <div className="space-y-4">
              {result.status === 'success' && (result.campos_extraidos?.length ?? 0) > 0 ? (
                <>
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">
                        IA extraiu {result.campos_extraidos!.length} campos!
                      </p>
                      {createTask && (
                        <p className="text-xs text-green-600">Tarefa de reunião criada</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Campos atualizados</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.campos_extraidos!.map((campo) => (
                        <span key={campo} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                          {campo}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Nenhuma informação nova encontrada</p>
                    <p className="text-xs text-amber-600">
                      A IA não identificou dados novos para preencher no CRM
                    </p>
                    {createTask && (
                      <p className="text-xs text-amber-600 mt-1">Tarefa de reunião foi criada mesmo assim</p>
                    )}
                  </div>
                </div>
              )}

              {/* Briefing text */}
              {result.briefing_text && (
                <div>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showDetails ? 'Ocultar' : 'Ver'} resumo gerado
                  </button>
                  {showDetails && (
                    <div className="mt-1.5 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 leading-relaxed max-h-32 overflow-y-auto">
                      {result.briefing_text}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step: Error */}
          {step === 'error' && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800">Erro ao processar</p>
                <p className="text-xs text-red-600">{result?.error || 'Tente novamente'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t bg-gray-50">
          {step === 'input' && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcess}
                disabled={!canProcess}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  canProcess
                    ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                <Sparkles className="h-4 w-4" />
                {createTask ? 'Criar e Processar com IA' : 'Processar com IA'}
              </button>
            </>
          )}
          {(step === 'done' || step === 'error') && (
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
