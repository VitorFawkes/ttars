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
      ],
      properties: {
        messages: {
          type: "array",
          description:
            "Lista de 1 a 3 mensagens já quebradas pra WhatsApp. Cada uma <1024 chars. Vazio = silêncio (raro, só em loop_incompreensao).",
          minItems: 0,
          maxItems: 3,
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
            "Campos a atualizar no card (cards.id). JSON com chaves do form_data ou colunas top-level. Vazio se nada mudar.",
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
      },
    },
  },
} as const;

// Tipo TypeScript correspondente
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
      | "request_handoff"
      | "update_contact"
      | "assign_tag"
      | "create_task";
    args: Record<string, unknown>;
  }>;
  internal_reasoning: string;
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
