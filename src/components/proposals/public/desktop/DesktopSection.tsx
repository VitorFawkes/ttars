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
import { resolveSelectionMode } from '../shared/sectionMode'

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

  // Modo efetivo de seleção configurado pelo consultor (ou 'auto' que decide
  // pelo número de items, comportamento histórico).
  const effectiveMode = resolveSelectionMode(section)
  const isRadioMode = effectiveMode === 'pick_one_required'

  // Renderiza item baseado no tipo.
  // IMPORTANTE: `key` precisa ir DIRETO no JSX (não via spread) pra evitar
  // warning do React e garantir reconciliação correta.
  const renderItem = (item: ProposalItemWithOptions) => {
    const selection = selections[item.id]
    const isSelected = selection?.selected || false
    const selectedOptionId = selection?.optionId
    const quantity = selection?.quantity || 1

    const commonProps = {
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
        return <DesktopHotelCard key={item.id} {...commonProps} />
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
        return <DesktopExperienceCard key={item.id} {...commonProps} />
      case 'transfer':
        return <DesktopTransferCard key={item.id} {...commonProps} />
      case 'insurance':
        return <DesktopInsuranceCard key={item.id} {...commonProps} />
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
          {effectiveMode === 'pick_one_required' && (
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
              Escolha 1 opção
            </span>
          )}
          {effectiveMode === 'pick_one_or_more' && (
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
              Escolha 1 ou mais
            </span>
          )}
          {effectiveMode === 'pick_any_optional' && items.length >= 2 && (
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">
              Adicione o que quiser
            </span>
          )}
          {effectiveMode === 'all_included' && items.length >= 2 && (
            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">
              Todos incluídos
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
      <div className="space-y-5">
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
