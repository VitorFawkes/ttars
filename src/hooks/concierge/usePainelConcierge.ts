import { useQuery } from '@tanstack/react-query'
import { sbAny } from './_supabaseUntyped'
import { startOfMonth, startOfWeek, subMonths } from 'date-fns'

export type PainelPeriodo = 'semana' | 'mes' | 'trimestre'

function getPeriodoStart(p: PainelPeriodo): Date {
  const now = new Date()
  if (p === 'semana') return startOfWeek(now, { weekStartsOn: 1 })
  if (p === 'mes') return startOfMonth(now)
  return subMonths(now, 3)
}

export interface PainelKPIs {
  total: number
  fechados: number
  taxa_sla: number
  vendido_extra: number
  taxa_conversao_oferta: number
}

export function usePainelConciergeStats(periodo: PainelPeriodo = 'mes') {
  const start = getPeriodoStart(periodo)
  return useQuery({
    queryKey: ['concierge', 'painel-stats', periodo],
    queryFn: async (): Promise<PainelKPIs> => {
      const startISO = start.toISOString()

      const { data: total } = await sbAny
        .from('atendimentos_concierge')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startISO)

      const { data: fechados } = await sbAny
        .from('atendimentos_concierge')
        .select('id', { count: 'exact', head: true })
        .gte('outcome_em', startISO)
        .not('outcome', 'is', null)

      const { data: vendidos } = await sbAny
        .from('atendimentos_concierge')
        .select('valor')
        .eq('outcome', 'aceito')
        .eq('cobrado_de', 'cliente')
        .gte('outcome_em', startISO)

      const { data: ofertas } = await sbAny
        .from('atendimentos_concierge')
        .select('id, outcome')
        .eq('tipo_concierge', 'oferta')
        .gte('created_at', startISO)

      const totalCount = (total as { count?: number } | null)?.count ?? 0
      const fechadosCount = (fechados as { count?: number } | null)?.count ?? 0
      const vendidoSum = ((vendidos ?? []) as { valor: number | null }[])
        .reduce((acc, r) => acc + (r.valor ?? 0), 0)
      const ofertasArr = (ofertas ?? []) as { outcome: string | null }[]
      const ofertasTotal = ofertasArr.length
      const ofertasAceitas = ofertasArr.filter(o => o.outcome === 'aceito').length

      return {
        total: totalCount,
        fechados: fechadosCount,
        taxa_sla: 0,
        vendido_extra: vendidoSum,
        taxa_conversao_oferta: ofertasTotal > 0 ? (ofertasAceitas / ofertasTotal) * 100 : 0,
      }
    },
    staleTime: 60 * 1000,
  })
}

export interface ConciergePerformance {
  dono_id: string
  nome: string
  ativos: number
  vencidos: number
  fechados: number
  vendido: number
}

export function usePainelPorConcierge(periodo: PainelPeriodo = 'mes') {
  const start = getPeriodoStart(periodo)
  return useQuery({
    queryKey: ['concierge', 'painel-por-concierge', periodo],
    queryFn: async (): Promise<ConciergePerformance[]> => {

      const { data, error } = await sbAny
        .from('v_meu_dia_concierge')
        .select('dono_id, status_apresentacao, valor, cobrado_de, concluida, outcome, outcome_em, atendimento_criado_em')

      if (error) throw error
      const rows = (data ?? []) as Array<{
        dono_id: string | null
        status_apresentacao: string
        valor: number | null
        cobrado_de: string | null
        concluida: boolean
        outcome: string | null
        outcome_em: string | null
        atendimento_criado_em: string
      }>

      const byOwner = new Map<string, ConciergePerformance>()
      for (const r of rows) {
        if (!r.dono_id) continue
        const existing = byOwner.get(r.dono_id) ?? {
          dono_id: r.dono_id,
          nome: r.dono_id,
          ativos: 0,
          vencidos: 0,
          fechados: 0,
          vendido: 0,
        }
        if (!r.concluida && !r.outcome) existing.ativos += 1
        if (r.status_apresentacao === 'vencido') existing.vencidos += 1
        if (r.outcome_em && new Date(r.outcome_em) >= start) {
          existing.fechados += 1
          if (r.outcome === 'aceito' && r.cobrado_de === 'cliente') {
            existing.vendido += r.valor ?? 0
          }
        } else if (r.atendimento_criado_em && new Date(r.atendimento_criado_em) >= start && r.concluida) {
          existing.fechados += 1
        }
        byOwner.set(r.dono_id, existing)
      }

      const ids = Array.from(byOwner.keys())
      if (ids.length > 0) {
        const { data: profiles } = await sbAny
          .from('profiles')
          .select('id, nome')
          .in('id', ids)
        for (const p of (profiles ?? []) as { id: string; nome: string }[]) {
          const ent = byOwner.get(p.id)
          if (ent) ent.nome = p.nome ?? p.id
        }
      }

      return Array.from(byOwner.values()).sort((a, b) => b.vendido - a.vendido)
    },
    staleTime: 60 * 1000,
  })
}

export interface ViagemComFogo {
  card_id: string
  card_titulo: string
  vencidos: number
  data_viagem_inicio: string | null
}

export function useViagensComFogo() {
  return useQuery({
    queryKey: ['concierge', 'viagens-com-fogo'],
    queryFn: async (): Promise<ViagemComFogo[]> => {
      const { data, error } = await sbAny
        .from('v_meu_dia_concierge')
        .select('card_id, card_titulo, data_viagem_inicio, status_apresentacao')
        .eq('status_apresentacao', 'vencido')

      if (error) throw error
      const rows = (data ?? []) as Array<{
        card_id: string
        card_titulo: string
        data_viagem_inicio: string | null
      }>

      const map = new Map<string, ViagemComFogo>()
      for (const r of rows) {
        const e = map.get(r.card_id) ?? {
          card_id: r.card_id,
          card_titulo: r.card_titulo,
          vencidos: 0,
          data_viagem_inicio: r.data_viagem_inicio,
        }
        e.vencidos += 1
        map.set(r.card_id, e)
      }
      return Array.from(map.values()).sort((a, b) => b.vencidos - a.vencidos)
    },
    staleTime: 60 * 1000,
  })
}
