/**
 * disparo-variar-mensagem — gera variações de UMA mensagem de disparo.
 *
 * Objetivo anti-bloqueio: quando a mesma mensagem vai pra muita gente, o WhatsApp
 * marca como spam por repetição. Esta função recebe a mensagem principal e devolve
 * N reescritas que dizem a MESMA coisa com palavras/ordem diferentes — preservando
 * os campos personalizados ([nome], [cidade], {{nome}}…) intactos. O envio sorteia
 * uma versão por pessoa (ver disparo_calcular_agenda).
 *
 * Reusa o padrão OpenAI das outras edge functions de IA (ai-agent-prompt-variations).
 *
 * Request:  { mensagem: string, num_variacoes?: number, contexto?: { variaveis?: string[], casamento?: string } }
 * Response: { variacoes: string[], model_used: string }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VariarRequest {
  mensagem: string;
  num_variacoes?: number;
  contexto?: {
    variaveis?: string[];
    casamento?: string;
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as VariarRequest;
    const mensagem = (body.mensagem ?? "").trim();
    if (!mensagem) return json({ error: "mensagem obrigatória" }, 400);

    const n = Math.min(Math.max(body.num_variacoes ?? 3, 1), 5);
    const ctx = body.contexto ?? {};

    // Campos personalizados que NÃO podem ser alterados (ex.: [nome], [cidade]).
    const campos = (ctx.variaveis ?? []).filter((v) => v && v.trim() !== "");
    const camposLine = campos.length
      ? `Campos personalizados que DEVEM ser mantidos exatamente como estão: ${campos.map((c) => `[${c}]`).join(", ")}.`
      : "Se houver algo entre colchetes (ex.: [nome]) ou chaves duplas (ex.: {{nome}}), mantenha exatamente como está.";
    const casamentoLine = ctx.casamento ? `Contexto: convidados do casamento "${ctx.casamento}".` : "";

    const systemPrompt = `Você é especialista em copywriting de WhatsApp pra um negócio de casamentos/viagens.
Recebe UMA mensagem que será enviada pra vários convidados e gera ${n} variações dela.

OBJETIVO: cada convidado deve receber um texto diferente, dizendo EXATAMENTE a mesma coisa,
pra que o WhatsApp não marque o número como spam por mensagens repetidas.

${casamentoLine}
${camposLine}

REGRAS ABSOLUTAS:
- Mesma intenção, mesmas informações e mesmo tom acolhedor do original. NÃO invente dados,
  preços, datas, links ou promessas que não estão no texto original.
- Varie de verdade: saudação, ordem das frases, conectores e escolha de palavras.
- Mantenha os campos personalizados ([nome], [cidade], {{nome}}…) IDÊNTICOS e na mesma posição lógica.
  Toda variação que tiver nome deve usar o mesmo campo do original (ex.: [nome]).
- Português brasileiro natural e caloroso, informal-educado. Sem clichê de marketing
  ("experiência única", "realizar o sonho", "imperdível").
- NÃO adicione links nem peça pra clicar em nada.
- Tamanho parecido com o original (não resuma demais nem alongue demais).

Mensagem original:
"""
${mensagem}
"""

Saída OBRIGATÓRIA em JSON: { "variacoes": ["texto 1", "texto 2", ...] } com exatamente ${n} itens.`;

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    const modelUsed = "gpt-4.1-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelUsed,
        temperature: 0.95,
        max_completion_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Gere as variações agora em JSON." },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return json({ error: "LLM error", details: errBody.substring(0, 500) }, 502);
    }

    const llmData = await res.json();
    const rawContent = llmData.choices?.[0]?.message?.content || "{}";

    let parsed: { variacoes?: unknown } = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return json({ error: "Invalid JSON from LLM", raw: rawContent.substring(0, 300) }, 502);
    }

    const variacoes = Array.isArray(parsed.variacoes)
      ? parsed.variacoes
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
          .map((v) => v.trim())
          .slice(0, n)
      : [];

    if (variacoes.length === 0) return json({ error: "Nenhuma variação válida" }, 502);

    return json({ variacoes, model_used: modelUsed });
  } catch (err) {
    return json({ error: "Internal error", details: String(err) }, 500);
  }
});
