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

export const PATRICIA_AGENT_ID = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

export interface AgentDefaults {
  principles_text: string;
  buildDiffCognitivo: typeof buildDiffCognitivoText;
  data_update_rules_text: string;
  buildBoundaries: typeof buildBoundariesText;
}

/**
 * Retorna o pacote de defaults pro agente, ou null se o agente não tem
 * defaults curados (cai pro comportamento genérico do prompt_assembler).
 */
export function getDefaultsForAgent(agentId: string): AgentDefaults | null {
  if (agentId === PATRICIA_AGENT_ID) {
    return {
      principles_text: PATRICIA_PRINCIPLES_TEXT,
      buildDiffCognitivo: buildDiffCognitivoText,
      data_update_rules_text: PATRICIA_DATA_UPDATE_RULES_TEXT,
      buildBoundaries: buildBoundariesText,
    };
  }
  return null;
}
