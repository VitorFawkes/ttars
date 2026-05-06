import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export type TaskDeadlineFilter = 'all' | 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'no_date'
export type TaskStatusFilter = 'pending' | 'completed_today' | 'all'
export type TaskScopeFilter = 'minhas' | 'meu_time' | 'todas'
export type TaskPrioridadeFilter = 'alta' | 'media' | 'baixa'
export type TaskOrigemFilter = 'manual' | 'cadencia' | 'automacao' | 'integracao'

export interface TaskFilterState {
    search: string
    deadlineFilter: TaskDeadlineFilter
    statusFilter: TaskStatusFilter
    scope: TaskScopeFilter
    tipos: string[]
    prioridades: TaskPrioridadeFilter[]
    origens: TaskOrigemFilter[]
    /** Filtrar por slug de fase do time do responsável (SDR, Planner, Pós-venda) */
    fases: string[]
    responsavelIds: string[]
    /** Date range for due date */
    dateFrom?: string
    dateTo?: string
}

export const initialTaskFilters: TaskFilterState = {
    search: '',
    deadlineFilter: 'all',
    statusFilter: 'pending',
    scope: 'minhas',
    tipos: [],
    prioridades: [],
    origens: [],
    fases: [],
    responsavelIds: [],
}

const DEADLINE_VALUES: TaskDeadlineFilter[] = ['all', 'overdue', 'today', 'tomorrow', 'this_week', 'next_week', 'no_date']
const STATUS_VALUES: TaskStatusFilter[] = ['pending', 'completed_today', 'all']
const SCOPE_VALUES: TaskScopeFilter[] = ['minhas', 'meu_time', 'todas']
const PRIORIDADE_VALUES: TaskPrioridadeFilter[] = ['alta', 'media', 'baixa']
const ORIGEM_VALUES: TaskOrigemFilter[] = ['manual', 'cadencia', 'automacao', 'integracao']

function parseEnum<T extends string>(value: string | null, allowed: T[], fallback: T): T {
    return value && (allowed as string[]).includes(value) ? (value as T) : fallback
}

function parseEnumList<T extends string>(value: string | null, allowed: T[]): T[] {
    if (!value) return []
    return value.split(',').filter((v): v is T => (allowed as string[]).includes(v))
}

function parseStringList(value: string | null): string[] {
    if (!value) return []
    return value.split(',').filter(Boolean)
}

function parseFilters(params: URLSearchParams): TaskFilterState {
    return {
        search: params.get('q') || '',
        deadlineFilter: parseEnum(params.get('prazo'), DEADLINE_VALUES, 'all'),
        statusFilter: parseEnum(params.get('status'), STATUS_VALUES, 'pending'),
        scope: parseEnum(params.get('escopo'), SCOPE_VALUES, 'minhas'),
        tipos: parseStringList(params.get('tipo')),
        prioridades: parseEnumList(params.get('prioridade'), PRIORIDADE_VALUES),
        origens: parseEnumList(params.get('origem'), ORIGEM_VALUES),
        fases: parseStringList(params.get('fase')),
        responsavelIds: parseStringList(params.get('quem')),
        dateFrom: params.get('de') || undefined,
        dateTo: params.get('ate') || undefined,
    }
}

function serializeFilters(filters: TaskFilterState, prev: URLSearchParams): URLSearchParams {
    const next = new URLSearchParams(prev)

    const setOrDelete = (key: string, value: string | undefined | null) => {
        if (value && value.length > 0) next.set(key, value)
        else next.delete(key)
    }
    const setListOrDelete = (key: string, list: string[]) => {
        if (list.length > 0) next.set(key, list.join(','))
        else next.delete(key)
    }

    setOrDelete('q', filters.search)
    setOrDelete('prazo', filters.deadlineFilter !== 'all' ? filters.deadlineFilter : null)
    setOrDelete('status', filters.statusFilter !== 'pending' ? filters.statusFilter : null)
    setOrDelete('escopo', filters.scope !== 'minhas' ? filters.scope : null)
    setListOrDelete('tipo', filters.tipos)
    setListOrDelete('prioridade', filters.prioridades)
    setListOrDelete('origem', filters.origens)
    setListOrDelete('fase', filters.fases)
    setListOrDelete('quem', filters.responsavelIds)
    setOrDelete('de', filters.dateFrom)
    setOrDelete('ate', filters.dateTo)

    return next
}

/**
 * Filtros da página de Tarefas sincronizados com a URL (querystring).
 *
 * Mantém a mesma interface { filters, setFilters, reset } da versão Zustand
 * antiga para minimizar blast radius. Persistência agora vem do navegador
 * (back/forward, bookmark, link compartilhável).
 */
export function useTaskFilters() {
    const [searchParams, setSearchParams] = useSearchParams()

    const filters = useMemo(() => parseFilters(searchParams), [searchParams])

    const setFilters = useCallback((partial: Partial<TaskFilterState>) => {
        setSearchParams(prev => {
            const current = parseFilters(prev)
            const merged: TaskFilterState = { ...current, ...partial }
            return serializeFilters(merged, prev)
        }, { replace: true })
    }, [setSearchParams])

    const reset = useCallback(() => {
        setSearchParams(prev => {
            // preserva params não relacionados a tarefas
            const next = new URLSearchParams(prev)
            const ours = ['q', 'prazo', 'status', 'escopo', 'tipo', 'prioridade', 'origem', 'fase', 'quem', 'de', 'ate']
            ours.forEach(k => next.delete(k))
            return next
        }, { replace: true })
    }, [setSearchParams])

    return { filters, setFilters, reset }
}
