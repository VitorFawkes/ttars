/**
 * MobileSection - Renderiza uma seção da proposta com dispatch por tipo
 */

import type { ProposalSectionWithItems, ProposalItemWithOptions } from '@/types/proposals'
import { SECTION_TYPE_CONFIG } from '@/types/proposals'
import * as LucideIcons from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SelectionsMap } from '../shared/types'
import {
  MobileHotelCard,
  MobileFlightCard,
  MobileExperienceCard,
  MobileTransferCard,
  MobileInsuranceCard,
} from './items'

interface MobileSectionProps {
  section: ProposalSectionWithItems
  selections: SelectionsMap
  onToggleItem: (itemId: string) => void
  onSelectItem: (sectionId: string, itemId: string) => void
  onSelectOption: (itemId: string, optionId: string) => void
  onChangeQuantity: (itemId: string, quantity: number) => void
}

// Cores por tipo de seção
const SECTION_COLORS: Record<string, { bg: string; icon: string }> = {
  flights: { bg: 'from-sky-50 to-blue-100', icon: 'text-sky-600' },
  hotels: { bg: 'from-emerald-50 to-teal-100', icon: 'text-emerald-600' },
  experiences: { bg: 'from-purple-50 to-pink-100', icon: 'text-purple-600' },
  transfers: { bg: 'from-teal-50 to-cyan-100', icon: 'text-teal-600' },
  insurance: { bg: 'from-amber-50 to-orange-100', icon: 'text-amber-600' },
  services: { bg: 'from-indigo-50 to-violet-100', icon: 'text-indigo-600' },
  custom: { bg: 'from-slate-50 to-gray-100', icon: 'text-slate-600' },
}

export function MobileSection({
  section,
  selections,
  onToggleItem,
  onSelectItem,
  onSelectOption,
  onChangeQuantity,
}: MobileSectionProps) {
  const items = section.items || []
  if (items.length === 0) return null

  // Configuração da seção
  const config = SECTION_TYPE_CONFIG[section.section_type] || SECTION_TYPE_CONFIG.custom
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[config.icon] || LucideIcons.FileText
  const sectionColors = SECTION_COLORS[section.section_type] || SECTION_COLORS.custom

  // Detecta modo de exibição
  const isRadioMode = items.length >= 2
  const isAllOptional = items.every(item => item.is_optional)

  // Remove emoji do título
  const cleanTitle = (title: string) =>
    title.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim()

  // Renderiza item baseado no tipo
  const renderItem = (item: ProposalItemWithOptions) => {
    const sel = selections[item.id]
    const isSelected = sel?.selected ?? false
    const selectedOptionId = sel?.optionId
    const quantity = sel?.quantity ?? 1

    // Props comuns
    const commonProps = {
      item,
      isSelected,
      selectedOptionId,
      quantity,
    }

    switch (item.item_type) {
      case 'hotel':
        return (
          <MobileHotelCard
            key={item.id}
            {...commonProps}
            onSelect={() => isRadioMode ? onSelectItem(section.id, item.id) : onToggleItem(item.id)}
            onSelectOption={(optId) => onSelectOption(item.id, optId)}
            onChangeQuantity={(qty) => onChangeQuantity(item.id, qty)}
            isRadioMode={isRadioMode}
          />
        )

      case 'flight':
        return (
          <MobileFlightCard
            key={item.id}
            item={item}
            isSelected={isSelected}
            selectedOptionId={selectedOptionId}
            onSelect={() => isRadioMode ? onSelectItem(section.id, item.id) : onToggleItem(item.id)}
            onSelectOption={(optId) => onSelectOption(item.id, optId)}
          />
        )

      case 'experience':
        return (
          <MobileExperienceCard
            key={item.id}
            {...commonProps}
            onToggle={() => onToggleItem(item.id)}
            onSelectOption={(optId) => onSelectOption(item.id, optId)}
          />
        )

      case 'transfer':
        return (
          <MobileTransferCard
            key={item.id}
            {...commonProps}
            onToggle={() => onToggleItem(item.id)}
            onSelectOption={(optId) => onSelectOption(item.id, optId)}
          />
        )

      case 'insurance':
        return (
          <MobileInsuranceCard
            key={item.id}
            {...commonProps}
            onSelect={() => isRadioMode ? onSelectItem(section.id, item.id) : onToggleItem(item.id)}
            onSelectOption={(optId) => onSelectOption(item.id, optId)}
            isRadioMode={isRadioMode}
          />
        )

      default:
        // Fallback genérico
        return (
          <div key={item.id} className="p-4 bg-slate-50 rounded-lg">
            <p className="font-medium">{item.title}</p>
            {item.description && <p className="text-sm text-slate-500 mt-1">{item.description}</p>}
          </div>
        )
    }
  }

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-100 mx-4 mb-4">
      {/* Header */}
      <header className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 bg-white">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center",
          `bg-gradient-to-br ${sectionColors.bg}`
        )}>
          <IconComponent className={cn("h-5 w-5", sectionColors.icon)} />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900">{cleanTitle(section.title)}</h2>
          {isRadioMode && (
            <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                Obrigatório
              </span>
              Escolha 1 opção
            </p>
          )}
          {isAllOptional && !isRadioMode && (
            <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                Opcional
              </span>
              {items.length} {items.length === 1 ? 'item disponível' : 'itens disponíveis'}
            </p>
          )}
        </div>
      </header>

      {/* Items */}
      <div className="divide-y divide-slate-100">
        {items.map(renderItem)}
      </div>
    </section>
  )
}
