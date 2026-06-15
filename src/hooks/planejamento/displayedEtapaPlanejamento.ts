import { PLANEJAMENTO_DEFAULT, type EtapaPlanejamento } from './types'

// Fallback de coluna: enquanto o casamento não tem linha em
// `wedding_planejamento_state`, deriva a coluna a partir do NOME da etapa
// pos_venda atual (que já vem sincronizada do AC pipeline 4 via
// integration_stage_map). É só uma posição inicial ("seed"); ao arrastar, a
// posição passa a viver em wedding_planejamento_state e vence o fallback.
//
// Mapa por NOME (não por UUID) — mais robusto a recriação de stage.
const STAGE_NOME_TO_COLUNA: Record<string, EtapaPlanejamento> = {
  'Boas-vindas e Questionário': 'boas_vindas',
  'Concepção': 'onboarding',
  'Fornecedores em Contratação': 'propostas',
  'Convidados e Logística': 'passagem',
  'Pré-evento': 'aditivo',
  'Casamento Realizado': 'aditivo',
  'Pós-casamento': 'aditivo',
}

export function colunaFromStageNome(nome: string | null | undefined): EtapaPlanejamento {
  if (!nome) return PLANEJAMENTO_DEFAULT
  return STAGE_NOME_TO_COLUNA[nome.trim()] ?? PLANEJAMENTO_DEFAULT
}

/**
 * Etapa exibida do casamento no board de Planejamento.
 * - `override` (de wedding_planejamento_state) vence quando existe — foi arrasto manual.
 * - Caso contrário, deriva da etapa pos_venda atual (seed).
 */
export function displayedEtapaPlanejamento(
  override: EtapaPlanejamento | null | undefined,
  stageNome: string | null | undefined,
): EtapaPlanejamento {
  return override ?? colunaFromStageNome(stageNome)
}
