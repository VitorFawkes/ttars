/**
 * DesktopSection - Seção de proposta para desktop
 *
 * Dispatcher que roteia para o componente específico de cada tipo
 */

import type { ProposalSectionWithItems, ProposalItemWithOptions } from '@/types/proposals'
import { SECTION_TYPE_CONFIG } from '@/types/proposals'
import { cn } from '@/lib/utils'
import type { SelectionsMap } from '../shared/types'
import { DesktopHotelCard } from './items/DesktopHotelCard'
import { DesktopFlightCard } from './items/DesktopFlightCard'
import { DesktopExperienceCard } from './items/DesktopExperienceCard'
import { DesktopTransferCard } from './items/DesktopTransferCard'
import { DesktopInsuranceCard } from './items/DesktopInsuranceCard'

interface DesktopSectionProps {
  section: ProposalSectionWithItems
  selections: SelectionsMap
  onToggleItem: (itemId: string) => void
  onSelectItem: (sectionId: string, itemId: string) => void
  onSelectOption: (itemId: string, optionId: string) => void
  onChangeQuantity: (itemId: string, quantity: number) => void
}

export function DesktopSection({
  section,
  selections,
  onToggleItem,
  onSelectItem,
  onSelectOption,
  onChangeQuantity,
}: DesktopSectionProps) {
  const config = SECTION_TYPE_CONFIG[section.section_type] || SECTION_TYPE_CONFIG.custom
  const items = section.items || []

  if (items.length === 0) return null

  // Determina se é modo radio (múltiplos itens = escolha única)
  const isRadioMode = items.length >= 2

  // Renderiza item baseado no tipo
  const renderItem = (item: ProposalItemWithOptions) => {
    const selection = selections[item.id]
    const isSelected = selection?.selected || false
    const selectedOptionId = selection?.optionId
    const quantity = selection?.quantity || 1

    const commonProps = {
      key: item.id,
      item,
      isSelected,
      selectedOptionId,
      onSelect: () => isRadioMode
        ? onSelectItem(section.id, item.id)
        : onToggleItem(item.id),
      onSelectOption: (optionId: string) => onSelectOption(item.id, optionId),
      quantity,
      onChangeQuantity: (q: number) => onChangeQuantity(item.id, q),
      isRadioMode,
    }

    switch (item.item_type) {
      case 'hotel':
        return <DesktopHotelCard {...commonProps} />
      case 'flight':
        return (
          <DesktopFlightCard
            key={item.id}
            item={item}
            isSelected={isSelected}
            onSelect={() => isRadioMode
              ? onSelectItem(section.id, item.id)
              : onToggleItem(item.id)
            }
          />
        )
      case 'experience':
        return <DesktopExperienceCard {...commonProps} />
      case 'transfer':
        return <DesktopTransferCard {...commonProps} />
      case 'insurance':
        return <DesktopInsuranceCard {...commonProps} />
      default:
        return <FallbackCard key={item.id} item={item} isSelected={isSelected} />
    }
  }

  // Remove emoji do título
  const cleanTitle = section.title
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .trim()

  return (
    <section className="mb-8">
      {/* Header da seção */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900">
            {cleanTitle || config.defaultTitle}
          </h2>
          {isRadioMode && (
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
              Escolha uma opção
            </span>
          )}
        </div>
        {items.length > 1 && (
          <span className="text-sm text-slate-500">
            {items.length} opções disponíveis
          </span>
        )}
      </div>

      {/* Lista de itens */}
      <div className="space-y-4">
        {items.map(renderItem)}
      </div>
    </section>
  )
}

// Card fallback para tipos desconhecidos
function FallbackCard({
  item,
  isSelected
}: {
  item: ProposalItemWithOptions
  isSelected: boolean
}) {
  return (
    <div className={cn(
      "p-6 rounded-2xl border-2 transition-all",
      isSelected
        ? "border-emerald-500 bg-emerald-50/30"
        : "border-slate-200 bg-white"
    )}>
      <h3 className="font-semibold text-slate-800">{item.title}</h3>
      {item.base_price && (
        <p className="text-lg font-bold text-slate-700 mt-2">
          R$ {Number(item.base_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      )}
    </div>
  )
}
