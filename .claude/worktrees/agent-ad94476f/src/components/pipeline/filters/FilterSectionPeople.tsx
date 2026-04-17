import { User } from 'lucide-react'
import { PersonFilterList } from './PersonFilterList'
import type { FilterState, ArrayFilterField } from '../../../hooks/usePipelineFilters'
import { useCurrentProductMeta } from '../../../hooks/useCurrentProductMeta'
import { usePhaseCapabilities } from '../../../hooks/usePhaseCapabilities'
import { getPhaseLabel } from '../../../lib/pipeline/phaseLabels'
import { usePipelinePhases } from '../../../hooks/usePipelinePhases'
import { SystemPhase } from '../../../types/pipeline'

interface FilterProfile {
    id: string
    full_name: string | null
    email: string | null
    phase_slug: string | null
}

interface FilterSectionPeopleProps {
    filters: FilterState
    profiles: FilterProfile[]
    onToggle: (field: ArrayFilterField, value: string) => void
}

// Accent palettes indexed by position (entry, sales, post-sales, …)
const PHASE_ACCENTS = [
    {
        checkbox: 'text-secondary focus:ring-secondary',
        avatar: 'bg-secondary/10',
        avatarText: 'text-secondary',
        avatarBorder: 'border-secondary/20',
        selectedBg: 'bg-secondary/5',
        selectedText: 'font-medium text-secondary-dark',
    },
    {
        checkbox: 'text-amber-600 focus:ring-amber-500',
        avatar: 'bg-amber-100',
        avatarText: 'text-amber-700',
        avatarBorder: 'border-amber-200',
        selectedBg: 'bg-amber-50',
        selectedText: 'font-medium text-amber-700',
    },
    {
        checkbox: 'text-emerald-600 focus:ring-emerald-500',
        avatar: 'bg-emerald-100',
        avatarText: 'text-emerald-700',
        avatarBorder: 'border-emerald-200',
        selectedBg: 'bg-emerald-50',
        selectedText: 'font-medium text-emerald-700',
    },
]

// Maps ownerField column name → FilterState array field key
// This drives which filter bucket each phase uses in the filter state.
const OWNER_FIELD_TO_FILTER: Record<string, ArrayFilterField> = {
    sdr_owner_id: 'sdrIds',
    vendas_owner_id: 'plannerIds',
    pos_owner_id: 'posIds',
}

export function FilterSectionPeople({ filters, profiles, onToggle }: FilterSectionPeopleProps) {
    const { pipelineId } = useCurrentProductMeta()
    const { data: phases } = usePipelinePhases(pipelineId ?? undefined)
    const { getOwnerPhases } = usePhaseCapabilities(pipelineId ?? undefined)

    // Try to build phase sections dynamically from DB capabilities (ownerField populated)
    const ownerPhases = getOwnerPhases()
    const hasDynamicPhases = ownerPhases.length > 0

    // Fallback sections used when DB capabilities not yet populated
    const fallbackSections = [
        { slug: SystemPhase.SDR, filterField: 'sdrIds' as ArrayFilterField },
        { slug: SystemPhase.PLANNER, filterField: 'plannerIds' as ArrayFilterField },
        { slug: SystemPhase.POS_VENDA, filterField: 'posIds' as ArrayFilterField },
    ]

    return (
        <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <User className="h-3 w-3" /> Pessoas
            </h3>

            <PersonFilterList
                label="Responsáveis (Dono Atual)"
                placeholder="Buscar responsável..."
                profiles={profiles}
                selected={filters.ownerIds || []}
                onToggle={(id) => onToggle('ownerIds', id)}
            />

            {hasDynamicPhases
                ? // Dynamic sections from DB phase capabilities
                  ownerPhases.map((phase, i) => {
                      const filterField = phase.ownerField ? OWNER_FIELD_TO_FILTER[phase.ownerField] : undefined
                      if (!filterField) return null
                      const phaseProfiles = profiles.filter(p => p.phase_slug === phase.slug)
                      const label = phase.label || phase.name
                      return (
                          <PersonFilterList
                              key={phase.slug ?? phase.id}
                              label={label}
                              placeholder={`Buscar ${label}...`}
                              profiles={phaseProfiles}
                              selected={(filters[filterField] as string[]) || []}
                              onToggle={(id) => onToggle(filterField, id)}
                              accentColor={PHASE_ACCENTS[i % PHASE_ACCENTS.length]}
                          />
                      )
                  })
                : // Fallback: hardcoded 3 sections with dynamic labels from DB
                  fallbackSections.map((section, i) => {
                      const label = getPhaseLabel(phases, section.slug)
                      const sectionProfiles = profiles.filter(p => p.phase_slug === section.slug)
                      return (
                          <PersonFilterList
                              key={section.slug}
                              label={label}
                              placeholder={`Buscar ${label}...`}
                              profiles={sectionProfiles}
                              selected={(filters[section.filterField] as string[]) || []}
                              onToggle={(id) => onToggle(section.filterField, id)}
                              accentColor={PHASE_ACCENTS[i % PHASE_ACCENTS.length]}
                          />
                      )
                  })}
        </div>
    )
}
