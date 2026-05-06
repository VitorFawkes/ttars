import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Eixo principal de status (situação corrente da tarefa)
export type TaskSituacao =
    | 'abertas'         // pendentes em geral
    | 'atrasadas'       // pendentes com vencimento < hoje
    | 'hoje'            // pendentes com vencimento = hoje
    | 'esta_semana'     // pendentes com vencimento <= fim da semana
    | 'concluidas'      // todas concluídas (combinar com janelaConclusao)
    | 'reagendadas'     // status reagendada OU rescheduled_to_id IS NOT NULL
    | 'canceladas'      // status cancelada / cancelado / nao_compareceu
    | 'tudo'            // sem filtro

// Eixo secundário: janela temporal de conclusão (só faz sentido com situacao=concluidas)
export type TaskJanelaConclusao = 'hoje' | 'ontem' | 'esta_semana' | 'este_mes' | 'sempre'

export type TaskScopeFilter = 'minhas' | 'meu_time' | 'todas'
export type TaskPrioridadeFilter = 'alta' | 'media' | 'baixa'
export type TaskOrigemFilter = 'manual' | 'cadencia' | 'automacao' | 'integracao'
export type TaskUrgenciaFilter = 'sem_responsavel' | 'sem_prazo' | 'sem_descricao' | 'sem_resultado'

export interface TaskFilterState {
    /** Busca livre */
    search: string
    /** Situação principal */
    situacao: TaskSituacao
    /** Janela de conclusão (combina com situacao=concluidas) */
    janelaConclusao: TaskJanelaConclusao
    /** Escopo (minhas / time / todas) */
    scope: TaskScopeFilter
    /** Tipos de tarefa */
    tipos: string[]
    /** Prioridade */
    prioridades: TaskPrioridadeFilter[]
    /** Origem (manual/cadência/automação/integração) */
    origens: TaskOrigemFilter[]
    /** Resultado / outcome (atendeu, não atendeu, etc.) */
    resultados: string[]
    /** Slug da fase do responsável (sdr, planner, pos-venda, concierge) */
    fases: string[]
    /** IDs dos responsáveis */
    responsavelIds: string[]
    /** Slug da fase do CARD (estado da viagem) */
    cardFases: string[]
    /** Status comercial do card (aberto, ganho, perdido) */
    cardStatusComercial: string[]
    /** Vencimento — período personalizado */
    vencimentoFrom?: string
    vencimentoTo?: string
    /** Criação — período */
    criacaoFrom?: string
    criacaoTo?: string
    /** Conclusão — período (sobrescreve janelaConclusao se setado) */
    conclusaoFrom?: string
    conclusaoTo?: string
    /** Filtros de "campos vazios" / urgência */
    urgencia: TaskUrgenciaFilter[]
    /** Atrasada há mais de N dias */
    atrasadaMaisDias?: number
}

export const initialTaskFilters: TaskFilterState = {
    search: '',
    situacao: 'abertas',
    janelaConclusao: 'sempre',
    scope: 'minhas',
    tipos: [],
    prioridades: [],
    origens: [],
    resultados: [],
    fases: [],
    responsavelIds: [],
    cardFases: [],
    cardStatusComercial: [],
    urgencia: [],
}

interface TaskFiltersStore {
    filters: TaskFilterState
    setFilters: (partial: Partial<TaskFilterState>) => void
    reset: () => void
}

/**
 * Filtros da página de Tarefas.
 *
 * Persistência: localStorage (igual ao Kanban — sobrevive reload sem poluir
 * URL). Search é excluído do partialize porque seria ruído no histórico.
 *
 * Comportamento esperto:
 * - Trocar `scope` zera responsavelIds (filtro incompatível)
 * - Setar `vencimentoFrom/To` libera o usuário a deixar `situacao` em qualquer
 *   estado (ele escolhe a janela manualmente)
 */
export const useTaskFilters = create<TaskFiltersStore>()(
    persist(
        (set) => ({
            filters: { ...initialTaskFilters },
            setFilters: (partial) =>
                set((state) => {
                    const next = { ...state.filters, ...partial }

                    // Cascade: trocar escopo zera filtro de pessoa específica (incompatível)
                    if (partial.scope && partial.scope !== state.filters.scope) {
                        next.responsavelIds = []
                    }

                    return { filters: next }
                }),
            reset: () => set({ filters: { ...initialTaskFilters } }),
        }),
        {
            name: 'tasks-filters-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                filters: { ...state.filters, search: '' },
            }),
        },
    ),
)
