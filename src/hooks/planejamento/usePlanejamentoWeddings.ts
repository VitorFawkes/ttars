import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrg } from '../../contexts/OrgContext'
import { sbAny } from '../convidados/_supabaseUntyped'
import { useWeddingsWithGuestCounts } from '../convidados/useWeddingsWithGuestCounts'
import type { WeddingWithGuests, HotelStatus } from '../convidados/types'
import { colunaFromStageNome } from './displayedEtapaPlanejamento'
import { PLANEJ_FIELD, type EtapaPlanejamento, type FornecedorStatus } from './types'
import { computeGate, type GateResult, type GateTask } from './planejamentoGate'

const POS_VENDA_PHASE_SLUG = 'pos_venda'

export interface PlanejamentoFornecedor {
  setor: string
  status: FornecedorStatus
  valor: number | null
}

export interface PlanejamentoChecklistResumo {
  total: number
  feitos: number
  comPrazo: number
  /** Itens com prazo vencido e ainda não feitos. */
  atrasados: number
  /** Itens não feitos (pendentes), independente de prazo. */
  pendentes: number
  /** Próxima entrega: menor prazo entre as tarefas pendentes (pode estar vencido). null = nenhuma com prazo. */
  proximaPrazo: string | null
  /** Última conclusão: quando uma tarefa foi marcada feita pela última vez (proxy: max updated_at das feitas). */
  ultimaConclusao: string | null
}

/** Tarefa-trava pendente da ETAPA ATUAL — segura o avanço (Fase 4). */
export interface TravaPendente {
  titulo: string
  /** Tipo da tarefa (documento/lista/bloqueio/reserva/pagamento) — define o ícone. */
  tipo: string | null
  prazo: string | null
  /** Data da última cobrança automática (recobrança) desta tarefa, se houve. */
  ultimaCobranca: string | null
  /** Depende do casal/fornecedor (gera_cobranca) → "esperando o casal". */
  esperandoTerceiro: boolean
}

export interface WeddingPlanejamento extends WeddingWithGuests {
  /** Coluna atual no board — derivada da etapa real do funil (pipeline_stage_id). */
  planejamentoEtapa: EtapaPlanejamento
  /** Resultado da trava da etapa atual (o que falta pra avançar). */
  gate: GateResult
  hotelStatus: HotelStatus | null
  hotelTarifa: number | null
  /** Quartos do bloco no hotel — fonte única de "quartos a bloquear". */
  hotelQuartos: number | null
  convitesCount: number
  fornecedores: PlanejamentoFornecedor[]
  checklist: PlanejamentoChecklistResumo
  /** Tarefas 🔒 da etapa ATUAL ainda não feitas — bloqueiam o avanço (Fase 4). */
  travaPendentes: TravaPendente[]
  /** Tarefas 🔁 já vencidas e não feitas (qualquer etapa) — viram cobrança. */
  cobrancasVencidas: number
  /** Quando o casamento entrou na ETAPA atual (cards.stage_entered_at) — "parado desde". null = sem registro. */
  paradoDesde: string | null
}

/**
 * Casamentos do board de Planejamento. Reusa a fonte da área Convidados (mesmos
 * cards WEDDING em pos_venda, isolados por org + produto) e enriquece com:
 *   - coluna atual: derivada DIRETO da etapa real do funil (cards.pipeline_stage_id),
 *     a mesma régua do Kanban/CardDetail. Sem estado paralelo.
 *   - dados das travas: hotel, convites, checklist e fornecedores (por card)
 *   - a trava calculada da etapa atual.
 * Casamentos cuja etapa não é uma das 6 de Planejamento (ex.: "Produção (em
 * construção)") ficam FORA do quadro.
 */
export function usePlanejamentoWeddings() {
  const { org } = useOrg()
  const orgId = org?.id ?? null
  const base = useWeddingsWithGuestCounts()

  // stageId -> nome da etapa pos_venda (pro fallback de coluna).
  const stagesQuery = useQuery<Record<string, string>>({
    queryKey: ['planejamento', 'pos-venda-stages', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return {}
      const [phaseRes, pipelineRes] = await Promise.all([
        sbAny.from('pipeline_phases').select('id').eq('org_id', orgId).eq('slug', POS_VENDA_PHASE_SLUG).maybeSingle(),
        sbAny.from('pipelines').select('id').eq('org_id', orgId).eq('produto', 'WEDDING').maybeSingle(),
      ])
      if (phaseRes.error) throw phaseRes.error
      if (pipelineRes.error) throw pipelineRes.error

      const phaseId: string | undefined = phaseRes.data?.id
      const pipelineId: string | undefined = pipelineRes.data?.id
      if (!phaseId || !pipelineId) return {}

      const { data, error } = await sbAny
        .from('pipeline_stages')
        .select('id, nome')
        .eq('phase_id', phaseId)
        .eq('pipeline_id', pipelineId)
      if (error) throw error

      const map: Record<string, string> = {}
      for (const s of (data ?? []) as { id: string; nome: string }[]) map[s.id] = s.nome
      return map
    },
  })

  // Dados das travas (hotel/convites/checklist/fornecedores), por card. Sempre
  // filtrados por org_id. Degrada gracioso (sem dados → trava só com o que tem).
  const gateDataQuery = useQuery({
    queryKey: ['planejamento', 'gate-data', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) {
        return { hotel: {}, convites: {}, checklist: {}, fornecedores: {}, tasks: {} } as GateData
      }
      // wedding_checklist passa de 1000 linhas por org (115+ casamentos × 22
      // tarefas = 2500+). O PostgREST corta em 1000 SEM aviso → casamentos
      // além do corte ficavam sem tarefas, sem trava e com contadores zerados
      // no board. Pagina por .range() (mesmo padrão de useWeddings). As outras
      // listas (hotel/convites/fornecedores/cobranças) estão bem abaixo de 1000.
      const fetchChecklist = async (): Promise<ChecklistGateRow[]> => {
        const PAGE = 1000
        const rows: ChecklistGateRow[] = []
        for (let start = 0; ; start += PAGE) {
          const { data, error } = await sbAny
            .from('wedding_checklist')
            .select('id, card_id, titulo, tipo, prazo, feito, marco, stage_id, trava, gera_cobranca, updated_at')
            .eq('org_id', orgId)
            .order('id', { ascending: true })
            .range(start, start + PAGE - 1)
          if (error) throw error
          const page = (data ?? []) as ChecklistGateRow[]
          rows.push(...page)
          if (page.length < PAGE) break
        }
        return rows
      }

      const [hotelRes, convitesRes, checklistRows, fornRes, cobrancaRes] = await Promise.all([
        sbAny.from('wedding_hotel').select('card_id, status, tarifa, total_quartos').eq('org_id', orgId),
        sbAny.from('wedding_convites').select('card_id').eq('org_id', orgId),
        fetchChecklist(),
        sbAny.from('wedding_fornecedores').select('card_id, setor, status, valor').eq('org_id', orgId),
        // "cobramos dia Y": recobranças automáticas já criadas (tarefa nativa).
        // ("parado desde" vem do card paginado em useWeddings: w.stage_entered_at.)
        sbAny.from('tarefas').select('metadata, created_at').eq('org_id', orgId).filter('metadata->>kind', 'eq', 'ww_cobranca').is('deleted_at', null),
      ])

      const hotel: Record<string, { status: HotelStatus | null; tarifa: number | null; quartos: number | null }> = {}
      for (const r of (hotelRes.data ?? []) as { card_id: string; status: HotelStatus | null; tarifa: number | null; total_quartos: number | null }[]) {
        hotel[r.card_id] = { status: r.status ?? null, tarifa: r.tarifa ?? null, quartos: r.total_quartos ?? null }
      }

      const convites: Record<string, number> = {}
      for (const r of (convitesRes.data ?? []) as { card_id: string }[]) {
        convites[r.card_id] = (convites[r.card_id] ?? 0) + 1
      }

      // Mapa: por tarefa de checklist, a data da última recobrança automática.
      const ultimaCobranca: Record<string, string> = {}
      for (const r of (cobrancaRes.data ?? []) as { metadata: Record<string, unknown> | null; created_at: string }[]) {
        const wcId = r.metadata?.wedding_checklist_id
        if (typeof wcId === 'string' && (!ultimaCobranca[wcId] || r.created_at > ultimaCobranca[wcId])) {
          ultimaCobranca[wcId] = r.created_at
        }
      }

      const hoje = new Date().toISOString().slice(0, 10)
      const checklist: Record<string, PlanejamentoChecklistResumo> = {}
      const tasks: Record<string, GateTask[]> = {}
      // Tarefas 🔒 não-feitas, com sua etapa + id (pra dossiê: prazo + última cobrança).
      const travaTasks: Record<string, { id: string; titulo: string; tipo: string | null; stageId: string | null; prazo: string | null; geraCobranca: boolean }[]> = {}
      const cobrancasVencidas: Record<string, number> = {}
      for (const r of checklistRows) {
        const c = checklist[r.card_id] ?? { total: 0, feitos: 0, comPrazo: 0, atrasados: 0, pendentes: 0, proximaPrazo: null, ultimaConclusao: null }
        c.total += 1
        if (r.feito) {
          c.feitos += 1
          // "última tarefa concluída" — proxy: a feita com updated_at mais recente.
          if (r.updated_at && (!c.ultimaConclusao || r.updated_at > c.ultimaConclusao)) c.ultimaConclusao = r.updated_at
        } else {
          c.pendentes += 1
          if (r.prazo && r.prazo < hoje) c.atrasados += 1
          // "próxima entrega" — o menor prazo entre as pendentes (pode estar vencido).
          if (r.prazo && (!c.proximaPrazo || r.prazo < c.proximaPrazo)) c.proximaPrazo = r.prazo
          if (r.trava) (travaTasks[r.card_id] ??= []).push({ id: r.id, titulo: r.titulo, tipo: r.tipo ?? null, stageId: r.stage_id ?? null, prazo: r.prazo, geraCobranca: !!r.gera_cobranca })
          if (r.gera_cobranca && r.prazo && r.prazo < hoje) cobrancasVencidas[r.card_id] = (cobrancasVencidas[r.card_id] ?? 0) + 1
        }
        if (r.prazo) c.comPrazo += 1
        checklist[r.card_id] = c
        ;(tasks[r.card_id] ??= []).push({ marco: r.marco ?? null, feito: r.feito })
      }

      const fornecedores: Record<string, PlanejamentoFornecedor[]> = {}
      for (const r of (fornRes.data ?? []) as { card_id: string; setor: string; status: FornecedorStatus; valor: number | null }[]) {
        const list = fornecedores[r.card_id] ?? []
        list.push({ setor: r.setor, status: r.status, valor: r.valor ?? null })
        fornecedores[r.card_id] = list
      }

      return { hotel, convites, checklist, fornecedores, tasks, travaTasks, cobrancasVencidas, ultimaCobranca } as GateData
    },
  })

  const data = useMemo<WeddingPlanejamento[]>(() => {
    const weddings: WeddingWithGuests[] = base.data ?? []
    const stageMap = stagesQuery.data ?? {}
    const gd: GateData = gateDataQuery.data ?? { hotel: {}, convites: {}, checklist: {}, fornecedores: {}, tasks: {}, travaTasks: {}, cobrancasVencidas: {}, ultimaCobranca: {} }

    const out: WeddingPlanejamento[] = []
    for (const w of weddings) {
      const planejamentoEtapa = colunaFromStageNome(
        w.pipeline_stage_id ? stageMap[w.pipeline_stage_id] : null,
      )
      // Fora das 6 etapas de Planejamento (ex.: Produção em construção) → não entra no quadro.
      if (!planejamentoEtapa) continue
      const hotel = gd.hotel[w.id] ?? { status: null, tarifa: null, quartos: null }
      const convitesCount = gd.convites[w.id] ?? 0
      const checklist = gd.checklist[w.id] ?? { total: 0, feitos: 0, comPrazo: 0, atrasados: 0, pendentes: 0, proximaPrazo: null, ultimaConclusao: null }
      const fornecedores = gd.fornecedores[w.id] ?? []
      // Trava da Fase 4: tarefas 🔒 não-feitas DESTA etapa (stage atual) seguram o avanço.
      const travaPendentes = (gd.travaTasks[w.id] ?? [])
        .filter(t => t.stageId === w.pipeline_stage_id)
        .map(t => ({ titulo: t.titulo, tipo: t.tipo, prazo: t.prazo, ultimaCobranca: gd.ultimaCobranca[t.id] ?? null, esperandoTerceiro: t.geraCobranca }))
      const cobrancasVencidas = gd.cobrancasVencidas[w.id] ?? 0
      // "parado nesta etapa desde": vem do card paginado (useWeddings), sem query extra.
      const paradoDesde = w.stage_entered_at ?? null
      const marcosFeitos = Array.isArray(w.produto_data?.[PLANEJ_FIELD.marcosFeitos])
        ? (w.produto_data![PLANEJ_FIELD.marcosFeitos] as unknown[]).filter((x): x is string => typeof x === 'string')
        : []

      const gate = computeGate(planejamentoEtapa, {
        produtoData: w.produto_data,
        weddingDate: w.wedding_date,
        guestTotal: w.counts.total,
        guestConfirmado: w.counts.confirmado,
        hotelStatus: hotel.status,
        hotelQuartos: hotel.quartos,
        convitesCount,
        checklistComPrazo: checklist.comPrazo,
        fornecedores: fornecedores.map(f => ({ setor: f.setor, status: f.status })),
        marcosFeitos,
        tasks: gd.tasks[w.id] ?? [],
      })

      out.push({
        ...w,
        planejamentoEtapa,
        gate,
        hotelStatus: hotel.status,
        hotelTarifa: hotel.tarifa,
        hotelQuartos: hotel.quartos,
        convitesCount,
        fornecedores,
        checklist,
        travaPendentes,
        cobrancasVencidas,
        paradoDesde,
      })
    }
    return out
  }, [base.data, stagesQuery.data, gateDataQuery.data])

  return {
    data,
    isLoading: base.isLoading || stagesQuery.isLoading,
    isError: base.isError,
    error: base.error,
  }
}

interface ChecklistGateRow {
  id: string
  card_id: string
  titulo: string
  tipo: string | null
  prazo: string | null
  feito: boolean
  marco: string | null
  stage_id: string | null
  trava: boolean | null
  gera_cobranca: boolean | null
  updated_at: string | null
}

interface GateData {
  hotel: Record<string, { status: HotelStatus | null; tarifa: number | null; quartos: number | null }>
  convites: Record<string, number>
  checklist: Record<string, PlanejamentoChecklistResumo>
  fornecedores: Record<string, PlanejamentoFornecedor[]>
  tasks: Record<string, GateTask[]>
  travaTasks: Record<string, { id: string; titulo: string; tipo: string | null; stageId: string | null; prazo: string | null; geraCobranca: boolean }[]>
  cobrancasVencidas: Record<string, number>
  /** checklist task id → data da última recobrança automática. */
  ultimaCobranca: Record<string, string>
}
