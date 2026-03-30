import { User } from 'lucide-react'
import { PersonFilterList } from './PersonFilterList'
import type { FilterState, ArrayFilterField } from '../../../hooks/usePipelineFilters'

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

const SDR_ACCENT = {
    checkbox: 'text-secondary focus:ring-secondary',
    avatar: 'bg-secondary/10',
    avatarText: 'text-secondary',
    avatarBorder: 'border-secondary/20',
    selectedBg: 'bg-secondary/5',
    selectedText: 'font-medium text-secondary-dark',
}

const PLANNER_ACCENT = {
    checkbox: 'text-amber-600 focus:ring-amber-500',
    avatar: 'bg-amber-100',
    avatarText: 'text-amber-700',
    avatarBorder: 'border-amber-200',
    selectedBg: 'bg-amber-50',
    selectedText: 'font-medium text-amber-700',
}

const POS_ACCENT = {
    checkbox: 'text-emerald-600 focus:ring-emerald-500',
    avatar: 'bg-emerald-100',
    avatarText: 'text-emerald-700',
    avatarBorder: 'border-emerald-200',
    selectedBg: 'bg-emerald-50',
    selectedText: 'font-medium text-emerald-700',
}

export function FilterSectionPeople({ filters, profiles, onToggle }: FilterSectionPeopleProps) {
    const allProfiles = profiles
    const sdrProfiles = profiles.filter(p => p.phase_slug === 'sdr')
    const plannerProfiles = profiles.filter(p => p.phase_slug === 'planner')
    const posProfiles = profiles.filter(p => p.phase_slug === 'pos_venda')

    return (
        <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <User className="h-3 w-3" /> Pessoas
            </h3>

            <PersonFilterList
                label="Responsáveis (Dono Atual)"
                placeholder="Buscar responsável..."
                profiles={allProfiles}
                selected={filters.ownerIds || []}
                onToggle={(id) => onToggle('ownerIds', id)}
            />

            <PersonFilterList
                label="SDRs (Pré-venda)"
                placeholder="Buscar SDR..."
                profiles={sdrProfiles}
                selected={filters.sdrIds || []}
                onToggle={(id) => onToggle('sdrIds', id)}
                accentColor={SDR_ACCENT}
            />

            <PersonFilterList
                label="Planners (Vendas)"
                placeholder="Buscar Planner..."
                profiles={plannerProfiles}
                selected={filters.plannerIds || []}
                onToggle={(id) => onToggle('plannerIds', id)}
                accentColor={PLANNER_ACCENT}
            />

            <PersonFilterList
                label="Pós-Venda"
                placeholder="Buscar Pós-Venda..."
                profiles={posProfiles}
                selected={filters.posIds || []}
                onToggle={(id) => onToggle('posIds', id)}
                accentColor={POS_ACCENT}
            />
        </div>
    )
}
