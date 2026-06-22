import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useOrg } from '../../contexts/OrgContext'
import { ETAPA_ORDER, STATUS_RSVP_LIST, type EtapaConvidados, type StatusRSVP } from './types'

export type ConvidadosModo =
  | 'casamentos'
  | 'convidados'
  | 'envios_hoje'
  | 'envio_especifico'
  | 'disparo'
  | 'casais'
  | 'extras'

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
        : parsed.modo === 'envio_especifico' ? 'envio_especifico'
        : parsed.modo === 'disparo' ? 'disparo'
        : parsed.modo === 'casais' ? 'casais'
        : parsed.modo === 'extras' ? 'extras'
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

// Store compartilhado por org. As prefs eram um `useState` local em cada
// instância do hook — FiltersBar, ConvidadosPage e CasamentosBoard tinham
// CÓPIAS SEPARADAS. Digitar na busca (FiltersBar) atualizava só a cópia dele;
// o board lia outra cópia e nunca filtrava. Um store externo único por org
// mantém todos os consumidores em sincronia (mesmo padrão de useSeenCards).
type Listener = () => void
interface Store {
  snapshot: ConvidadosPreferences
  listeners: Set<Listener>
}
const stores = new Map<string, Store>()

function getStore(key: string): Store {
  let store = stores.get(key)
  if (!store) {
    store = { snapshot: readPrefs(key), listeners: new Set() }
    stores.set(key, store)
  }
  return store
}

function commitPrefs(key: string, next: ConvidadosPreferences) {
  const store = getStore(key)
  store.snapshot = next
  writePrefs(key, next)
  store.listeners.forEach(l => l())
}

export function useConvidadosPreferences() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const key = storageKey(orgId)

  const subscribe = useCallback((listener: Listener) => {
    if (!key) return () => {}
    const store = getStore(key)
    store.listeners.add(listener)
    return () => store.listeners.delete(listener)
  }, [key])

  const getSnapshot = useCallback(
    () => (key ? getStore(key).snapshot : DEFAULT_PREFS),
    [key],
  )

  const prefs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setPref = useCallback(<K extends keyof ConvidadosPreferences>(
    field: K,
    value: ConvidadosPreferences[K] | ((prev: ConvidadosPreferences[K]) => ConvidadosPreferences[K])
  ) => {
    if (!key) return
    const prev = getStore(key).snapshot
    const nextValue = typeof value === 'function'
      ? (value as (p: ConvidadosPreferences[K]) => ConvidadosPreferences[K])(prev[field])
      : value
    commitPrefs(key, { ...prev, [field]: nextValue })
  }, [key])

  const toggleEtapa = useCallback((etapa: EtapaConvidados) => {
    if (!key) return
    const prev = getStore(key).snapshot
    const has = prev.etapaFilter.includes(etapa)
    const nextArr = has ? prev.etapaFilter.filter(e => e !== etapa) : [...prev.etapaFilter, etapa]
    commitPrefs(key, { ...prev, etapaFilter: nextArr })
  }, [key])

  const toggleStatus = useCallback((status: StatusRSVP) => {
    if (!key) return
    const prev = getStore(key).snapshot
    const has = prev.statusFilter.includes(status)
    const nextArr = has ? prev.statusFilter.filter(s => s !== status) : [...prev.statusFilter, status]
    commitPrefs(key, { ...prev, statusFilter: nextArr })
  }, [key])

  const toggleWedding = useCallback((cardId: string) => {
    if (!key) return
    const prev = getStore(key).snapshot
    const has = prev.weddingFilter.includes(cardId)
    const nextArr = has ? prev.weddingFilter.filter(c => c !== cardId) : [...prev.weddingFilter, cardId]
    commitPrefs(key, { ...prev, weddingFilter: nextArr })
  }, [key])

  // "Limpar" zera só os filtros da lista de convidados (busca/status/casamento).
  // Preserva `modo` e os filtros da visão "Por casamento" — antes resetava tudo,
  // mas o efeito colateral em `modo` ficava mascarado pela falta de sync.
  const clearAll = useCallback(() => {
    if (!key) return
    const prev = getStore(key).snapshot
    commitPrefs(key, { ...prev, search: '', statusFilter: [], weddingFilter: [] })
  }, [key])

  const hasAnyFilter = useMemo(() => (
    prefs.search.trim().length > 0 ||
    prefs.statusFilter.length > 0 ||
    prefs.weddingFilter.length > 0
  ), [prefs])

  return { prefs, setPref, toggleEtapa, toggleStatus, toggleWedding, clearAll, hasAnyFilter }
}
