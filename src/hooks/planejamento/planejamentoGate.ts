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
}

export interface GateCriterion {
  key: string
  label: string
  /** Estado final: cumprido automaticamente (dado preenchido) OU na mão. */
  ok: boolean
  /** Cumprido automaticamente pelo dado preenchido (sem intervenção manual). */
  auto: boolean
  /** Bloco onde o marco se resolve (atalho). null = sem campo editável na tela. */
  anchor: BlocoAnchor | null
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
        { key: 'data', label: 'Data prevista do casamento informada', auto: !!ctx.weddingDate || isSet(pd, 'ww_data_casamento'), anchor: BLOCO.acompanhamento },
        { key: 'orcamento', label: 'Orçamento informado', auto: isSet(pd, 'ww_investimento_refinado') || isSet(pd, 'ww_mkt_orcamento_form'), anchor: BLOCO.local },
        { key: 'reuniao1', label: '1ª reunião marcada', auto: isSet(pd, PLANEJ_FIELD.reuniao1), anchor: BLOCO.acompanhamento },
      ]
      break
    case 'onboarding':
      raw = [
        { key: 'reuniao_feita', label: '1ª reunião realizada', auto: isTrue(pd, PLANEJ_FIELD.reuniao1Feita), anchor: BLOCO.acompanhamento },
        { key: 'lista', label: 'Lista de convidados iniciada', auto: ctx.guestTotal >= 1, anchor: BLOCO.convidados },
        { key: 'estimado', label: 'Nº de convidados estimado', auto: isSet(pd, PLANEJ_FIELD.convidadosEstimado) || isSet(pd, 'ww_num_convidados'), anchor: BLOCO.convidados },
      ]
      break
    case 'propostas':
      raw = [
        { key: 'regiao', label: 'Região decidida', auto: isSet(pd, PLANEJ_FIELD.regiao), anchor: BLOCO.local },
        { key: 'formato', label: 'Formato decidido (resort / pousada / espaço)', auto: isSet(pd, PLANEJ_FIELD.formato), anchor: BLOCO.local },
        { key: 'proxima', label: 'Próxima reunião agendada', auto: isSet(pd, PLANEJ_FIELD.proximaReuniao), anchor: BLOCO.acompanhamento },
      ]
      break
    case 'definicao': // Reserva do Evento & Documentação
      raw = [
        { key: 'espaco', label: 'Espaço / pacote do casamento definido', auto: isSet(pd, PLANEJ_FIELD.espaco), anchor: BLOCO.local },
        { key: 'contrato', label: 'Contrato do casamento assinado', auto: isTrue(pd, PLANEJ_FIELD.contratoAssinado), anchor: BLOCO.local },
        { key: 'sinal', label: 'Sinal recebido', auto: isSet(pd, PLANEJ_FIELD.sinalPagoEm), anchor: BLOCO.local },
      ]
      break
    case 'passagem': // Bloqueio de Hospedagem & Ação Promocional
      raw = [
        { key: 'hotel', label: 'Hotel contratado / bloco reservado', auto: hotelBloqueado, anchor: BLOCO.local },
        { key: 'quartos', label: 'Nº de quartos a bloquear definido', auto: temQuartos, anchor: BLOCO.local },
        { key: 'promo', label: 'Ação promocional definida (tarifa + janela)', auto: isSet(pd, PLANEJ_FIELD.promoTarifa) && isSet(pd, PLANEJ_FIELD.promoFim), anchor: BLOCO.promo },
      ]
      break
    case 'aditivo': // Programação Final + lista preenchida
      raw = [
        { key: 'programacao', label: 'Programação / cronograma montado (5+ marcos com prazo)', auto: ctx.checklistComPrazo >= 5, anchor: BLOCO.cronograma },
        { key: 'lista_preenchida', label: 'Lista de convidados preenchida', auto: isTrue(pd, PLANEJ_FIELD.listaPreenchida) || ctx.guestTotal >= 1, anchor: BLOCO.convidados },
      ]
      break
  }

  // Aplica a conclusão manual (Opção B): um marco também conta como cumprido se
  // a planejadora marcou na mão. ok = automático OU manual.
  const criteria: GateCriterion[] = raw.map(c => {
    const manual = ctx.marcosFeitos.includes(`${etapa}:${c.key}`)
    return { key: c.key, label: c.label, auto: c.auto, anchor: c.anchor, ok: c.auto || manual }
  })

  const met = criteria.filter(c => c.ok).length
  return { etapa, criteria, met, total: criteria.length, allOk: met === criteria.length }
}
