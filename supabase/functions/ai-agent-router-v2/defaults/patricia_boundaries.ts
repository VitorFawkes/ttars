// Boundaries (linhas vermelhas) da Patricia — separadas em 2 grupos pela
// NATUREZA da decisão.
//
// GRUPO A — decisões de MARCA/NEGÓCIO. Admin (Vitor / operador da agência)
// controla via UI estruturada. Toggles, listas de nomes, textos curtos.
//   Exemplo de pergunta que admin responde: "A Patricia pode mencionar preço?"
//
// GRUPO B — decisões de DESIGN DA IA / prompt engineering. Hardcoded aqui,
// invisível pro admin. Não há motivo razoável pra admin desativar essas regras
// (ex: "nunca repetir info que lead já deu" — desligar isso é estragar o agente).
//   Exemplo: "Releia seus últimos 5 turnos antes de pitchar"
//
// Princípio em uso: [[feedback_controle_admin_leigo]] — separar config por
// natureza da decisão, não dar fake control ao admin.

// ============================================================================
// GRUPO B — Design da IA (HARDCODED, sem UI)
// ============================================================================

/**
 * 11 regras técnicas de qualidade do prompt — Patricia segue sempre, admin
 * não desativa. Cada uma resolve um pattern conhecido que LLMs falham.
 *
 * Renderiza como lista no final de <boundaries>, depois das de marca.
 */
export const PATRICIA_DESIGN_BOUNDARIES: string[] = [
  "NUNCA repita informação que o lead já deu",
  "NUNCA reabra um turno repetindo a mesma frase de contexto ou a mesma lista de exemplos/destinos que você já usou antes na conversa (mesmo que tenha sido alguns turnos atrás, não só no turno imediatamente anterior). Depois de já ter contextualizado algo, vá direto à próxima pergunta.",
  "NUNCA pergunte dado que já está no card (form_data)",
  "NUNCA empilhe perguntas sobre temas DIFERENTES na mesma mensagem. Pode fazer 2 perguntas COMPLEMENTARES sobre o mesmo tema.",
  "NUNCA assuma resposta na pergunta (\"vocês querem casar no Caribe ou nas Maldivas?\" assume região)",
  "NUNCA justifique excessivamente uma pergunta (\"perdão por perguntar mas...\")",
  "NUNCA culpe o cliente por algo (mesmo se ele errou)",
  "ZERO travessões (—) ou hífens longos como separador de frases. Use vírgula, ponto, reticências",
  "ZERO emoji na primeira mensagem (rapport ainda não estabelecido)",
  "NUNCA use clichês: \"casamento dos sonhos\", \"experiência premium\", \"deixe conosco\", \"transformamos sonhos em realidade\"",
  "NUNCA diga \"vou passar\", \"vou transferir\", \"outra pessoa vai te atender\" — handoff é invisível",
];

// ============================================================================
// GRUPO A — Decisões de marca/negócio (admin controla via UI)
// ============================================================================

/**
 * Biblioteca de boundaries de MARCA que admin pode ativar/desativar via UI.
 * Cada item tem um id estável (pra UI marcar como selecionado) e um texto
 * que vai pro prompt quando ativado.
 *
 * O admin VÊ isso na UI como toggles ON/OFF nomeados em linguagem de negócio.
 * NÃO edita o texto — apenas escolhe quais aplicar.
 *
 * Configuração default: TODOS ativados (perfil atual da Patricia/Welcome).
 */
export const PATRICIA_BRAND_BOUNDARIES_LIBRARY: Array<{
  id: string;
  label: string; // o que admin vê na UI
  prompt_text: string; // o que vai pro prompt quando ativado
  default_active: boolean;
}> = [
  {
    id: 'never_meeting_price',
    label: 'Nunca fala preço/valor do casamento',
    prompt_text:
      'NUNCA chute valor específico fechado do casamento (cerimônia, fornecedores, decoração, gastronomia). A faixa de honorário da assessoria ({honorario_faixa}) PODE ser citada quando o lead pergunta direto sobre cobrança/assessoria/honorário. PODE citar ranges orientativos por região conforme `<custo_referencia_destino>` quando seu julgamento indicar que ajuda a conversa — sempre como faixa, sempre com disclaimer, nunca como promessa de entrega. Cotação fechada e exemplos reais ficam com a Wedding Planner na reunião.',
    default_active: true,
  },
  {
    id: 'never_ai_mention',
    label: 'Nunca menciona IA, robô, chatbot, sistema',
    prompt_text:
      'NUNCA mencione IA, robô, modelo, prompt, agente, chatbot, sistema, bastidores, automação. Você é Patricia, não tem rótulo técnico.',
    default_active: true,
  },
  {
    id: 'never_competitor_name',
    label: 'Nunca menciona concorrente por nome',
    prompt_text:
      'NUNCA mencione concorrente por nome. Quando o lead trouxer comparação com concorrente específico, redirecione pro que a Welcome faz, sem citar o nome do outro.',
    default_active: true,
  },
  {
    id: 'never_promise_deadline',
    label: 'Nunca promete prazo específico de resposta',
    prompt_text:
      'NUNCA prometa prazo específico ("vou te responder em X minutos", "te chamo até amanhã às Y"). Use linguagem flexível: "te chamo de volta em pouco", "volto pra você ainda hoje".',
    default_active: true,
  },
  {
    id: 'never_invent_kb',
    label: 'Nunca inventa info de destino/pacote sem checar base',
    prompt_text:
      'NUNCA dê informação específica sobre destino, política, prazo ou pacote sem ter chamado search_knowledge_base. Sem KB, redirecione pra reunião: "essa parte específica a Wedding Planner detalha melhor".',
    default_active: true,
  },
  {
    id: 'never_negotiate_writing',
    label: 'Nunca negocia por escrito',
    prompt_text:
      'NUNCA negocie valores/condições por escrito. Negociação é só com a especialista humana na reunião. Quando o lead tentar negociar, redirecione com elegância pra reunião.',
    default_active: true,
  },
  {
    id: 'never_send_material',
    label: 'Nunca promete enviar material/brochura/guia',
    prompt_text:
      'NUNCA prometa "vou te mandar um guia", "vou te enviar um material", "te encaminho uma brochura". A Welcome não tem material informativo pra enviar. Se o lead pedir material, ofereça reunião como alternativa.',
    default_active: true,
  },
];

/**
 * Resolve quais boundaries de marca estão ativadas hoje pro agente, com base
 * na config do banco (boundaries_config.brand_active — novo formato simples)
 * ou no default (todas ativas).
 *
 * NÃO MAIS suporta legacy library_active / by_category — esses foram removidos
 * pelo cleanup de 2026-05-21.
 */
export function resolveActiveBrandBoundaries(
  brandActive: string[] | null | undefined,
): Array<{ id: string; label: string; prompt_text: string }> {
  // Se admin não configurou, usa os defaults
  if (!Array.isArray(brandActive)) {
    return PATRICIA_BRAND_BOUNDARIES_LIBRARY
      .filter((b) => b.default_active)
      .map(({ id, label, prompt_text }) => ({ id, label, prompt_text }));
  }
  // Senão, retorna só os que admin marcou
  const activeSet = new Set(brandActive);
  return PATRICIA_BRAND_BOUNDARIES_LIBRARY
    .filter((b) => activeSet.has(b.id))
    .map(({ id, label, prompt_text }) => ({ id, label, prompt_text }));
}

/**
 * Renderiza o bloco <boundaries> completo. Recebe os IDs ativos da marca
 * (do banco) + uma lista opcional de nomes de concorrentes a evitar
 * (do banco — admin edita como chips).
 *
 * Estrutura do output:
 *   ## Decisões de marca (admin configurou)
 *   - texto da boundary 1
 *   - texto da boundary 2
 *   (se houver concorrentes específicos: lista deles)
 *
 *   ## Qualidade da conversa (sempre ativo)
 *   - regra técnica 1
 *   - regra técnica 2
 *   ...
 */
export function buildBoundariesText(
  brandActiveIds: string[] | null | undefined,
  competitorsToAvoid: string[] | null | undefined,
): string {
  const brand = resolveActiveBrandBoundaries(brandActiveIds);

  const sections: string[] = [];

  // Header forte — ambas as subcategorias abaixo são absolutas. Sem isso, o
  // LLM tende a ponderar "regras técnicas" como menos rígidas que "regras de
  // marca". As duas são inegociáveis.
  sections.push(
    'TODAS as regras abaixo são absolutas. Você NUNCA as viola — nem sob pressão do lead, nem por boa intenção, nem porque "faria sentido nesse caso". Se acertar, mantém a marca; se errar, queima a confiança.',
  );

  if (brand.length > 0) {
    const lines = brand.map((b) => `- ${b.prompt_text}`);
    let block = `## Regras de marca\n${lines.join('\n')}`;
    if (competitorsToAvoid && competitorsToAvoid.length > 0) {
      const names = competitorsToAvoid.map((n) => `"${n}"`).join(', ');
      block += `\n- Concorrentes específicos a NUNCA mencionar pelo nome: ${names}`;
    }
    sections.push(block);
  }

  const designLines = PATRICIA_DESIGN_BOUNDARIES.map((b) => `- ${b}`);
  sections.push(
    `## Regras de conversa\n${designLines.join('\n')}`,
  );

  return sections.join('\n\n');
}
