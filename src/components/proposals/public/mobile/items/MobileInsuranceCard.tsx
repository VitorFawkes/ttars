/**
 * MobileInsuranceCard - Card de seguro otimizado para mobile
 *
 * Lê rich_content.insurance diretamente via reader
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import { Shield, Check, Users, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readInsuranceData, TIER_COLORS, TIER_LABELS } from '../../shared/readers'
import { formatPrice } from '../../shared/utils/priceUtils'
import { formatDateRange } from '../../shared/utils/dateUtils'

interface MobileInsuranceCardProps {
  item: ProposalItemWithOptions
  isSelected: boolean
  selectedOptionId?: string
  onSelect: () => void
  onSelectOption: (optionId: string) => void
  isRadioMode?: boolean
}

export function MobileInsuranceCard({
  item,
  isSelected,
  selectedOptionId,
  onSelect,
  onSelectOption,
  isRadioMode = false,
}: MobileInsuranceCardProps) {
  const insuranceData = readInsuranceData(item)

  if (!insuranceData) {
    return (
      <div className="p-4 bg-amber-50 rounded-xl text-center">
        <Shield className="h-8 w-8 text-amber-300 mx-auto mb-2" />
        <p className="text-sm text-amber-500">Dados do seguro não disponíveis</p>
      </div>
    )
  }

  // Tier do item ou da opção selecionada
  const selectedOption = insuranceData.options.find(o => o.id === selectedOptionId)
  const tier = selectedOption?.tier ?? 'standard'
  const tierColors = TIER_COLORS[tier]
  const tierLabel = TIER_LABELS[tier]

  // Preço
  const totalPrice = selectedOption?.price ?? insuranceData.totalPrice

  return (
    <div
      className={cn(
        "transition-all duration-200 overflow-hidden",
        isSelected ? "bg-amber-50/30" : "bg-white hover:bg-slate-50"
      )}
    >
      <button onClick={onSelect} className="w-full text-left p-4">
        <div className="flex items-start gap-3">
          {/* Radio se modo radio */}
          {isRadioMode && (
            <div className={cn(
              "mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
              isSelected ? "border-amber-600 bg-amber-600" : "border-slate-300"
            )}>
              {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
            </div>
          )}

          {/* Ícone */}
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
            tierColors.bg
          )}>
            <Shield className={cn("h-6 w-6", tierColors.text)} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={cn(
                    "font-semibold text-base leading-tight",
                    isSelected ? "text-slate-900" : "text-slate-700"
                  )}>
                    {insuranceData.name}
                  </h3>
                  <span className={cn(
                    "px-2 py-0.5 text-[10px] font-semibold rounded-full",
                    tierColors.bg, tierColors.text
                  )}>
                    {tierLabel}
                  </span>
                </div>

                {insuranceData.providerLabel && (
                  <p className="text-sm text-slate-500 mt-0.5">
                    {insuranceData.providerLabel}
                  </p>
                )}
              </div>

              {/* Preço */}
              <div className="text-right flex-shrink-0">
                <p className={cn(
                  "text-lg font-bold",
                  isSelected ? "text-amber-600" : "text-slate-600"
                )}>
                  {formatPrice(totalPrice)}
                </p>
                {insuranceData.priceType === 'per_person' && (
                  <p className="text-xs text-slate-500">por pessoa</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info adicional */}
        <div className="mt-3 flex flex-wrap gap-2">
          {insuranceData.showCoverageDates && insuranceData.coverageStart && (
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDateRange(insuranceData.coverageStart, insuranceData.coverageEnd)}
            </span>
          )}
          {insuranceData.travelers > 1 && (
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded flex items-center gap-1">
              <Users className="h-3 w-3" />
              {insuranceData.travelers} viajantes
            </span>
          )}
          {insuranceData.showMedicalValue && insuranceData.medicalCoverage > 0 && (
            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded">
              Cobertura médica: {formatPrice(insuranceData.medicalCoverage, insuranceData.medicalCoverageCurrency as 'USD' | 'BRL' | 'EUR')}
            </span>
          )}
        </div>

        {/* Coberturas */}
        {insuranceData.coverages.length > 0 && (
          <div className="mt-3 space-y-1">
            {insuranceData.coverages.slice(0, 4).map((coverage, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Check className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                <span className="text-slate-600">{coverage}</span>
              </div>
            ))}
            {insuranceData.coverages.length > 4 && (
              <p className="text-xs text-slate-400 pl-5">
                +{insuranceData.coverages.length - 4} coberturas
              </p>
            )}
          </div>
        )}
      </button>

      {/* Opções de plano */}
      {insuranceData.options.length > 0 && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Planos disponíveis
          </p>
          <div className="space-y-2">
            {insuranceData.options.map(option => {
              const isOptionSelected = selectedOptionId === option.id
              const optTierColors = TIER_COLORS[option.tier]
              return (
                <button
                  key={option.id}
                  onClick={() => onSelectOption(option.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border-2 transition-all",
                    isOptionSelected
                      ? cn("bg-opacity-50", optTierColors.border, optTierColors.bg)
                      : "border-slate-200 hover:border-amber-300"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                        isOptionSelected
                          ? cn(optTierColors.border.replace('border-', 'border-'), "bg-amber-600")
                          : "border-slate-300"
                      )}>
                        {isOptionSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-slate-900">{option.label}</span>
                        <span className={cn(
                          "ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded",
                          optTierColors.bg, optTierColors.text
                        )}>
                          {TIER_LABELS[option.tier]}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">
                      {formatPrice(option.price)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
