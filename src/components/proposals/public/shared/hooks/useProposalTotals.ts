/**
 * useProposalTotals - Calcula totais da proposta
 *
 * Soma preços dos itens selecionados, considerando opções e quantidades.
 */

import { useMemo } from 'react'
import type { ProposalSectionWithItems } from '@/types/proposals'
import type { SelectionsMap } from '../types'
import { convertCurrency, type Currency } from '../utils/priceUtils'

// Readers para calcular preços específicos
import { readHotelData } from '../readers/readHotelData'
import { readFlightData } from '../readers/readFlightData'
import { readExperienceData } from '../readers/readExperienceData'
import { readTransferData } from '../readers/readTransferData'
import { readInsuranceData } from '../readers/readInsuranceData'
import { readCruiseData } from '../readers/readCruiseData'

interface UseProposalTotalsResult {
  totalPrimary: number
  totalSecondary: number
  totalCost: number
  totalReceita: number
  marginPercent: number
  primaryCurrency: Currency
  secondaryCurrency: Currency
  itemsCount: number
  selectedItemsCount: number
}

/**
 * Hook para calcular totais da proposta
 */
export function useProposalTotals(
  sections: ProposalSectionWithItems[],
  selections: SelectionsMap,
  primaryCurrency: Currency = 'BRL',
  secondaryCurrency: Currency = 'USD'
): UseProposalTotalsResult {
  return useMemo(() => {
    let totalPrimary = 0
    let totalCost = 0
    let itemsCount = 0
    let selectedItemsCount = 0

    sections.forEach(section => {
      const items = section.items || []

      items.forEach(item => {
        itemsCount++

        const selection = selections[item.id]
        if (!selection?.selected) return

        selectedItemsCount++

        // Calcula preço de venda do item
        const itemPrice = calculateItemPrice(item, selection)
        totalPrimary += itemPrice

        // Calcula custo do fornecedor
        const itemCost = Number((item as any).supplier_cost) || 0
        if (itemCost > 0) {
          const quantity = selection.quantity ?? 1
          totalCost += itemCost * quantity
        }
      })
    })

    // Converte para moeda secundária
    const totalSecondary = convertCurrency(totalPrimary, primaryCurrency, secondaryCurrency)

    // Receita e margem
    const totalReceita = totalPrimary - totalCost
    const marginPercent = totalPrimary > 0
      ? Math.round((totalReceita / totalPrimary) * 10000) / 100
      : 0

    return {
      totalPrimary,
      totalSecondary,
      totalCost,
      totalReceita,
      marginPercent,
      primaryCurrency,
      secondaryCurrency,
      itemsCount,
      selectedItemsCount,
    }
  }, [sections, selections, primaryCurrency, secondaryCurrency])
}

/**
 * Calcula preço de um item específico
 */
function calculateItemPrice(
  item: { item_type: string; base_price: number; rich_content: unknown; options?: Array<{ id: string; price_delta: number }> },
  selection: { selected: boolean; optionId?: string; quantity?: number }
): number {
  const quantity = selection.quantity ?? 1
  let basePrice = 0
  let optionDelta = 0

  // Tenta ler preço do reader específico
  switch (item.item_type) {
    case 'hotel': {
      const data = readHotelData(item as never)
      basePrice = data?.totalPrice ?? Number(item.base_price) ?? 0
      break
    }
    case 'flight': {
      const data = readFlightData(item as never)
      basePrice = data?.totalPrice ?? Number(item.base_price) ?? 0
      // Voos não têm quantity
      return basePrice
    }
    case 'experience': {
      const data = readExperienceData(item as never)
      basePrice = data?.totalPrice ?? Number(item.base_price) ?? 0
      break
    }
    case 'transfer': {
      const data = readTransferData(item as never)
      basePrice = data?.price ?? Number(item.base_price) ?? 0
      break
    }
    case 'insurance': {
      const data = readInsuranceData(item as never)
      basePrice = data?.totalPrice ?? Number(item.base_price) ?? 0
      break
    }
    default: {
      // Tenta cruzeiro ou usa base_price
      const cruiseData = readCruiseData(item as never)
      if (cruiseData) {
        basePrice = cruiseData.totalPrice
      } else {
        basePrice = Number(item.base_price) ?? 0
      }
    }
  }

  // Adiciona delta da opção selecionada
  if (selection.optionId && item.options) {
    const selectedOption = item.options.find(opt => opt.id === selection.optionId)
    if (selectedOption) {
      optionDelta = Number(selectedOption.price_delta) ?? 0
    }
  }

  // Hotéis: preço já inclui noites, quantity é extra (quartos)
  // Outros: quantity multiplica o total
  if (item.item_type === 'hotel') {
    // Para hotéis, base já é por noite * noites
    // Se quantity > 1, significa mais quartos
    return (basePrice + optionDelta * quantity) * quantity
  }

  return (basePrice + optionDelta) * quantity
}

/**
 * Retorna resumo dos itens selecionados para exibição
 */
export function getSelectedItemsSummary(
  sections: ProposalSectionWithItems[],
  selections: SelectionsMap
): Array<{
  id: string
  title: string
  type: string
  price: number
  quantity: number
  optionLabel?: string
}> {
  const summary: Array<{
    id: string
    title: string
    type: string
    price: number
    quantity: number
    optionLabel?: string
  }> = []

  sections.forEach(section => {
    const items = section.items || []

    items.forEach(item => {
      const selection = selections[item.id]
      if (!selection?.selected) return

      const quantity = selection.quantity ?? 1
      const price = calculateItemPrice(
        { item_type: item.item_type, base_price: item.base_price, rich_content: item.rich_content, options: item.options },
        selection
      )

      let optionLabel: string | undefined
      if (selection.optionId && item.options) {
        const opt = item.options.find(o => o.id === selection.optionId)
        optionLabel = opt?.option_label
      }

      summary.push({
        id: item.id,
        title: item.title,
        type: item.item_type,
        price,
        quantity,
        optionLabel,
      })
    })
  })

  return summary
}
