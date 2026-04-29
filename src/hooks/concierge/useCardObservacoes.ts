import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'

export interface CardObservacoes {
  briefing: Record<string, unknown>
  criticas: Record<string, unknown>
  pos_venda: Record<string, unknown>
}

interface ObservacaoEntry {
  key: string
  label: string
  value: string
  source: 'briefing' | 'criticas' | 'pos_venda'
}

const SECTION_LABEL: Record<string, string> = {
  briefing:  'Briefing inicial',
  criticas:  'Atenção',
  pos_venda: 'Pós-venda',
}

function humanizeKey(k: string): string {
  return k
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/Obs /i, '')
    .trim()
}

function valueToString(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    const flat = v.map(x => valueToString(x)).filter(Boolean)
    return flat.length ? flat.join(', ') : null
  }
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return null }
  }
  return null
}

export function useCardObservacoes(cardId: string | null | undefined) {
  return useQuery({
    queryKey: ['card-observacoes', cardId],
    queryFn: async (): Promise<CardObservacoes> => {
      if (!cardId) return { briefing: {}, criticas: {}, pos_venda: {} }
      const { data, error } = await sbAny
        .from('cards')
        .select('briefing_inicial, produto_data')
        .eq('id', cardId)
        .single()
      if (error) throw error
      const briefing  = ((data?.briefing_inicial as Record<string, unknown> | null)?.observacoes ?? {}) as Record<string, unknown>
      const produto   = (data?.produto_data as Record<string, unknown> | null) ?? {}
      const criticas  = (produto.observacoes_criticas ?? {}) as Record<string, unknown>
      const pos_venda = (produto.observacoes_pos_venda ?? {}) as Record<string, unknown>
      return { briefing, criticas, pos_venda }
    },
    enabled: !!cardId,
    staleTime: 60 * 1000,
  })
}

/**
 * Achata as 3 fontes de observações em uma lista plana, descartando entradas vazias.
 */
export function flattenObservacoes(obs: CardObservacoes | null | undefined): ObservacaoEntry[] {
  if (!obs) return []
  const out: ObservacaoEntry[] = []
  for (const source of ['criticas', 'briefing', 'pos_venda'] as const) {
    const bag = obs[source]
    if (!bag || typeof bag !== 'object') continue
    for (const [key, raw] of Object.entries(bag)) {
      const value = valueToString(raw)
      if (!value) continue
      out.push({ key, label: humanizeKey(key), value, source })
    }
  }
  return out
}

export { SECTION_LABEL as OBS_SECTION_LABEL }
