/**
 * useProposalSelections - Gerencia estado de seleções do cliente
 *
 * Controla quais itens estão selecionados, qual opção de cada item,
 * e a quantidade (para hotéis).
 */

import { useState, useCallback, useMemo } from 'react'
import type { ProposalSectionWithItems, ProposalItemWithOptions } from '@/types/proposals'
import type { SelectionsMap } from '../types'

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
  // Inicializa seleções baseado nas seções e itens
  const initialSelections = useMemo(() => {
    const selections: SelectionsMap = {}

    sections.forEach(section => {
      const items = section.items || []

      // Detecta modo de seleção
      const isSelectable = items.length >= 2
      const allOptional = items.every(item => item.is_optional)

      items.forEach((item, idx) => {
        if (isSelectable) {
          // Modo radio: seleciona primeiro ou is_default_selected
          const shouldSelect = idx === 0 || item.is_default_selected
          selections[item.id] = {
            selected: shouldSelect,
            quantity: 1,
          }
        } else if (allOptional || item.is_optional) {
          // Modo toggle: usa is_default_selected
          selections[item.id] = {
            selected: item.is_default_selected ?? false,
            quantity: 1,
          }
        } else {
          // Item obrigatório único: sempre selecionado
          selections[item.id] = {
            selected: true,
            quantity: 1,
          }
        }
      })
    })

    return selections
  }, [sections])

  const [selections, setSelections] = useState<SelectionsMap>(initialSelections)

  // Mapa de seção -> itens para seleção exclusiva
  const sectionToItemsMap = useMemo(() => {
    const map = new Map<string, ProposalItemWithOptions[]>()
    sections.forEach(section => {
      map.set(section.id, section.items || [])
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
   * Seleciona item de forma exclusiva na seção (para modo radio)
   */
  const selectItem = useCallback((sectionId: string, itemId: string) => {
    const sectionItems = sectionToItemsMap.get(sectionId) || []

    // Se seção tem 2+ itens, é seleção exclusiva
    if (sectionItems.length >= 2) {
      setSelections(prev => {
        const newSelections = { ...prev }

        // Desmarca todos os outros da seção
        sectionItems.forEach(item => {
          if (item.id !== itemId) {
            newSelections[item.id] = {
              ...newSelections[item.id],
              selected: false,
            }
          }
        })

        // Marca o selecionado
        newSelections[itemId] = {
          ...newSelections[itemId],
          selected: true,
        }

        return newSelections
      })
    } else {
      // Single item, apenas toggle
      toggleItem(itemId)
    }
  }, [sectionToItemsMap, toggleItem])

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
 * Valida se todas as seleções obrigatórias foram feitas
 */
export function validateSelections(
  sections: ProposalSectionWithItems[],
  selections: SelectionsMap
): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  sections.forEach(section => {
    const items = section.items || []

    // Seções com 2+ itens requerem uma seleção
    if (items.length >= 2) {
      const hasSelection = items.some(item => selections[item.id]?.selected)
      if (!hasSelection) {
        errors.push(`Selecione uma opção em "${section.title}"`)
      }
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
  }
}
