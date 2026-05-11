/**
 * Reader para dados de Seguro
 *
 * Lê rich_content.insurance do Builder V4 e retorna InsuranceViewData
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import type { InsuranceViewData, InsuranceOptionViewData } from '../types'
import { INSURANCE_PROVIDER_LABELS } from '../types'

/**
 * Extrai dados de seguro do item
 * Retorna null se não for um item de seguro válido
 */
export function readInsuranceData(item: ProposalItemWithOptions): InsuranceViewData | null {
  const rc = item.rich_content as Record<string, unknown>

  // Busca dados no namespace insurance
  const ins = rc?.insurance as Record<string, unknown> | undefined

  // Se não tem namespace, verifica formato legado
  if (!ins) {
    if (rc?.provider || rc?.coverages || rc?.medical_coverage) {
      return readLegacyInsuranceData(item, rc)
    }
    return null
  }

  // Provider com label
  const provider = String(ins.provider || '')
  const providerLabel = INSURANCE_PROVIDER_LABELS[provider] || provider

  // Preço
  const priceType = String(ins.price_type || 'total') as 'per_person' | 'total'
  const price = Number(ins.price) || Number(item.base_price) || 0
  const travelers = Number(ins.travelers) || 1
  const totalPrice = priceType === 'per_person' ? price * travelers : price

  // Opções
  const rawOptions = (ins.options as Array<Record<string, unknown>>) || []
  const options: InsuranceOptionViewData[] = rawOptions
    .filter(opt => opt.enabled !== false)
    .map(opt => ({
      id: String(opt.id || ''),
      label: String(opt.label || ''),
      tier: parseTier(opt.tier),
      price: Number(opt.price) || 0,
      isRecommended: Boolean(opt.is_recommended),
      enabled: opt.enabled !== false,
    }))

  return {
    name: String(ins.name || item.title || ''),
    provider,
    providerLabel,
    coverageStart: String(ins.coverage_start || ''),
    coverageEnd: String(ins.coverage_end || ''),
    travelers,
    medicalCoverage: Number(ins.medical_coverage) || 0,
    medicalCoverageCurrency: String(ins.medical_coverage_currency || 'USD'),
    price,
    priceType,
    totalPrice,
    coverages: Array.isArray(ins.coverages) ? ins.coverages.map(String) : [],
    policyNumber: ins.policy_number ? String(ins.policy_number) : null,
    description: ins.description ? String(ins.description) : null,
    notes: ins.notes ? String(ins.notes) : null,
    imageUrl: String(ins.image_url || item.image_url || '') || null,
    showCoverageDates: ins.show_coverage_dates !== false,
    showMedicalValue: ins.show_medical_value !== false,
    options,
  }
}

/**
 * Lê formato legado (flat)
 */
function readLegacyInsuranceData(
  item: ProposalItemWithOptions,
  rc: Record<string, unknown>
): InsuranceViewData {
  const provider = String(rc.provider || '')
  const providerLabel = INSURANCE_PROVIDER_LABELS[provider] || provider

  const priceType = String(rc.price_type || 'total') as 'per_person' | 'total'
  const price = Number(rc.price) || Number(item.base_price) || 0
  const travelers = Number(rc.travelers) || Number(rc.travelers_count) || 1
  const totalPrice = priceType === 'per_person' ? price * travelers : price

  const options: InsuranceOptionViewData[] = (item.options || []).map(opt => ({
    id: opt.id,
    label: opt.option_label,
    tier: 'standard' as const,
    price: Number(opt.price_delta) || 0,
    isRecommended: false,
    enabled: true,
  }))

  return {
    name: String(rc.name || item.title || ''),
    provider,
    providerLabel,
    coverageStart: String(rc.coverage_start || rc.start_date || ''),
    coverageEnd: String(rc.coverage_end || rc.end_date || ''),
    travelers,
    medicalCoverage: Number(rc.medical_coverage) || Number(rc.coverage_amount) || 0,
    medicalCoverageCurrency: String(rc.medical_coverage_currency || 'USD'),
    price,
    priceType,
    totalPrice,
    coverages: Array.isArray(rc.coverages)
      ? rc.coverages.map(String)
      : Array.isArray(rc.features)
        ? rc.features.map(String)
        : [],
    policyNumber: rc.policy_number ? String(rc.policy_number) : null,
    description: rc.description ? String(rc.description) : null,
    notes: rc.notes ? String(rc.notes) : null,
    imageUrl: String(rc.image_url || item.image_url || '') || null,
    showCoverageDates: rc.show_coverage_dates !== false,
    showMedicalValue: rc.show_medical_value !== false,
    options,
  }
}

/**
 * Parse tier
 */
function parseTier(value: unknown): 'basic' | 'standard' | 'premium' | 'platinum' {
  if (!value) return 'standard'
  const str = String(value).toLowerCase()
  if (str === 'basic' || str === 'basico' || str === 'básico') return 'basic'
  if (str === 'standard' || str === 'padrao' || str === 'padrão') return 'standard'
  if (str === 'premium' || str === 'completo') return 'premium'
  if (str === 'platinum' || str === 'platina') return 'platinum'
  return 'standard'
}

/**
 * Verifica se o item é um seguro válido
 */
export function isInsuranceItem(item: ProposalItemWithOptions): boolean {
  if (item.item_type === 'insurance') return true

  const rc = item.rich_content as Record<string, unknown>
  return !!(rc?.insurance || rc?.provider || rc?.medical_coverage)
}

/**
 * Cores para cada tier
 */
export const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  basic: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
  standard: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  premium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
  platinum: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
}

/**
 * Labels para cada tier
 */
export const TIER_LABELS: Record<string, string> = {
  basic: 'Básico',
  standard: 'Standard',
  premium: 'Premium',
  platinum: 'Platinum',
}
