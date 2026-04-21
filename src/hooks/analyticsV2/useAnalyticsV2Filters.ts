import { create } from 'zustand'
import { endOfDay, startOfYear, subDays } from 'date-fns'

// Filtros universais do Analytics v2.
// Persiste estado na URL (compartilhável) e no localStorage.
// Lente temporal × Ponto de vitória são 2 eixos separados (em vez do dropdown confuso do v1).

export type DatePresetV2 =
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'this_quarter'
  | 'this_year'
  | 'custom'

export type TemporalLensV2 = 'events' | 'cohort' | 'snapshot'
export type WinPointV2 = 'any' | 'sdr_handoff' | 'planner_closed' | 'delivery_done'
export type PersonaV2 = 'dono' | 'comercial' | 'vendas' | 'pos' | 'sdr'
export type PhaseSlugV2 = 'sdr' | 'planner' | 'pos_venda' | 'resolucao'
export type LeadEntryPathV2 = 'full_funnel' | 'direct_planner' | 'returning' | 'referred'

export interface AnalyticsV2FiltersState {
  datePreset: DatePresetV2
  from: string
  to: string
  phaseSlugs: PhaseSlugV2[]
  ownerId: string | null
  origens: string[]
  leadEntryPath: LeadEntryPathV2 | null
  destinos: string[]
  tagIds: string[]
  temporalLens: TemporalLensV2
  winPoint: WinPointV2
  product: string | null

  setDatePreset: (preset: DatePresetV2) => void
  setDateRange: (from: string, to: string) => void
  setPhaseSlugs: (slugs: PhaseSlugV2[]) => void
  setOwnerId: (id: string | null) => void
  setOrigens: (arr: string[]) => void
  setLeadEntryPath: (path: LeadEntryPathV2 | null) => void
  setDestinos: (arr: string[]) => void
  setTagIds: (ids: string[]) => void
  setTemporalLens: (l: TemporalLensV2) => void
  setWinPoint: (w: WinPointV2) => void
  setProduct: (p: string | null) => void
  applyPersonaDefaults: (persona: PersonaV2) => void
  resetToPersona: (persona: PersonaV2) => void
}

function rangeForPreset(preset: DatePresetV2): { from: string; to: string } {
  const now = new Date()
  const to = endOfDay(now).toISOString().slice(0, 10)
  switch (preset) {
    case 'last_7d':
      return { from: subDays(now, 7).toISOString().slice(0, 10), to }
    case 'last_30d':
      return { from: subDays(now, 30).toISOString().slice(0, 10), to }
    case 'last_90d':
      return { from: subDays(now, 90).toISOString().slice(0, 10), to }
    case 'this_quarter':
      return { from: subDays(now, 90).toISOString().slice(0, 10), to }
    case 'this_year':
      return { from: startOfYear(now).toISOString().slice(0, 10), to }
    case 'custom':
      return { from: subDays(now, 30).toISOString().slice(0, 10), to }
  }
}

interface PersonaDefaults {
  datePreset: DatePresetV2
  phaseSlugs: PhaseSlugV2[]
  temporalLens: TemporalLensV2
  winPoint: WinPointV2
}

const PERSONA_DEFAULTS: Record<PersonaV2, PersonaDefaults> = {
  dono: { datePreset: 'this_quarter', phaseSlugs: [], temporalLens: 'events', winPoint: 'any' },
  comercial: { datePreset: 'last_30d', phaseSlugs: [], temporalLens: 'events', winPoint: 'any' },
  vendas: { datePreset: 'last_30d', phaseSlugs: ['planner'], temporalLens: 'events', winPoint: 'planner_closed' },
  pos: { datePreset: 'last_30d', phaseSlugs: ['pos_venda'], temporalLens: 'snapshot', winPoint: 'delivery_done' },
  sdr: { datePreset: 'last_7d', phaseSlugs: ['sdr'], temporalLens: 'events', winPoint: 'sdr_handoff' },
}

const initialPreset: DatePresetV2 = 'last_30d'
const initialRange = rangeForPreset(initialPreset)

const initial = {
  datePreset: initialPreset,
  from: initialRange.from,
  to: initialRange.to,
  phaseSlugs: [] as PhaseSlugV2[],
  ownerId: null as string | null,
  origens: [] as string[],
  leadEntryPath: null as LeadEntryPathV2 | null,
  destinos: [] as string[],
  tagIds: [] as string[],
  temporalLens: 'events' as TemporalLensV2,
  winPoint: 'any' as WinPointV2,
  product: null as string | null,
}

export const useAnalyticsV2Filters = create<AnalyticsV2FiltersState>()((set) => ({
  ...initial,
  setDatePreset: (preset) => {
    const r = rangeForPreset(preset)
    set({ datePreset: preset, from: r.from, to: r.to })
  },
  setDateRange: (from, to) => set({ datePreset: 'custom', from, to }),
  setPhaseSlugs: (phaseSlugs) => set({ phaseSlugs }),
  setOwnerId: (ownerId) => set({ ownerId }),
  setOrigens: (origens) => set({ origens }),
  setLeadEntryPath: (leadEntryPath) => set({ leadEntryPath }),
  setDestinos: (destinos) => set({ destinos }),
  setTagIds: (tagIds) => set({ tagIds }),
  setTemporalLens: (temporalLens) => set({ temporalLens }),
  setWinPoint: (winPoint) => set({ winPoint }),
  setProduct: (product) => set({ product }),
  applyPersonaDefaults: (persona) => {
    const d = PERSONA_DEFAULTS[persona]
    const r = rangeForPreset(d.datePreset)
    set({
      datePreset: d.datePreset, from: r.from, to: r.to,
      phaseSlugs: d.phaseSlugs, temporalLens: d.temporalLens, winPoint: d.winPoint,
    })
  },
  resetToPersona: (persona) => {
    const d = PERSONA_DEFAULTS[persona]
    const r = rangeForPreset(d.datePreset)
    set({
      ...initial,
      datePreset: d.datePreset, from: r.from, to: r.to,
      phaseSlugs: d.phaseSlugs, temporalLens: d.temporalLens, winPoint: d.winPoint,
    })
  },
}))

// Filtros do "dialeto" Fase 2 (p_from/p_to = date)
export function getRpcFilters(s: AnalyticsV2FiltersState) {
  return {
    p_from: s.from,
    p_to: s.to,
    p_product: s.product,
    p_origem: s.origens.length ? s.origens : null,
    p_phase_slugs: s.phaseSlugs.length ? s.phaseSlugs : null,
    p_lead_entry_path: s.leadEntryPath,
    p_destinos: s.destinos.length ? s.destinos : null,
    p_owner_id: s.ownerId,
  }
}

// Filtros do "dialeto" Fase 1 _v2 (p_date_start/p_date_end = timestamptz)
export function getRpcFiltersV1(s: AnalyticsV2FiltersState) {
  return {
    p_date_start: `${s.from}T00:00:00Z`,
    p_date_end: `${s.to}T23:59:59Z`,
    p_product: s.product,
    p_owner_id: s.ownerId,
    p_owner_ids: null,
    p_tag_ids: s.tagIds.length ? s.tagIds : null,
    p_origem: s.origens.length ? s.origens : null,
    p_phase_slugs: s.phaseSlugs.length ? s.phaseSlugs : null,
    p_lead_entry_path: s.leadEntryPath,
    p_destinos: s.destinos.length ? s.destinos : null,
  }
}
