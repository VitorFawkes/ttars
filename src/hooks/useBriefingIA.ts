import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { processAIExtraction, type AIExtractionResult } from './useAIExtraction'

export type BriefingIAResult = AIExtractionResult

export type BriefingStep = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export type BriefingMode = 'novo' | 'atualizar'

/**
 * Standalone function to process BriefingIA via unified n8n webhook.
 * Reusable outside the hook context (e.g., CreateCardModal post-creation flow).
 */
export async function processBriefingIA(
  cardId: string,
  audioBlob: Blob,
  userId: string,
  mode: BriefingMode = 'atualizar'
): Promise<BriefingIAResult> {
  return processAIExtraction(cardId, 'briefing_audio', userId, {
    audioBlob,
    mode
  })
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
