import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const N8N_WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/briefing-ia'

export interface BriefingIAResult {
  status: 'success' | 'no_update' | 'error' | 'transcription_empty'
  briefing_text?: string
  campos_atualizados?: Record<string, unknown>
  campos_extraidos?: string[]
  transcription?: string
  message?: string
  error?: string
}

export type BriefingStep = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // Remove data:...;base64, prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Standalone function to process BriefingIA via n8n webhook.
 * Reusable outside the hook context (e.g., CreateCardModal post-creation flow).
 */
export type BriefingMode = 'novo' | 'atualizar'

export async function processBriefingIA(
  cardId: string,
  audioBlob: Blob,
  userId: string,
  mode: BriefingMode = 'atualizar'
): Promise<BriefingIAResult> {
  const base64 = await blobToBase64(audioBlob)

  if (base64.length < 100) {
    throw new Error('Áudio muito curto ou vazio')
  }

  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_id: cardId,
      audio_base64: base64,
      audio_mime_type: audioBlob.type || 'audio/webm',
      user_id: userId,
      mode
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Erro ${response.status}: ${errText}`)
  }

  return response.json()
}

export function useBriefingIA(cardId: string) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<BriefingStep>('idle')
  const [result, setResult] = useState<BriefingIAResult | null>(null)

  const process = useCallback(async (audioBlob: Blob, mode: BriefingMode = 'atualizar') => {
    setStep('uploading')
    setResult(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      setStep('processing')

      const data = await processBriefingIA(cardId, audioBlob, user.id, mode)
      setResult(data)

      if (data.status === 'success') {
        setStep('done')
        const count = data.campos_extraidos?.length || 0
        toast.success(`Briefing gerado! ${count} campo${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}`)
        queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
        queryClient.invalidateQueries({ queryKey: ['card', cardId] })
        queryClient.invalidateQueries({ queryKey: ['activity-feed', cardId] })
      } else if (data.status === 'transcription_empty') {
        setStep('error')
        toast.error('Não foi possível transcrever o áudio. Verifique a qualidade da gravação.')
      } else {
        setStep('done')
        toast.info('IA não encontrou informações novas no áudio')
      }
    } catch (error) {
      console.error('[BriefingIA] Erro:', error)
      setStep('error')
      setResult({ status: 'error', error: (error as Error).message })
      toast.error('Erro ao processar áudio com IA')
    }
  }, [cardId, queryClient])

  const reset = useCallback(() => {
    setStep('idle')
    setResult(null)
  }, [])

  return { step, result, process, reset }
}
