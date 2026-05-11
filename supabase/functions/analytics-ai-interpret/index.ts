/**
 * analytics-ai-interpret — Explorer IA (Fase 2 Analytics v2)
 *
 * Recebe uma pergunta em texto do gestor e devolve um JSON estruturado
 * compatível com a RPC public.analytics_explorer_query.
 *
 * Arquitetura tool-use: o LLM nunca gera SQL. Ele só escolhe uma measure +
 * group_by (+ cross_with opcional) + filtros, dentro da lista fechada. A RPC
 * valida tudo de novo no banco (defesa em profundidade) e executa com RLS.
 *
 * Resposta sempre inclui "confidence" (0-1) e "explanation" em PT-BR para o
 * card "Entendi assim" no frontend.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MODEL = "gpt-5.1";
const RATE_LIMIT_PER_HOUR = 30;

// ---------------------------------------------------------------------------
// Whitelist (tem que bater com a RPC analytics_explorer_query)
// ---------------------------------------------------------------------------

const MEASURES = [
  "count_cards",
  "sum_revenue",
  "avg_ticket",
  "count_ganho_sdr",
  "count_ganho_planner",
  "count_ganho_pos",
  "conversion_planner_pct",
  "avg_quality_score",
  "avg_days_to_planner_win",
  "avg_stage_age_days",
] as const;

const DIMENSIONS = [
  "owner",
  "sdr_owner",
  "planner_owner",
  "pos_owner",
  "stage",
  "phase",
  "origem",
  "lead_entry_path",
  "product",
  "destino",
  "month",
  "week",
  "day",
] as const;

const PHASE_SLUGS = ["sdr", "planner", "pos_venda", "resolucao"] as const;
const LEAD_ENTRY_PATHS = ["full_funnel", "direct_planner", "returning", "referred"] as const;
const VIZ = ["table", "bar", "line", "heatmap"] as const;

type Measure = typeof MEASURES[number];
type Dimension = typeof DIMENSIONS[number];

interface InterpretedQuery {
  measure: Measure;
  group_by: Dimension;
  cross_with: Dimension | null;
  filters: {
    product?: string;
    origem?: string[];
    phase_slugs?: string[];
    lead_entry_path?: string;
    destinos?: string[];
    owner_id?: string;
  };
  period: {
    from: string;
    to: string;
  };
  viz: typeof VIZ[number];
  confidence: number;
  explanation: string;
}

// ---------------------------------------------------------------------------
// OpenAI tool definition
// ---------------------------------------------------------------------------

const INTERPRET_TOOL = {
  type: "function",
  function: {
    name: "set_analytics_query",
    description:
      "Preenche os parâmetros de uma query analítica sobre o CRM Welcome Trips/Weddings baseada na pergunta do gestor. SEMPRE chame esta tool.",
    parameters: {
      type: "object",
      required: ["measure", "group_by", "period", "viz", "confidence", "explanation"],
      properties: {
        measure: {
          type: "string",
          enum: [...MEASURES],
          description:
            "Métrica a calcular. count_cards=quantidade, sum_revenue=receita total, avg_ticket=ticket médio, conversion_planner_pct=% conversão para Planner ganho, avg_quality_score=qualidade média do preenchimento, etc.",
        },
        group_by: {
          type: "string",
          enum: [...DIMENSIONS],
          description: "Dimensão principal (linhas). Use month/week/day para evolução temporal.",
        },
        cross_with: {
          type: ["string", "null"],
          enum: [...DIMENSIONS, null],
          description:
            "Dimensão secundária (colunas). Use apenas se a pergunta tem duas dimensões reais. null quando for único agrupamento.",
        },
        filters: {
          type: "object",
          properties: {
            product: { type: ["string", "null"], enum: ["TRIPS", "WEDDING", "CORP", null] },
            origem: { type: "array", items: { type: "string" } },
            phase_slugs: { type: "array", items: { type: "string", enum: [...PHASE_SLUGS] } },
            lead_entry_path: { type: ["string", "null"], enum: [...LEAD_ENTRY_PATHS, null] },
            destinos: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
        period: {
          type: "object",
          required: ["from", "to"],
          properties: {
            from: { type: "string", description: "Data inicial no formato YYYY-MM-DD" },
            to: { type: "string", description: "Data final no formato YYYY-MM-DD" },
          },
        },
        viz: {
          type: "string",
          enum: [...VIZ],
          description:
            "Visualização recomendada. table para lista, bar para ranking, line para evolução temporal, heatmap para 2 dimensões categóricas.",
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "Confiança na interpretação. Use <0.6 quando a pergunta está ambígua — frontend vai pedir para o gestor validar o pivot manualmente.",
        },
        explanation: {
          type: "string",
          description:
            "Frase curta em PT-BR começando com verbo, para o card 'Entendi assim'. Ex: 'Mostra conversão para ganho Planner por dono de card, nos últimos 30 dias.'",
        },
      },
      additionalProperties: false,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(now: Date): string {
  const today = now.toISOString().slice(0, 10);
  return `Você é um interpretador de perguntas analíticas para o CRM do Welcome Group (Trips + Weddings). Hoje é ${today}.

CONTEXTO do negócio:
- O CRM é multi-produto: TRIPS (viagens sob medida) e WEDDING (destination weddings). Isolamento é por organização, não precisa filtrar por produto a menos que o usuário mencione.
- Pipeline: SDR (pré-venda) → T. Planner (vendas) → Pós-Venda (operação da viagem) → Resolução.
- Pontos de vitória: ganho_sdr (handoff qualificado), ganho_planner (proposta fechada = receita), ganho_pos (entrega concluída).
- Donos de card são pessoas diferentes por etapa: sdr_owner, planner_owner (vendas), pos_owner.
- Origem de lead: active_campaign, mkt, whatsapp, manual, indicacao, carteira_wg, etc.
- Lead entry path: full_funnel (normal), direct_planner (pulou SDR), returning (cliente voltou), referred (indicação).

TAREFA: extrair da pergunta do gestor UMA query analítica. Sempre chame a tool set_analytics_query.

REGRAS:
1. Se pergunta menciona "por X e Y" ou cruza dimensões, use cross_with. Uma dimensão só: deixe cross_with=null.
2. Se pergunta não menciona período, use últimos 30 dias por padrão. Aceita "mês passado", "ano", "trimestre", "esta semana", "últimos 90 dias", datas específicas.
3. "Receita" = sum_revenue. "Ticket médio" = avg_ticket. "Conversão" = conversion_planner_pct. "Ranking de vendedores" = count_ganho_planner group_by=planner_owner.
4. Se a pergunta é temporal ("por mês", "evolução"), use group_by=month/week/day e viz=line.
5. Se pergunta cruza duas dimensões categóricas, viz=heatmap.
6. Se pergunta é ranking ou distribuição, viz=bar.
7. Se é lista simples, viz=table.
8. Use confidence<0.6 se faltar info crítica (ex: "como estamos?" é vago demais).
9. explanation SEMPRE em PT-BR, 1 frase, começa com verbo ("Mostra", "Compara", "Lista").
10. NUNCA invente valores de filtro fora das listas. Se usuário mencionar fase que não está em [sdr, planner, pos_venda, resolucao], ignore phase_slugs.

NÃO CHUME nenhuma outra ferramenta. NÃO produza texto além da chamada de tool.`;
}

// ---------------------------------------------------------------------------
// Validação defensiva
// ---------------------------------------------------------------------------

interface ToolArgs {
  measure?: unknown;
  group_by?: unknown;
  cross_with?: unknown;
  filters?: Record<string, unknown> | null;
  period?: { from?: unknown; to?: unknown } | null;
  viz?: unknown;
  confidence?: unknown;
  explanation?: unknown;
}

function validateAndNormalize(args: ToolArgs): InterpretedQuery {
  const measure = String(args.measure ?? "");
  if (!MEASURES.includes(measure as Measure)) {
    throw new Error(`measure invalida: ${measure}`);
  }
  const group_by = String(args.group_by ?? "");
  if (!DIMENSIONS.includes(group_by as Dimension)) {
    throw new Error(`group_by invalido: ${group_by}`);
  }
  let cross_with: Dimension | null = null;
  if (args.cross_with && args.cross_with !== "null") {
    const cw = String(args.cross_with);
    if (!DIMENSIONS.includes(cw as Dimension)) {
      throw new Error(`cross_with invalido: ${cw}`);
    }
    if (cw === group_by) {
      cross_with = null;
    } else {
      cross_with = cw as Dimension;
    }
  }
  const viz = VIZ.includes(args.viz as typeof VIZ[number])
    ? (args.viz as typeof VIZ[number])
    : "table";
  const confidence = typeof args.confidence === "number"
    ? Math.max(0, Math.min(1, args.confidence))
    : 0.5;
  const explanation = String(args.explanation ?? "Query analítica.");

  const period = args.period ?? {};
  const fromRaw = String((period as { from?: unknown }).from ?? "");
  const toRaw = String((period as { to?: unknown }).to ?? "");
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw)
    ? fromRaw
    : new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toRaw)
    ? toRaw
    : new Date().toISOString().slice(0, 10);

  const rawFilters = (args.filters ?? {}) as Record<string, unknown>;
  const filters: InterpretedQuery["filters"] = {};
  if (typeof rawFilters.product === "string" && ["TRIPS", "WEDDING", "CORP"].includes(rawFilters.product)) {
    filters.product = rawFilters.product;
  }
  if (Array.isArray(rawFilters.origem)) {
    const clean = rawFilters.origem.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 64);
    if (clean.length > 0) filters.origem = clean;
  }
  if (Array.isArray(rawFilters.phase_slugs)) {
    const clean = rawFilters.phase_slugs.filter(
      (x): x is string => typeof x === "string" && (PHASE_SLUGS as readonly string[]).includes(x),
    );
    if (clean.length > 0) filters.phase_slugs = clean;
  }
  if (typeof rawFilters.lead_entry_path === "string"
      && (LEAD_ENTRY_PATHS as readonly string[]).includes(rawFilters.lead_entry_path)) {
    filters.lead_entry_path = rawFilters.lead_entry_path;
  }
  if (Array.isArray(rawFilters.destinos)) {
    const clean = rawFilters.destinos.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 64);
    if (clean.length > 0) filters.destinos = clean;
  }

  return {
    measure: measure as Measure,
    group_by: group_by as Dimension,
    cross_with,
    filters,
    period: { from, to },
    viz,
    confidence,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Rate limiting simples (in-memory por instância)
// ---------------------------------------------------------------------------

const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const hourWindow = 60 * 60 * 1000;
  const bucket = rateLimitBuckets.get(userId);
  if (!bucket || now - bucket.windowStart > hourWindow) {
    rateLimitBuckets.set(userId, { count: 1, windowStart: now });
    return { ok: true, remaining: RATE_LIMIT_PER_HOUR - 1 };
  }
  if (bucket.count >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, remaining: 0 };
  }
  bucket.count += 1;
  return { ok: true, remaining: RATE_LIMIT_PER_HOUR - bucket.count };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "missing_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const rate = checkRateLimit(user.id);
    if (!rate.ok) {
      return new Response(JSON.stringify({ error: "rate_limited", retry_after_seconds: 3600 }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return new Response(JSON.stringify({ error: "missing_question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (question.length > 500) {
      return new Response(JSON.stringify({ error: "question_too_long", max: 500 }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(new Date()) },
          { role: "user", content: question },
        ],
        tools: [INTERPRET_TOOL],
        tool_choice: { type: "function", function: { name: "set_analytics_query" } },
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error("openai_error", openaiRes.status, err);
      return new Response(JSON.stringify({ error: "llm_unavailable" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const completion = await openaiRes.json();
    const toolCall = completion?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "set_analytics_query") {
      return new Response(
        JSON.stringify({ error: "llm_no_tool_call", raw: completion?.choices?.[0]?.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsedArgs: ToolArgs;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments ?? "{}");
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "llm_invalid_json", raw: toolCall.function.arguments }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let normalized: InterpretedQuery;
    try {
      normalized = validateAndNormalize(parsedArgs);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "llm_invalid_args", reason: (e as Error).message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        query: normalized,
        rate_remaining: rate.remaining,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("analytics-ai-interpret fatal", e);
    return new Response(JSON.stringify({ error: "internal", message: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
