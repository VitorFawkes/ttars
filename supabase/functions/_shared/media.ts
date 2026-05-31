// Helpers genéricos de mídia (download + Whisper + Vision + PDF). Infra compartilhada,
// NÃO é engine de agente — pode ser usada por qualquer fluxo (Sofia/wsdr, etc).
// Espelha a abordagem já provada da Patricia (ai-agent-router-v2/_utils.ts).

const IMAGE_PROMPT =
  "Descreva em português, de forma objetiva, o que aparece nesta imagem no contexto de um casamento (local, estilo, referência de decoração, paleta, vestido, etc). Se for um print de conversa ou documento, transcreva o texto relevante. Seja conciso.";
const DOCUMENT_PROMPT =
  "Extraia em português o conteúdo relevante deste documento para um atendimento de casamento (orçamento, proposta, lista, contrato). Resuma os pontos principais de forma objetiva.";

export async function downloadMedia(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Media download failed ${response.status}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  return { base64, mimeType };
}

export async function transcribeAudio(base64: string, mimeType: string, apiKey: string): Promise<string> {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "ogg";
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), `audio.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("language", "pt");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Whisper API error ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return result.text || "";
}

export async function analyzeImage(base64: string, mimeType: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.1",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: IMAGE_PROMPT },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "low" } },
        ],
      }],
      max_completion_tokens: 1000,
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`Vision API ${res.status}: ${await res.text()}`);
  const result = await res.json();
  return result.choices?.[0]?.message?.content || "";
}

export async function analyzeDocument(base64: string, mimeType: string, apiKey: string): Promise<string> {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const ext = mimeType.includes("pdf") ? "pdf" : "bin";
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: mimeType }), `document.${ext}`);
  formData.append("purpose", "assistants");
  const uploadRes = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!uploadRes.ok) throw new Error(`File upload ${uploadRes.status}: ${await uploadRes.text()}`);
  const fileObj = await uploadRes.json();
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.1",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: DOCUMENT_PROMPT },
            { type: "file", file: { file_id: fileObj.id } },
          ],
        }],
        max_completion_tokens: 1500,
        temperature: 0.1,
      }),
    });
    if (!res.ok) throw new Error(`Chat API ${res.status}: ${await res.text()}`);
    const result = await res.json();
    return result.choices?.[0]?.message?.content || "";
  } finally {
    fetch(`https://api.openai.com/v1/files/${fileObj.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch(() => {});
  }
}

/**
 * Converte mídia (áudio/imagem/documento/sticker) em texto pro fluxo conversacional,
 * respeitando o toggle multimodal do agente. Em falha, devolve placeholder neutro
 * (descreve a ação do contato, não erro técnico) pro agente tratar com naturalidade.
 */
export async function processMediaToText(
  messageType: string,
  mediaUrl: string | null,
  apiKey: string,
  multimodalConfig?: { audio?: boolean; image?: boolean; pdf?: boolean } | null,
): Promise<string> {
  if (!mediaUrl) return "";
  if (!apiKey) return `[${messageType} recebido — processamento indisponível]`;
  const isSticker = messageType === "sticker";
  if (multimodalConfig) {
    if (messageType === "audio" && multimodalConfig.audio === false) return `[áudio recebido — processamento desabilitado]`;
    if ((messageType === "image" || isSticker) && multimodalConfig.image === false) {
      return isSticker ? `[o casal reagiu com um sticker]` : `[imagem recebida — processamento desabilitado]`;
    }
    if (messageType === "document" && multimodalConfig.pdf === false) return `[documento recebido — processamento desabilitado]`;
  }
  try {
    const { base64, mimeType } = await downloadMedia(mediaUrl);
    if (messageType === "audio") {
      const text = await transcribeAudio(base64, mimeType, apiKey);
      return text ? `[transcrição de áudio]: ${text}` : `[áudio recebido — sem fala detectada]`;
    }
    if (messageType === "image" || isSticker) {
      const text = await analyzeImage(base64, mimeType, apiKey);
      if (isSticker) return text ? `[descrição do sticker]: ${text}` : `[o casal reagiu com um sticker]`;
      return text ? `[análise de imagem]: ${text}` : `[imagem recebida — não consegui descrever]`;
    }
    if (messageType === "document") {
      const text = await analyzeDocument(base64, mimeType, apiKey);
      return text ? `[conteúdo do documento]: ${text}` : `[documento recebido — não consegui extrair]`;
    }
    return `[${messageType} recebido — tipo não suportado]`;
  } catch (err) {
    console.error(`[media] erro processando ${messageType}:`, err);
    if (isSticker) return `[o casal reagiu com um sticker]`;
    return `[${messageType} recebido — falha no processamento]`;
  }
}
