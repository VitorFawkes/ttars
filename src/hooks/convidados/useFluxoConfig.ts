import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from './_supabaseUntyped'

/** Cada categoria do fluxo é uma sequência fixa de mensagens.
 *  - promom1..promom5 (5 mensagens promocionais)
 *  - pade1m1..pade1m5 (5 mensagens de Etapa 1)
 *  - pade2m1..pade2m25 (25 mensagens de Etapa 2)
 *  Tudo isso somado dá 35 mensagens no fluxo. */
export interface FluxoCategoria {
  slug: 'promom' | 'pade1m' | 'pade2m'
  label: string
  description: string
  count: number
  dot: string
  bg: string
  bgLight: string
  text: string
}

export const FLUXO_CATEGORIAS: readonly FluxoCategoria[] = [
  {
    slug: 'promom',
    label: 'Promocional',
    description: 'promom1-5',
    count: 5,
    dot: 'bg-violet-500',
    bg: 'bg-violet-100',
    bgLight: 'bg-violet-50',
    text: 'text-violet-700',
  },
  {
    slug: 'pade1m',
    label: 'Etapa 1',
    description: 'pade1m1-5',
    count: 5,
    dot: 'bg-sky-500',
    bg: 'bg-sky-100',
    bgLight: 'bg-sky-50',
    text: 'text-sky-700',
  },
  {
    slug: 'pade2m',
    label: 'Etapa 2',
    description: 'pade2m1-25',
    count: 25,
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-100',
    bgLight: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
] as const

export type FluxoSlug = FluxoCategoria['slug']
export type FluxoIntervals = Record<FluxoSlug, number>

export const DEFAULT_INTERVALS: FluxoIntervals = {
  promom: 5,
  pade1m: 15,
  pade2m: 20,
}

/** Uma variação de fluxo nomeada. Persistida na tabela `fluxo_templates`. */
export interface FluxoVariation {
  id: string
  name: string
  intervals: FluxoIntervals
}

interface FluxoTemplateRow {
  id: string
  org_id: string
  name: string
  intervals: FluxoIntervals | Record<string, number>
  is_default: boolean
  created_at: string
  updated_at: string
}

function clampDays(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(365, Math.round(n)))
}

function sanitizeIntervals(raw: Record<string, number> | undefined): FluxoIntervals {
  return {
    promom: clampDays(raw?.promom ?? DEFAULT_INTERVALS.promom),
    pade1m: clampDays(raw?.pade1m ?? DEFAULT_INTERVALS.pade1m),
    pade2m: clampDays(raw?.pade2m ?? DEFAULT_INTERVALS.pade2m),
  }
}

function rowToVariation(row: FluxoTemplateRow): FluxoVariation {
  return {
    id: row.id,
    name: row.name,
    intervals: sanitizeIntervals(row.intervals as Record<string, number>),
  }
}

function intervalsEqual(a: FluxoIntervals, b: FluxoIntervals): boolean {
  return a.promom === b.promom && a.pade1m === b.pade1m && a.pade2m === b.pade2m
}

// ────────────────────────────────────────────────────────────────────────
// useFluxoTemplates — fetcher puro
// ────────────────────────────────────────────────────────────────────────

/** Lista todos os fluxos da org ativa direto do DB. Sem state de UI.
 *  Consumidores que só precisam ler a lista de fluxos usam este hook. */
export function useFluxoTemplates() {
  const { org } = useOrg()
  const orgId = org?.id ?? null

  return useQuery<FluxoVariation[]>({
    queryKey: ['convidados', 'fluxo-templates', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await sbAny
        .from('fluxo_templates')
        .select('id, org_id, name, intervals, is_default, created_at, updated_at')
        .eq('org_id', orgId)
        .is('deleted_at', null)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return ((data ?? []) as FluxoTemplateRow[]).map(rowToVariation)
    },
  })
}

// ────────────────────────────────────────────────────────────────────────
// useFluxoConfig — hook completo com state de UI (activeId, draft)
// ────────────────────────────────────────────────────────────────────────

const ACTIVE_ID_STORAGE_PREFIX = 'welcomecrm:convidados:active-fluxo:v1'

function activeIdStorageKey(orgId: string | null): string | null {
  return orgId ? `${ACTIVE_ID_STORAGE_PREFIX}:${orgId}` : null
}

function readActiveId(key: string | null): string | null {
  if (!key || typeof window === 'undefined') return null
  try { return window.localStorage.getItem(key) } catch { return null }
}

function writeActiveId(key: string | null, id: string) {
  if (!key || typeof window === 'undefined') return
  try { window.localStorage.setItem(key, id) } catch { /* silencia */ }
}

/** Hook completo de configuração do fluxo: variações vêm do DB, mas o
 *  "fluxo ativo" da UI (qual variação o usuário está visualizando/editando
 *  na ConfiguracaoFluxoPage) é state local persistido em localStorage. */
export function useFluxoConfig() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const qc = useQueryClient()
  const templatesQuery = useFluxoTemplates()
  const flows = useMemo<FluxoVariation[]>(() => templatesQuery.data ?? [], [templatesQuery.data])

  const activeKey = activeIdStorageKey(orgId)
  const [activeId, setActiveId] = useState<string>(() => readActiveId(activeKey) ?? '')

  // Quando flows carregam, escolhe o primeiro como ativo se não houver válido.
  useEffect(() => {
    if (flows.length === 0) return
    const stored = readActiveId(activeKey)
    if (stored && flows.some(f => f.id === stored)) {
      setActiveId(stored)
    } else {
      const first = flows[0].id
      setActiveId(first)
      writeActiveId(activeKey, first)
    }
  }, [flows, activeKey])

  const active = useMemo<FluxoVariation>(
    () => flows.find(f => f.id === activeId) ?? flows[0] ?? {
      id: '',
      name: 'Padrão',
      intervals: { ...DEFAULT_INTERVALS },
    },
    [flows, activeId],
  )

  const [draft, setDraft] = useState<FluxoIntervals>(active.intervals)
  useEffect(() => {
    setDraft(active.intervals)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id])

  const setField = useCallback((slug: FluxoSlug, value: number) => {
    setDraft(prev => ({ ...prev, [slug]: clampDays(value) }))
  }, [])

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['convidados', 'fluxo-templates', orgId] })
  }, [qc, orgId])

  // ── Mutations ─────────────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: async (vars: { id: string; intervals: FluxoIntervals }) => {
      const { error } = await sbAny
        .from('fluxo_templates')
        .update({ intervals: vars.intervals })
        .eq('id', vars.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const createMut = useMutation({
    mutationFn: async (vars: { name: string; intervals: FluxoIntervals }) => {
      if (!orgId) throw new Error('sem org')
      const { data, error } = await sbAny
        .from('fluxo_templates')
        .insert({
          org_id: orgId,
          name: vars.name,
          intervals: vars.intervals,
          is_default: false,
        })
        .select('id, org_id, name, intervals, is_default, created_at, updated_at')
        .single()
      if (error) throw error
      return data as FluxoTemplateRow
    },
    onSuccess: row => {
      invalidate()
      if (row?.id) {
        setActiveId(row.id)
        writeActiveId(activeKey, row.id)
      }
    },
  })

  const renameMut = useMutation({
    mutationFn: async (vars: { id: string; name: string }) => {
      const { error } = await sbAny
        .from('fluxo_templates')
        .update({ name: vars.name })
        .eq('id', vars.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete via deleted_at
      const { error } = await sbAny
        .from('fluxo_templates')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      invalidate()
      if (activeId === id) {
        const next = flows.find(f => f.id !== id)?.id ?? ''
        setActiveId(next)
        if (next) writeActiveId(activeKey, next)
      }
    },
  })

  // ── API pública ───────────────────────────────────────────────────────

  const save = useCallback(() => {
    if (!active.id) return
    saveMut.mutate({ id: active.id, intervals: draft })
  }, [active.id, draft, saveMut])

  const resetToDefault = useCallback(() => {
    setDraft({ ...DEFAULT_INTERVALS })
  }, [])

  const selectFlow = useCallback((id: string) => {
    if (!flows.some(f => f.id === id)) return
    setActiveId(id)
    writeActiveId(activeKey, id)
  }, [flows, activeKey])

  const createFlow = useCallback((name: string): string => {
    const nm = name.trim()
    if (!nm) return active.id
    // Cria com os intervalos do fluxo ativo (atalho conveniente).
    createMut.mutate({ name: nm, intervals: { ...active.intervals } })
    return ''  // o id real chega via onSuccess; consumidores que precisam
               // do id usam `flows` após refetch
  }, [active.intervals, active.id, createMut])

  const renameFlow = useCallback((id: string, name: string) => {
    const nm = name.trim()
    if (!nm) return
    renameMut.mutate({ id, name: nm })
  }, [renameMut])

  const deleteFlow = useCallback((id: string) => {
    if (flows.length <= 1) return  // sempre mantém pelo menos um
    deleteMut.mutate(id)
  }, [flows.length, deleteMut])

  const hasUnsavedChanges = useMemo(
    () => !intervalsEqual(active.intervals, draft),
    [active.intervals, draft],
  )

  return {
    flows,
    activeId,
    active,
    draft,
    setField,
    save,
    resetToDefault,
    selectFlow,
    createFlow,
    renameFlow,
    deleteFlow,
    hasUnsavedChanges,
    canDelete: flows.length > 1,
    isLoading: templatesQuery.isLoading,
  }
}

// ────────────────────────────────────────────────────────────────────────
// Computação de mensagens (puro — sem state)
// ────────────────────────────────────────────────────────────────────────

export interface FluxoMessage {
  index: number
  slug: string
  categoria: FluxoCategoria
  date: Date
}

/** Calcula a sequência de 35 mensagens a partir de uma data de início e
 *  os intervalos. */
export function computeFluxoMessages(intervals: FluxoIntervals, start: Date): FluxoMessage[] {
  const out: FluxoMessage[] = []
  const cur = new Date(start)
  cur.setHours(0, 0, 0, 0)
  let idx = 1
  for (const cat of FLUXO_CATEGORIAS) {
    const interval = intervals[cat.slug]
    for (let i = 1; i <= cat.count; i++) {
      if (idx === 1) {
        out.push({ index: idx, slug: `${cat.slug}${i}`, categoria: cat, date: new Date(cur) })
      } else {
        cur.setDate(cur.getDate() + interval)
        out.push({ index: idx, slug: `${cat.slug}${i}`, categoria: cat, date: new Date(cur) })
      }
      idx += 1
    }
  }
  return out
}

/** Duração total do fluxo em dias. */
export function computeFluxoTotalDays(intervals: FluxoIntervals): number {
  let total = 0
  for (let i = 0; i < FLUXO_CATEGORIAS.length; i++) {
    const cat = FLUXO_CATEGORIAS[i]
    const interval = intervals[cat.slug]
    const dentro = (cat.count - 1) * interval
    const entrada = i === 0 ? 0 : interval
    total += dentro + entrada
  }
  return total
}

export function totalFluxoMessages(): number {
  return FLUXO_CATEGORIAS.reduce((acc, c) => acc + c.count, 0)
}
