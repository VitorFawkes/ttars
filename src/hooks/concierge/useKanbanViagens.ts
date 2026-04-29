import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import type { MeuDiaItem, TipoConcierge } from './types'

export type SaudeViagem = 'critica' | 'em_andamento' | 'concluida'

export interface KanbanViagensFilters {
  donoId?: string | null
  tipos?: TipoConcierge[]
}

export interface ViagemKanbanItem {
  card_id: string
  card_titulo: string
  produto: string
  data_viagem_inicio: string | null
  data_viagem_fim: string | null
  pessoa_principal_id: string | null
  card_valor_estimado: number | null
  card_valor_final: number | null
  saude: SaudeViagem
  total_atendimentos: number
  abertos: number
  vencidos: number
  hoje: number
  esta_semana: number
  concluidos: number
  proxima_data_vencimento: string | null
  dias_pra_embarque: number | null
  tipos_pendentes: TipoConcierge[]
}

export interface SaudeColumnSpec {
  id: SaudeViagem
  label: string
  emoji: string
  hint: string
  tone: { bg: string; text: string; border: string; accent: string }
}

export const SAUDE_COLUMNS: SaudeColumnSpec[] = [
  { id: 'critica',       label: 'Crítica',       emoji: '🔴', hint: 'Vencida ou embarca em até 48h',     tone: { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     accent: 'bg-red-500'     } },
  { id: 'em_andamento',  label: 'Em andamento',  emoji: '🟡', hint: 'Tem atendimentos abertos',            tone: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   accent: 'bg-amber-500'   } },
  { id: 'concluida',     label: 'Concluída',     emoji: '✅', hint: 'Sem pendências no momento',           tone: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', accent: 'bg-emerald-500' } },
]

function classifySaude(viagem: {
  abertos: number
  vencidos: number
  dias_pra_embarque: number | null
}): SaudeViagem {
  if (viagem.abertos === 0) return 'concluida'
  if (viagem.vencidos > 0) return 'critica'
  if (viagem.dias_pra_embarque !== null && viagem.dias_pra_embarque >= 0 && viagem.dias_pra_embarque <= 2) return 'critica'
  return 'em_andamento'
}

export function useKanbanViagens(filters: KanbanViagensFilters = {}) {
  const query = useQuery({
    queryKey: ['concierge', 'kanban-viagens', filters],
    queryFn: async (): Promise<ViagemKanbanItem[]> => {
      let q = sbAny.from('v_meu_dia_concierge').select('*')

      if (filters.donoId) q = q.eq('dono_id', filters.donoId)
      if (filters.tipos?.length) q = q.in('tipo_concierge', filters.tipos)

      const { data, error } = await q
      if (error) throw error

      const byCard = new Map<string, MeuDiaItem[]>()
      for (const item of (data ?? []) as MeuDiaItem[]) {
        const list = byCard.get(item.card_id) ?? []
        list.push(item)
        byCard.set(item.card_id, list)
      }

      const result: ViagemKanbanItem[] = []
      for (const [card_id, items] of byCard.entries()) {
        const head = items[0]
        const abertos = items.filter(i => !i.outcome && !i.concluida)
        const vencidos = items.filter(i => i.status_apresentacao === 'vencido' && !i.outcome).length
        const hoje = items.filter(i => i.status_apresentacao === 'hoje' && !i.outcome).length
        const esta_semana = items.filter(i => i.status_apresentacao === 'esta_semana' && !i.outcome).length
        const concluidos = items.filter(i => i.outcome === 'feito' || i.outcome === 'aceito' || i.concluida).length

        const proximaData = abertos
          .map(i => i.data_vencimento)
          .filter((d): d is string => !!d)
          .sort()[0] ?? null

        const tiposSet = new Set<TipoConcierge>()
        for (const i of abertos) tiposSet.add(i.tipo_concierge)

        const viagem: Omit<ViagemKanbanItem, 'saude'> = {
          card_id,
          card_titulo: head.card_titulo,
          produto: head.produto,
          data_viagem_inicio: head.data_viagem_inicio,
          data_viagem_fim: head.data_viagem_fim,
          pessoa_principal_id: head.pessoa_principal_id,
          card_valor_estimado: head.card_valor_estimado,
          card_valor_final: head.card_valor_final,
          total_atendimentos: items.length,
          abertos: abertos.length,
          vencidos,
          hoje,
          esta_semana,
          concluidos,
          proxima_data_vencimento: proximaData,
          dias_pra_embarque: head.dias_pra_embarque,
          tipos_pendentes: Array.from(tiposSet),
        }

        result.push({
          ...viagem,
          saude: classifySaude(viagem),
        })
      }

      return result.sort((a, b) => {
        const da = a.dias_pra_embarque ?? Number.MAX_SAFE_INTEGER
        const db = b.dias_pra_embarque ?? Number.MAX_SAFE_INTEGER
        return da - db
      })
    },
    staleTime: 30 * 1000,
  })

  const groupedBySaude = useMemo(() => {
    const groups = new Map<SaudeViagem, ViagemKanbanItem[]>()
    for (const col of SAUDE_COLUMNS) groups.set(col.id, [])
    for (const v of query.data ?? []) {
      groups.get(v.saude)!.push(v)
    }
    return groups
  }, [query.data])

  return { ...query, groupedBySaude }
}
