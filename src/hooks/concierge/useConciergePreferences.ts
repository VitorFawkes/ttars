import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOrg } from '../../contexts/OrgContext'
import type { TipoConcierge, SourceConcierge } from './types'
import type { JanelaEmbarque } from './useKanbanTarefas'

export type Modo = 'tarefas' | 'viagens'
export type DonoFilter = 'me' | 'all' | string

export interface ConciergePreferences {
  modo: Modo
  donoFilter: DonoFilter
  tipos: TipoConcierge[]
  sources: SourceConcierge[]
  janelas: JanelaEmbarque[]
  categorias: string[]
  tagIds: string[]
}

const DEFAULT_PREFS: ConciergePreferences = {
  modo: 'tarefas',
  donoFilter: 'me',
  tipos: [],
  sources: [],
  janelas: [],
  categorias: [],
  tagIds: [],
}

const STORAGE_PREFIX = 'welcomecrm:concierge:kanban:v1'

function storageKey(orgId: string | null | undefined) {
  return orgId ? `${STORAGE_PREFIX}:${orgId}` : null
}

function readPrefs(key: string | null): ConciergePreferences {
  if (!key || typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<ConciergePreferences>
    return {
      modo: parsed.modo === 'viagens' ? 'viagens' : 'tarefas',
      donoFilter: parsed.donoFilter ?? 'me',
      tipos: Array.isArray(parsed.tipos) ? (parsed.tipos as TipoConcierge[]) : [],
      sources: Array.isArray(parsed.sources) ? (parsed.sources as SourceConcierge[]) : [],
      janelas: Array.isArray(parsed.janelas) ? (parsed.janelas as JanelaEmbarque[]) : [],
      categorias: Array.isArray(parsed.categorias) ? parsed.categorias : [],
      tagIds: Array.isArray(parsed.tagIds) ? parsed.tagIds : [],
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function writePrefs(key: string | null, prefs: ConciergePreferences) {
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(prefs))
  } catch {
    // localStorage cheio ou desabilitado — silenciar
  }
}

export function useConciergePreferences() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const key = storageKey(orgId)

  const [prefs, setPrefs] = useState<ConciergePreferences>(() => readPrefs(key))

  useEffect(() => {
    setPrefs(readPrefs(key))
  }, [key])

  useEffect(() => {
    writePrefs(key, prefs)
  }, [key, prefs])

  const setPref = useCallback(<K extends keyof ConciergePreferences>(
    field: K,
    value: ConciergePreferences[K] | ((prev: ConciergePreferences[K]) => ConciergePreferences[K])
  ) => {
    setPrefs(prev => ({
      ...prev,
      [field]: typeof value === 'function'
        ? (value as (p: ConciergePreferences[K]) => ConciergePreferences[K])(prev[field])
        : value,
    }))
  }, [])

  const clearAll = useCallback(() => {
    setPrefs(DEFAULT_PREFS)
  }, [])

  const toggleSet = useCallback(<K extends 'tipos' | 'sources' | 'janelas' | 'categorias' | 'tagIds'>(
    field: K,
    value: ConciergePreferences[K][number]
  ) => {
    setPrefs(prev => {
      const arr = (prev[field] as string[]) ?? []
      const next = arr.includes(value as string)
        ? arr.filter(v => v !== value)
        : [...arr, value as string]
      return { ...prev, [field]: next as ConciergePreferences[K] }
    })
  }, [])

  const hasAnyFilter = useMemo(() => (
    prefs.tipos.length > 0 ||
    prefs.sources.length > 0 ||
    prefs.janelas.length > 0 ||
    prefs.categorias.length > 0 ||
    prefs.tagIds.length > 0
  ), [prefs])

  return { prefs, setPref, toggleSet, clearAll, hasAnyFilter }
}

export const __TEST_DEFAULT_PREFS = DEFAULT_PREFS
