// Travas (portões) do Planejamento — decisão do Vitor (18/06) + blueprint
// (EstudoWeddings). Padrão: Planejamento DEFINE/CONTRATA; Convidados/Produção
// EXECUTA. Tudo calculado no app a partir do que já é preenchido (produto_data
// do card + tabelas wedding_*), sem nova fonte de verdade. A trava IMPEDE o
// avanço (não é só aviso).

import type { HotelStatus } from '../convidados/types'
import { PLANEJ_FIELD, type EtapaPlanejamento, type FornecedorStatus } from './types'

export interface GateContext {
  produtoData: Record<string, unknown> | null
  /** Data do casamento (cards.data_viagem_inicio). */
  weddingDate: string | null
  guestTotal: number
  guestConfirmado: number
  hotelStatus: HotelStatus | null
  convitesCount: number
  /** Itens de checklist com prazo preenchido (formam o cronograma). */
  checklistComPrazo: number
  fornecedores: { setor: string; status: FornecedorStatus }[]
}

export interface GateCriterion {
  key: string
  label: string
  ok: boolean
}

export interface GateResult {
  etapa: EtapaPlanejamento
  criteria: GateCriterion[]
  met: number
  total: number
  allOk: boolean
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

  let criteria: GateCriterion[] = []

  switch (etapa) {
    case 'boas_vindas':
      criteria = [
        { key: 'tipo', label: 'Tipo do casamento definido (DW ou Elopement)', ok: isSet(pd, 'ww_tipo_casamento') },
        { key: 'data', label: 'Data prevista do casamento informada', ok: !!ctx.weddingDate || isSet(pd, 'ww_data_casamento') },
        { key: 'orcamento', label: 'Orçamento informado', ok: isSet(pd, 'ww_investimento_refinado') || isSet(pd, 'ww_mkt_orcamento_form') },
        { key: 'reuniao1', label: '1ª reunião marcada', ok: isSet(pd, PLANEJ_FIELD.reuniao1) },
      ]
      break
    case 'onboarding':
      criteria = [
        { key: 'reuniao_feita', label: '1ª reunião realizada', ok: isTrue(pd, PLANEJ_FIELD.reuniao1Feita) },
        { key: 'lista', label: 'Lista de convidados iniciada', ok: ctx.guestTotal >= 1 },
        { key: 'estimado', label: 'Nº de convidados estimado', ok: isSet(pd, PLANEJ_FIELD.convidadosEstimado) || isSet(pd, 'ww_num_convidados') },
      ]
      break
    case 'propostas':
      criteria = [
        { key: 'regiao', label: 'Região decidida', ok: isSet(pd, PLANEJ_FIELD.regiao) },
        { key: 'formato', label: 'Formato decidido (resort / pousada / espaço)', ok: isSet(pd, PLANEJ_FIELD.formato) },
        { key: 'proxima', label: 'Próxima reunião agendada', ok: isSet(pd, PLANEJ_FIELD.proximaReuniao) },
      ]
      break
    case 'definicao': // Reserva do Evento & Documentação
      criteria = [
        { key: 'espaco', label: 'Espaço / pacote do casamento definido', ok: isSet(pd, PLANEJ_FIELD.espaco) },
        { key: 'contrato', label: 'Contrato do casamento assinado', ok: isTrue(pd, PLANEJ_FIELD.contratoAssinado) },
        { key: 'sinal', label: 'Sinal recebido', ok: isSet(pd, PLANEJ_FIELD.sinalPagoEm) },
      ]
      break
    case 'passagem': // Bloqueio de Hospedagem & Ação Promocional
      criteria = [
        { key: 'hotel', label: 'Hotel contratado / bloco reservado', ok: hotelBloqueado },
        { key: 'quartos', label: 'Nº de quartos a bloquear definido', ok: isSet(pd, PLANEJ_FIELD.quartosBloquear) },
        { key: 'promo', label: 'Ação promocional definida (tarifa + janela)', ok: isSet(pd, PLANEJ_FIELD.promoTarifa) && isSet(pd, PLANEJ_FIELD.promoFim) },
      ]
      break
    case 'aditivo': // Programação Final + lista preenchida
      criteria = [
        { key: 'programacao', label: 'Programação / cronograma montado (5+ marcos com prazo)', ok: ctx.checklistComPrazo >= 5 },
        { key: 'lista_preenchida', label: 'Lista de convidados preenchida', ok: isTrue(pd, PLANEJ_FIELD.listaPreenchida) || ctx.guestTotal >= 1 },
      ]
      break
  }

  const met = criteria.filter(c => c.ok).length
  return { etapa, criteria, met, total: criteria.length, allOk: met === criteria.length }
}
