import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ColumnConfig } from '../components/ui/data-grid/ColumnManager'

export interface LeadsColumnConfig extends ColumnConfig {
    width?: number
    sortable?: boolean
}

// Default columns configuration
const DEFAULT_COLUMNS: LeadsColumnConfig[] = [
    { id: 'titulo', label: 'Negócio / Cliente', isVisible: true, sortable: true },
    { id: 'etapa_nome', label: 'Etapa', isVisible: true },
    { id: 'valor_estimado', label: 'Valor', isVisible: true, sortable: true },
    { id: 'prioridade', label: 'Prioridade', isVisible: true },
    { id: 'dono_atual_nome', label: 'Responsável', isVisible: true },
    { id: 'created_at', label: 'Criado em', isVisible: true, sortable: true },
    { id: 'updated_at', label: 'Atualizado', isVisible: true, sortable: true },
    { id: 'status_comercial', label: 'Status', isVisible: true },
    // New columns - hidden by default
    { id: 'tempo_sem_contato', label: 'Dias s/ Contato', isVisible: false },
    { id: 'proxima_tarefa', label: 'Próxima Tarefa', isVisible: false },
    { id: 'data_viagem_inicio', label: 'Data Viagem', isVisible: false, sortable: true },
    { id: 'dias_ate_viagem', label: 'Dias p/ Viagem', isVisible: false },
    { id: 'tarefas_atrasadas', label: 'Tarefas Atrasadas', isVisible: false },
    { id: 'tarefas_pendentes', label: 'Tarefas Pendentes', isVisible: false },
    { id: 'urgencia_viagem', label: 'Urgência', isVisible: false },
    { id: 'destinos', label: 'Destinos', isVisible: false },
    { id: 'pipeline_nome', label: 'Pipeline', isVisible: false },
    { id: 'pessoa_email', label: 'Email', isVisible: false },
    { id: 'pessoa_telefone', label: 'Telefone', isVisible: false },
    { id: 'origem', label: 'Origem', isVisible: true },
]

interface LeadsColumnsStore {
    columns: LeadsColumnConfig[]
    setColumns: (columns: LeadsColumnConfig[]) => void
    toggleColumn: (columnId: string) => void
    reorderColumns: (startIndex: number, endIndex: number) => void
    resetColumns: () => void
    getVisibleColumns: () => LeadsColumnConfig[]
}

export const useLeadsColumns = create<LeadsColumnsStore>()(
    persist(
        (set, get) => ({
            columns: DEFAULT_COLUMNS,

            setColumns: (columns) => set({ columns }),

            toggleColumn: (columnId) => set((state) => ({
                columns: state.columns.map(col =>
                    col.id === columnId ? { ...col, isVisible: !col.isVisible } : col
                )
            })),

            reorderColumns: (startIndex, endIndex) => set((state) => {
                const newColumns = [...state.columns]
                const [removed] = newColumns.splice(startIndex, 1)
                newColumns.splice(endIndex, 0, removed)
                return { columns: newColumns }
            }),

            resetColumns: () => set({ columns: DEFAULT_COLUMNS }),

            getVisibleColumns: () => get().columns.filter(col => col.isVisible)
        }),
        {
            name: 'leads-columns-storage',
            partialize: (state) => ({ columns: state.columns })
        }
    )
)
