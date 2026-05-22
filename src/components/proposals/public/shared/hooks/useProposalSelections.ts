/**
 * useProposalSelections - Gerencia estado de seleções do cliente
 *
 * Controla quais itens estão selecionados, qual opção de cada item,
 * e a quantidade (para hotéis).
 */

import { useState, useCallback, useMemo } from 'react'
import type { ProposalSectionWithItems, ProposalItemWithOptions } from '@/types/proposals'
import type { SelectionsMap } from '../types'
import { resolveSelectionMode } from '../sectionMode'

interface UseProposalSelectionsResult {
  selections: SelectionsMap
  toggleItem: (itemId: string) => void
  selectItem: (sectionId: string, itemId: string) => void
  selectOption: (itemId: string, optionId: string) => void
  changeQuantity: (itemId: string, quantity: number) => void
  isItemSelected: (itemId: string) => boolean
  getSelectedOption: (itemId: string) => string | undefined
  getQuantity: (itemId: string) => number
  resetSelections: () => void
}

/**
 * Hook para gerenciar seleções de itens na proposta
 */
export function useProposalSelections(
  sections: ProposalSectionWithItems[]
): UseProposalSelectionsResult {
  // Inicializa seleções baseado no modo de seleção configurado por seção
  const initialSelections = useMemo(() => {
    const selections: SelectionsMap = {}

    sections.forEach(section => {
      const items = section.items || []
      const mode = resolveSelectionMode(section)

      // Pra modo radio (pick_one_required), marca EXATAMENTE 1 item:
      // o primeiro com is_default_selected=true, ou o primeiro item da lista.
      // (Os items todos vêm com is_default_selected=true do banco — não dá
      // pra usar como sinal de "qual marcar" no modo radio.)
      const radioDefaultIndex = mode === 'pick_one_required'
        ? Math.max(0, items.findIndex(it => it.is_default_selected))
        : -1

      items.forEach((item, idx) => {
        if (mode === 'all_included') {
          // Todos sempre marcados, sem escolha do cliente
          selections[item.id] = { selected: true, quantity: 1 }
        } else if (mode === 'pick_one_required') {
          // Radio: marca APENAS o item escolhido como default
          selections[item.id] = { selected: idx === radioDefaultIndex, quantity: 1 }
        } else if (mode === 'pick_one_or_more') {
          // Checkbox com mín 1: marca o que vier como default; se nenhum, marca o primeiro
          const anyDefault = items.some(it => it.is_default_selected)
          const shouldSelect = anyDefault ? !!item.is_default_selected : idx === 0
          selections[item.id] = { selected: shouldSelect, quantity: 1 }
        } else {
          // pick_any_optional: respeita is_default_selected
          selections[item.id] = {
            selected: !!item.is_default_selected,
            quantity: 1,
          }
        }
      })
    })

    return selections
  }, [sections])

  const [selections, setSelections] = useState<SelectionsMap>(initialSelections)

  // Mapa de seção -> (itens, modo) para seleção exclusiva
  const sectionInfo = useMemo(() => {
    const map = new Map<string, { items: ProposalItemWithOptions[]; mode: ReturnType<typeof resolveSelectionMode> }>()
    sections.forEach(section => {
      map.set(section.id, {
        items: section.items || [],
        mode: resolveSelectionMode(section),
      })
    })
    return map
  }, [sections])

  /**
   * Toggle item (para itens opcionais)
   */
  const toggleItem = useCallback((itemId: string) => {
    setSelections(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        selected: !prev[itemId]?.selected,
      },
    }))
  }, [])

  /**
   * Seleciona item respeitando o modo da seção.
   * - pick_one_required: radio (desmarca os outros)
   * - pick_one_or_more / pick_any_optional: checkbox (só toggle do alvo)
   * - all_included: sempre marcado, click é no-op
   */
  const selectItem = useCallback((sectionId: string, itemId: string) => {
    const info = sectionInfo.get(sectionId)
    if (!info) return
    const { items, mode } = info

    if (mode === 'all_included') {
      return // sem ação — todos permanecem marcados
    }

    if (mode === 'pick_one_required') {
      // Radio exclusivo: marca este e desmarca os outros
      setSelections(prev => {
        const next = { ...prev }
        items.forEach(item => {
          next[item.id] = {
            ...next[item.id],
            selected: item.id === itemId,
          }
        })
        return next
      })
      return
    }

    // pick_one_or_more / pick_any_optional → toggle simples
    toggleItem(itemId)
  }, [sectionInfo, toggleItem])

  /**
   * Seleciona opção de um item
   */
  const selectOption = useCallback((itemId: string, optionId: string) => {
    setSelections(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        optionId,
      },
    }))
  }, [])

  /**
   * Altera quantidade de um item
   */
  const changeQuantity = useCallback((itemId: string, quantity: number) => {
    const validQuantity = Math.max(1, Math.floor(quantity))
    setSelections(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        quantity: validQuantity,
      },
    }))
  }, [])

  /**
   * Verifica se item está selecionado
   */
  const isItemSelected = useCallback((itemId: string): boolean => {
    return selections[itemId]?.selected ?? false
  }, [selections])

  /**
   * Retorna opção selecionada de um item
   */
  const getSelectedOption = useCallback((itemId: string): string | undefined => {
    return selections[itemId]?.optionId
  }, [selections])

  /**
   * Retorna quantidade de um item
   */
  const getQuantity = useCallback((itemId: string): number => {
    return selections[itemId]?.quantity ?? 1
  }, [selections])

  /**
   * Reseta seleções para estado inicial
   */
  const resetSelections = useCallback(() => {
    setSelections(initialSelections)
  }, [initialSelections])

  return {
    selections,
    toggleItem,
    selectItem,
    selectOption,
    changeQuantity,
    isItemSelected,
    getSelectedOption,
    getQuantity,
    resetSelections,
  }
}

/**
 * Valida se todas as seleções obrigatórias foram feitas baseado no modo
 * de seleção configurado por seção.
 *
 * pick_one_required / pick_one_or_more → exige pelo menos 1 selecionado.
 * pick_any_optional / all_included / auto-com-1-item → sempre ok.
 */
export function validateSelections(
  sections: ProposalSectionWithItems[],
  selections: SelectionsMap
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  sections.forEach(section => {
    const items = section.items || []
    if (items.length === 0) return
    const mode = resolveSelectionMode(section)

    if (mode === 'pick_one_required' || mode === 'pick_one_or_more') {
      const hasSelection = items.some(item => selections[item.id]?.selected)
      if (!hasSelection) {
        const label = mode === 'pick_one_required'
          ? `Selecione 1 opção em "${section.title}"`
          : `Selecione pelo menos 1 item em "${section.title}"`
        errors.push(label)
      }
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
  }
}
