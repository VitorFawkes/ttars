/**
 * Reader para dados de Experiência
 *
 * Lê rich_content.experience do Builder V4 e retorna ExperienceViewData
 */

import type { ProposalItemWithOptions } from '@/types/proposals'
import type { ExperienceViewData, ExperienceOptionViewData } from '../types'

/**
 * Extrai dados de experiência do item
 * Retorna null se não for um item de experiência válido
 */
export function readExperienceData(item: ProposalItemWithOptions): ExperienceViewData | null {
  const rc = item.rich_content as Record<string, unknown>

  // Busca dados no namespace experience
  const exp = rc?.experience as Record<string, unknown> | undefined

  // Se não tem namespace, verifica formato legado
  if (!exp) {
    if (rc?.name || rc?.meeting_point || rc?.duration) {
      return readLegacyExperienceData(item, rc)
    }
    return null
  }

  // Preço
  const priceType = String(exp.price_type || 'total') as 'per_person' | 'total'
  const price = Number(exp.price) || Number(item.base_price) || 0
  const participants = Number(exp.participants) || 1
  const totalPrice = priceType === 'per_person' ? price * participants : price

  // Opções
  const rawOptions = (exp.options as Array<Record<string, unknown>>) || []
  const options: ExperienceOptionViewData[] = rawOptions
    .filter(opt => opt.enabled !== false)
    .map(opt => ({
      id: String(opt.id || ''),
      label: String(opt.label || ''),
      price: Number(opt.price) || 0,
      isRecommended: Boolean(opt.is_recommended),
      enabled: opt.enabled !== false,
    }))

  return {
    name: String(exp.name || item.title || ''),
    date: String(exp.date || ''),
    time: String(exp.time || ''),
    duration: String(exp.duration || ''),
    locationCity: String(exp.location_city || exp.location || ''),
    meetingPoint: String(exp.meeting_point || ''),
    participants,
    priceType,
    price,
    totalPrice,
    currency: String(exp.currency || 'BRL'),
    included: Array.isArray(exp.included) ? exp.included.map(String) : [],
    provider: exp.provider ? String(exp.provider) : null,
    cancellationPolicy: exp.cancellation_policy ? String(exp.cancellation_policy) : null,
    ageRestriction: exp.age_restriction ? String(exp.age_restriction) : null,
    difficultyLevel: parseDifficultyLevel(exp.difficulty_level),
    description: exp.description ? String(exp.description) : null,
    notes: exp.notes ? String(exp.notes) : null,
    imageUrl: String(exp.image_url || item.image_url || '') || null,
    images: Array.isArray(exp.images) ? exp.images.map(String).filter(Boolean) : [],
    options,
  }
}

/**
 * Lê formato legado (flat)
 */
function readLegacyExperienceData(
  item: ProposalItemWithOptions,
  rc: Record<string, unknown>
): ExperienceViewData {
  const priceType = String(rc.price_type || 'total') as 'per_person' | 'total'
  const price = Number(rc.price) || Number(item.base_price) || 0
  const participants = Number(rc.participants) || 1
  const totalPrice = priceType === 'per_person' ? price * participants : price

  const options: ExperienceOptionViewData[] = (item.options || []).map(opt => ({
    id: opt.id,
    label: opt.option_label,
    price: Number(opt.price_delta) || 0,
    isRecommended: false,
    enabled: true,
  }))

  return {
    name: String(rc.name || item.title || ''),
    date: String(rc.date || ''),
    time: String(rc.time || ''),
    duration: String(rc.duration || ''),
    locationCity: String(rc.location_city || rc.location || ''),
    meetingPoint: String(rc.meeting_point || ''),
    participants,
    priceType,
    price,
    totalPrice,
    currency: String(rc.currency || 'BRL'),
    included: Array.isArray(rc.included) ? rc.included.map(String) : [],
    provider: rc.provider ? String(rc.provider) : null,
    cancellationPolicy: rc.cancellation_policy ? String(rc.cancellation_policy) : null,
    ageRestriction: rc.age_restriction ? String(rc.age_restriction) : null,
    difficultyLevel: parseDifficultyLevel(rc.difficulty_level),
    description: rc.description ? String(rc.description) : null,
    notes: rc.notes ? String(rc.notes) : null,
    imageUrl: String(rc.image_url || item.image_url || '') || null,
    images: Array.isArray(rc.images) ? rc.images.map(String).filter(Boolean) : [],
    options,
  }
}

/**
 * Parse difficulty level
 */
function parseDifficultyLevel(
  value: unknown
): 'easy' | 'moderate' | 'challenging' | null {
  if (!value) return null
  const str = String(value).toLowerCase()
  if (str === 'easy' || str === 'facil' || str === 'fácil') return 'easy'
  if (str === 'moderate' || str === 'moderado' || str === 'moderada') return 'moderate'
  if (str === 'challenging' || str === 'hard' || str === 'difícil' || str === 'dificil') return 'challenging'
  return null
}

/**
 * Verifica se o item é uma experiência válida
 */
export function isExperienceItem(item: ProposalItemWithOptions): boolean {
  if (item.item_type === 'experience') return true

  const rc = item.rich_content as Record<string, unknown>
  return !!(rc?.experience || rc?.meeting_point || rc?.duration)
}

/**
 * Labels para nível de dificuldade
 */
export const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Fácil',
  moderate: 'Moderado',
  challenging: 'Desafiador',
}
