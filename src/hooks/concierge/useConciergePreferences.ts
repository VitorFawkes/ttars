import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOrg } from '../../contexts/OrgContext'
import { SOURCE_LABEL, type TipoConcierge, type SourceConcierge } from './types'
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
  /** Mostrar atendimentos com outcome (Feito/Encerrado) com mais de 2 dias.
   *  Default false: o Kanban esconde por padrão pra reduzir ruído. */
  mostrarConcluidosAntigos: boolean
  /** Renderiza a lista do checklist diretamente nos cards do kanban, com
   *  checkboxes clicáveis (marca/desmarca sem abrir o modal). Default true. */
  mostrarChecklists: boolean
}

const DEFAULT_PREFS: ConciergePreferences = {
  modo: 'tarefas',
  donoFilter: 'me',
  tipos: [],
  sources: [],
  janelas: [],
  categorias: [],
  tagIds: [],
  mostrarConcluidosAntigos: false,
  mostrarChecklists: true,
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
      // Filtra valores que não estão mais em SOURCE_LABEL (ex: usuários
      // que tinham 'planner_request' salvo antes da remoção em 20260505d).
      sources: Array.isArray(parsed.sources)
        ? (parsed.sources as string[]).filter((s): s is SourceConcierge => s in SOURCE_LABEL)
        : [],
      janelas: Array.isArray(parsed.janelas) ? (parsed.janelas as JanelaEmbarque[]) : [],
      categorias: Array.isArray(parsed.categorias) ? parsed.categorias : [],
      tagIds: Array.isArray(parsed.tagIds) ? parsed.tagIds : [],
      mostrarConcluidosAntigos: typeof parsed.mostrarConcluidosAntigos === 'boolean'
        ? parsed.mostrarConcluidosAntigos
        : false,
      mostrarChecklists: typeof parsed.mostrarChecklists === 'boolean'
        ? parsed.mostrarChecklists
        : true,
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

  // Rehidrata quando a org muda (key inicial pode ser null se o OrgContext
  // ainda não carregou). Importante: NÃO escrever no localStorage dentro
  // de um useEffect que reage a [key, prefs] — isso sobrescreveria os
  // dados persistidos com DEFAULT_PREFS entre o setPrefs(readPrefs) e o
  // ciclo seguinte. Toda persistência acontece dentro das funções de
  // mutação abaixo, com o `key` capturado no momento da chamada.
  useEffect(() => {
    setPrefs(readPrefs(key))
  }, [key])

  const setPref = useCallback(<K extends keyof ConciergePreferences>(
    field: K,
    value: ConciergePreferences[K] | ((prev: ConciergePreferences[K]) => ConciergePreferences[K])
  ) => {
    setPrefs(prev => {
      const nextValue = typeof value === 'function'
        ? (value as (p: ConciergePreferences[K]) => ConciergePreferences[K])(prev[field])
        : value
      const next = { ...prev, [field]: nextValue }
      writePrefs(key, next)
      return next
    })
  }, [key])

  const clearAll = useCallback(() => {
    setPrefs(() => {
      writePrefs(key, DEFAULT_PREFS)
      return DEFAULT_PREFS
    })
  }, [key])

  const toggleSet = useCallback(<K extends 'tipos' | 'sources' | 'janelas' | 'categorias' | 'tagIds'>(
    field: K,
    value: ConciergePreferences[K][number]
  ) => {
    setPrefs(prev => {
      const arr = (prev[field] as string[]) ?? []
      const nextArr = arr.includes(value as string)
        ? arr.filter(v => v !== value)
        : [...arr, value as string]
      const next = { ...prev, [field]: nextArr as ConciergePreferences[K] }
      writePrefs(key, next)
      return next
    })
  }, [key])

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
