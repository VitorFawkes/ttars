import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedItem {
    title: string;
    description?: string;
    price?: number;
    currency?: string;
    dates?: string;
    location?: string;
    category?: 'hotel' | 'flight' | 'transfer' | 'experience' | 'service' | 'insurance' | 'custom';
    details?: Record<string, unknown>;
}

interface ExtractionResult {
    success: boolean;
    items: ExtractedItem[];
    rawText?: string;
    confidence?: number;
    suggestedCategory?: string;
}

// Tipos de extração de voos
type ExtractionMode = 'ida_volta' | 'ida_only' | 'volta_only' | 'separate_legs';

// Prompt base para extração genérica
const GENERIC_PROMPT = `Você é um assistente especializado em extrair informações de orçamentos de viagem de imagens.

Analise a imagem e extraia TODOS os itens de viagem que encontrar (voos, hotéis, transfers, experiências, seguros, etc.).

Para cada item encontrado, retorne um objeto JSON com:
- title: nome/descrição do item
- description: detalhes adicionais (opcional)
- price: valor numérico sem formatação (opcional)
- currency: moeda (BRL, USD, EUR) (opcional)
- dates: datas relevantes como string (opcional)
- location: cidade/local (opcional)
- category: tipo do item (hotel, flight, transfer, experience, service, insurance, custom)
- company_name: nome da empresa prestadora (ex: LATAM, Hilton, Localiza)
- details: objeto com dados extras específicos do tipo (opcional)

⚠️ IMPORTANTE PARA VOOS:
Se a imagem contém uma TABELA DE VOOS com múltiplos trechos, extraia como UM ÚNICO ITEM com category "flight" e inclua um array "segments" em details.

Cada segment deve ter:
- segment_order: 1, 2, 3... (ordem dos trechos)
- airline_code: código IATA (LA, G3, AD, AA, etc.)
- airline_name: nome completo (LATAM, GOL, Azul, etc.)
- flight_number: número do voo (ex: "4904")
- departure_date: data de saída (YYYY-MM-DD)
- departure_time: hora de saída (HH:MM)
- departure_airport: código do aeroporto (GRU, CGH, CWB, etc.)
- departure_city: nome da cidade
- arrival_date: data de chegada (YYYY-MM-DD)
- arrival_time: hora de chegada (HH:MM)
- arrival_airport: código do aeroporto
- arrival_city: nome da cidade
- cabin_class: Economy, Business, First (se disponível)
- baggage_included: informação de bagagem (se disponível)
- price: valor do voo (se disponível)

Responda APENAS com um JSON válido no formato:
{
  "items": [...],
  "confidence": 0.95,
  "rawText": "texto extraído da imagem"
}`;

// Prompt especializado para extração de voos com modo
function getFlightExtractionPrompt(mode: ExtractionMode): string {
    const modeInstructions: Record<ExtractionMode, string> = {
        'ida_volta': `MODO: IDA + VOLTA
A imagem contém uma TABELA DE VOOS com opções de IDA e VOLTA.
- Voos com MESMA DATA e MESMA ROTA são OPÇÕES do mesmo trecho
- Voos com DATA DIFERENTE ou ROTA DIFERENTE são TRECHOS diferentes
- Geralmente: primeira tabela = opções de IDA, segunda tabela = opções de VOLTA

Agrupe os voos assim:
- Se data/rota iguais → são opções do mesmo trecho
- Se data diferente ou rota invertida → são trechos diferentes`,

        'ida_only': `MODO: APENAS IDA
A imagem contém OPÇÕES DE VOO para um único trecho de IDA.
TODAS as linhas da tabela são OPÇÕES DIFERENTES para o MESMO trecho.
Extraia todos os voos como opções de um único trecho de ida.`,

        'volta_only': `MODO: APENAS VOLTA
A imagem contém OPÇÕES DE VOO para um único trecho de VOLTA.
TODAS as linhas da tabela são OPÇÕES DIFERENTES para o MESMO trecho.
Extraia todos os voos como opções de um único trecho de volta.`,

        'separate_legs': `MODO: TRECHOS SEPARADOS
Cada linha/voo da imagem é um TRECHO DIFERENTE (conexões, multi-city).
Extraia cada voo como um segment separado.`,
    };

    return `Você é um assistente especializado em extrair informações de VOOS de imagens de reservas/cotações.

${modeInstructions[mode]}

EXTRAIA TODOS OS VOOS da imagem. Cada voo deve ter:
- segment_order: número sequencial (1, 2, 3...)
- airline_code: código IATA da companhia (AD=Azul, G3=GOL, LA=LATAM, etc.)
- airline_name: nome completo da companhia
- flight_number: número do voo (apenas números, sem prefixo da cia)
- departure_date: data de saída no formato YYYY-MM-DD
- departure_time: hora de saída no formato HH:MM
- departure_airport: código IATA do aeroporto (CGH, GRU, CWB, etc.)
- departure_city: nome da cidade
- arrival_date: data de chegada no formato YYYY-MM-DD
- arrival_time: hora de chegada no formato HH:MM
- arrival_airport: código IATA do aeroporto
- arrival_city: nome da cidade
- cabin_class: classe (Economy, Business, First)
- baggage_included: informação de bagagem se disponível
- price: valor numérico do voo (sem formatação, apenas número)

IMPORTANTE:
- Aeroporto CGH = São Paulo Congonhas
- Aeroporto GRU = São Paulo Guarulhos
- Aeroporto CWB = Curitiba Afonso Pena
- Se o preço tiver centavos (ex: R$ 370,94), use 370.94

Responda APENAS com um JSON válido no formato:
{
  "items": [{
    "category": "flight",
    "title": "Voos Extraídos",
    "details": {
      "segments": [
        { "segment_order": 1, "airline_code": "AD", "airline_name": "Azul", "flight_number": "6404", ... },
        { "segment_order": 2, ... }
      ]
    }
  }],
  "confidence": 0.95,
  "rawText": "texto extraído da imagem"
}`;
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        console.log('[AI Extract] Request received');

        const { image, imageUrl, extractionMode, flightExtraction, voucherExtraction, voucherType, voucherPrompt } = await req.json();

        if (!image && !imageUrl) {
            console.error('[AI Extract] No image provided');
            return new Response(
                JSON.stringify({ success: false, error: "No image provided", items: [] }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openaiApiKey) {
            console.error('[AI Extract] OPENAI_API_KEY not configured');
            return new Response(
                JSON.stringify({ success: false, error: "AI service not configured in Supabase Secrets", items: [] }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
        console.log('[AI Extract] API Key configured');

        // Build the image content for OpenAI
        const imageContent = imageUrl
            ? { type: "image_url", image_url: { url: imageUrl } }
            : { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } };

        // Selecionar o prompt baseado no modo
        let systemPrompt: string;
        let userMessage: string;

        if (voucherExtraction && voucherPrompt) {
            // Modo voucher: prompt específico passado pelo frontend
            systemPrompt = `Você é um assistente especializado em extrair dados de vouchers e confirmações de viagem.
Analise a imagem/documento e extraia os dados no formato JSON estruturado.
Retorne APENAS um JSON válido com os campos solicitados. Se um campo não for encontrado, use null.

${voucherPrompt}

Retorne o resultado como um array "items" com um único objeto contendo:
- category: "${voucherType || 'generic'}"
- title: nome descritivo do voucher
- details: objeto com TODOS os campos extraídos
- confidence: número de 0 a 1 indicando confiança na extração`;
            userMessage = `Extraia todos os dados deste voucher/confirmação de ${voucherType || 'viagem'}.`;
        } else if (flightExtraction && extractionMode) {
            systemPrompt = getFlightExtractionPrompt(extractionMode as ExtractionMode);
            userMessage = "Extraia TODOS os voos desta imagem de cotação/reserva aérea.";
        } else {
            systemPrompt = GENERIC_PROMPT;
            userMessage = "Extraia todas as informações de viagem desta imagem de orçamento.";
        }

        console.log(`[AI Extract] Mode: ${extractionMode || 'generic'}, Flight extraction: ${flightExtraction}`);
        console.log('[AI Extract] Calling OpenAI GPT-5.1 Vision API...');
        const startTime = Date.now();

        // Call OpenAI Vision API
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openaiApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-5.1",
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: userMessage
                            },
                            imageContent as any
                        ]
                    }
                ],
                max_completion_tokens: 4096,
                temperature: 0.1, // Mais baixo para maior consistência
            }),
        });

        const duration = Date.now() - startTime;
        console.log(`[AI Extract] OpenAI call took ${duration}ms`);

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error('[AI Extract] OpenAI API error:', openaiResponse.status, errorText);
            return new Response(
                JSON.stringify({
                    success: false,
                    error: `OpenAI API Error: ${openaiResponse.status}`,
                    details: errorText,
                    items: []
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const openaiData = await openaiResponse.json();
        const content = openaiData.choices?.[0]?.message?.content;

        if (!content) {
            console.error('[AI Extract] No content in OpenAI response');
            return new Response(
                JSON.stringify({ success: false, error: "No response from AI", items: [] }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log('[AI Extract] GPT-5.1 response received, parsing content length:', content.length);

        // Parse the JSON response from GPT
        let parsed: { items: ExtractedItem[]; confidence?: number; rawText?: string };
        try {
            // Remove markdown code blocks if present
            const cleanContent = content
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            // Try to extract JSON from the response
            const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                console.warn('[AI Extract] Could not find JSON object in response');
                parsed = { items: [], rawText: content };
            }
        } catch (parseError) {
            console.error('[AI Extract] Failed to parse AI response:', parseError);
            console.log('[AI Extract] Raw content:', content);
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Failed to parse AI response",
                    rawText: content,
                    items: []
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const result: ExtractionResult = {
            success: true,
            items: parsed.items || [],
            confidence: parsed.confidence,
            rawText: parsed.rawText,
        };

        // Log dos segments extraídos para debug
        const flightItem = result.items.find(i => i.category === 'flight');
        if (flightItem?.details?.segments) {
            const segments = flightItem.details.segments as any[];
            console.log(`[AI Extract] Flight extraction complete. Found ${segments.length} segments.`);
            segments.forEach((seg, i) => {
                console.log(`  Segment ${i + 1}: ${seg.airline_code} ${seg.flight_number} ${seg.departure_airport}->${seg.arrival_airport} ${seg.departure_date} ${seg.departure_time}`);
            });
        } else {
            console.log(`[AI Extract] Extraction complete. Found ${result.items.length} items.`);
        }

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error('[AI Extract] Unhandled error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message || 'Internal server error', items: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
