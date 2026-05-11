/**
 * DesktopInsuranceCard - Card de seguro viagem otimizado para desktop
 *
 * Layout com detalhes de cobertura, provider e informações completas
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import { Shield, Check, Calendar, Users, Heart, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readInsuranceData } from '../../shared/readers'
import { formatPrice, formatPriceWithSymbol, type Currency } from '../../shared/utils/priceUtils'
import { formatDateRange } from '../../shared/utils/dateUtils'

interface DesktopInsuranceCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string
  onSelect: () => void
  onSelectOption: (optionId: string) => void
}

// Cores por tier
const TIER_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  basic: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-300', badge: 'bg-slate-100 text-slate-600' },
  standard: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300', badge: 'bg-blue-100 text-blue-600' },
  premium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', badge: 'bg-amber-100 text-amber-600' },
  platinum: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-300', badge: 'bg-violet-100 text-violet-600' },
}

const TIER_LABELS: Record<string, string> = {
  basic: 'Básico',
  standard: 'Standard',
  premium: 'Premium',
  platinum: 'Platinum',
}

export function DesktopInsuranceCard({
  item,
  isSelected,
  selectedOptionId,
  onSelect,
  onSelectOption,
}: DesktopInsuranceCardProps) {
  const insuranceData = readInsuranceData(item)

  if (!insuranceData) {
    return (
      <div className="p-8 bg-teal-50 rounded-2xl text-center border-2 border-dashed border-teal-200">
        <Shield className="h-12 w-12 text-teal-300 mx-auto mb-3" />
        <p className="text-teal-700 font-medium">Dados do seguro não disponíveis</p>
      </div>
    )
  }

  // Preço com opção selecionada
  const selectedOption = insuranceData.options.find(o => o.id === selectedOptionId)
  const basePrice = selectedOption?.price ?? insuranceData.price
  const totalPrice = insuranceData.priceType === 'per_person'
    ? basePrice * insuranceData.travelers
    : basePrice

  const currentTier = selectedOption?.tier || 'standard'
  const tierColors = TIER_COLORS[currentTier] || TIER_COLORS.standard

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden transition-all duration-300 border-2",
        isSelected
          ? "border-teal-500 bg-teal-50/30 shadow-lg shadow-teal-500/10"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
      )}
    >
      {/* Header com provider e preço */}
      <div className={cn(
        "px-5 py-4 flex items-center justify-between border-b",
        isSelected ? "bg-teal-50 border-teal-200" : "bg-gradient-to-r from-teal-50 to-emerald-50 border-slate-100"
      )}>
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            isSelected ? "bg-teal-100" : "bg-teal-100/70"
          )}>
            <Shield className={cn("h-6 w-6", isSelected ? "text-teal-600" : "text-teal-500")} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">
              {insuranceData.name || 'Seguro Viagem'}
            </h3>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="font-medium text-teal-700">
                {insuranceData.providerLabel}
              </span>
              {selectedOption && (
                <span className={cn("px-2 py-0.5 rounded text-xs font-medium", tierColors.badge)}>
                  {TIER_LABELS[currentTier] || currentTier}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className={cn(
              "text-2xl font-bold",
              isSelected ? "text-teal-600" : "text-slate-700"
            )}>
              {formatPrice(totalPrice)}
            </p>
            {insuranceData.priceType === 'per_person' && insuranceData.travelers > 1 && (
              <p className="text-sm text-slate-500">
                {formatPrice(basePrice)}/pessoa
              </p>
            )}
          </div>

          <button
            onClick={onSelect}
            className={cn(
              "w-10 h-10 rounded-xl border-2 flex items-center justify-center transition-all",
              isSelected
                ? "border-teal-600 bg-teal-600"
                : "border-slate-300 hover:border-teal-400 bg-white"
            )}
          >
            {isSelected && <Check className="h-5 w-5 text-white" />}
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-5">
        {/* Info Grid */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {insuranceData.showCoverageDates && insuranceData.coverageStart && insuranceData.coverageEnd && (
            <div className="p-3 bg-teal-50 rounded-xl">
              <div className="flex items-center gap-2 text-teal-700 text-xs font-medium mb-1">
                <Calendar className="h-3.5 w-3.5" />
                Período
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {formatDateRange(insuranceData.coverageStart, insuranceData.coverageEnd)}
              </p>
            </div>
          )}
          {insuranceData.travelers > 0 && (
            <div className="p-3 bg-slate-100 rounded-xl">
              <div className="flex items-center gap-2 text-slate-600 text-xs font-medium mb-1">
                <Users className="h-3.5 w-3.5" />
                Viajantes
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {insuranceData.travelers} pessoa{insuranceData.travelers > 1 ? 's' : ''}
              </p>
            </div>
          )}
          {insuranceData.showMedicalValue && insuranceData.medicalCoverage > 0 && (
            <div className="p-3 bg-emerald-50 rounded-xl col-span-2">
              <div className="flex items-center gap-2 text-emerald-700 text-xs font-medium mb-1">
                <Heart className="h-3.5 w-3.5" />
                Cobertura Médica
              </div>
              <p className="text-lg font-bold text-emerald-700">
                {formatPriceWithSymbol(insuranceData.medicalCoverage, (insuranceData.medicalCoverageCurrency || 'USD') as Currency)}
              </p>
            </div>
          )}
        </div>

        {/* Coberturas */}
        {insuranceData.coverages.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-slate-500 uppercase mb-3">Coberturas incluídas</p>
            <div className="grid grid-cols-2 gap-2">
              {insuranceData.coverages.map((coverage, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg"
                >
                  <Check className="h-4 w-4 text-teal-500 flex-shrink-0" />
                  <span className="text-sm text-slate-700">{coverage}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Descrição */}
        {insuranceData.description && (
          <p className="text-sm text-slate-600 mb-4">
            {insuranceData.description}
          </p>
        )}

        {/* Número da apólice */}
        {insuranceData.policyNumber && (
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
            <Info className="h-4 w-4" />
            Apólice: {insuranceData.policyNumber}
          </div>
        )}

        {/* Opções de plano */}
        {insuranceData.options.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase mb-3">
              Escolha seu plano
            </p>
            <div className="grid grid-cols-4 gap-3">
              {insuranceData.options.map(option => {
                const isOptionSelected = selectedOptionId === option.id
                const optionTier = option.tier || 'standard'
                const optionColors = TIER_COLORS[optionTier] || TIER_COLORS.standard

                return (
                  <button
                    key={option.id}
                    onClick={() => onSelectOption(option.id)}
                    disabled={!isSelected}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all text-center",
                      isOptionSelected
                        ? cn(optionColors.border, optionColors.bg)
                        : "border-slate-200 hover:border-teal-300",
                      !isSelected && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <p className={cn(
                      "font-semibold mb-1",
                      isOptionSelected ? optionColors.text : "text-slate-700"
                    )}>
                      {option.label}
                    </p>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      optionColors.badge
                    )}>
                      {TIER_LABELS[optionTier] || optionTier}
                    </span>
                    <p className={cn(
                      "text-lg font-bold mt-2",
                      isOptionSelected ? optionColors.text : "text-slate-600"
                    )}>
                      {formatPrice(option.price)}
                    </p>
                    {option.isRecommended && (
                      <span className="text-[10px] text-teal-600 font-medium">✓ Recomendado</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
