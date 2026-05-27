// JSON Schema do structured output do single-agent (Patricia).
//
// O LLM principal (gpt-5.5) é forçado a retornar EXATAMENTE este schema via
// response_format: { type: "json_schema", json_schema: {...} } — substitui
// o pipeline 5-step da Estela (Backoffice + Data + Persona + Validator + Formatter).
//
// O agente decide:
//   - quais mensagens enviar (pré-quebradas pra WhatsApp, max 3)
//   - se patcha campos do card / contato
//   - qual momento aplicar (abertura, sondagem, objecao_preco, ...)
//   - quais tools chamar (calculate_qualification_score, search_knowledge_base, etc.)
//   - registra raciocínio interno pra log/auditoria
//
// Brand Validator (gpt-5.5-mini) lê só `messages[]` e devolve OK/correções
// (validação separada das 11 validator_rules — não é problema do agente principal).

export const SINGLE_AGENT_OUTPUT_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "patricia_turn_output",
    description:
      "Resposta do agente em um turno: mensagens prontas pra WhatsApp + patches de card/contato + metadados de momento + tools chamadas + raciocínio.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "messages",
        "card_patch",
        "contact_patch",
        "current_moment_key",
        "tool_calls",
        "internal_reasoning",
        "self_analysis",
      ],
      properties: {
        messages: {
          type: "array",
          description:
            "Lista de 1 a 6 mensagens prontas pra WhatsApp, JÁ separadas em bolhas naturais (cada item do array é uma bolha de chat distinta). Cada uma <1024 chars. Quebre em bolhas curtas como um humano faria em conversa por texto — saudação numa bolha, contexto noutra, pergunta noutra. NUNCA use separadores como --- ou *** dentro do texto, eles aparecem como lixo no WhatsApp; se precisa separar, abra outro elemento do array. Vazio = silêncio (raro, só em loop_incompreensao).",
          minItems: 0,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "content"],
            properties: {
              type: {
                type: "string",
                enum: ["text"],
                description:
                  "Patricia v1 só envia texto. Mídia (imagem/documento) fica em handoff_actions ou tools.",
              },
              content: {
                type: "string",
                description:
                  "Texto da mensagem WhatsApp. Sem travessões. Sem emoji na primeira mensagem (rapport ainda não estabelecido).",
              },
            },
          },
        },
        card_patch: {
          type: "object",
          description:
            "Campos a atualizar no card (cards.id). JSON com chaves do form_data ou colunas top-level. Vazio se nada mudar. Para orçamento em moeda estrangeira (EUR/USD/GBP), além do `ww_orcamento_faixa` em BRL (convertido), inclua também `ww_orcamento_moeda_original` (string: \"EUR\"/\"USD\"/\"GBP\") e `ww_orcamento_cotacao_usada` (number: cotação aplicada, ex: 6.0) pra auditoria da conversão.",
          additionalProperties: true,
          properties: {},
        },
        contact_patch: {
          type: "object",
          description:
            "Campos a atualizar no contato principal (contatos.id). Chaves permitidas: nome, email, data_nascimento. NUNCA telefone.",
          additionalProperties: true,
          properties: {},
        },
        current_moment_key: {
          type: ["string", "null"],
          description:
            "Slug do momento detectado neste turno (abertura, sondagem, objecao_preco, lua_de_mel, desfecho_qualificado, desfecho_nao_qualificado, destino_fora_catalogo, objecao_preciso_pensar, familia_co_financiadora). null se indeterminado.",
        },
        tool_calls: {
          type: "array",
          description:
            "Tools a chamar APÓS gerar messages. Cada tool é executada pelo runtime; o resultado fica em log mas não volta pro LLM neste turno (single-call).",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["tool_name", "args"],
            properties: {
              tool_name: {
                type: "string",
                enum: [
                  "calculate_qualification_score",
                  "search_knowledge_base",
                  "check_calendar",
                  "confirm_meeting_slot",
                  "request_handoff",
                  "update_contact",
                  "assign_tag",
                  "create_task",
                ],
              },
              args: {
                type: "object",
                description:
                  "Argumentos da tool conforme spec do BUILT_IN_TOOLS no _utils.ts.",
                additionalProperties: true,
                properties: {},
              },
            },
          },
        },
        internal_reasoning: {
          type: "string",
          description:
            "Raciocínio invisível: por que escolheu esse momento, quais sinais observou, decisões tomadas. Usado pra log/auditoria. NÃO vai pro WhatsApp.",
        },
        self_analysis: {
          type: "object",
          description:
            "Auto-análise do turno feita pelo agente (com reasoning ativo). Substitui heurísticas regex no router. Validator consulta esses campos pra decidir se bloqueia.",
          additionalProperties: false,
          required: [
            "contradicao_detectada",
            "pitch_saturado_self",
            "pitch_count_recent",
            "inviabilidade_calc",
            "valor_por_convidado_brl",
            "pendencia_resolver",
            "sinais_defensivos_lead",
            "pergunta_lead_nao_respondida",
            "lead_intent",
          ],
          properties: {
            contradicao_detectada: {
              type: ["object", "null"],
              description:
                "Se o lead disse algo conflitante com o que ele mesmo declarou antes, descreva. NULL se não há contradição real. Use julgamento: 'frio + Mendoza/Patagônia' NÃO é contradição (Mendoza é fria), 'frio + Trancoso/Caribe' É contradição.",
              additionalProperties: false,
              required: ["campos", "descricao"],
              properties: {
                campos: {
                  type: "array",
                  items: { type: "string" },
                  description: "Lista de eixos em conflito (ex: ['clima_preferido', 'destinos_citados']).",
                },
                descricao: {
                  type: "string",
                  description: "1 frase curta descrevendo a contradição.",
                },
              },
            },
            pitch_saturado_self: {
              type: "boolean",
              description:
                "Você (Patricia) já ofertou slots REAIS de reunião (data+hora concreta) 2+ vezes nos últimos 5 turns? Menção genérica no anchor de abertura NÃO conta — só conta oferta com horário específico.",
            },
            pitch_count_recent: {
              type: "integer",
              description: "Quantas ofertas reais de slot você fez nos últimos 5 turns (0..5).",
            },
            inviabilidade_calc: {
              type: ["string", "null"],
              enum: ["abaixo_minimo_resistente", "fronteira_defensiva", null],
              description:
                "Avalie viabilidade econômica: valor/convidado em BRL (após conversão). < R$ 800 = 'abaixo_minimo_resistente'. R$ 800-1200 = 'fronteira_defensiva'. ≥ R$ 1200 ou dados insuficientes = null.",
            },
            valor_por_convidado_brl: {
              type: ["integer", "null"],
              description: "Valor por convidado calculado em BRL (após conversão de moeda). NULL se faltam dados.",
            },
            pendencia_resolver: {
              type: ["string", "null"],
              description:
                "Você fez alguma promessa de retornar/verificar em turn anterior que ainda não cumpriu? Se sim, frase curta descrevendo. NULL se não há pendência.",
            },
            sinais_defensivos_lead: {
              type: "boolean",
              description:
                "O lead deu sinais de estar jogando número defensivo no orçamento? Sinais: destino premium + número grande + valor baixo, OU hesitação ao falar valor, OU 'tô com vergonha de dizer'. TRUE só se há evidência clara — não chute.",
            },
            pergunta_lead_nao_respondida: {
              type: ["string", "null"],
              description:
                "O lead fez uma PERGUNTA FACTUAL no último turn dele que sua mensagem candidata NÃO responde? Ex: lead pergunta 'quanto custa?', 'vocês cobram?', 'tem agenda dia X?', 'qual o nome da Wedding Planner?', e você puls direto pra outro tema sem responder. Se sim, escreva A PERGUNTA do lead (curta). NULL se ele não fez pergunta direta, OU se você está respondendo a pergunta dele. AMBIGUIDADE NÃO É FUGA: se a pergunta é ambígua ('quanto custa' sem objeto), responder com clarificação ('do casamento todo ou do nosso honorário?') CONTA como responder — preencher null. Mas pular pra outro tema sem clarificar CONTA como não responder — preencher com a pergunta.",
            },
            lead_intent: {
              type: "string",
              enum: ["explorando", "qualificando", "objetando", "pronto_pra_fechar"],
              description:
                "Sua leitura semântica da intenção do lead no turno ATUAL (não no histórico todo, no que ele acabou de mandar). " +
                "'explorando' = primeira aproximação, vago, sem decisão ('vi vocês no insta', 'tô começando a pensar', 'queria saber mais'). " +
                "'qualificando' = trocando dados pra entender se cabe ('pra quantas pessoas vocês fazem?', 'tem destino X?', conta orçamento, dá dados estruturados). " +
                "'objetando' = tem ressalva específica e quer testar antes de avançar (preço, prazo, comparação com concorrente, dúvida sobre formato). " +
                "'pronto_pra_fechar' = pediu reunião, horário ou agenda EXPLICITAMENTE, sem mais perguntas exploratórias ('quero marcar', 'qual horário?', 'quarta 14h?', 'bora ver isso'). " +
                "Use julgamento: 'já vi tudo de vocês' SOZINHO não é pronto_pra_fechar — precisa intenção concreta de marcar. 'Vocês podem me explicar como funciona?' É exploring, não pronto.",
            },
          },
        },
      },
    },
  },
} as const;

// Tipo TypeScript correspondente
export interface SelfAnalysis {
  contradicao_detectada: { campos: string[]; descricao: string } | null;
  pitch_saturado_self: boolean;
  pitch_count_recent: number;
  inviabilidade_calc: "abaixo_minimo_resistente" | "fronteira_defensiva" | null;
  valor_por_convidado_brl: number | null;
  pendencia_resolver: string | null;
  sinais_defensivos_lead: boolean;
  pergunta_lead_nao_respondida: string | null;
  lead_intent: "explorando" | "qualificando" | "objetando" | "pronto_pra_fechar";
}

export interface SingleAgentOutput {
  messages: Array<{ type: "text"; content: string }>;
  card_patch: Record<string, unknown>;
  contact_patch: Record<string, unknown>;
  current_moment_key: string | null;
  tool_calls: Array<{
    tool_name:
      | "calculate_qualification_score"
      | "search_knowledge_base"
      | "check_calendar"
      | "confirm_meeting_slot"
      | "request_handoff"
      | "update_contact"
      | "assign_tag"
      | "create_task";
    args: Record<string, unknown>;
  }>;
  internal_reasoning: string;
  self_analysis: SelfAnalysis;
}

// JSON Schema do brand validator
export const BRAND_VALIDATOR_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "brand_validator_verdict",
    description:
      "Verdict do validador de marca: OK ou pedido de reescrita/bloqueio com correções.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ok", "violations", "action", "corrected_messages"],
      properties: {
        ok: {
          type: "boolean",
          description:
            "true se nenhuma regra foi violada. false se alguma regra foi violada.",
        },
        violations: {
          type: "array",
          description: "Lista de regras violadas (ids).",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["rule_id", "reason"],
            properties: {
              rule_id: { type: "string" },
              reason: {
                type: "string",
                description: "Por que a regra foi violada (1 frase).",
              },
            },
          },
        },
        action: {
          type: "string",
          enum: ["pass", "rewrite", "block"],
          description:
            "pass = enviar como está. rewrite = aplicar corrected_messages. block = não enviar nada (logar e silenciar).",
        },
        corrected_messages: {
          type: "array",
          description:
            "Se action=rewrite, mensagens já corrigidas. Se action=pass, vazio. Se action=block, vazio.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["type", "content"],
            properties: {
              type: { type: "string", enum: ["text"] },
              content: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

export interface BrandValidatorVerdict {
  ok: boolean;
  violations: Array<{ rule_id: string; reason: string }>;
  action: "pass" | "rewrite" | "block";
  corrected_messages: Array<{ type: "text"; content: string }>;
}
