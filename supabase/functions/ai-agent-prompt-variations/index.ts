/**
 * ai-agent-prompt-variations — sugere 3 variações de texto pro editor do Playbook.
 *
 * Parte do Marco 2b. Chamada pelos botões "Sugerir variações" ao lado de campos
 * de texto livre (missão, frase-âncora, frase típica, exemplo, etc.).
 *
 * Request:
 *   { text: string, field_type: string, context?: {...}, num_variations?: number }
 *
 * Response:
 *   { suggestions: [{ text, rationale }], model_used }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type FieldType =
  | 'mission_one_liner'
  | 'anchor_text'
  | 'typical_phrase'
  | 'forbidden_phrase'
  | 'example_lead_message'
  | 'example_agent_response'
  | 'red_line'
  | 'signal_hint'
  | 'moment_label'
  | 'custom';

interface VariationsRequest {
  text: string;
  field_type: FieldType;
  context?: {
    agent_nome?: string;
    agent_role?: string;
    company_name?: string;
    voice_tone_tags?: string[];
    voice_formality?: number;
    related_moment_label?: string;
    related_lead_message?: string;
    industry_hint?: string;
  };
  num_variations?: number;
}

interface Suggestion {
  text: string;
  rationale: string;
}

const GUIDANCE_BY_FIELD: Record<FieldType, string> = {
  mission_one_liner:
    "Missão do agente em UMA frase. Diz o que ele faz e pra quem. Verbo forte no presente. Sem jargão. Entre 10 e 25 palavras.",
  anchor_text:
    "Frase-âncora que o agente usa naquele momento da conversa. Deve soar natural no WhatsApp, adaptar ao tom/voz do agente, conter o propósito sem prometer o que não é do agente. Use {contact_name} como placeholder do nome do lead. Evite formalidade corporativa.",
  typical_phrase:
    "Frase curta que ilustra COMO esse agente fala tipicamente. Natural, oral, brasileira. 3 a 10 palavras. Sem jargão corporativo.",
  forbidden_phrase:
    "Frase curta que representa COMO esse agente NÃO deve falar (clichê, formalidade excessiva, robô, invento). 3 a 10 palavras.",
  example_lead_message:
    "Uma mensagem realista de um lead escrevendo no WhatsApp. Informal, pode ter erro de digitação leve, curta.",
  example_agent_response:
    "Como o agente responderia A MENSAGEM DO LEAD fornecida em contexto. Seguir tom/voz, respeitar red_lines, manter natural.",
  red_line:
    "Regra absoluta do que o agente NUNCA deve fazer. Comece com 'Nunca' ou 'Jamais'. Curta, imperativa, específica.",
  signal_hint:
    "Descrição curta de como detectar um sinal na conversa. Ex: 'lead menciona viagem internacional recente', 'menciona amigo que fez X'.",
  moment_label:
    "Rótulo curto (1-3 palavras) pra um momento da conversa. Ex: 'Abertura', 'Objeção de preço', 'Desfecho qualificado'.",
  custom:
    "Gere 3 variações naturais do texto fornecido, mantendo o mesmo propósito mas variando estilo, estrutura e palavras.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json() as VariationsRequest;
    if (!body.field_type) {
      return new Response(
        JSON.stringify({ error: "field_type obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const numVariations = Math.min(Math.max(body.num_variations ?? 3, 1), 5);
    const fieldGuidance = GUIDANCE_BY_FIELD[body.field_type] ?? GUIDANCE_BY_FIELD.custom;

    const ctx = body.context ?? {};
    const contextLines: string[] = [];
    if (ctx.agent_nome) contextLines.push(`Nome do agente: ${ctx.agent_nome}`);
    if (ctx.agent_role) contextLines.push(`Função do agente: ${ctx.agent_role}`);
    if (ctx.company_name) contextLines.push(`Empresa: ${ctx.company_name}`);
    if (ctx.industry_hint) contextLines.push(`Setor: ${ctx.industry_hint}`);
    if (ctx.voice_tone_tags?.length) contextLines.push(`Tom: ${ctx.voice_tone_tags.join(', ')}`);
    if (ctx.voice_formality !== undefined) contextLines.push(`Formalidade: ${ctx.voice_formality}/5`);
    if (ctx.related_moment_label) contextLines.push(`Momento relacionado: ${ctx.related_moment_label}`);
    if (ctx.related_lead_message) contextLines.push(`Mensagem do lead: "${ctx.related_lead_message}"`);
    const contextBlock = contextLines.length > 0 ? `\n\nContexto:\n${contextLines.join('\n')}` : '';

    const currentText = body.text?.trim() || "(vazio — gere do zero a partir do contexto)";

    const systemPrompt = `Você é um especialista em copywriting conversacional e em engenharia de prompts de agentes IA.
Seu trabalho é sugerir ${numVariations} variações de um campo específico pra um agente IA que responde no WhatsApp.

Tipo de campo: ${body.field_type}
Orientação: ${fieldGuidance}${contextBlock}

Texto atual:
"""
${currentText}
"""

Regras:
- Português brasileiro natural, NUNCA formal demais.
- Cada variação deve ter tom ligeiramente diferente, mas manter o mesmo propósito do texto original.
- Se o texto atual estiver vazio, gere ${numVariations} propostas iniciais boas com base no contexto.
- Inclua {contact_name} quando fizer sentido (não é obrigatório em toda variação).
- Nunca use clichês ("sonhos", "experiência premium", "deixe conosco").
- Cada variação vem com um "rationale" de 1 frase explicando o tom/abordagem.

Saída OBRIGATÓRIA em JSON:
{
  "suggestions": [
    { "text": "...", "rationale": "..." },
    ...
  ]
}`;

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const modelUsed = "gpt-4.1-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelUsed,
        temperature: 0.9,
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Sugira as variações agora em JSON." },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return new Response(
        JSON.stringify({ error: "LLM error", details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const llmData = await res.json();
    const rawContent = llmData.choices?.[0]?.message?.content || "{}";

    let parsed: { suggestions?: Suggestion[] } = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON from LLM", raw: rawContent.substring(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, numVariations) : [];
    if (suggestions.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma sugestão válida", raw: rawContent.substring(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        suggestions,
        model_used: modelUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
