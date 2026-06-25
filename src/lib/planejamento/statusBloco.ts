// Sistema de cor SEMÂNTICA da tela de Planejamento (queixa da planejadora 25/06:
// "tá com pouca cor, preciso de vermelho/verde/amarelo pra bater o olho").
// O champagne.css só remapeia slate/indigo → dourado; emerald/amber/rose passam
// direto. Então a cor de ESTADO vem daqui, não do tema.

import type { WeddingPlanejamento } from '../../hooks/planejamento/usePlanejamentoWeddings'

/** Estado visual de uma área/bloco — vira a "bolinha" verde/amarelo/cinza/vermelho. */
export type BlocoStatus = 'ok' | 'doing' | 'todo' | 'alert'

export const STATUS_META: Record<BlocoStatus, { label: string; dot: string; chipBg: string; chipText: string; ring: string }> = {
  ok:    { label: 'pronto',       dot: 'bg-emerald-500', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', ring: 'ring-emerald-200' },
  doing: { label: 'em andamento', dot: 'bg-amber-500',   chipBg: 'bg-amber-50',   chipText: 'text-amber-700',   ring: 'ring-amber-200' },
  todo:  { label: 'a fazer',      dot: 'bg-[#CBBEA8]',   chipBg: 'bg-[#F1ECE3]',  chipText: 'text-[#8A8278]',   ring: 'ring-[#E3D8C6]' },
  alert: { label: 'atenção',      dot: 'bg-rose-500',    chipBg: 'bg-rose-50',    chipText: 'text-rose-700',    ring: 'ring-rose-200' },
}

function has(pd: Record<string, unknown> | null, key: string): boolean {
  if (!pd) return false
  const v = pd[key]
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return !Number.isNaN(v)
  if (typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

/** Conta quantas de N chaves estão preenchidas → ok (todas) / doing (alguma) / todo (nenhuma). */
function porPreenchimento(pd: Record<string, unknown> | null, keys: string[]): BlocoStatus {
  const n = keys.filter(k => has(pd, k)).length
  if (n === 0) return 'todo'
  if (n === keys.length) return 'ok'
  return 'doing'
}

export interface AreaStatus {
  key: string
  label: string
  status: BlocoStatus
}

/** Pílulas da "faixa de saúde" no topo — a leitura de 1 segundo de onde o casamento
 *  está e o que falta. Deriva tudo do que já temos (sem query nova). */
export function faixaDeSaude(w: WeddingPlanejamento): AreaStatus[] {
  const pd = w.produto_data

  // Local & Cerimônia: região + formato + espaço definidos.
  const local = porPreenchimento(pd, ['ww_planej_regiao', 'ww_planej_formato', 'ww_planej_espaco'])

  // Hospedagem & Bloqueio: pelo status do hotel.
  const hosp: BlocoStatus =
    w.hotelStatus === 'confirmado' ? 'ok'
    : w.hotelStatus === 'bloqueado' ? 'doing'
    : (w.hotelQuartos ?? 0) > 0 ? 'doing'
    : 'todo'

  // Comissionamento (campo novo): ok se houver dado de hospedagem OU pacote.
  const comissao: BlocoStatus = has(pd, 'ww_planej_comissionamento') ? 'ok' : 'todo'

  // Convidados: lista preenchida → ok; algum convidado → doing; nada → todo.
  const conv: BlocoStatus =
    (pd?.['ww_planej_lista_preenchida'] === true || pd?.['ww_planej_lista_preenchida'] === 'true') ? 'ok'
    : w.counts.total > 0 ? 'doing'
    : 'todo'

  // Tarefas: atrasadas → vermelho; pendentes → amarelo; tudo feito → verde.
  const tarefas: BlocoStatus =
    w.checklist.atrasados > 0 ? 'alert'
    : w.checklist.pendentes > 0 ? 'doing'
    : w.checklist.total > 0 ? 'ok'
    : 'todo'

  // Financeiro: valor do casamento + sinal pago.
  const fin = porPreenchimento(pd, ['ww_planej_valor_total', 'ww_planej_sinal_valor'])

  return [
    { key: 'local', label: 'Local', status: local },
    { key: 'hospedagem', label: 'Hospedagem', status: hosp },
    { key: 'comissao', label: 'Comissão', status: comissao },
    { key: 'convidados', label: 'Convidados', status: conv },
    { key: 'tarefas', label: 'Tarefas', status: tarefas },
    { key: 'financeiro', label: 'Financeiro', status: fin },
  ]
}
