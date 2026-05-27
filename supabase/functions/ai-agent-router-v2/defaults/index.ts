// Orquestrador de defaults por agente. Hoje só Patricia, mas a porta tá aberta
// pra outros agentes single_agent_v2 no futuro.
//
// Quando aparecer um 2º agente, refatorar pra ler `defaults_profile` de
// ai_agents (TEXT). Por enquanto, match por id é mais simples que ter migration
// só pra isso.

import {
  PATRICIA_PRINCIPLES_TEXT,
} from './patricia_principles.ts';
import {
  buildDiffCognitivoText,
} from './patricia_diff_cognitivo.ts';
import {
  PATRICIA_DATA_UPDATE_RULES_TEXT,
} from './patricia_data_update_rules.ts';
import {
  buildBoundariesText,
} from './patricia_boundaries.ts';
import {
  PATRICIA_CUSTO_REFERENCIA_TEXT,
} from './patricia_custo_referencia.ts';

export const PATRICIA_AGENT_ID = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

export interface AgentDefaults {
  principles_text: string;
  buildDiffCognitivo: typeof buildDiffCognitivoText;
  data_update_rules_text: string;
  buildBoundaries: typeof buildBoundariesText;
  /** Tabela de ranges de custo por convidado por região. Quando presente,
   * o assembler renderiza um bloco <custo_referencia_destino> com a regra
   * de uso. Valores reais editáveis no arquivo do default. */
  custo_referencia_text: string | null;
  /**
   * Valores fallback dos campos editáveis do business_config. Usados pelo
   * router quando o admin não preencheu o campo no banco — garante que o
   * prompt nunca tem placeholder vazio.
   */
  businessFallbacks: {
    wedding_planner_name: string;
    wedding_planner_short: string;
    honorario_faixa: string;
    empresa_stats: string;
    network_regions: string;
    destination_categories: string;
    brochure_policy: string;
  };
}

const PATRICIA_BUSINESS_FALLBACKS: AgentDefaults['businessFallbacks'] = {
  wedding_planner_name: 'a Wedding Planner',
  wedding_planner_short: 'a Wedding Planner',
  honorario_faixa: 'R$ 4 mil a R$ 18 mil',
  empresa_stats:
    'Desde 2012, mais de 650 casamentos realizados em mais de 20 países. 5 prêmios consecutivos como melhor produtora de Destination Wedding da América Latina.',
  network_regions:
    'Caribe (Cancún, Punta Cana, Tulum, Riviera Maya), Maldivas, Nordeste brasileiro (Trancoso, Jericoacoara, Fernando de Noronha, Praia do Forte), Mendoza/Argentina, e Europa selecionada (Portugal, Itália, Espanha, Grécia).',
  destination_categories: 'Caribe / Maldivas / Nordeste / Mendoza / Europa / Outro',
  brochure_policy:
    'A Welcome não tem material informativo / brochura / guia pra eu enviar pro lead. NUNCA prometo "vou te mandar um guia", "vou te enviar um material", "te encaminho uma brochura". No desfecho não qualificado, encerro com honestidade direta — sem promessa de envio.',
};

/**
 * Retorna o pacote de defaults pro agente, ou null se o agente não tem
 * defaults curados (cai pro comportamento genérico do prompt_assembler).
 */
export function getDefaultsForAgent(agentId: string): AgentDefaults | null {
  if (agentId === PATRICIA_AGENT_ID) {
    // Bloco custo_referencia_destino só entra no prompt se os placeholders
    // foram preenchidos com valores reais. Enquanto tiver "PLACEHOLDER_",
    // o assembler omite o bloco — evita mandar "R$ [PLACEHOLDER_MIN]" pra
    // produção por engano.
    const custoTextRaw = PATRICIA_CUSTO_REFERENCIA_TEXT;
    const custoText = custoTextRaw.includes('[PLACEHOLDER_') ? null : custoTextRaw;
    return {
      principles_text: PATRICIA_PRINCIPLES_TEXT,
      buildDiffCognitivo: buildDiffCognitivoText,
      data_update_rules_text: PATRICIA_DATA_UPDATE_RULES_TEXT,
      buildBoundaries: buildBoundariesText,
      custo_referencia_text: custoText,
      businessFallbacks: PATRICIA_BUSINESS_FALLBACKS,
    };
  }
  return null;
}
