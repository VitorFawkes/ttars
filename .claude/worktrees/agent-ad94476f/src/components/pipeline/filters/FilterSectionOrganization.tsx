import { useState } from 'react'
import { Users, Tag, Link, Paperclip } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { FilterChipGroup } from './FilterChipGroup'
import { ALL_ORIGEM_OPTIONS } from '../../../lib/constants/origem'
import type { FilterState, ArrayFilterField } from '../../../hooks/usePipelineFilters'

const DOC_STATUS_OPTIONS = [
    { value: 'com_anexos', label: 'Com Anexos', color: 'bg-indigo-500 text-white border-indigo-500' },
    { value: 'sem_anexos', label: 'Sem Anexos', color: 'bg-gray-500 text-white border-gray-500' },
]

interface Team { id: string; name: string }
interface Department { id: string; name: string }
interface TagOption { id: string; name: string; color: string }

interface FilterSectionOrganizationProps {
    filters: FilterState
    teams: Team[]
    departments: Department[]
    tags: TagOption[]
    onToggle: (field: ArrayFilterField, value: string) => void
    onToggleNoTag: () => void
}

export function FilterSectionOrganization({
    filters, teams, departments, tags, onToggle, onToggleNoTag
}: FilterSectionOrganizationProps) {
    const [searchTeam, setSearchTeam] = useState('')
    const filteredTeams = teams.filter(t => t.name.toLowerCase().includes(searchTeam.toLowerCase()))

    return (
        <>
            {/* Origem do Lead */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Link className="h-3 w-3" /> Origem do Lead
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <FilterChipGroup
                        options={ALL_ORIGEM_OPTIONS.map(o => ({ value: o.value, label: o.label, color: o.color + ' border-transparent' }))}
                        selected={filters.origem || []}
                        onToggle={(v) => onToggle('origem', v)}
                    />
                </div>
            </div>

            {/* Anexos */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Paperclip className="h-3 w-3" /> Anexos
                </h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <FilterChipGroup
                        options={DOC_STATUS_OPTIONS}
                        selected={filters.docStatus || []}
                        onToggle={(v) => onToggle('docStatus', v)}
                    />
                </div>
            </div>

            {/* Organização */}
            <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                    <Users className="h-3 w-3" /> Organização
                </h3>

                {/* Times */}
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                    <label className="text-sm font-semibold text-gray-700 block">Times</label>
                    <input
                        type="text"
                        placeholder="Filtrar times..."
                        className="w-full h-10 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-2"
                        value={searchTeam}
                        onChange={(e) => setSearchTeam(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        {filteredTeams.map(team => (
                            <button
                                key={team.id}
                                onClick={() => onToggle('teamIds', team.id)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                    (filters.teamIds || []).includes(team.id)
                                        ? "bg-primary text-white border-primary shadow-sm"
                                        : "border-gray-200 text-gray-600 hover:border-primary/50 hover:text-primary bg-white"
                                )}
                            >
                                {team.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Macro Áreas */}
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-3">
                    <label className="text-sm font-semibold text-gray-700 block">Macro Áreas</label>
                    <div className="flex flex-wrap gap-2">
                        {departments.map(dept => (
                            <button
                                key={dept.id}
                                onClick={() => onToggle('departmentIds', dept.id)}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                                    (filters.departmentIds || []).includes(dept.id)
                                        ? "bg-secondary text-white border-secondary shadow-sm"
                                        : "border-gray-200 text-gray-600 hover:border-secondary/50 hover:text-secondary bg-white"
                                )}
                            >
                                {dept.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-gray-400" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Tags</h3>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={onToggleNoTag}
                                className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all",
                                    filters.noTag
                                        ? "bg-slate-200 text-slate-800 border-slate-400"
                                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                                )}
                            >
                                <span className="w-2 h-2 rounded-full shrink-0 bg-slate-400" />
                                Sem tag
                            </button>
                            {tags.map(tag => {
                                const selected = (filters.tagIds || []).includes(tag.id)
                                return (
                                    <button
                                        key={tag.id}
                                        onClick={() => onToggle('tagIds', tag.id)}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all"
                                        style={selected ? {
                                            backgroundColor: tag.color + '25',
                                            color: tag.color,
                                            borderColor: tag.color + '60',
                                        } : {
                                            backgroundColor: 'white',
                                            color: '#6b7280',
                                            borderColor: '#e5e7eb',
                                        }}
                                    >
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: tag.color }}
                                        />
                                        {tag.name}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
