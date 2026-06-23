import { PLANEJAMENTO_LABEL, type EtapaPlanejamento } from './types'

// Pós o reshape do funil (23/06), a fase pos_venda do pipeline WEDDING É a régua
// das 6 etapas do board: o NOME de cada etapa real bate 1:1 com PLANEJAMENTO_LABEL.
// A coluna do board passa a vir DIRETO da etapa real do card
// (cards.pipeline_stage_id) — não há mais estado paralelo. Stages fora das 6
// (ex.: "Produção (em construção)") → null = casamento fica FORA do quadro de
// Planejamento até a área de Produção existir.
const NOME_TO_COLUNA: Record<string, EtapaPlanejamento> = Object.fromEntries(
  (Object.entries(PLANEJAMENTO_LABEL) as [EtapaPlanejamento, string][]).map(
    ([slug, label]) => [label, slug],
  ),
) as Record<string, EtapaPlanejamento>

/**
 * Coluna do board a partir do NOME da etapa real do funil (pos_venda WEDDING).
 * Retorna `null` quando a etapa não é uma das 6 de Planejamento (ex.: Produção),
 * pra esse casamento ficar fora do quadro.
 */
export function colunaFromStageNome(
  nome: string | null | undefined,
): EtapaPlanejamento | null {
  if (!nome) return null
  return NOME_TO_COLUNA[nome.trim()] ?? null
}
