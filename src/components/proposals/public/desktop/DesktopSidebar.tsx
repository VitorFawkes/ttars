/**
 * DesktopSidebar - Sidebar sticky com resumo da proposta
 *
 * Mostra itens selecionados, total e botão de aceite
 */

import type { ProposalSectionWithItems } from '@/types/proposals'
import { SECTION_TYPE_CONFIG } from '@/types/proposals'
import { ShoppingBag, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SelectionsMap } from '../shared/types'
import { formatPrice, type Currency } from '../shared/utils/priceUtils'

interface SelectedItemSummary {
  id: string
  title: string
  type: string
  price: number
  quantity: number
  optionLabel?: string
}

interface DesktopSidebarProps {
  sections: ProposalSectionWithItems[]
  selections: SelectionsMap
  selectedItems: SelectedItemSummary[]
  total: number
  currency: Currency
  travelers: number
  onAccept: () => void
  onRemoveItem?: (itemId: string) => void
}

export function DesktopSidebar({
  sections,
  selections,
  selectedItems,
  total,
  currency,
  travelers,
  onAccept,
  onRemoveItem,
}: DesktopSidebarProps) {
  const hasSelections = selectedItems.length > 0
  const pricePerPerson = travelers > 1 ? total / travelers : null

  // Agrupa itens por tipo
  const itemsByType = selectedItems.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = []
    acc[item.type].push(item)
    return acc
  }, {} as Record<string, SelectedItemSummary[]>)

  // Conta seções com itens não selecionados
  const incompleteSections = sections.filter(section => {
    const items = section.items || []
    if (items.length < 2) return false // Seção single não precisa de validação
    const hasSelection = items.some(item => selections[item.id]?.selected)
    return !hasSelection
  })

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden sticky top-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-5 w-5" />
            <span className="font-semibold">Resumo da Proposta</span>
          </div>
          {hasSelections && (
            <span className="px-2 py-1 bg-white/20 rounded-full text-sm">
              {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'itens'}
            </span>
          )}
        </div>
      </div>

      {/* Lista de itens selecionados */}
      <div className="max-h-[40vh] overflow-y-auto">
        {hasSelections ? (
          <div className="divide-y divide-slate-100">
            {Object.entries(itemsByType).map(([type, items]) => {
              const config = SECTION_TYPE_CONFIG[type as keyof typeof SECTION_TYPE_CONFIG] || SECTION_TYPE_CONFIG.custom
              return (
                <div key={type} className="p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">
                    {config.defaultTitle}
                  </p>
                  <div className="space-y-2">
                    {items.map(item => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 p-2 bg-slate-50 rounded-lg group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {item.title}
                          </p>
                          {item.optionLabel && (
                            <p className="text-xs text-slate-500">{item.optionLabel}</p>
                          )}
                          {item.quantity > 1 && (
                            <p className="text-xs text-slate-500">Qtd: {item.quantity}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                            {formatPrice(item.price, currency)}
                          </p>
                          {onRemoveItem && (
                            <button
                              onClick={() => onRemoveItem(item.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded transition-all"
                            >
                              <X className="h-3 w-3 text-slate-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-6 text-center">
            <ShoppingBag className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              Selecione os itens desejados para ver o resumo
            </p>
          </div>
        )}
      </div>

      {/* Avisos de seções incompletas */}
      {incompleteSections.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
          <p className="text-xs text-amber-700 font-medium">
            {incompleteSections.length} seç{incompleteSections.length === 1 ? 'ão precisa' : 'ões precisam'} de seleção:
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {incompleteSections.map(section => {
              const cleanTitle = section.title
                .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
                .trim()
              return (
                <span
                  key={section.id}
                  className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded"
                >
                  {cleanTitle}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="p-4 border-t border-slate-200 bg-emerald-50">
        <div className="flex items-end justify-between mb-1">
          <span className="text-sm text-emerald-700 font-medium">Total da viagem</span>
          <div className="text-right">
            <p className="text-2xl font-bold text-emerald-700">
              {formatPrice(total, currency)}
            </p>
            {pricePerPerson && (
              <p className="text-xs text-emerald-600">
                {formatPrice(pricePerPerson, currency)}/pessoa
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Botão de aceite */}
      <div className="p-4 border-t border-slate-100">
        <button
          onClick={onAccept}
          disabled={!hasSelections || incompleteSections.length > 0}
          className={cn(
            "w-full py-4 rounded-xl font-semibold text-lg transition-all",
            hasSelections && incompleteSections.length === 0
              ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          )}
        >
          {hasSelections ? (
            <span className="flex items-center justify-center gap-2">
              <Check className="h-5 w-5" />
              Aceitar Proposta
            </span>
          ) : (
            'Selecione os itens'
          )}
        </button>

        {incompleteSections.length > 0 && hasSelections && (
          <p className="text-xs text-center text-amber-600 mt-2">
            Complete todas as seleções para continuar
          </p>
        )}
      </div>
    </div>
  )
}
