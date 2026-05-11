import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessResult {
    message_id: string;
    message_type: string;
    media_content: string | null;
    error?: string;
}

const IMAGE_PROMPT = `Descreva esta imagem enviada por um cliente de agência de viagens.
Se for um documento (passaporte, itinerário, reserva de hotel, passagem aérea, comprovante de pagamento):
- Extraia todos os dados relevantes: nomes, datas, destinos, valores, códigos de reserva, companhias
Se for uma foto de destino ou lugar:
- Descreva brevemente o local
Se for um print de tela ou outro conteúdo:
- Descreva o que está visível

Responda em português, máximo 300 palavras. Seja direto e factual.`;

const DOCUMENT_PROMPT = `Extraia todo o texto e dados relevantes deste documento.
Se for um itinerário de viagem, reserva de hotel, passagem aérea ou comprovante:
- Extraia: datas, destinos, nomes dos viajantes, valores, códigos de reserva, companhias aéreas/hotéis
- Organize de forma estruturada

Se for outro tipo de documento:
- Extraia o conteúdo principal de forma resumida

Responda em português, formato estruturado. Máximo 500 palavras.`;

async function transcribeAudio(base64: string, mimeType: string, apiKey: string): Promise<string> {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }

    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'ogg';
    const formData = new FormData();
    formData.append('file', new Blob([bytes], { type: mimeType }), `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Whisper API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result.text || '';
}

async function analyzeImage(base64: string, mimeType: string, prompt: string, apiKey: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-5.1',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'low' } }
                ]
            }],
            max_completion_tokens: 1000,
            temperature: 0.1,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vision API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || '';
}

async function analyzeDocument(base64: string, mimeType: string, prompt: string, apiKey: string): Promise<string> {
    // PDFs can't be sent via image_url — upload to Files API, then reference in chat
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }

    const ext = mimeType.includes('pdf') ? 'pdf' : 'bin';
    const formData = new FormData();
    formData.append('file', new Blob([bytes], { type: mimeType }), `document.${ext}`);
    formData.append('purpose', 'assistants');

    const uploadRes = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
    });

    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`File upload error ${uploadRes.status}: ${errorText}`);
    }

    const fileObj = await uploadRes.json();
    const fileId = fileObj.id;
    console.log(`[ProcessMedia] File uploaded: ${fileId}`);

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-5.1',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'file', file: { file_id: fileId } }
                    ]
                }],
                max_completion_tokens: 1500,
                temperature: 0.1,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Chat API error ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        return result.choices?.[0]?.message?.content || '';
    } finally {
        // Cleanup: delete the uploaded file
        fetch(`https://api.openai.com/v1/files/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiKey}` },
        }).catch(() => {});
    }
}

async function downloadMedia(url: string): Promise<{ base64: string; mimeType: string }> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Media download failed ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = base64Encode(new Uint8Array(buffer));
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';

    return { base64, mimeType };
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { card_id } = await req.json();

        if (!card_id) {
            return new Response(
                JSON.stringify({ error: "card_id is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openaiApiKey) {
            return new Response(
                JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Query pending media messages for this card
        const { data: pendingMedia, error: queryError } = await supabase
            .from('whatsapp_messages')
            .select('id, message_type, media_url, body')
            .eq('card_id', card_id)
            .in('message_type', ['audio', 'image', 'document'])
            .is('media_content', null)
            .not('media_url', 'is', null)
            .order('created_at', { ascending: true })
            .limit(20);

        if (queryError) {
            console.error('[ProcessMedia] Query error:', queryError);
            return new Response(
                JSON.stringify({ error: queryError.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!pendingMedia || pendingMedia.length === 0) {
            return new Response(
                JSON.stringify({ processed: 0, message: "No pending media found" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Limit to 5 items per invocation to stay within Edge Function timeout (60s)
        const mediaToProcess = pendingMedia.slice(0, 5);
        console.log(`[ProcessMedia] Processing ${mediaToProcess.length} of ${pendingMedia.length} pending media messages for card ${card_id}`);

        const results: ProcessResult[] = [];

        for (const msg of mediaToProcess) {
            try {
                console.log(`[ProcessMedia] Processing ${msg.message_type}: ${msg.id}`);
                const startTime = Date.now();

                // Download media
                const { base64, mimeType } = await downloadMedia(msg.media_url);
                console.log(`[ProcessMedia] Downloaded ${msg.message_type} (${Math.round(base64.length / 1024)}KB, ${mimeType})`);

                let mediaContent = '';

                if (msg.message_type === 'audio') {
                    mediaContent = await transcribeAudio(base64, mimeType, openaiApiKey);
                } else if (msg.message_type === 'image') {
                    mediaContent = await analyzeImage(base64, mimeType, IMAGE_PROMPT, openaiApiKey);
                } else if (msg.message_type === 'document') {
                    mediaContent = await analyzeDocument(base64, mimeType, DOCUMENT_PROMPT, openaiApiKey);
                }

                const duration = Date.now() - startTime;
                console.log(`[ProcessMedia] ${msg.message_type} processed in ${duration}ms (${mediaContent.length} chars)`);

                if (mediaContent) {
                    const updatePayload: Record<string, string> = {
                        media_content: mediaContent,
                    };

                    // Update body when it's empty OR a placeholder (e.g. "[Áudio]", "[Imagem]", "[Documento: file.pdf]")
                    // Never overwrite real captions written by the user
                    const isPlaceholder = !msg.body || /^\[(?:Áudio|Imagem|Documento|Audio)/.test(msg.body);
                    if (isPlaceholder) {
                        if (msg.message_type === 'audio') {
                            updatePayload.body = `[Transcrição]: ${mediaContent}`;
                        } else if (msg.message_type === 'image') {
                            updatePayload.body = `[Imagem]: ${mediaContent}`;
                        } else if (msg.message_type === 'document') {
                            updatePayload.body = `[Documento]: ${mediaContent}`;
                        }
                    }

                    const { error: updateError } = await supabase
                        .from('whatsapp_messages')
                        .update(updatePayload)
                        .eq('id', msg.id);

                    if (updateError) {
                        console.error(`[ProcessMedia] Update error for ${msg.id}:`, updateError);
                        results.push({ message_id: msg.id, message_type: msg.message_type, media_content: null, error: updateError.message });
                    } else {
                        results.push({ message_id: msg.id, message_type: msg.message_type, media_content: mediaContent });
                    }
                } else {
                    results.push({ message_id: msg.id, message_type: msg.message_type, media_content: null, error: 'Empty result from API' });
                }
            } catch (msgError: any) {
                console.error(`[ProcessMedia] Error processing ${msg.id}:`, msgError);
                results.push({ message_id: msg.id, message_type: msg.message_type, media_content: null, error: msgError.message });
            }
        }

        const processed = results.filter(r => r.media_content !== null).length;
        const failed = results.filter(r => r.media_content === null).length;

        console.log(`[ProcessMedia] Done: ${processed} processed, ${failed} failed`);

        return new Response(
            JSON.stringify({ processed, failed, total: results.length, results }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error('[ProcessMedia] Unhandled error:', error);
        return new Response(
            JSON.stringify({ error: error.message || 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
