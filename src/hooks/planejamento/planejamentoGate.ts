// Travas (portões) do Planejamento — decisão do Vitor (18/06) + blueprint
// (EstudoWeddings). Padrão: Planejamento DEFINE/CONTRATA; Convidados/Produção
// EXECUTA. Tudo calculado no app a partir do que já é preenchido (produto_data
// do card + tabelas wedding_*), sem nova fonte de verdade. A trava IMPEDE o
// avanço (não é só aviso).

import type { HotelStatus } from '../convidados/types'
import { BLOCO, PLANEJ_FIELD, type EtapaPlanejamento, type FornecedorStatus } from './types'

type BlocoAnchor = (typeof BLOCO)[keyof typeof BLOCO]

export interface GateContext {
  produtoData: Record<string, unknown> | null
  /** Data do casamento (cards.data_viagem_inicio). */
  weddingDate: string | null
  guestTotal: number
  guestConfirmado: number
  hotelStatus: HotelStatus | null
  /** Nº de quartos do bloco no hotel (fonte única de "quartos a bloquear"). */
  hotelQuartos: number | null
  convitesCount: number
  /** Itens de checklist com prazo preenchido (formam o cronograma). */
  checklistComPrazo: number
  fornecedores: { setor: string; status: FornecedorStatus }[]
  /** Marcos concluídos manualmente (Opção B) — array de "etapa:key". */
  marcosFeitos: string[]
  /** Tarefas do card (wedding_checklist) com seu marco e estado — pro roll-up. */
  tasks: GateTask[]
}

/** Tarefa enxuta usada pelo roll-up do gate. */
export interface GateTask {
  marco: string | null
  feito: boolean
}

export interface GateCriterion {
  key: string
  label: string
  /** Estado final: auto (dado preenchido) OU na mão OU pelas tarefas. */
  ok: boolean
  /** Cumprido automaticamente pelo dado preenchido (sem intervenção manual). */
  auto: boolean
  /** Bloco onde o marco se resolve (atalho). null = sem campo editável na tela. */
  anchor: BlocoAnchor | null
  /** Roll-up de tarefas linkadas a este marco. */
  taskCount: number
  tasksDone: number
  /** true quando há tarefas linkadas e TODAS estão feitas. */
  byTasks: boolean
}

export interface GateResult {
  etapa: EtapaPlanejamento
  criteria: GateCriterion[]
  met: number
  total: number
  allOk: boolean
}

/** Critério antes de aplicar a conclusão manual. */
interface RawCriterion {
  key: string
  label: string
  auto: boolean
  anchor: BlocoAnchor | null
}

// ── leitura segura de produto_data ──────────────────────────────────────────

function isSet(pd: Record<string, unknown> | null, key: string): boolean {
  if (!pd) return false
  const v = pd[key]
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return !Number.isNaN(v)
  if (typeof v === 'boolean') return v
  return true
}

function isTrue(pd: Record<string, unknown> | null, key: string): boolean {
  if (!pd) return false
  const v = pd[key]
  return v === true || v === 'true' || v === 'sim' || v === 'Sim' || v === '1'
}

// ── definição das travas por etapa (alinhadas ao blueprint) ─────────────────

export function computeGate(etapa: EtapaPlanejamento, ctx: GateContext): GateResult {
  const pd = ctx.produtoData
  const hotelBloqueado = ctx.hotelStatus === 'bloqueado' || ctx.hotelStatus === 'confirmado'
  const temQuartos = (ctx.hotelQuartos ?? 0) > 0 || isSet(pd, PLANEJ_FIELD.quartosBloquear)

  let raw: RawCriterion[] = []

  switch (etapa) {
    case 'boas_vindas':
      raw = [
        { key: 'tipo', label: 'Tipo do casamento definido (DW ou Elopement)', auto: isSet(pd, 'ww_tipo_casamento'), anchor: null },
        { key: 'orcamento', label: 'Orçamento informado', auto: isSet(pd, 'ww_investimento_refinado') || isSet(pd, 'ww_mkt_orcamento_form'), anchor: BLOCO.local },
      ]
      break
    case 'onboarding':
      raw = [
        // Primeira Reunião = a data que o Calendly JÁ gravou no card (Closer ou SDR).
        // Funil nativo manda; não é mais preenchimento manual. Ver feedback_weddings_planejamento_lente_nativa.
        { key: 'reuniao1', label: 'Primeira Reunião', auto: isSet(pd, 'ww_closer_data_reuniao') || isSet(pd, 'ww_sdr_data_reuniao'), anchor: BLOCO.spine },
        { key: 'lista_iniciada', label: 'Lista de convidados iniciada', auto: ctx.guestTotal >= 1, anchor: BLOCO.convidados },
        { key: 'estimado', label: 'Nº de convidados estimado', auto: isSet(pd, PLANEJ_FIELD.convidadosEstimado) || isSet(pd, 'ww_num_convidados'), anchor: BLOCO.convidados },
      ]
      break
    case 'propostas':
      raw = [
        { key: 'definicao', label: 'Destino, Local & Data definidos', auto: isSet(pd, PLANEJ_FIELD.regiao) && isSet(pd, PLANEJ_FIELD.formato), anchor: BLOCO.spine },
      ]
      break
    case 'definicao': // Reserva do Evento & Documentação
      raw = [
        { key: 'reserva', label: 'Reserva da Cerimônia', auto: isSet(pd, PLANEJ_FIELD.espaco), anchor: BLOCO.spine },
        { key: 'documentacao', label: 'Documentação', auto: isTrue(pd, PLANEJ_FIELD.contratoAssinado), anchor: BLOCO.spine },
        { key: 'pagamento', label: 'Pagamento (sinal)', auto: isSet(pd, PLANEJ_FIELD.sinalPagoEm), anchor: BLOCO.spine },
      ]
      break
    case 'passagem': // Bloqueio de Hospedagem & Ação Promocional
      raw = [
        { key: 'hotel', label: 'Hotel contratado / bloco reservado', auto: hotelBloqueado, anchor: BLOCO.local },
        { key: 'bloqueio', label: 'Bloqueio de Apartamentos', auto: temQuartos, anchor: BLOCO.spine },
        { key: 'promo', label: 'Ação promocional definida (tarifa + janela)', auto: isSet(pd, PLANEJ_FIELD.promoTarifa) && isSet(pd, PLANEJ_FIELD.promoFim), anchor: BLOCO.promo },
      ]
      break
    case 'aditivo': // Programação Final + lista preenchida
      raw = [
        { key: 'programacao', label: 'Programação / cronograma montado (5+ tarefas com prazo)', auto: ctx.checklistComPrazo >= 5, anchor: BLOCO.spine },
        { key: 'lista', label: 'Lista de convidados preenchida', auto: isTrue(pd, PLANEJ_FIELD.listaPreenchida) || ctx.guestTotal >= 1, anchor: BLOCO.spine },
      ]
      break
  }

  // Roll-up: um marco também é cumprido se TODAS as tarefas linkadas a ele
  // estão feitas. ok = automático (dado) OU na mão (Opção B) OU pelas tarefas.
  const criteria: GateCriterion[] = raw.map(c => {
    const mk = `${etapa}:${c.key}`
    const linked = ctx.tasks.filter(t => t.marco === mk)
    const taskCount = linked.length
    const tasksDone = linked.filter(t => t.feito).length
    const byTasks = taskCount > 0 && tasksDone === taskCount
    const manual = ctx.marcosFeitos.includes(mk)
    return {
      key: c.key,
      label: c.label,
      auto: c.auto,
      anchor: c.anchor,
      ok: c.auto || manual || byTasks,
      taskCount,
      tasksDone,
      byTasks,
    }
  })

  const met = criteria.filter(c => c.ok).length
  return { etapa, criteria, met, total: criteria.length, allOk: met === criteria.length }
}
