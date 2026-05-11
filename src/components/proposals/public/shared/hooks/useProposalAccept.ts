/**
 * useProposalAccept - Lógica de aceite da proposta
 *
 * Salva seleções do cliente, atualiza status da proposta,
 * e registra evento de aceite.
 */

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ProposalSectionWithItems } from '@/types/proposals'
import type { SelectionsMap } from '../types'
import { validateSelections } from './useProposalSelections'

interface UseProposalAcceptResult {
  isAccepting: boolean
  isAccepted: boolean
  error: string | null
  accept: (notes?: string) => Promise<boolean>
  reset: () => void
}

interface AcceptProposalParams {
  proposalId: string
  versionId: string
  sections: ProposalSectionWithItems[]
  selections: SelectionsMap
  total: number
  currency: string
}

/**
 * Hook para gerenciar aceite da proposta
 */
export function useProposalAccept({
  proposalId,
  versionId,
  sections,
  selections,
  total,
  currency,
}: AcceptProposalParams): UseProposalAcceptResult {
  const [isAccepting, setIsAccepting] = useState(false)
  const [isAccepted, setIsAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = useCallback(async (notes?: string): Promise<boolean> => {
    // Valida seleções
    const validation = validateSelections(sections, selections)
    if (!validation.isValid) {
      setError(validation.errors[0])
      return false
    }

    setIsAccepting(true)
    setError(null)

    try {
      // 1. Salva seleções do cliente
      const selectionsToSave = Object.entries(selections)
        .filter(([, sel]) => sel.selected)
        .map(([itemId, sel]) => ({
          proposal_id: proposalId,
          item_id: itemId,
          selected: true,
          option_id: sel.optionId || null,
          selection_metadata: {
            quantity: sel.quantity ?? 1,
            version_id: versionId,
          },
          selected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

      // Upsert seleções
      const { error: selectionsError } = await supabase
        .from('proposal_client_selections')
        .upsert(selectionsToSave, {
          onConflict: 'proposal_id,item_id',
        })

      if (selectionsError) {
        throw new Error('Erro ao salvar seleções: ' + selectionsError.message)
      }

      // 2. Atualiza status da proposta
      const { error: updateError } = await supabase
        .from('proposals')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          accepted_total: total,
          accepted_version_id: versionId,
        })
        .eq('id', proposalId)

      if (updateError) {
        throw new Error('Erro ao atualizar proposta: ' + updateError.message)
      }

      // 3. Registra evento de aceite
      await supabase
        .from('proposal_events')
        .insert({
          proposal_id: proposalId,
          event_type: 'proposal_accepted',
          payload: {
            total,
            currency,
            items_count: selectionsToSave.length,
            client_notes: notes || null,
            version_id: versionId,
          },
        })

      setIsAccepted(true)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao aceitar proposta'
      setError(message)
      return false
    } finally {
      setIsAccepting(false)
    }
  }, [proposalId, versionId, sections, selections, total, currency])

  const reset = useCallback(() => {
    setIsAccepting(false)
    setIsAccepted(false)
    setError(null)
  }, [])

  return {
    isAccepting,
    isAccepted,
    error,
    accept,
    reset,
  }
}

/**
 * Registra evento de visualização da proposta
 */
export async function trackProposalView(proposalId: string): Promise<void> {
  try {
    // Atualiza status para 'viewed' se ainda estiver 'sent'
    await supabase
      .from('proposals')
      .update({ status: 'viewed' })
      .eq('id', proposalId)
      .eq('status', 'sent')

    // Registra evento
    await supabase
      .from('proposal_events')
      .insert({
        proposal_id: proposalId,
        event_type: 'link_opened',
        payload: {
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          timestamp: new Date().toISOString(),
        },
      })
  } catch {
    // Silently fail - não queremos interromper a visualização
    console.warn('Failed to track proposal view')
  }
}
