import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const N8N_WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/ai-extraction-unified'

export type AIExtractionSource = 'whatsapp' | 'briefing_audio' | 'meeting_transcript'

export interface AIExtractionMeta {
  status?: 'wrong_trip'
  detected_trip?: string
  message?: string
  other_trips_mentioned?: string[]
  messages_about_this_trip?: number
  messages_about_other_trips?: number
}

export interface AIExtractionResult {
  status: 'success' | 'no_update' | 'wrong_trip' | 'error' | 'transcription_empty'
  source?: AIExtractionSource
  briefing_text?: string
  transcription?: string
  campos_atualizados?: Record<string, unknown>
  campos_extraidos?: string[]
  _meta?: AIExtractionMeta | null
  message?: string
  error?: string
  meeting_id?: string | null
}

export type AIExtractionStep = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export interface AIExtractionOptions {
  audioBlob?: Blob
  transcription?: string
  mode?: 'novo' | 'atualizar'
  meetingId?: string
}

/**
 * Standalone function to call the unified AI extraction webhook.
 */
export async function processAIExtraction(
  cardId: string,
  source: AIExtractionSource,
  userId: string,
  options: AIExtractionOptions = {}
): Promise<AIExtractionResult> {
  const body: Record<string, unknown> = {
    card_id: cardId,
    source,
    user_id: userId,
    mode: options.mode || 'atualizar'
  }

  if (source === 'briefing_audio' && options.audioBlob) {
    const base64 = await blobToBase64(options.audioBlob)
    if (base64.length < 100) {
      throw new Error('Áudio muito curto ou vazio')
    }
    body.audio_base64 = base64
    body.audio_mime_type = options.audioBlob.type || 'audio/webm'
  }

  if (source === 'meeting_transcript' && options.transcription) {
    body.transcription = options.transcription
    if (options.meetingId) body.meeting_id = options.meetingId
  }

  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Erro ${response.status}: ${errText}`)
  }

  return response.json()
}

/**
 * Hook for AI extraction — unified across all sources.
 * Handles toast feedback including trip-aware messages for WhatsApp.
 */
export function useAIExtraction(cardId: string) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<AIExtractionStep>('idle')
  const [result, setResult] = useState<AIExtractionResult | null>(null)

  const extract = useCallback(async (
    source: AIExtractionSource,
    options: AIExtractionOptions = {}
  ) => {
    setStep('uploading')
    setResult(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      setStep('processing')

      const data = await processAIExtraction(cardId, source, user.id, options)
      setResult(data)

      if (data.status === 'success') {
        setStep('done')
        const count = data.campos_extraidos?.length || 0
        const sourceLabel = source === 'whatsapp' ? 'conversa' : source === 'briefing_audio' ? 'áudio' : 'reunião'

        if (data._meta?.other_trips_mentioned?.length) {
          const ignored = data._meta.other_trips_mentioned.join(', ')
          toast.success(
            `Julia atualizou ${count} campo${count !== 1 ? 's' : ''} da ${sourceLabel}. Mensagens sobre ${ignored} foram ignoradas.`
          )
        } else {
          toast.success(
            `Julia atualizou ${count} campo${count !== 1 ? 's' : ''} da ${sourceLabel}!`
          )
        }

        queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
        queryClient.invalidateQueries({ queryKey: ['card', cardId] })
        queryClient.invalidateQueries({ queryKey: ['activity-feed', cardId] })
      } else if (data.status === 'wrong_trip') {
        setStep('done')
        const tripName = data._meta?.detected_trip || 'outra viagem'
        toast.warning(
          `Julia identificou que as mensagens são sobre ${tripName}. Nenhum campo foi atualizado.`
        )
      } else if (data.status === 'transcription_empty') {
        setStep('error')
        toast.error('Não foi possível transcrever o áudio. Verifique a qualidade da gravação.')
      } else {
        setStep('done')
        toast.info('Nenhuma informação nova encontrada')
      }
    } catch (error) {
      console.error('[AIExtraction] Erro:', error)
      setStep('error')
      setResult({ status: 'error', error: (error as Error).message })
      toast.error('Erro ao processar com IA')
    }
  }, [cardId, queryClient])

  const reset = useCallback(() => {
    setStep('idle')
    setResult(null)
  }, [])

  return { step, result, extract, reset }
}
