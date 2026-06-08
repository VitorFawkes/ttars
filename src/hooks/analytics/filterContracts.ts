/**
 * Contrato de filtros por tela do Analytics (Viagens).
 *
 * Regra de ouro (mesma do Analytics de Casamentos): cada tela mostra SÓ os filtros
 * que de fato mudam a resposta dela. Um controle que não chega na query NÃO aparece.
 * O contrato dirige TANTO o que a `SimpleFilterBar` renderiza QUANTO o conjunto de
 * params que o hook da tela passa pra RPC — as duas pontas leem a mesma lista, então
 * é impossível ter "controle morto" (que aparece mas não filtra) ou "filtro fantasma"
 * (que filtra mas não tem controle).
 *
 * `dateRef` = lente temporal cohort↔atividade (ver `DateRef` em useAnalyticsFilters).
 * Só entra no contrato de telas cuja RPC aceita `p_date_ref`.
 */
export type FilterDimension = 'period' | 'dateRef' | 'owners' | 'tags' | 'origins'

export const FILTER_CONTRACTS: Record<string, FilterDimension[]> = {
  // Visão geral da empresa — recorte por período e lente temporal (sem dono: é agregado).
  resumo: ['period', 'dateRef'],
  // Qualidade de dados é um retrato AGORA — sem período; filtra por dono e etiqueta.
  saude: ['owners', 'tags'],
  // Equipe — período + dono + etiqueta. (lente safra↔atividade: próximo incremento, RPCs de time ainda não aceitam p_date_ref.)
  team: ['period', 'owners', 'tags'],
  // Financeiro — período + lente (visão de receita da empresa).
  financeiro: ['period', 'dateRef'],
  // Previsão — janela de fechamento é intrínseca (não usa período); filtra por dono ("Meu pipeline").
  previsao: ['owners'],
  // SDR — período + dono + origem. (a lente safra↔atividade do funil vive na própria tela de Funil.)
  sdr: ['period', 'owners', 'origins'],
  // Planner — período + dono + origem.
  planner: ['period', 'owners', 'origins'],
  // Operações (pós-venda) — período + dono.
  operacoes: ['period', 'owners'],
  // Concierge — período. (filtro por dono: próximo incremento, a RPC de concierge ainda não aceita p_owner_ids.)
  concierge: ['period'],
}

/** Conjunto vazio seguro p/ telas sem filtros globais (Pipeline snapshot, Retenção, Explorar). */
export const NO_FILTERS: FilterDimension[] = []
