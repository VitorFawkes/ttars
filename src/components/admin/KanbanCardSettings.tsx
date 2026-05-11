import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { usePipelinePhases } from '../../hooks/usePipelinePhases'
import { useCurrentProductMeta } from '../../hooks/useCurrentProductMeta'
import { LayoutList, Grid3X3, ArrowUpDown, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { Database } from '../../database.types'
import { KanbanGrid } from './kanban/KanbanGrid'
import { KanbanSequencer } from './kanban/KanbanSequencer'

type SystemField = Database['public']['Tables']['system_fields']['Row']

export default function KanbanCardSettings() {
    const { pipelineId } = useCurrentProductMeta()
    const [viewMode, setViewMode] = useState<'grid' | 'sequencer'>('grid')

    // --- Data Fetching (Centralized) ---
    const { data: phases, isLoading: loadingPhases } = usePipelinePhases(pipelineId)

    const { data: systemFields, isLoading: loadingFields } = useQuery({
        queryKey: ['system-fields-kanban-settings'],
        queryFn: async () => {
            const { data } = await supabase
                .from('system_fields')
                .select('*')
                .eq('active', true)
                .order('label')
            return data as SystemField[]
        }
    })

    const { data: settings, isLoading: loadingSettings } = useQuery({
        queryKey: ['pipeline-card-settings-admin'],
        queryFn: async () => {
            const { data } = await supabase
                .from('pipeline_card_settings')
                .select('*')
                .is('usuario_id', null)
            return data || []
        }
    })

    const isLoading = loadingPhases || loadingFields || loadingSettings

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12 h-full">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header & Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <LayoutList className="w-6 h-6 text-primary" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">Configuração de Cards Kanban</h2>
                    </div>
                    <p className="text-muted-foreground">Gerencie quais informações aparecem nos cards do funil e a ordem de exibição.</p>
                </div>

                <div className="flex bg-muted p-1 rounded-lg border border-border self-start sm:self-auto">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                            viewMode === 'grid'
                                ? "bg-background text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                        )}
                    >
                        <Grid3X3 className="w-4 h-4" />
                        Visibilidade (Grid)
                    </button>
                    <button
                        onClick={() => setViewMode('sequencer')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                            viewMode === 'sequencer'
                                ? "bg-background text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                        )}
                    >
                        <ArrowUpDown className="w-4 h-4" />
                        Ordenação (Sequencer)
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-card rounded-xl border border-border shadow-sm overflow-hidden p-6">
                {viewMode === 'grid' ? (
                    <KanbanGrid
                        phases={phases || []}
                        systemFields={systemFields || []}
                        settings={settings || []}
                        isLoading={isLoading}
                    />
                ) : (
                    <KanbanSequencer
                        phases={phases || []}
                        systemFields={systemFields || []}
                        settings={settings || []}
                        isLoading={isLoading}
                    />
                )}
            </div>
        </div>
    )
}
