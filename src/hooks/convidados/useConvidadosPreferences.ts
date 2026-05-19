import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOrg } from '../../contexts/OrgContext'
import { ETAPA_ORDER, STATUS_RSVP_LIST, type EtapaConvidados, type StatusRSVP } from './types'

export type ConvidadosModo = 'casamentos' | 'convidados' | 'envios_hoje'

export interface ConvidadosPreferences {
  modo: ConvidadosModo
  /** Busca na visão "Lista de convidados" (filtra convidados por nome/email/telefone). */
  search: string
  /** Busca na visão "Por casamento" (filtra casamentos pelo título). */
  casamentosSearch: string
  /** Filtro de etapa na visão "Por casamento". Vazio = todas. */
  etapaFilter: EtapaConvidados[]
  /** Quando true, visão "Por casamento" mostra só casamentos pendentes de
   *  configuração (0 convidados ainda). Toggle pelo stat card. */
  pendentesOnly: boolean
  statusFilter: StatusRSVP[]
  weddingFilter: string[]
}

const DEFAULT_PREFS: ConvidadosPreferences = {
  modo: 'casamentos',
  search: '',
  casamentosSearch: '',
  etapaFilter: [],
  pendentesOnly: false,
  statusFilter: [],
  weddingFilter: [],
}

// v2 = reset após refactor pra contatos linkados + status RSVP em 4 estados.
// Quem ainda tinha valores antigos (pendente/talvez/ativo/removido, ou um
// weddingFilter de UUIDs que não existem mais) terá as prefs zeradas.
const STORAGE_PREFIX = 'welcomecrm:convidados:v2'

function storageKey(orgId: string | null | undefined) {
  return orgId ? `${STORAGE_PREFIX}:${orgId}` : null
}

function readPrefs(key: string | null): ConvidadosPreferences {
  if (!key || typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<ConvidadosPreferences>
    return {
      modo:
        parsed.modo === 'convidados' ? 'convidados'
        : parsed.modo === 'envios_hoje' ? 'envios_hoje'
        : 'casamentos',
      search: typeof parsed.search === 'string' ? parsed.search : '',
      casamentosSearch: typeof parsed.casamentosSearch === 'string' ? parsed.casamentosSearch : '',
      etapaFilter: Array.isArray(parsed.etapaFilter)
        ? (parsed.etapaFilter as string[]).filter((s): s is EtapaConvidados => ETAPA_ORDER.includes(s as EtapaConvidados))
        : [],
      pendentesOnly: typeof parsed.pendentesOnly === 'boolean' ? parsed.pendentesOnly : false,
      statusFilter: Array.isArray(parsed.statusFilter)
        ? (parsed.statusFilter as string[]).filter((s): s is StatusRSVP => STATUS_RSVP_LIST.includes(s as StatusRSVP))
        : [],
      weddingFilter: Array.isArray(parsed.weddingFilter)
        ? parsed.weddingFilter.filter((v): v is string => typeof v === 'string')
        : [],
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function writePrefs(key: string | null, prefs: ConvidadosPreferences) {
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(prefs))
  } catch {
    // localStorage cheio ou indisponível — silenciar
  }
}

export function useConvidadosPreferences() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const key = storageKey(orgId)

  const [prefs, setPrefs] = useState<ConvidadosPreferences>(() => readPrefs(key))

  useEffect(() => {
    setPrefs(readPrefs(key))
  }, [key])

  const setPref = useCallback(<K extends keyof ConvidadosPreferences>(
    field: K,
    value: ConvidadosPreferences[K] | ((prev: ConvidadosPreferences[K]) => ConvidadosPreferences[K])
  ) => {
    setPrefs(prev => {
      const nextValue = typeof value === 'function'
        ? (value as (p: ConvidadosPreferences[K]) => ConvidadosPreferences[K])(prev[field])
        : value
      const next = { ...prev, [field]: nextValue }
      writePrefs(key, next)
      return next
    })
  }, [key])

  const toggleEtapa = useCallback((etapa: EtapaConvidados) => {
    setPrefs(prev => {
      const has = prev.etapaFilter.includes(etapa)
      const nextArr = has ? prev.etapaFilter.filter(e => e !== etapa) : [...prev.etapaFilter, etapa]
      const next = { ...prev, etapaFilter: nextArr }
      writePrefs(key, next)
      return next
    })
  }, [key])

  const toggleStatus = useCallback((status: StatusRSVP) => {
    setPrefs(prev => {
      const has = prev.statusFilter.includes(status)
      const nextArr = has ? prev.statusFilter.filter(s => s !== status) : [...prev.statusFilter, status]
      const next = { ...prev, statusFilter: nextArr }
      writePrefs(key, next)
      return next
    })
  }, [key])

  const toggleWedding = useCallback((cardId: string) => {
    setPrefs(prev => {
      const has = prev.weddingFilter.includes(cardId)
      const nextArr = has ? prev.weddingFilter.filter(c => c !== cardId) : [...prev.weddingFilter, cardId]
      const next = { ...prev, weddingFilter: nextArr }
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

  const hasAnyFilter = useMemo(() => (
    prefs.search.trim().length > 0 ||
    prefs.statusFilter.length > 0 ||
    prefs.weddingFilter.length > 0
  ), [prefs])

  return { prefs, setPref, toggleEtapa, toggleStatus, toggleWedding, clearAll, hasAnyFilter }
}
