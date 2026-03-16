import { useState, useCallback } from 'react'
import { X, Sparkles, Loader2, CheckCircle, AlertCircle, RotateCcw, ChevronDown, ChevronUp, ArrowDownToLine, Replace, FileText, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBriefingIA, type BriefingStep } from '@/hooks/useBriefingIA'
import { supabase } from '@/lib/supabase'
import type { MergeConfig } from '@/hooks/useSubCards'
import AudioRecorder from './AudioRecorder'

interface BriefingIAModalProps {
  isOpen: boolean
  onClose: () => void
  cardId: string
  /** Pass card_type to detect sub-cards without extra query */
  cardType?: string | null
}

const STEP_LABELS: Record<BriefingStep, string> = {
  idle: '',
  uploading: 'Enviando áudio...',
  processing: 'Transcrevendo e analisando com IA...',
  done: 'Concluído!',
  error: 'Erro no processamento'
}

export default function BriefingIAModal({ isOpen, onClose, cardId, cardType }: BriefingIAModalProps) {
  const { step, result, process, reset } = useBriefingIA(cardId)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [showTranscription, setShowTranscription] = useState(false)

  // Sub-card merge config for Briefing IA
  const isSubCard = cardType === 'sub_card'
  const [subCardMergeConfig, setSubCardMergeConfig] = useState<{
    texto: 'replace' | 'append'
    viagem: 'replace' | 'append'
  }>({ texto: 'append', viagem: 'replace' })

  // Save merge_config to the sub-card when user changes it
  const updateSubCardMergeConfig = useCallback(async (
    group: 'texto' | 'viagem',
    mode: 'replace' | 'append'
  ) => {
    const newConfig = { ...subCardMergeConfig, [group]: mode }
    setSubCardMergeConfig(newConfig)

    // Persist to card's merge_config
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- merge_config pendente de regeneracao de types
      const { data } = await (supabase as any)
        .from('cards')
        .select('merge_config')
        .eq('id', cardId)
        .single()

      const current = (data?.merge_config as MergeConfig | null) || {
        texto: { copiar_pai: false, merge_mode: 'append' },
        viagem: { copiar_pai: false, merge_mode: 'replace' }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- merge_config pendente de regeneracao de types
      await (supabase as any)
        .from('cards')
        .update({
          merge_config: {
            ...current,
            [group]: { ...current[group], merge_mode: mode }
          }
        })
        .eq('id', cardId)
    } catch {
      // Non-critical — config will still be editable at merge time
    }
  }, [cardId, subCardMergeConfig])

  const handleAudioReady = useCallback((blob: Blob) => {
    setAudioBlob(blob)
  }, [])

  const handleProcess = useCallback(async () => {
    if (!audioBlob) return
    await process(audioBlob)
  }, [audioBlob, process])

  const handleNewAudio = useCallback(() => {
    reset()
    setAudioBlob(null)
    setShowTranscription(false)
  }, [reset])

  const handleClose = useCallback(() => {
    if (step === 'uploading' || step === 'processing') return // Don't close while processing
    reset()
    setAudioBlob(null)
    setShowTranscription(false)
    onClose()
  }, [step, reset, onClose])

  if (!isOpen) return null

  const isProcessing = step === 'uploading' || step === 'processing'
  const isDone = step === 'done'
  const isError = step === 'error'
  const isIdle = step === 'idle'
  const isSuccess = isDone && result?.status === 'success'
  const camposCount = result?.campos_extraidos?.length || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-amber-50 to-white border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-100 rounded-lg">
              <Sparkles className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Briefing IA</h3>
              <p className="text-xs text-slate-500">Grave ou envie um áudio do consultor</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              isProcessing ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
            )}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {/* State: Idle — Show AudioRecorder */}
          {isIdle && (
            <>
              <AudioRecorder onAudioReady={handleAudioReady} disabled={false} />

              {/* Sub-card: merge mode selector before processing */}
              {isSubCard && audioBlob && (
                <div className="mt-4 p-3 rounded-lg border border-orange-200 bg-orange-50 space-y-2.5">
                  <p className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Card de Alteração — como tratar os campos no merge?
                  </p>

                  {/* Texto group */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3 h-3 text-gray-500" />
                      <span className="text-xs text-gray-700 font-medium">Texto</span>
                      <span className="text-[10px] text-gray-400">(Obs + Briefing)</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => updateSubCardMergeConfig('texto', 'append')}
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                          subCardMergeConfig.texto === 'append'
                            ? 'bg-orange-100 border-orange-400 text-orange-800'
                            : 'bg-white border-gray-200 text-gray-500'
                        )}
                      >
                        <ArrowDownToLine className="w-2.5 h-2.5" />
                        Acrescentar
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSubCardMergeConfig('texto', 'replace')}
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                          subCardMergeConfig.texto === 'replace'
                            ? 'bg-orange-100 border-orange-400 text-orange-800'
                            : 'bg-white border-gray-200 text-gray-500'
                        )}
                      >
                        <Replace className="w-2.5 h-2.5" />
                        Substituir
                      </button>
                    </div>
                  </div>

                  {/* Viagem group */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-gray-500" />
                      <span className="text-xs text-gray-700 font-medium">Viagem</span>
                      <span className="text-[10px] text-gray-400">(Destinos, Orçamento...)</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => updateSubCardMergeConfig('viagem', 'append')}
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                          subCardMergeConfig.viagem === 'append'
                            ? 'bg-orange-100 border-orange-400 text-orange-800'
                            : 'bg-white border-gray-200 text-gray-500'
                        )}
                      >
                        <ArrowDownToLine className="w-2.5 h-2.5" />
                        Acrescentar
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSubCardMergeConfig('viagem', 'replace')}
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                          subCardMergeConfig.viagem === 'replace'
                            ? 'bg-orange-100 border-orange-400 text-orange-800'
                            : 'bg-white border-gray-200 text-gray-500'
                        )}
                      >
                        <Replace className="w-2.5 h-2.5" />
                        Substituir
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* State: Processing */}
          {isProcessing && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-900">
                  {STEP_LABELS[step]}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Isso pode levar até 30 segundos dependendo do tamanho do áudio
                </p>
              </div>

              {/* Progress steps */}
              <div className="w-full max-w-xs space-y-2 mt-2">
                <ProgressStep
                  label="Envio do áudio"
                  status={step === 'uploading' ? 'active' : 'done'}
                />
                <ProgressStep
                  label="Transcrição (Whisper)"
                  status={step === 'processing' ? 'active' : step === 'uploading' ? 'pending' : 'done'}
                />
                <ProgressStep
                  label="Análise IA e extração de campos"
                  status={step === 'processing' ? 'active' : 'pending'}
                />
              </div>
            </div>
          )}

          {/* State: Done (Success) */}
          {isDone && isSuccess && (
            <div className="space-y-4">
              {/* Success banner */}
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">Briefing gerado com sucesso!</p>
                  <p className="text-xs text-green-600">
                    {camposCount} campo{camposCount !== 1 ? 's' : ''} atualizado{camposCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Briefing text */}
              {result?.briefing_text && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Briefing Gerado
                  </h4>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed max-h-48 overflow-y-auto">
                    {result.briefing_text}
                  </div>
                </div>
              )}

              {/* Updated fields */}
              {camposCount > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Campos Atualizados ({camposCount})
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {result?.campos_extraidos?.map(campo => (
                      <span
                        key={campo}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 rounded-md text-xs text-green-700"
                      >
                        <CheckCircle className="h-3 w-3" />
                        {campo}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcription toggle */}
              {result?.transcription && (
                <div>
                  <button
                    onClick={() => setShowTranscription(!showTranscription)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showTranscription ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showTranscription ? 'Ocultar' : 'Ver'} transcrição
                  </button>
                  {showTranscription && (
                    <div className="mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 leading-relaxed max-h-32 overflow-y-auto">
                      {result.transcription}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* State: Done (No update) */}
          {isDone && !isSuccess && result?.status === 'no_update' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Nenhuma informação nova encontrada</p>
                  <p className="text-xs text-amber-600">
                    A IA não identificou dados novos para preencher no CRM
                  </p>
                </div>
              </div>

              {result?.briefing_text && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Briefing Gerado
                  </h4>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed max-h-48 overflow-y-auto">
                    {result.briefing_text}
                  </div>
                </div>
              )}

              {result?.transcription && (
                <div>
                  <button
                    onClick={() => setShowTranscription(!showTranscription)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showTranscription ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showTranscription ? 'Ocultar' : 'Ver'} transcrição
                  </button>
                  {showTranscription && (
                    <div className="mt-1.5 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 leading-relaxed max-h-32 overflow-y-auto">
                      {result.transcription}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* State: Error */}
          {isError && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Erro ao processar</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    {result?.error || 'Erro desconhecido. Tente novamente.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
          >
            {isDone || isError ? 'Fechar' : 'Cancelar'}
          </button>

          <div className="flex gap-2">
            {/* New audio button (after done/error) */}
            {(isDone || isError) && (
              <button
                onClick={handleNewAudio}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Novo Áudio
              </button>
            )}

            {/* Process button (idle state with audio ready) */}
            {isIdle && (
              <button
                onClick={handleProcess}
                disabled={!audioBlob}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all',
                  audioBlob
                    ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-sm'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                )}
              >
                <Sparkles className="h-4 w-4" />
                Processar com IA
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function ProgressStep({ label, status }: { label: string; status: 'pending' | 'active' | 'done' }) {
  return (
    <div className="flex items-center gap-2.5">
      {status === 'done' && (
        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
      )}
      {status === 'active' && (
        <Loader2 className="h-4 w-4 text-amber-500 animate-spin flex-shrink-0" />
      )}
      {status === 'pending' && (
        <div className="h-4 w-4 rounded-full border-2 border-slate-200 flex-shrink-0" />
      )}
      <span className={cn(
        'text-xs',
        status === 'active' ? 'text-slate-900 font-medium' : status === 'done' ? 'text-green-700' : 'text-slate-400'
      )}>
        {label}
      </span>
    </div>
  )
}
