import { useState, useCallback } from 'react'
import type { SortBy, SortDirection } from './usePipelineFilters'
import { usePipelineFilters } from './usePipelineFilters'

export interface StageSortConfig {
    sortBy: SortBy
    sortDirection: SortDirection
}

type StageSortMap = Record<string, StageSortConfig>

function storageKey(pipelineId: string) {
    return `stage-sort:${pipelineId}`
}

function loadFromStorage(pipelineId: string): StageSortMap {
    try {
        const raw = localStorage.getItem(storageKey(pipelineId))
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

function saveToStorage(pipelineId: string, map: StageSortMap) {
    localStorage.setItem(storageKey(pipelineId), JSON.stringify(map))
}

export function useStageSort(pipelineId: string) {
    const { filters } = usePipelineFilters()
    const [overrides, setOverrides] = useState<StageSortMap>(() => loadFromStorage(pipelineId))

    const globalSort: StageSortConfig = {
        sortBy: filters.sortBy || 'created_at',
        sortDirection: filters.sortDirection || 'desc',
    }

    const getStageSortConfig = useCallback((stageId: string): StageSortConfig => {
        return overrides[stageId] || globalSort
    }, [overrides, globalSort.sortBy, globalSort.sortDirection])

    const setStageSortConfig = useCallback((stageId: string, config: StageSortConfig) => {
        setOverrides(prev => {
            const next = { ...prev, [stageId]: config }
            saveToStorage(pipelineId, next)
            return next
        })
    }, [pipelineId])

    const clearStageSortConfig = useCallback((stageId: string) => {
        setOverrides(prev => {
            const next = { ...prev }
            delete next[stageId]
            saveToStorage(pipelineId, next)
            return next
        })
    }, [pipelineId])

    const hasStageSortOverride = useCallback((stageId: string): boolean => {
        return stageId in overrides
    }, [overrides])

    return { getStageSortConfig, setStageSortConfig, clearStageSortConfig, hasStageSortOverride }
}
