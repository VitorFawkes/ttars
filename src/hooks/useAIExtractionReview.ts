import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { type AIExtractionSource, type AIExtractionOptions, type AIExtractionMeta } from './useAIExtraction'

// Field definition from n8n config
export interface FieldDef {
  key: string
  type: string
  section: string
  label?: string
  question?: string
  allowed_values?: string[]
  is_visible?: boolean
}

// Preview returned by dry_run
export interface ExtractionPreview {
  status: 'preview'
  card_id: string
  source: AIExtractionSource
  campos_extraidos: Record<string, unknown>
  campos_atuais: Record<string, unknown>
  briefing_text: string
  field_config: { fields: FieldDef[]; sections?: Record<string, string> }
  _meta: AIExtractionMeta | null
  fase: string
  transcription?: string
}

// Decision per field from the review modal
export interface FieldDecision {
  key: string
  accepted: boolean
  merge_mode: 'replace' | 'append'
  value?: unknown // edited value (for arrays: filtered items)
}

export type ReviewStep = 'idle' | 'extracting' | 'reviewing' | 'applying' | 'done' | 'error'

const N8N_WEBHOOK_URL = 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/ai-extraction-unified'

/**
 * Hook for two-phase AI extraction: extract (dry_run) → review → apply
 */
export function useAIExtractionReview(cardId: string) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<ReviewStep>('idle')
  const [preview, setPreview] = useState<ExtractionPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Store source + options for phase 2 (apply without dry_run)
  const [lastSource, setLastSource] = useState<AIExtractionSource>('whatsapp')
  const [lastOptions, setLastOptions] = useState<AIExtractionOptions>({})

  /**
   * Phase 1: Extract fields with dry_run=true → returns preview without applying
   */
  const extractPreview = useCallback(async (
    source: AIExtractionSource,
    options: AIExtractionOptions = {}
  ) => {
    setStep('extracting')
    setPreview(null)
    setError(null)
    setLastSource(source)
    setLastOptions(options)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      // Build body with dry_run=true
      const body: Record<string, unknown> = {
        card_id: cardId,
        source,
        user_id: user.id,
        mode: options.mode || 'atualizar',
        dry_run: true
      }

      if (source === 'briefing_audio' && options.audioBlob) {
        const base64 = await blobToBase64(options.audioBlob)
        if (base64.length < 100) throw new Error('Áudio muito curto ou vazio')
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

      const data = await response.json()

      // Handle non-preview responses (wrong_trip, no_update, error)
      if (data.status === 'wrong_trip') {
        setStep('done')
        const tripName = data._meta?.detected_trip || 'outra viagem'
        toast.warning(`Julia identificou que as mensagens são sobre ${tripName}. Nenhum campo foi atualizado.`)
        return
      }

      if (data.status === 'no_update' || data.status === 'transcription_empty') {
        setStep('done')
        toast.info('Nenhuma informação nova encontrada')
        return
      }

      if (data.status !== 'preview') {
        // Fallback: if workflow returned success directly (shouldn't happen with dry_run)
        setStep('done')
        toast.success('Julia atualizou os campos!')
        queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
        queryClient.invalidateQueries({ queryKey: ['card', cardId] })
        return
      }

      // Check if there are actual changes to review
      const hasChanges = Object.keys(data.campos_extraidos || {}).length > 0 || (data.briefing_text && data.briefing_text.length > 20)
      if (!hasChanges) {
        setStep('done')
        toast.info('Nenhuma informação nova encontrada')
        return
      }

      setPreview(data as ExtractionPreview)
      setStep('reviewing')
    } catch (err) {
      console.error('[AIExtractionReview] Erro na extração:', err)
      setError((err as Error).message)
      setStep('error')
      toast.error('Erro ao processar com IA')
    }
  }, [cardId, queryClient])

  /**
   * Phase 2: Apply approved fields
   * Calls the same webhook WITHOUT dry_run, but with only the approved campos
   */
  const applyDecisions = useCallback(async (
    decisions: FieldDecision[],
    approveBriefing: boolean
  ) => {
    if (!preview) return
    setStep('applying')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      // Build the filtered campos from decisions
      const acceptedFields = decisions.filter(d => d.accepted)
      if (acceptedFields.length === 0 && !approveBriefing) {
        setStep('done')
        toast.info('Nenhum campo selecionado')
        return
      }

      // Fetch current card data for merge
      const { data: cardData, error: fetchError } = await supabase
        .from('cards')
        .select('produto_data, briefing_inicial, pipeline_stages(fase)')
        .eq('id', cardId)
        .single()

      if (fetchError || !cardData) throw new Error('Erro ao buscar card')

      const currentProdutoData = (cardData.produto_data as Record<string, unknown>) || {}
      const currentBriefing = (cardData.briefing_inicial as Record<string, unknown>) || {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fase = (cardData.pipeline_stages as any)?.fase || 'SDR'
      const fields = preview.field_config.fields || []

      // Build section map
      const fieldSectionMap: Record<string, string> = {}
      const fieldTypeMap: Record<string, string> = {}
      for (const f of fields) {
        fieldSectionMap[f.key] = f.section
        fieldTypeMap[f.key] = f.type
      }

      // Apply decisions with merge logic
      const newProdutoData = { ...currentProdutoData }
      const newBriefing = { ...currentBriefing }

      for (const decision of acceptedFields) {
        const { key, merge_mode, value } = decision
        const finalValue = value !== undefined ? value : preview.campos_extraidos[key]
        const section = fieldSectionMap[key]
        const fieldType = fieldTypeMap[key]

        if (fase === 'SDR') {
          if (section === 'trip_info') {
            newBriefing[key] = applyMerge(key, finalValue, newBriefing[key], fieldType, merge_mode)
          } else if (section === 'observacoes') {
            const obs = (newBriefing.observacoes as Record<string, unknown>) || {}
            obs[key] = applyMerge(key, finalValue, obs[key], fieldType, merge_mode)
            newBriefing.observacoes = obs
          }
        } else if (fase === 'Planner') {
          if (section === 'trip_info') {
            newProdutoData[key] = applyMerge(key, finalValue, newProdutoData[key], fieldType, merge_mode)
          } else if (section === 'observacoes') {
            const obs = (newProdutoData.observacoes_criticas as Record<string, unknown>) || {}
            obs[key] = applyMerge(key, finalValue, obs[key], fieldType, merge_mode)
            newProdutoData.observacoes_criticas = obs
          }
        } else {
          if (section === 'trip_info') {
            newProdutoData[key] = applyMerge(key, finalValue, newProdutoData[key], fieldType, merge_mode)
          } else if (section === 'observacoes') {
            const obs = (newProdutoData.observacoes_pos_venda as Record<string, unknown>) || {}
            obs[key] = applyMerge(key, finalValue, obs[key], fieldType, merge_mode)
            newProdutoData.observacoes_pos_venda = obs
          }
        }
      }

      // Handle briefing_text
      if (approveBriefing && preview.briefing_text) {
        const obsKey = fase === 'SDR' ? 'observacoes' : fase === 'Planner' ? 'observacoes_criticas' : 'observacoes_pos_venda'
        const target = fase === 'SDR' ? newBriefing : newProdutoData
        const obs = (target[obsKey] as Record<string, unknown>) || {}
        const currentBriefingText = (obs.briefing as string) || ''
        obs.briefing = currentBriefingText
          ? currentBriefingText + '\n\n' + preview.briefing_text
          : preview.briefing_text
        target[obsKey] = obs

        // Also update resumo_consultor
        target.resumo_consultor = preview.briefing_text
        target.resumo_consultor_at = new Date().toISOString()
      }

      // Call the existing RPC
      const { error: rpcError } = await supabase.rpc('update_card_from_ai_extraction', {
        p_card_id: cardId,
        p_produto_data: newProdutoData as unknown as Record<string, never>,
        p_briefing_inicial: newBriefing as unknown as Record<string, never>
      })

      if (rpcError) throw new Error(`Erro ao atualizar card: ${rpcError.message}`)

      // Log activity
      await supabase.from('activities').insert({
        card_id: cardId,
        tipo: 'ai_extraction',
        descricao: `IA extraiu campos (${preview.source}: ${acceptedFields.length} campos aprovados)`,
        metadata: {
          campos_extraidos: acceptedFields.map(d => d.key),
          source: preview.source,
          reviewed: true
        },
        created_by: user.id
      })

      setStep('done')
      const count = acceptedFields.length
      const sourceLabel = preview.source === 'whatsapp' ? 'conversa' : preview.source === 'briefing_audio' ? 'áudio' : 'reunião'
      toast.success(`Julia atualizou ${count} campo${count !== 1 ? 's' : ''} da ${sourceLabel}!`)

      queryClient.invalidateQueries({ queryKey: ['card-detail', cardId] })
      queryClient.invalidateQueries({ queryKey: ['card', cardId] })
      queryClient.invalidateQueries({ queryKey: ['activity-feed', cardId] })
    } catch (err) {
      console.error('[AIExtractionReview] Erro ao aplicar:', err)
      setError((err as Error).message)
      setStep('error')
      toast.error('Erro ao aplicar campos')
    }
  }, [cardId, preview, queryClient])

  const reset = useCallback(() => {
    setStep('idle')
    setPreview(null)
    setError(null)
  }, [])

  return {
    step,
    preview,
    error,
    lastSource,
    lastOptions,
    extractPreview,
    applyDecisions,
    reset
  }
}

// ============================================================================
// Helpers
// ============================================================================

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

const TEXT_LIBRE_KEYS = ['briefing', 'observacoes', 'observacoes_criticas', 'observacoes_pos_venda']

/**
 * Simple merge logic based on user's explicit choice
 */
function applyMerge(
  key: string,
  newValue: unknown,
  currentValue: unknown,
  fieldType: string,
  mergeMode: 'replace' | 'append'
): unknown {
  // No current value → just set
  if (currentValue === null || currentValue === undefined || currentValue === '') {
    return newValue
  }

  if (mergeMode === 'replace') {
    return newValue
  }

  // Append mode
  // Text fields: concatenate
  if (TEXT_LIBRE_KEYS.includes(key) || fieldType === 'textarea' || fieldType === 'text') {
    const currentStr = typeof currentValue === 'string' ? currentValue.trim() : ''
    const newStr = typeof newValue === 'string' ? (newValue as string).trim() : ''
    if (!newStr) return currentValue
    if (!currentStr) return newStr
    if (currentStr.includes(newStr)) return currentValue
    return currentStr + '\n\n' + newStr
  }

  // Arrays: merge without duplicates
  if (Array.isArray(newValue) && Array.isArray(currentValue)) {
    const merged = [...currentValue]
    for (const item of newValue) {
      const normalized = typeof item === 'string' ? item.toLowerCase().trim() : item
      const exists = merged.some(m =>
        (typeof m === 'string' ? m.toLowerCase().trim() : m) === normalized
      )
      if (!exists) merged.push(item)
    }
    return merged
  }

  // Other fields in append mode: still replace (append doesn't make sense for numbers, booleans, etc.)
  return newValue
}
