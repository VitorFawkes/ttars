import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/** Estado fundamental da tarefa (eixo 1, mutually exclusive) */
export type TaskEstado = 'pendentes' | 'concluidas' | 'reagendadas' | 'canceladas' | 'tudo'

/** Janela de prazo (eixo 2, multi-select — só faz sentido quando estado=pendentes) */
export type TaskPrazo = 'atrasadas' | 'hoje' | 'amanha' | 'esta_semana' | 'proxima_semana' | 'sem_prazo'

/** Janela temporal de conclusão (só faz sentido quando estado=concluidas) */
export type TaskJanelaConclusao = 'hoje' | 'ontem' | 'esta_semana' | 'este_mes' | 'sempre'

export type TaskScopeFilter = 'minhas' | 'meu_time' | 'todas'
export type TaskPrioridadeFilter = 'alta' | 'media' | 'baixa'
export type TaskOrigemFilter = 'manual' | 'cadencia' | 'automacao' | 'integracao'
export type TaskUrgenciaFilter = 'sem_responsavel' | 'sem_prazo' | 'sem_descricao' | 'sem_resultado'

export interface TaskFilterState {
    /** Busca livre */
    search: string
    /** Estado fundamental (Pendentes/Concluídas/Reagendadas/Canceladas/Tudo) */
    estado: TaskEstado
    /** Prazo (multi-select, ativo quando estado=pendentes ou tudo) */
    prazos: TaskPrazo[]
    /** Janela de conclusão (combina com estado=concluidas) */
    janelaConclusao: TaskJanelaConclusao
    /** Escopo (minhas / time / todas) */
    scope: TaskScopeFilter
    /** Tipos de tarefa */
    tipos: string[]
    /** Prioridade */
    prioridades: TaskPrioridadeFilter[]
    /** Origem (manual/cadência/automação/integração) */
    origens: TaskOrigemFilter[]
    /** Resultado / outcome */
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
    estado: 'pendentes',
    prazos: [],
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
    /** Aplica preset "Foco hoje": estado=pendentes + prazos=[atrasadas, hoje] */
    applyFocoHoje: () => void
    reset: () => void
}

/**
 * Filtros da página de Tarefas — modelo de 2 eixos.
 *
 * Eixo 1 (estado): Pendentes / Concluídas / Reagendadas / Canceladas / Tudo
 * Eixo 2 (prazos): Atrasadas / Hoje / Amanhã / Esta semana / Próx. semana / Sem prazo
 *
 * Composição:
 * - estado=pendentes + prazos=[atrasadas, hoje] → minhas tarefas urgentes
 * - estado=concluidas + janelaConclusao=hoje → o que terminei hoje
 * - estado=tudo → relatório completo (raro)
 *
 * Persistência: localStorage. Search excluído do partialize.
 *
 * Comportamento esperto:
 * - Trocar `scope` zera responsavelIds (filtro incompatível)
 * - Trocar `estado` para algo que não seja pendentes/tudo zera `prazos`
 */
export const useTaskFilters = create<TaskFiltersStore>()(
    persist(
        (set) => ({
            filters: { ...initialTaskFilters },
            setFilters: (partial) =>
                set((state) => {
                    const next = { ...state.filters, ...partial }

                    if (partial.scope && partial.scope !== state.filters.scope) {
                        next.responsavelIds = []
                    }

                    if (partial.estado && partial.estado !== state.filters.estado) {
                        if (partial.estado !== 'pendentes' && partial.estado !== 'tudo') {
                            next.prazos = []
                        }
                    }

                    return { filters: next }
                }),
            applyFocoHoje: () =>
                set((state) => ({
                    filters: {
                        ...state.filters,
                        estado: 'pendentes',
                        prazos: ['atrasadas', 'hoje'],
                    },
                })),
            reset: () => set({ filters: { ...initialTaskFilters } }),
        }),
        {
            name: 'tasks-filters-storage-v2',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                filters: { ...state.filters, search: '' },
            }),
        },
    ),
)
