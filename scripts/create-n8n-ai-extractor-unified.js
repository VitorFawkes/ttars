#!/usr/bin/env node
/**
 * Create "Welcome CRM - AI Extractor Unified" workflow in n8n
 *
 * Unifies 3 extraction workflows into one:
 *   - WhatsApp conversations (manual button, trip-aware)
 *   - Briefing audio (Whisper transcription)
 *   - Meeting transcription
 *
 * Routes by `source` param: whatsapp | briefing_audio | meeting_transcript
 *
 * Best-of-3 features:
 *   - Config v2 (stage-aware field visibility) — from Atualizador
 *   - Smart merge (append text, dedupe arrays) — from Atualizador
 *   - Locked fields respect + restore in mode=novo — from Briefing IA
 *   - Hidden fields → observações redirect — from Briefing IA
 *   - Activity logging — from Transcript
 *   - briefing_text generation — from Briefing IA / Transcript
 *   - valor_estimado calculation — from Briefing IA / Transcript
 *   - Tarefas metadata update — from Transcript
 *   - Whisper transcription — from Briefing IA
 *   - WhatsApp media processing — from Atualizador
 *   - Trip-aware extraction (multi-viagem) — NEW
 *
 * Usage: source .env && node scripts/create-n8n-ai-extractor-unified.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';

// Credential IDs from existing workflows
const SUPABASE_CREDENTIAL = { id: 'SXzk2uSaw8b7BcaN', name: 'WelcomeSupabase' };
const OPENAI_CREDENTIAL = { id: 'ZLg8WpP4UNXepE8g', name: 'Vitor TESTE' };

if (!API_KEY) {
  console.error('❌ N8N_API_KEY is required.');
  console.error('Usage: source .env && node scripts/create-n8n-ai-extractor-unified.js');
  process.exit(1);
}

// ============================================================================
// SYSTEM PROMPT (shared across all sources)
// ============================================================================

const SYSTEM_PROMPT = `Você é a Julia, assistente de IA da Welcome Trips — uma agência premium de viagens personalizadas.

Sua função é processar texto (conversa WhatsApp, transcrição de áudio ou reunião) e retornar JSON com campos estruturados para o CRM.

## REGRAS ABSOLUTAS

1. EXTRAIA APENAS informações confirmadas/decididas
2. NUNCA invente ou infira informações não ditas
3. Se houver ambiguidade, NÃO inclua o campo
4. Respeite os formatos e valores permitidos de cada campo
5. Campos com dados existentes: SOMENTE atualize se houve informação NOVA ou DIFERENTE
6. Se um campo NÃO foi mencionado, NÃO o inclua (mantém o existente)
7. Transcrição/conversa pode ter erros de reconhecimento: "maldives" = "Maldivas", etc. Use bom senso
8. Números devem ser números puros (sem formatação)
9. Booleanos devem ser true ou false
10. Para campos select/multiselect, use APENAS os valores permitidos

## TIPO DE ÁUDIO (quando source = briefing_audio)

**Tipo A — Relato do consultor:** O consultor narra sozinho o que conversou com o cliente.
**Tipo B — Conversa ao vivo:** Áudio da conversa entre consultor e cliente.

Para Tipo B:
- PERGUNTAS do consultor NÃO são dados
- SUGESTÕES do consultor NÃO são dados, EXCETO se o cliente confirmar
- RESPOSTAS e CONFIRMAÇÕES do cliente SÃO dados
- Hesitação ou incerteza do cliente NÃO é dado

## DESTINOS — REGRA ESPECIAL
Cidade mencionada NÃO é necessariamente destino. Extraia APENAS locais que o cliente demonstrou INTENÇÃO de visitar nesta viagem.
NÃO-destinos (NUNCA extrair como destino):
- Cidade onde o cliente MORA ("aqui em Roma faz frio", "moro em São Paulo")
- Referências/comparações ("tipo aquele hotel em Roma", "já fui pra Roma ano passado")
- Conexões/escalas sem pernoite
- Destinos de viagens PASSADAS que não fazem parte desta viagem
- Cidades mencionadas pelo CONSULTOR como sugestão não confirmada pelo cliente

## PROIBIÇÕES (CRÍTICO)
- NUNCA analise ou comente sobre a qualidade/completude dos dados
- NUNCA sugira "próximos passos" ou recomendações
- NUNCA escreva como se estivesse conversando — você é um EXTRATOR
- NUNCA encha o briefing com conteúdo inventado

## SAÍDA
Responda APENAS com JSON válido. Nenhum texto antes ou depois. Sem markdown.`;

// NOTE: Source-specific prompts are built INSIDE the Code nodes (Formata WhatsApp / Monta Contexto Audio/Meeting)
// because they need JS interpolation of runtime data. The Agent node receives the final prompt via $json.ai_prompt.

// ============================================================================
// CODE NODES
// ============================================================================

// --- Prepara Audio (from Briefing IA) ---
const CODE_PREPARA_AUDIO = `// Converte base64 para binary data (para HTTP Request/Whisper)
const items = $input.all();
const audio_base64 = items[0].json.audio_base64;
let audio_mime_type = items[0].json.audio_mime_type || 'audio/webm';
const card_id = items[0].json.card_id;
const user_id = items[0].json.user_id;

if (!audio_base64 || audio_base64.length < 100) {
  throw new Error('Audio base64 vazio ou muito curto.');
}

// Normalizar MIME types não-padrão
if (audio_mime_type === 'audio/m4a' || audio_mime_type === 'audio/x-m4a') {
  audio_mime_type = 'audio/mp4';
}
if (audio_mime_type.includes(';')) {
  audio_mime_type = audio_mime_type.split(';')[0].trim();
}

const ext = audio_mime_type.includes('webm') ? 'webm'
  : audio_mime_type.includes('mp4') ? 'm4a'
  : audio_mime_type.includes('mpeg') || audio_mime_type.includes('mp3') ? 'mp3'
  : audio_mime_type.includes('wav') ? 'wav'
  : audio_mime_type.includes('aiff') ? 'aiff'
  : 'ogg';

const fileSizeKB = Math.round(audio_base64.length * 0.75 / 1024);
console.log('[Unified] Audio: ' + fileSizeKB + 'KB, tipo: ' + audio_mime_type + ', ext: ' + ext);

return [{
  json: { card_id, user_id },
  binary: {
    audio: {
      data: audio_base64,
      mimeType: audio_mime_type,
      fileName: 'audio.' + ext
    }
  }
}];`;

// --- Extrai Transcrição (from Briefing IA) ---
const CODE_EXTRAI_TRANSCRICAO = `// Extrai texto da resposta do Whisper
const whisperResponse = $input.first().json;
const card_id = $('1. Extrai Params').first().json.card_id;
const user_id = $('1. Extrai Params').first().json.user_id;

const transcription = (whisperResponse.text || '').trim();
console.log('[Unified] Transcrição: ' + transcription.length + ' caracteres');

if (!transcription || transcription.length < 10) {
  return [{ json: {
    card_id, user_id,
    transcription: '',
    status: 'transcription_empty',
    error: 'Transcrição vazia ou muito curta. Verifique o áudio.'
  }}];
}

return [{ json: { card_id, user_id, transcription }}];`;


// --- Formata WhatsApp (NEW — trip-aware message formatting) ---
const CODE_FORMATA_WHATSAPP = `// Formata histórico WhatsApp com contexto de trip-aware
const webhookData = $('1. Extrai Params').first().json;

// Guard: skip se source NÃO é whatsapp (tratado pelo branch 6am.)
if (webhookData.source !== 'whatsapp') return [];

const cardData = $('4. Busca Card').first().json;
const config = $('5. Busca Config').first().json;

// Mensagens do WhatsApp (por contact_id, não card_id)
const allMsgs = $('3w. Busca WhatsApp').all().map(i => i.json);

// Outros cards do contato (para trip context)
let otherCards = [];
try {
  otherCards = $('3x. Busca Outros Cards').all().map(i => i.json).filter(i => i.id);
} catch(e) {};

const card_id = webhookData.card_id;
const user_id = webhookData.user_id;

// Config v2: visibilidade
const allFields = config.fields || [];
const fields = allFields.filter(f => f.is_visible !== false);
const hiddenKeys = allFields.filter(f => f.is_visible === false).map(f => f.key);
const sections = config.sections || {};

const produtoData = cardData.produto_data || {};
const briefingData = cardData.briefing_inicial || {};
const lockedFields = cardData.locked_fields || {};
const lockedKeys = Object.keys(lockedFields).filter(k => lockedFields[k] === true);
const fase = cardData.pipeline_stages?.fase || 'SDR';
const stageName = cardData.pipeline_stages?.nome || '';

// SECTION_MAP por fase
const SECTION_MAP = {
  SDR: { dataSource: 'briefing_inicial', obsKey: 'observacoes', obsLabel: 'Observações do SDR' },
  Planner: { dataSource: 'produto_data', obsKey: 'observacoes_criticas', obsLabel: 'Observações Críticas (Planner)' },
  'Pós-venda': { dataSource: 'produto_data', obsKey: 'observacoes_pos_venda', obsLabel: 'Observações Pós-Venda' }
};
const sectionInfo = SECTION_MAP[fase] || SECTION_MAP['SDR'];

// Fonte dos dados baseada na FASE
let tripSource = {};
let obsSource = {};
if (fase === 'SDR') {
  tripSource = briefingData;
  obsSource = briefingData.observacoes || {};
} else if (fase === 'Planner') {
  tripSource = produtoData;
  obsSource = produtoData.observacoes_criticas || {};
} else {
  tripSource = produtoData;
  obsSource = produtoData.observacoes_pos_venda || {};
}

// Campos atuais dinâmicos
const camposAtuais = {};
for (const field of fields) {
  const source = field.section === 'trip_info' ? tripSource : obsSource;
  camposAtuais[field.key] = source[field.key] || null;
}

// Formata mensagens cronológicas
if (!Array.isArray(allMsgs) || allMsgs.length === 0) {
  return [{
    json: {
      card_id, user_id, source: 'whatsapp',
      titulo: cardData.titulo, fase, stage_name: stageName,
      section_info: sectionInfo,
      campos_atuais: camposAtuais,
      historico_conversa: '(Nenhuma mensagem encontrada)',
      total_mensagens: 0,
      field_definitions: '',
      field_config: { ...config, fields },
      hidden_fields: hiddenKeys,
      skip_ai: false,
      other_trips_context: '',
      trip_filter_instructions: ''
    }
  }];
}

const messagesChronological = [...allMsgs].reverse();
const historico = messagesChronological.map(msg => {
  const who = msg.is_from_me ? 'AGENTE' : 'CLIENTE';
  const date = msg.created_at ? new Date(msg.created_at).toLocaleString('pt-BR') : '';

  let content = '';
  const msgType = msg.message_type || 'text';

  if (msg.media_content && msgType !== 'text') {
    if (msgType === 'audio') {
      content = '[Transcrição]: ' + msg.media_content;
    } else if (msgType === 'image') {
      content = '[Imagem]: ' + msg.media_content;
    } else if (msgType === 'document') {
      content = '[Documento]: ' + msg.media_content;
    } else {
      content = msg.media_content;
    }
  } else if (msg.body) {
    content = msg.body;
  } else {
    content = '(mídia não processada)';
  }

  return '[' + date + '] ' + who + ': ' + content;
}).join('\\n');

// Trip-aware context: montar info sobre outras viagens do contato
let otherTripsContext = '';
let tripFilterInstructions = '';

if (otherCards.length > 0) {
  const otherTrips = otherCards.map(c => {
    const destinos = c.produto_data?.destinos || c.briefing_inicial?.destinos || [];
    const epoca = c.produto_data?.epoca_viagem?.display || c.briefing_inicial?.epoca_viagem?.display || '';
    return '- "' + c.titulo + '" (destinos: ' + (destinos.length > 0 ? destinos.join(', ') : 'não definidos') + (epoca ? ', época: ' + epoca : '') + ')';
  }).join('\\n');

  const thisDestinos = camposAtuais.destinos || [];
  const thisEpoca = camposAtuais.epoca_viagem?.display || '';

  otherTripsContext = '## ESTA VIAGEM (a que você deve atualizar)\\n'
    + 'Card: "' + cardData.titulo + '"\\n'
    + 'Destinos atuais: ' + JSON.stringify(thisDestinos) + '\\n'
    + (thisEpoca ? 'Época: ' + thisEpoca + '\\n' : '')
    + '\\n## OUTRAS VIAGENS DESTE CONTATO (NÃO atualizar)\\n'
    + otherTrips;

  tripFilterInstructions = '\\n## REGRA: FILTRAGEM POR VIAGEM\\n'
    + 'A conversa pode mencionar MÚLTIPLAS viagens. Extraia SOMENTE informações relacionadas a ESTA viagem (' + cardData.titulo + ').\\n'
    + '- Informações claramente sobre esta viagem → EXTRAIA\\n'
    + '- Informações claramente sobre outra viagem → IGNORE\\n'
    + '- Se não está claro a qual viagem se refere → NÃO extraia\\n'
    + '\\nSe a conversa é INTEIRAMENTE sobre outra viagem, retorne:\\n'
    + '{ "_meta": { "status": "wrong_trip", "detected_trip": "nome da viagem detectada", "message": "As mensagens recentes são sobre outra viagem" } }\\n'
    + '\\nSe extraiu campos MAS também detectou mensagens sobre outras viagens, inclua no JSON:\\n'
    + '"_meta": { "other_trips_mentioned": ["nome da viagem"], "messages_about_this_trip": N, "messages_about_other_trips": N }';
}

// Monta definições de campos para o prompt
let fieldDefs = '';
let currentSection = '';
let num = 1;
for (const f of fields) {
  if (f.section !== currentSection) {
    currentSection = f.section;
    const sectionLabel = f.section === 'observacoes' ? sectionInfo.obsLabel : (sections[f.section] || f.section);
    fieldDefs += '\\n## SEÇÃO: ' + sectionLabel + '\\n\\n';
  }
  fieldDefs += '### ' + num + '. ' + f.key + ' (' + f.type + ')\\n';
  fieldDefs += '**Pergunta:** ' + f.question + '\\n';
  if (f.format) fieldDefs += '**Formato:** ' + f.format + '\\n';
  if (f.examples) fieldDefs += '**Exemplos válidos:** ' + f.examples + '\\n';
  if (f.extract_when) fieldDefs += '**Extrair quando:** ' + f.extract_when + '\\n';
  if (f.allowed_values && f.allowed_values.length > 0) {
    fieldDefs += '**Valores permitidos:** ' + JSON.stringify(f.allowed_values) + '\\n';
  }
  fieldDefs += '\\n';
  num++;
}

// Build the complete AI prompt (interpolated)
let aiPrompt = '# TAREFA: Atualizar CRM com informações da conversa WhatsApp\\n\\n'
  + '## DADOS ATUAIS DO CARD\\n'
  + 'Título: ' + cardData.titulo + '\\n'
  + 'Fase: ' + fase + '\\n'
  + 'Campos já preenchidos:\\n'
  + JSON.stringify(camposAtuais, null, 2) + '\\n\\n'
  + (otherTripsContext ? otherTripsContext + '\\n\\n' : '')
  + '## HISTÓRICO DA CONVERSA (' + allMsgs.length + ' mensagens)\\n'
  + historico + '\\n\\n'
  + '---\\n\\n'
  + '# QUEM VOCÊ É\\n\\n'
  + 'Você é a Julia, assistente de IA da Welcome Trips — agência premium de viagens.\\n'
  + 'Leia a conversa como uma consultora de viagens leria.\\n\\n'
  + '## COMO PENSAR\\n\\n'
  + '- Para onde o cliente quer ir, quando, com quem, qual o orçamento\\n'
  + '- O que o cliente pediu, o que a consultora confirmou, decisões tomadas\\n'
  + '- Detalhes operacionais: seguros, vouchers, passaportes, reservas, transfers\\n'
  + '- Preferências, medos, restrições, pedidos especiais\\n\\n'
  + 'Se tem campo específico → coloque lá.\\n'
  + 'Se NÃO tem → coloque em **briefing** (sobre a viagem) ou **observacoes** (lembrete interno).\\n\\n'
  + '## FONTES DE INFORMAÇÃO\\n\\n'
  + '1. **CLIENTE** — dado primário\\n'
  + '2. **CONSULTORA** — confirmações são válidas\\n'
  + '3. **[Transcrição]** — áudios transcritos. Contêm o contexto mais rico\\n'
  + '4. **[Imagem]/[Documento]** — descrições de mídia\\n'
  + '5. **TÍTULO DO CARD** — "' + cardData.titulo + '"\\n\\n'
  + '## REGRAS CRÍTICAS DE ATUALIZAÇÃO\\n\\n'
  + '### NÃO substitua — ADICIONE\\n'
  + '- Se um campo já tem conteúdo, NÃO sobrescreva com informação equivalente\\n'
  + '- Só substitua se a informação é CLARAMENTE diferente/atualizada\\n'
  + '- Para texto livre (briefing, observacoes): NUNCA apague o existente\\n\\n'
  + '### briefing vs observacoes\\n'
  + '- **briefing**: sobre a VIAGEM — destinos, roteiro, preferências, estilo\\n'
  + '- **observacoes**: lembretes INTERNOS — "medo de avião", "passaporte vence set/2026"\\n\\n'
  + '---\\n\\n'
  + '# CAMPOS DISPONÍVEIS (visíveis nesta etapa)\\n\\n'
  + fieldDefs + '\\n\\n'
  + '---\\n\\n'
  + (lockedKeys.length > 0
    ? '# CAMPOS BLOQUEADOS (NÃO EXTRAIR)\\n\\n'
      + 'Os seguintes campos estão BLOQUEADOS pelo usuário. NÃO inclua na saída:\\n'
      + lockedKeys.map(k => '- ' + k).join('\\n') + '\\n\\n'
    : '')
  + '# FORMATO DE SAÍDA\\n\\n'
  + 'Retorne APENAS um JSON válido com os campos que devem ser ATUALIZADOS.\\n'
  + '- NÃO inclua campos que já estão corretos\\n'
  + '- NÃO inclua campos vazios ou null\\n'
  + '- Para briefing/observacoes: se já existe conteúdo, inclua texto EXISTENTE + novidade\\n'
  + '- Se não há nada novo, retorne: {}\\n'
  + (tripFilterInstructions ? '\\n' + tripFilterInstructions : '');

return [{
  json: {
    card_id, user_id, source: 'whatsapp',
    titulo: cardData.titulo,
    fase, stage_name: stageName,
    section_info: sectionInfo,
    campos_atuais: camposAtuais,
    historico_conversa: historico,
    total_mensagens: allMsgs.length,
    field_definitions: fieldDefs,
    field_config: { ...config, fields },
    hidden_fields: hiddenKeys,
    skip_ai: false,
    mode: 'atualizar',
    ai_prompt: aiPrompt
  }
}];`;

// --- Monta Contexto Audio/Meeting (shared for briefing_audio and meeting_transcript) ---
const CODE_MONTA_CONTEXTO_AUDIO_MEETING = `// Monta contexto para AI — briefing_audio ou meeting_transcript
const source = $('1. Extrai Params').first().json.source;

// Guard: skip se source é whatsapp (tratado pelo branch 6w.)
if (source === 'whatsapp') return [];
const card_id = $('1. Extrai Params').first().json.card_id;
const user_id = $('1. Extrai Params').first().json.user_id;
const meeting_id = $('1. Extrai Params').first().json.meeting_id || null;
const mode = $('1. Extrai Params').first().json.mode || 'atualizar';

// Transcrição — de Whisper (audio) ou direta (meeting)
let transcription = '';
if (source === 'briefing_audio') {
  const transData = $('3a3. Extrai Transcrição').first().json;
  if (transData.status === 'transcription_empty') {
    return [{ json: { ...transData, skip_ai: true, source } }];
  }
  transcription = transData.transcription;
} else {
  transcription = $('1. Extrai Params').first().json.transcription || '';
  if (!transcription || transcription.trim().length < 50) {
    return [{ json: {
      card_id, meeting_id, source,
      status: 'no_update',
      message: 'Transcrição muito curta',
      skip_ai: true
    }}];
  }
}

const cardData = $('4. Busca Card').first().json;
const config = $('5. Busca Config').first().json;

const allFields = config.fields || [];
const visibleKeys = new Set(allFields.filter(f => f.is_visible !== false).map(f => f.key));
const hiddenKeys = allFields.filter(f => f.is_visible === false).map(f => f.key);
const sections = config.sections || {};

// Para briefing_audio: IA recebe TODOS os campos (hidden → redirect em obs depois)
// Para meeting_transcript: IA recebe apenas visíveis
const fields = source === 'briefing_audio' ? allFields : allFields.filter(f => f.is_visible !== false);

const produtoData = cardData.produto_data || {};
const briefingData = cardData.briefing_inicial || {};
const lockedFields = cardData.locked_fields || {};
const lockedKeys = Object.keys(lockedFields).filter(k => lockedFields[k] === true);
const fase = cardData.pipeline_stages?.fase || 'SDR';
const stageName = cardData.pipeline_stages?.nome || '';

const SECTION_MAP = {
  SDR: { dataSource: 'briefing_inicial', obsKey: 'observacoes', obsLabel: 'Observações do SDR' },
  Planner: { dataSource: 'produto_data', obsKey: 'observacoes_criticas', obsLabel: 'Observações Críticas (Planner)' },
  'Pós-venda': { dataSource: 'produto_data', obsKey: 'observacoes_pos_venda', obsLabel: 'Observações Pós-Venda' }
};
const sectionInfo = SECTION_MAP[fase] || SECTION_MAP['SDR'];

let tripSource = {};
let obsSource = {};
if (fase === 'SDR') {
  tripSource = briefingData;
  obsSource = briefingData.observacoes || {};
} else if (fase === 'Planner') {
  tripSource = produtoData;
  obsSource = produtoData.observacoes_criticas || {};
} else {
  tripSource = produtoData;
  obsSource = produtoData.observacoes_pos_venda || {};
}

const camposAtuais = {};
if (mode !== 'novo') {
  for (const field of fields) {
    const src = field.section === 'trip_info' ? tripSource : obsSource;
    camposAtuais[field.key] = src[field.key] || null;
  }
}

const briefingAnterior = mode !== 'novo' ? (tripSource.resumo_consultor || '') : '';

// Monta definições de campos para o prompt
let fieldDefs = '';
let currentSection = '';
let num = 1;
for (const f of fields) {
  if (f.section !== currentSection) {
    currentSection = f.section;
    const sectionLabel = f.section === 'observacoes' ? sectionInfo.obsLabel : (sections[f.section] || f.section);
    fieldDefs += '\\n## SEÇÃO: ' + sectionLabel + '\\n\\n';
  }
  const visTag = source === 'briefing_audio' ? (f.is_visible !== false ? '[VISÍVEL]' : '[OCULTO]') : '';
  fieldDefs += '### ' + num + '. ' + f.key + ' (' + f.type + ') ' + visTag + '\\n';
  fieldDefs += '**Pergunta:** ' + f.question + '\\n';
  if (f.format) fieldDefs += '**Formato:** ' + f.format + '\\n';
  if (f.examples) fieldDefs += '**Exemplos válidos:** ' + f.examples + '\\n';
  if (f.extract_when) fieldDefs += '**Extrair quando:** ' + f.extract_when + '\\n';
  if (f.allowed_values && f.allowed_values.length > 0) {
    fieldDefs += '**Valores permitidos:** ' + JSON.stringify(f.allowed_values) + '\\n';
  }
  fieldDefs += '\\n';
  num++;
}

// Build the complete AI prompt (interpolated)
let aiPrompt = '';

if (source === 'briefing_audio') {
  aiPrompt = '# CONTEXTO\\n\\n'
    + 'Um CONSULTOR da Welcome Trips gravou um áudio. Pode ser um RELATO (consultor narrando sozinho) ou uma CONVERSA AO VIVO com o cliente.\\n\\n'
    + '## TRANSCRIÇÃO\\n"""\\n' + transcription + '\\n"""\\n\\n'
    + '## DADOS ATUAIS DO CARD\\n'
    + 'Título: ' + cardData.titulo + '\\n'
    + 'Fase do Pipeline: ' + fase + ' (Etapa: ' + stageName + ')\\n'
    + 'Seção de dados: ' + sectionInfo.obsLabel + '\\n\\n'
    + '⚠️ REGRA DE FASE: Este card está na fase **' + fase + '**. Extraia TODOS os campos mencionados.\\n\\n'
    + (mode === 'novo'
      ? '⚠️ MODO: NOVO BRIEFING — Extraia TUDO que foi confirmado/decidido.\\n\\n'
      : '⚠️ MODO: ATUALIZAR BRIEFING — COMPLEMENTANDO ou CORRIGINDO um briefing existente.\\n\\n')
    + (mode !== 'novo' && briefingAnterior ? '## BRIEFING ANTERIOR\\n' + briefingAnterior + '\\n\\n' : '')
    + (mode !== 'novo' ? 'Campos já preenchidos:\\n' + JSON.stringify(camposAtuais, null, 2) + '\\n\\n' : '')
    + '---\\n\\n'
    + '# TAREFA 1: BRIEFING (campo "briefing_text")\\n\\n'
    + (mode === 'novo'
      ? 'Gere um resumo factual das decisões/informações confirmadas.\\n\\n'
      : 'Gere um resumo factual ATUALIZADO que incorpore briefing anterior + novas informações.\\n\\n')
    + '**Regras:** Terceira pessoa, tom profissional. APENAS info CONFIRMADA. Máximo 600 palavras. PROIBIDO: "Próximos Passos", sugestões. NÃO invente.\\n\\n'
    + '# TAREFA 2: CAMPOS ESTRUTURADOS\\n\\n'
    + 'Extraia dados CONFIRMADOS para os campos abaixo.\\n\\n'
    + '## CAMPOS DISPONÍVEIS\\n' + fieldDefs + '\\n\\n'
    + (lockedKeys.length > 0
      ? '# CAMPOS BLOQUEADOS (NÃO EXTRAIR)\\n\\n'
        + 'Os seguintes campos estão BLOQUEADOS pelo usuário. NÃO inclua na saída:\\n'
        + lockedKeys.map(k => '- ' + k).join('\\n') + '\\n\\n'
      : '')
    + '# REGRAS\\n'
    + '1. APENAS informações CONFIRMADAS\\n'
    + '2. NÃO INVENTE\\n'
    + '3. Se ambíguo, NÃO inclua\\n'
    + (mode === 'novo' ? '4. Extraia TODOS os campos confirmados\\n' : '4. Se campo já tem o MESMO dado, NÃO repita. Se DIFERENTE, ATUALIZE.\\n')
    + '5. Faixas de valor: {"min": X, "max": Y}. Por pessoa: {"por_pessoa": X}. Total: número\\n'
    + '6. Faixas de duração: {"min": X, "max": Y}. Fixo: número\\n\\n'
    + '# FORMATO DE SAÍDA (JSON)\\n'
    + '{ "briefing_text": "...", "campos": { "key": "value" } }\\n'
    + 'RETORNE APENAS o JSON.';
} else {
  // meeting_transcript
  aiPrompt = '# CONTEXTO\\n\\n'
    + 'Transcrição de REUNIÃO DE VENDAS entre consultor da Welcome Trips e cliente.\\n\\n'
    + '## TRANSCRIÇÃO DA REUNIÃO\\n"""\\n' + transcription + '\\n"""\\n\\n'
    + '## DADOS ATUAIS DO CARD\\n'
    + 'Título: ' + cardData.titulo + '\\n'
    + 'Fase: ' + fase + ' (Etapa: ' + stageName + ')\\n'
    + 'Seção: ' + sectionInfo.obsLabel + '\\n\\n'
    + '⚠️ Apenas os campos listados abaixo estão HABILITADOS.\\n\\n'
    + 'Campos já preenchidos:\\n' + JSON.stringify(camposAtuais, null, 2) + '\\n\\n'
    + '---\\n\\n'
    + '# TAREFA 1: BRIEFING (campo "briefing_text")\\n\\n'
    + 'Resumo executivo e profissional da reunião. Terceira pessoa. Máximo 200 palavras. NÃO invente.\\n\\n'
    + '# TAREFA 2: CAMPOS ESTRUTURADOS\\n\\n'
    + 'Extraia dados do CLIENTE.\\n\\n'
    + '## CAMPOS DISPONÍVEIS\\n' + fieldDefs + '\\n\\n'
    + (lockedKeys.length > 0
      ? '# CAMPOS BLOQUEADOS (NÃO EXTRAIR)\\n\\n'
        + 'Os seguintes campos estão BLOQUEADOS pelo usuário. NÃO inclua na saída:\\n'
        + lockedKeys.map(k => '- ' + k).join('\\n') + '\\n\\n'
      : '')
    + '# REGRAS\\n'
    + '1. APENAS informações do CLIENTE\\n'
    + '2. NÃO INVENTE\\n'
    + '3. Se já tem o MESMO dado, NÃO repita. Se DIFERENTE, ATUALIZE\\n'
    + '4. Se cliente NÃO DECIDIU, NÃO extraia\\n'
    + '5. Sugestões do CONSULTOR NÃO contam\\n'
    + '6. Faixas de valor: {"min": X, "max": Y}. Duração: {"min": X, "max": Y}\\n\\n'
    + '# FORMATO DE SAÍDA (JSON)\\n'
    + '{ "briefing_text": "...", "campos": { "key": "value" } }\\n'
    + 'RETORNE APENAS o JSON.';
}

return [{ json: {
  card_id, user_id, meeting_id, source, mode,
  titulo: cardData.titulo,
  fase, stage_name: stageName,
  section_info: sectionInfo,
  transcription,
  campos_atuais: camposAtuais,
  briefing_anterior: briefingAnterior,
  field_definitions: fieldDefs,
  field_config: { ...config, fields },
  hidden_fields: hiddenKeys,
  skip_ai: false,
  ai_prompt: aiPrompt
}}];`;

// --- Valida Output (superset — handles all sources, _meta, briefing_text) ---
const CODE_VALIDA_OUTPUT = `// Valida e estrutura output do AI (superset de todos os sources)
const aiNode = $('7. AI Extrator').first().json;
const aiOutput = aiNode.output || aiNode.text || aiNode.message || aiNode.content || '{}';
console.log('[Unified] AI output type:', typeof aiOutput, '| keys:', Object.keys(aiNode).join(','));
console.log('[Unified] AI output preview:', String(aiOutput).substring(0, 500));

const contextData = $('6. Monta Contexto').first().json;
const config = contextData.field_config;
const card_id = contextData.card_id;
const user_id = contextData.user_id;
const meeting_id = contextData.meeting_id || null;
const source = contextData.source;
const transcription = contextData.transcription || contextData.historico_conversa || '';
const hiddenFields = new Set(contextData.hidden_fields || []);
const fields = config.fields || [];

// Parse AI JSON — múltiplas estratégias
let parsed = {};
try {
  let clean = aiOutput;
  if (typeof clean === 'string') {
    clean = clean.replace(/\\\`\\\`\\\`json\\n?/g, '').replace(/\\\`\\\`\\\`\\n?/g, '').trim();
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.substring(firstBrace, lastBrace + 1);
    }
    parsed = JSON.parse(clean);
  } else if (typeof clean === 'object' && clean !== null) {
    parsed = clean;
  }
} catch (e) {
  console.log('[Unified] Erro ao parsear JSON:', e.message);
  console.log('[Unified] Raw output:', String(aiOutput).substring(0, 1000));
  parsed = {};
}

// Extrair _meta (trip detection para whatsapp)
const _meta = parsed._meta || null;
if (_meta && _meta.status === 'wrong_trip') {
  return [{ json: {
    card_id, user_id, source,
    tem_atualizacao: false,
    campos_extraidos: {},
    _meta,
    status: 'wrong_trip',
    total_campos: 0,
    field_config: config,
    hidden_fields: [...hiddenFields],
    ai_raw_output: aiOutput
  }}];
}

// Extrair briefing_text (para audio e meeting)
const briefingText = parsed.briefing_text || '';

// Extrair campos — múltiplos formatos
let camposRaw = parsed.campos || parsed.extracted_fields || {};
if (Object.keys(camposRaw).length === 0) {
  const knownFieldKeys = new Set(fields.map(f => f.key));
  const rootCampos = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!['briefing_text', 'campos', 'extracted_fields', '_meta'].includes(key) && knownFieldKeys.has(key)) {
      rootCampos[key] = value;
    }
  }
  if (Object.keys(rootCampos).length > 0) {
    console.log('[Unified] Campos no root do JSON (fallback):', Object.keys(rootCampos).join(', '));
    camposRaw = rootCampos;
  }
}

// Validação DINÂMICA baseada na config
const fieldMap = {};
for (const f of fields) {
  fieldMap[f.key] = f;
}

const camposValidados = {};
for (const [key, value] of Object.entries(camposRaw)) {
  if (value === undefined || value === null || value === '') continue;

  // Para meeting_transcript: rejeitar campos ocultos
  if (source === 'meeting_transcript' && hiddenFields.has(key)) {
    console.log('[Unified] Campo oculto rejeitado (' + source + '): ' + key);
    continue;
  }

  const fieldDef = fieldMap[key];
  if (!fieldDef) continue;

  switch (fieldDef.type) {
    case 'array':
      if (typeof value === 'string') {
        const items = value.split(/[,e]/).map(d => d.trim()).filter(d => d.length > 0);
        if (items.length > 0) camposValidados[key] = items;
      } else if (Array.isArray(value) && value.length > 0) {
        camposValidados[key] = value;
      }
      break;

    case 'multiselect':
      if (Array.isArray(value) && fieldDef.allowed_values) {
        const valid = value.filter(v => fieldDef.allowed_values.includes(v));
        if (valid.length > 0) camposValidados[key] = valid;
      }
      break;

    case 'select':
      if (fieldDef.allowed_values && fieldDef.allowed_values.includes(value)) {
        camposValidados[key] = value;
      }
      break;

    case 'number':
    case 'currency':
      const num = Number(value);
      if (!isNaN(num) && num > 0) camposValidados[key] = num;
      break;

    case 'smart_budget':
      if (typeof value === 'number' && value > 0) {
        camposValidados[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        if (value.tipo) {
          camposValidados[key] = value;
        } else if (value.min > 0 && value.max > 0 && value.max >= value.min) {
          camposValidados[key] = value;
        } else if (value.por_pessoa > 0) {
          camposValidados[key] = value;
        } else if (value.total > 0) {
          camposValidados[key] = value.total;
        }
      }
      break;

    case 'flexible_duration':
      if (typeof value === 'number' && value > 0) {
        camposValidados[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        if (value.tipo) {
          camposValidados[key] = value;
        } else if (value.min > 0 && value.max > 0 && value.max >= value.min) {
          camposValidados[key] = value;
        }
      }
      break;

    case 'boolean':
      if (typeof value === 'boolean') camposValidados[key] = value;
      break;

    case 'text':
    default:
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        camposValidados[key] = value;
      } else {
        const str = String(value).trim();
        if (str.length > 0 && str.length < 5000) camposValidados[key] = str;
      }
      break;
  }
}

const temCampos = Object.keys(camposValidados).length > 0;
const temBriefing = briefingText.length > 20;
const temAtualizacao = temCampos || temBriefing;

console.log('[Unified] Source: ' + source + ' | Briefing: ' + briefingText.length + ' chars | Campos: ' + Object.keys(camposValidados).length);

return [{ json: {
  card_id, user_id, meeting_id, source,
  transcription: transcription.substring(0, 200),
  briefing_text: briefingText,
  campos_extraidos: camposValidados,
  campos_extraidos_keys: Object.keys(camposValidados),
  tem_atualizacao: temAtualizacao,
  _meta,
  field_config: config,
  hidden_fields: [...hiddenFields],
  ai_raw_output: aiOutput
}}];`;

// --- Merge Dados (UNIFIED — smart merge + locked + hidden→obs + valor_estimado) ---
const CODE_MERGE_DADOS = `// Merge dados extraídos — UNIFIED best-of-3
const validationData = $('8. Valida Output').first().json;
const camposExtraidos = validationData.campos_extraidos;
const briefingText = validationData.briefing_text || '';
const config = validationData.field_config;
const card_id = validationData.card_id;
const user_id = validationData.user_id;
const meeting_id = validationData.meeting_id || null;
const source = validationData.source;
const _meta = validationData._meta || null;
const hiddenFields = new Set(validationData.hidden_fields || []);
const fields = config.fields || [];

const currentCard = $('10. Busca produto_data Atual').first().json;
const currentProdutoData = currentCard.produto_data || {};
const currentBriefing = currentCard.briefing_inicial || {};
const lockedFields = currentCard.locked_fields || {};
const fase = $('6. Monta Contexto').first().json.fase;
const mode = $('6. Monta Contexto').first().json.mode || 'atualizar';

console.log('[Unified] Merge — source: ' + source + ' | mode: ' + mode + ' | fase: ' + fase);

// Construir mapa de seções e labels DINAMICAMENTE
const fieldSectionMap = {};
const fieldLabelMap = {};
for (const f of fields) {
  fieldSectionMap[f.key] = f.section;
  fieldLabelMap[f.key] = f.label || f.key;
}

// Separar campos por seção, respeitando locked + hidden
const tripInfoUpdate = {};
const observacoesUpdate = {};
const camposAtualizados = {};
const camposOcultosTexto = []; // hidden fields → text redirect to obs

for (const [key, value] of Object.entries(camposExtraidos)) {
  // Respeitar campos bloqueados
  if (lockedFields[key] === true) {
    console.log('[Unified] Campo bloqueado, ignorando: ' + key);
    continue;
  }

  // Campos OCULTOS no stage → redirecionar para observações como texto (briefing_audio + whatsapp)
  if (hiddenFields.has(key) && source !== 'meeting_transcript') {
    const label = fieldLabelMap[key] || key;
    let displayValue = value;
    if (Array.isArray(value)) {
      displayValue = value.join(', ');
    } else if (typeof value === 'object' && value !== null) {
      displayValue = value.display || value.valor || value.tipo || JSON.stringify(value);
    }
    camposOcultosTexto.push(label + ': ' + displayValue);
    console.log('[Unified] Campo oculto → observação: ' + key + ' = ' + displayValue);
    camposAtualizados[key] = '→ obs';
    continue;
  }

  const section = fieldSectionMap[key];
  if (section === 'trip_info') {
    tripInfoUpdate[key] = value;
  } else if (section === 'observacoes') {
    observacoesUpdate[key] = value;
  }
  camposAtualizados[key] = value;
}

// Nota de campos ocultos → observações
let notasCamposOcultos = '';
if (camposOcultosTexto.length > 0) {
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const sourceLabel = source === 'whatsapp' ? 'conversa WhatsApp' : source === 'briefing_audio' ? 'áudio' : 'reunião';
  notasCamposOcultos = '\\n\\n📋 Mencionado na ' + sourceLabel + ' (' + dataHoje + '): ' + camposOcultosTexto.join(' · ');
}

// ============================================================
// CONVERSÃO DE FORMATOS: simples → estruturado (SUPERSET)
// ============================================================

const MESES = {
  janeiro:1, fevereiro:2, 'março':3, marco:3, abril:4, maio:5, junho:6,
  julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12
};
const MESES_NOMES = ['', 'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function formatCurrency(num) {
  return 'R$ ' + num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function convertOrcamento(value, contextData) {
  if (typeof value === 'object' && value !== null && value.tipo) return value;
  if (typeof value === 'object' && value !== null) {
    if (value.min && value.max) {
      const avg = Math.round((value.min + value.max) / 2);
      return { tipo: 'range', valor_min: value.min, valor_max: value.max, total_calculado: avg, display: formatCurrency(value.min) + ' — ' + formatCurrency(value.max) };
    }
    if (value.total) return { tipo: 'total', valor: value.total, total_calculado: value.total, display: formatCurrency(value.total) };
    if (value.por_pessoa) {
      const qtd = contextData.quantidade_viajantes || 2;
      const total = value.por_pessoa * qtd;
      return { tipo: 'por_pessoa', valor: value.por_pessoa, total_calculado: total, display: formatCurrency(value.por_pessoa) + '/pessoa' };
    }
    return value;
  }
  if (typeof value === 'number' && value > 0) {
    return { tipo: 'total', valor: value, total_calculado: value, display: formatCurrency(value) };
  }
  return value;
}

function convertEpoca(value) {
  if (typeof value === 'object' && value !== null && value.tipo) return value;
  const thisYear = new Date().getFullYear();
  if (typeof value === 'object' && value !== null) {
    if (value.data_inicio) {
      const d = new Date(value.data_inicio);
      return {
        tipo: 'data_exata',
        data_inicio: value.data_inicio,
        data_fim: value.data_fim || value.data_inicio,
        mes_inicio: d.getMonth() + 1,
        mes_fim: value.data_fim ? new Date(value.data_fim).getMonth() + 1 : d.getMonth() + 1,
        ano: d.getFullYear(),
        display: value.data_inicio + (value.data_fim && value.data_fim !== value.data_inicio ? ' a ' + value.data_fim : ''),
        flexivel: value.flexivel || false
      };
    }
    if (value.inicio) {
      const d = new Date(value.inicio);
      return {
        tipo: 'data_exata',
        data_inicio: value.inicio,
        data_fim: value.fim || value.inicio,
        mes_inicio: d.getMonth() + 1,
        mes_fim: value.fim ? new Date(value.fim).getMonth() + 1 : d.getMonth() + 1,
        ano: d.getFullYear(),
        display: value.inicio + (value.fim ? ' a ' + value.fim : ''),
        flexivel: value.flexivel || false
      };
    }
    if (value.mes_inicio && value.mes_fim) {
      const ano = value.ano || thisYear;
      return {
        tipo: value.mes_inicio === value.mes_fim ? 'mes' : 'range_meses',
        mes_inicio: value.mes_inicio, mes_fim: value.mes_fim,
        ano: ano,
        display: value.mes_inicio === value.mes_fim
          ? MESES_NOMES[value.mes_inicio] + ' ' + ano
          : MESES_NOMES[value.mes_inicio] + ' a ' + MESES_NOMES[value.mes_fim] + ' ' + ano,
        flexivel: value.flexivel || false
      };
    }
    if (value.ano && value.mes) {
      return {
        tipo: 'mes',
        mes_inicio: value.mes, mes_fim: value.mes_fim || value.mes,
        ano: value.ano,
        display: MESES_NOMES[value.mes] + ' ' + value.ano,
        flexivel: value.flexivel || false
      };
    }
  }
  if (typeof value === 'string' && value.toLowerCase().trim() === 'indefinido') {
    return { tipo: 'indefinido', display: 'Não definido' };
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    for (const [nome, num] of Object.entries(MESES)) {
      if (lower.includes(nome)) {
        const anoMatch = value.match(/(20\\d{2})/);
        const ano = anoMatch ? parseInt(anoMatch[1]) : thisYear;
        const rangePattern = new RegExp(nome + '\\\\s*(?:a|até|-)\\\\s*(\\\\w+)', 'i');
        const rangeMatch = lower.match(rangePattern);
        if (rangeMatch) {
          const m2 = MESES[rangeMatch[1].trim()];
          if (m2) {
            return {
              tipo: 'range_meses',
              mes_inicio: num, mes_fim: m2,
              ano: ano,
              display: MESES_NOMES[num] + ' a ' + MESES_NOMES[m2] + ' ' + ano
            };
          }
        }
        return {
          tipo: 'mes', mes: num, ano: ano,
          display: MESES_NOMES[num] + ' ' + ano
        };
      }
    }
    return { tipo: 'indefinido', display: value.substring(0, 100) };
  }
  return { tipo: 'indefinido', display: 'Não definido' };
}

function convertDuracao(value) {
  if (typeof value === 'object' && value !== null && value.tipo) return value;
  if (typeof value === 'object' && value !== null && value.min && value.max) {
    return { tipo: 'range', dias_min: value.min, dias_max: value.max, display: value.min + ' a ' + value.max + ' dias' };
  }
  if (typeof value === 'number' && value > 0) {
    return { tipo: 'fixo', dias_min: value, dias_max: value, display: value + ' dias' };
  }
  if (typeof value === 'string') {
    const rangeMatch = value.match(/(\\d+)\\s*(?:a|-|até)\\s*(\\d+)/i);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1]);
      const max = parseInt(rangeMatch[2]);
      return { tipo: 'range', dias_min: min, dias_max: max, display: min + ' a ' + max + ' dias' };
    }
    const singleMatch = value.match(/(\\d+)/);
    if (singleMatch) {
      const dias = parseInt(singleMatch[1]);
      return { tipo: 'fixo', dias_min: dias, dias_max: dias, display: dias + ' dias' };
    }
  }
  return value;
}

function convertDataExata(value) {
  if (typeof value === 'object' && value !== null && value.display) return value;
  if (typeof value === 'object' && value !== null && (value.data_inicio || value.data_fim)) {
    const inicio = value.data_inicio || value.data_fim;
    const fim = value.data_fim || value.data_inicio;
    const formatDate = (d) => { const p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
    return {
      data_inicio: inicio, data_fim: fim,
      display: inicio === fim ? formatDate(inicio) : formatDate(inicio) + ' a ' + formatDate(fim)
    };
  }
  if (typeof value === 'string' && value.trim()) {
    const isoMatch = value.match(/(\\d{4})-(\\d{2})-(\\d{2})/);
    if (isoMatch) {
      return {
        data_inicio: value, data_fim: value,
        display: isoMatch[3] + '/' + isoMatch[2] + '/' + isoMatch[1]
      };
    }
    return { display: value };
  }
  return value;
}

// Apply conversions
if (tripInfoUpdate.orcamento) {
  tripInfoUpdate.orcamento = convertOrcamento(tripInfoUpdate.orcamento, { ...currentProdutoData, ...currentBriefing, ...tripInfoUpdate });
}
if (tripInfoUpdate.epoca_viagem) {
  tripInfoUpdate.epoca_viagem = convertEpoca(tripInfoUpdate.epoca_viagem);
}
if (tripInfoUpdate.duracao_viagem) {
  tripInfoUpdate.duracao_viagem = convertDuracao(tripInfoUpdate.duracao_viagem);
}
if (tripInfoUpdate.data_exata_da_viagem) {
  tripInfoUpdate.data_exata_da_viagem = convertDataExata(tripInfoUpdate.data_exata_da_viagem);
}

// ============================================================
// SMART MERGE — UNIFIED (best of Atualizador + Briefing IA)
// ============================================================

const TEXT_LIBRE_KEYS = ['briefing', 'observacoes', 'observacoes_criticas', 'observacoes_pos_venda'];
const fieldTypeMap = {};
for (const f of fields) {
  fieldTypeMap[f.key] = f.type;
}

function smartMergeField(key, newValue, currentValue, fieldType) {
  if (currentValue === null || currentValue === undefined || currentValue === '') {
    return newValue;
  }
  // Campos de texto livre: APPEND
  if (TEXT_LIBRE_KEYS.includes(key) || fieldType === 'textarea') {
    const currentStr = typeof currentValue === 'string' ? currentValue.trim() : '';
    const newStr = typeof newValue === 'string' ? newValue.trim() : '';
    if (!newStr) return currentValue;
    if (!currentStr) return newStr;
    if (currentStr.includes(newStr)) return currentValue;
    return currentStr + '\\n\\n' + newStr;
  }
  // Arrays: merge sem duplicatas
  if (Array.isArray(newValue) && Array.isArray(currentValue)) {
    const merged = [...currentValue];
    for (const item of newValue) {
      const normalized = typeof item === 'string' ? item.toLowerCase().trim() : item;
      const exists = merged.some(m =>
        (typeof m === 'string' ? m.toLowerCase().trim() : m) === normalized
      );
      if (!exists) merged.push(item);
    }
    return merged.length > currentValue.length ? merged : currentValue;
  }
  // Outros: aceita o novo
  return newValue;
}

// briefingComNotas = briefing da IA + notas de campos ocultos
const briefingComNotas = (briefingText || '') + notasCamposOcultos;
const temBriefingFinal = briefingComNotas.trim().length > 0;

let newProdutoData, newBriefing;

if (mode === 'novo' && source === 'briefing_audio') {
  // MODO NOVO: limpa seção e usa apenas dados da IA + restaura locked
  if (fase === 'SDR') {
    newBriefing = { ...tripInfoUpdate };
    newBriefing.observacoes = { ...observacoesUpdate };
    if (temBriefingFinal) {
      newBriefing.observacoes.briefing = briefingComNotas;
      newBriefing.resumo_consultor = briefingComNotas;
      newBriefing.resumo_consultor_at = new Date().toISOString();
    }
    for (const [key, val] of Object.entries(currentBriefing)) {
      if (lockedFields[key] === true && key !== 'observacoes') newBriefing[key] = val;
    }
    const lockedObs = currentBriefing.observacoes || {};
    for (const [key, val] of Object.entries(lockedObs)) {
      if (lockedFields[key] === true) newBriefing.observacoes[key] = val;
    }
    newProdutoData = currentProdutoData;
  } else if (fase === 'Planner') {
    newProdutoData = { ...currentProdutoData };
    for (const f of fields) {
      if (f.section === 'trip_info' && !lockedFields[f.key]) delete newProdutoData[f.key];
    }
    Object.assign(newProdutoData, tripInfoUpdate);
    newProdutoData.observacoes_criticas = { ...observacoesUpdate };
    const lockedObs = currentProdutoData.observacoes_criticas || {};
    for (const [key, val] of Object.entries(lockedObs)) {
      if (lockedFields[key] === true) newProdutoData.observacoes_criticas[key] = val;
    }
    if (temBriefingFinal) {
      newProdutoData.observacoes_criticas.briefing = briefingComNotas;
      newProdutoData.resumo_consultor = briefingComNotas;
      newProdutoData.resumo_consultor_at = new Date().toISOString();
    }
    newBriefing = currentBriefing;
  } else {
    newProdutoData = { ...currentProdutoData };
    for (const f of fields) {
      if (f.section === 'trip_info' && !lockedFields[f.key]) delete newProdutoData[f.key];
    }
    Object.assign(newProdutoData, tripInfoUpdate);
    newProdutoData.observacoes_pos_venda = { ...observacoesUpdate };
    const lockedObs = currentProdutoData.observacoes_pos_venda || {};
    for (const [key, val] of Object.entries(lockedObs)) {
      if (lockedFields[key] === true) newProdutoData.observacoes_pos_venda[key] = val;
    }
    if (temBriefingFinal) {
      newProdutoData.observacoes_pos_venda.briefing = briefingComNotas;
      newProdutoData.resumo_consultor = briefingComNotas;
      newProdutoData.resumo_consultor_at = new Date().toISOString();
    }
    newBriefing = currentBriefing;
  }
} else {
  // MODO ATUALIZAR (default para todos os sources): SMART MERGE
  newProdutoData = { ...currentProdutoData };
  newBriefing = { ...currentBriefing };

  if (fase === 'SDR') {
    for (const [key, value] of Object.entries(tripInfoUpdate)) {
      newBriefing[key] = smartMergeField(key, value, newBriefing[key], fieldTypeMap[key]);
    }
    const currentObs = currentBriefing.observacoes || {};
    const mergedObs = { ...currentObs };
    for (const [key, value] of Object.entries(observacoesUpdate)) {
      mergedObs[key] = smartMergeField(key, value, currentObs[key], fieldTypeMap[key]);
    }
    if (temBriefingFinal) {
      mergedObs.briefing = smartMergeField('briefing', briefingComNotas, currentObs.briefing, 'textarea');
      newBriefing.resumo_consultor = briefingComNotas;
      newBriefing.resumo_consultor_at = new Date().toISOString();
    }
    newBriefing.observacoes = mergedObs;
  } else if (fase === 'Planner') {
    for (const [key, value] of Object.entries(tripInfoUpdate)) {
      newProdutoData[key] = smartMergeField(key, value, newProdutoData[key], fieldTypeMap[key]);
    }
    const currentObs = currentProdutoData.observacoes_criticas || {};
    const mergedObs = { ...currentObs };
    for (const [key, value] of Object.entries(observacoesUpdate)) {
      mergedObs[key] = smartMergeField(key, value, currentObs[key], fieldTypeMap[key]);
    }
    if (temBriefingFinal) {
      mergedObs.briefing = smartMergeField('briefing', briefingComNotas, currentObs.briefing, 'textarea');
      newProdutoData.resumo_consultor = briefingComNotas;
      newProdutoData.resumo_consultor_at = new Date().toISOString();
    }
    newProdutoData.observacoes_criticas = mergedObs;
  } else {
    for (const [key, value] of Object.entries(tripInfoUpdate)) {
      newProdutoData[key] = smartMergeField(key, value, newProdutoData[key], fieldTypeMap[key]);
    }
    const currentObs = currentProdutoData.observacoes_pos_venda || {};
    const mergedObs = { ...currentObs };
    for (const [key, value] of Object.entries(observacoesUpdate)) {
      mergedObs[key] = smartMergeField(key, value, currentObs[key], fieldTypeMap[key]);
    }
    if (temBriefingFinal) {
      mergedObs.briefing = smartMergeField('briefing', briefingComNotas, currentObs.briefing, 'textarea');
      newProdutoData.resumo_consultor = briefingComNotas;
      newProdutoData.resumo_consultor_at = new Date().toISOString();
    }
    newProdutoData.observacoes_pos_venda = mergedObs;
  }
}

// valor_estimado calculation
if (tripInfoUpdate.orcamento) {
  const orc = newProdutoData.orcamento || newBriefing.orcamento;
  if (orc && typeof orc === 'object') {
    let ve = null;
    if (orc.total_calculado) {
      ve = orc.total_calculado;
    } else if (orc.tipo === 'total' && orc.valor) {
      ve = orc.valor;
    } else if (orc.tipo === 'range' && orc.valor_min && orc.valor_max) {
      ve = Math.round((orc.valor_min + orc.valor_max) / 2);
    }
    if (ve) {
      if (fase === 'SDR') newBriefing.valor_estimado = ve;
      else newProdutoData.valor_estimado = ve;
    }
  }
}

console.log('[Unified] Merge completo. Campos atualizados: ' + Object.keys(camposAtualizados).join(', '));

return [{ json: {
  card_id, user_id, meeting_id, source, _meta,
  produto_data: newProdutoData,
  briefing_inicial: newBriefing,
  campos_atualizados: camposAtualizados,
  briefing_text: briefingText
}}];`;

// --- Sucesso ---
const CODE_SUCESSO = `const mergeData = $('11. Merge Dados').first().json;

return [{ json: {
  status: 'success',
  card_id: mergeData.card_id,
  source: mergeData.source,
  meeting_id: mergeData.meeting_id || null,
  briefing_text: mergeData.briefing_text || '',
  campos_atualizados: mergeData.campos_atualizados,
  campos_extraidos: Object.keys(mergeData.campos_atualizados || {}),
  _meta: mergeData._meta || null,
  timestamp: new Date().toISOString()
}}];`;

// --- Sem Atualização ---
const CODE_SEM_ATUALIZACAO = `// Check skip_ai first (from Monta Contexto)
const contextData = $('6. Monta Contexto').first().json;
if (contextData.skip_ai) {
  return [{ json: {
    status: 'no_update',
    message: contextData.message || 'Conteúdo insuficiente',
    card_id: contextData.card_id,
    source: contextData.source,
    meeting_id: contextData.meeting_id || null,
    campos_extraidos: [],
    timestamp: new Date().toISOString()
  }}];
}

const validationData = $('8. Valida Output').first().json;
const _meta = validationData._meta || null;

return [{ json: {
  status: _meta?.status === 'wrong_trip' ? 'wrong_trip' : 'no_update',
  message: _meta?.message || 'IA não encontrou informações novas',
  card_id: validationData.card_id,
  source: validationData.source,
  meeting_id: validationData.meeting_id || null,
  _meta,
  campos_extraidos: [],
  ai_raw_output: validationData.ai_raw_output,
  timestamp: new Date().toISOString()
}}];`;

// ============================================================================
// WORKFLOW DEFINITION
// ============================================================================

function buildWorkflow() {
  const nodes = [
    // 0. Webhook
    {
      parameters: {
        httpMethod: 'POST',
        path: 'ai-extraction-unified',
        responseMode: 'responseNode',
        options: {}
      },
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'ai-extraction-unified'
    },

    // 1. Extrai Params
    {
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'card_id', name: 'card_id', value: '={{ $json.body.card_id }}', type: 'string' },
            { id: 'source', name: 'source', value: '={{ $json.body.source }}', type: 'string' },
            { id: 'mode', name: 'mode', value: '={{ $json.body.mode || "atualizar" }}', type: 'string' },
            { id: 'audio_base64', name: 'audio_base64', value: '={{ $json.body.audio_base64 || "" }}', type: 'string' },
            { id: 'audio_mime_type', name: 'audio_mime_type', value: '={{ $json.body.audio_mime_type || "audio/webm" }}', type: 'string' },
            { id: 'transcription', name: 'transcription', value: '={{ $json.body.transcription || "" }}', type: 'string' },
            { id: 'user_id', name: 'user_id', value: '={{ $json.body.user_id || "" }}', type: 'string' },
            { id: 'meeting_id', name: 'meeting_id', value: '={{ $json.body.meeting_id || "" }}', type: 'string' },
            { id: 'dry_run', name: 'dry_run', value: '={{ $json.body.dry_run === true || $json.body.dry_run === "true" ? "true" : "false" }}', type: 'string' }
          ]
        },
        options: {}
      },
      name: '1. Extrai Params',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [260, 300]
    },

    // 2. Router (Switch on source)
    {
      parameters: {
        rules: {
          values: [
            {
              conditions: {
                options: { caseSensitive: true, leftValue: '' },
                conditions: [{ leftValue: '={{ $json.source }}', rightValue: 'briefing_audio', operator: { type: 'string', operation: 'equals' } }],
                combinator: 'and'
              },
              renameOutput: true,
              outputKey: 'briefing_audio'
            },
            {
              conditions: {
                options: { caseSensitive: true, leftValue: '' },
                conditions: [{ leftValue: '={{ $json.source }}', rightValue: 'whatsapp', operator: { type: 'string', operation: 'equals' } }],
                combinator: 'and'
              },
              renameOutput: true,
              outputKey: 'whatsapp'
            },
            {
              conditions: {
                options: { caseSensitive: true, leftValue: '' },
                conditions: [{ leftValue: '={{ $json.source }}', rightValue: 'meeting_transcript', operator: { type: 'string', operation: 'equals' } }],
                combinator: 'and'
              },
              renameOutput: true,
              outputKey: 'meeting_transcript'
            }
          ]
        },
        options: {}
      },
      name: '2. Router',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [520, 300]
    },

    // ====== BRANCH: briefing_audio ======

    // 3a1. Prepara Audio
    {
      parameters: { jsCode: CODE_PREPARA_AUDIO, options: {} },
      name: '3a1. Prepara Audio',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [780, 100]
    },

    // 3a2. Whisper API
    {
      parameters: {
        method: 'POST',
        url: 'https://api.openai.com/v1/audio/transcriptions',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'openAiApi',
        sendBody: true,
        contentType: 'multipart-form-data',
        bodyParameters: {
          parameters: [
            { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'audio' },
            { parameterType: 'formData', name: 'model', value: 'whisper-1' },
            { parameterType: 'formData', name: 'language', value: 'pt' }
          ]
        },
        options: {}
      },
      name: '3a2. Whisper API',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1040, 100],
      credentials: { openAiApi: OPENAI_CREDENTIAL }
    },

    // 3a3. Extrai Transcrição
    {
      parameters: { jsCode: CODE_EXTRAI_TRANSCRICAO, options: {} },
      name: '3a3. Extrai Transcrição',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1300, 100]
    },

    // ====== BRANCH: whatsapp ======

    // 3w0. Processa Mídias (Edge Function — transcribe audio, analyze images, extract docs)
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/functions/v1/process-whatsapp-media`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        sendBody: true,
        bodyParameters: { parameters: [{ name: 'card_id', value: '={{ $json.card_id }}' }] },
        options: {
          response: { response: { neverError: true } },
          timeout: 120000,
        },
      },
      name: '3w0. Processa Mídias',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [780, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      onError: 'continueRegularOutput',
    },

    // ====== BRANCH: meeting_transcript (no preprocessing needed) ======
    // Goes straight to 4. Busca Card

    // ====== SHARED PIPELINE (all branches converge here) ======

    // 4. Busca Card
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $('1. Extrai Params').item.json.card_id }}&select=id,titulo,produto_data,briefing_inicial,pipeline_stage_id,locked_fields,pessoa_principal_id,pipeline_stages(fase,nome)`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '4. Busca Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1560, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 5. Busca Config v2 (stage-aware)
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/get_ai_extraction_config_v2`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ p_stage_id: $json.pipeline_stage_id || null }) }}',
        options: {},
      },
      name: '5. Busca Config',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1820, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
    },

    // 5w. Busca Contatos do Card (for whatsapp — alwaysOutputData so empty array still passes downstream)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards_contatos?card_id=eq.{{ $('1. Extrai Params').item.json.card_id }}&select=contato_id`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '5w. Busca Contatos',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1820, 500],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      alwaysOutputData: true
    },

    // 5w2. Monta Contact IDs — Code node that combines pessoa_principal_id + cards_contatos
    // Always returns 1 item with contactIds array
    {
      parameters: {
        jsCode: `// Combina pessoa_principal_id com contatos adicionais do cards_contatos
const pessoa_principal_id = $('4. Busca Card').first().json.pessoa_principal_id;
const contactIds = [pessoa_principal_id];

// Adiciona contatos extras (se houver)
try {
  const extras = $('5w. Busca Contatos').all().map(i => i.json.contato_id).filter(Boolean);
  for (const id of extras) {
    if (!contactIds.includes(id)) contactIds.push(id);
  }
} catch(e) {}

return [{ json: { contactIds, pessoa_principal_id } }];`,
        options: {}
      },
      name: '5w2. Monta Contact IDs',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2000, 500]
    },

    // 3w. Busca WhatsApp (by contact_ids — trip-aware, ALL messages from contact)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/whatsapp_messages?or=({{ $json.contactIds.map(id => 'contact_id.eq.' + id).join(',') }})&order=created_at.desc&limit=100&select=id,body,media_content,message_type,is_from_me,sender_name,created_at,card_id`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '3w. Busca WhatsApp',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2200, 400],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 3x. Busca Outros Cards do Contato (for trip-aware context)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?pessoa_principal_id=eq.{{ $json.pessoa_principal_id }}&id=neq.{{ $('1. Extrai Params').item.json.card_id }}&status_comercial=not.in.(ganho,perdido)&deleted_at=is.null&select=id,titulo,produto_data,briefing_inicial&order=created_at.desc&limit=5`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '3x. Busca Outros Cards',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2200, 600],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      alwaysOutputData: true
    },

    // 6w. Formata WhatsApp (trip-aware message formatting + context)
    {
      parameters: { jsCode: CODE_FORMATA_WHATSAPP, options: {} },
      name: '6w. Formata WhatsApp',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2340, 500]
    },

    // 6am. Monta Contexto Audio/Meeting
    {
      parameters: { jsCode: CODE_MONTA_CONTEXTO_AUDIO_MEETING, options: {} },
      name: '6am. Monta Contexto Audio/Meeting',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2340, 100]
    },

    // 6. Monta Contexto (Merge — picks from whichever branch produced data)
    {
      parameters: {
        jsCode: `// Merge: pega dados de qualquer branch que executou (inclui ai_prompt)
// Tenta WhatsApp primeiro
try {
  const wpItems = $('6w. Formata WhatsApp').all();
  if (wpItems.length > 0) {
    const wpData = wpItems[0].json;
    if (wpData && wpData.card_id && wpData.ai_prompt) return [{ json: wpData }];
  }
} catch(e) {}
// Tenta Audio/Meeting
try {
  const amItems = $('6am. Monta Contexto Audio/Meeting').all();
  if (amItems.length > 0) {
    const amData = amItems[0].json;
    if (amData && amData.skip_ai) {
      // Forward skip — set ai_prompt to a minimal instruction so AI returns empty
      return [{ json: {
        ...amData,
        ai_prompt: 'Responda APENAS com este JSON exato: {"campos_extraidos": {}}. Nenhum campo para atualizar.'
      }}];
    }
    if (amData && amData.card_id && amData.ai_prompt) return [{ json: amData }];
  }
} catch(e) {}
throw new Error('Nenhum branch produziu contexto válido');`,
        options: {}
      },
      name: '6. Monta Contexto',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2600, 300]
    },

    // 7. AI Extrator (Agent v2.2 — prompt comes pre-built from Code node via $json.ai_prompt)
    {
      parameters: {
        promptType: 'define',
        text: '={{ $json.ai_prompt }}',
        options: {
          systemMessage: SYSTEM_PROMPT
        }
      },
      name: '7. AI Extrator',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 2.2,
      position: [2860, 300]
    },

    // 7b. GPT-5.1 Model
    {
      parameters: {
        model: { __rl: true, value: 'gpt-5.1', mode: 'list', cachedResultName: 'gpt-5.1' },
        options: {
          responseFormat: 'json_object',
          temperature: 0.1,
          maxTokens: 4096
        }
      },
      name: 'GPT-5.1',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.2,
      position: [2860, 520],
      credentials: { openAiApi: OPENAI_CREDENTIAL }
    },

    // 8. Valida Output
    {
      parameters: { jsCode: CODE_VALIDA_OUTPUT, options: {} },
      name: '8. Valida Output',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3120, 300]
    },

    // 9. Tem Atualização?
    {
      parameters: {
        conditions: {
          boolean: [{ value1: '={{ $json.tem_atualizacao }}', value2: true }]
        }
      },
      name: '9. Tem Atualização?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [3380, 300]
    },

    // 10. Busca produto_data Atual (refetch fresh for merge)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $json.card_id }}&select=produto_data,briefing_inicial,locked_fields,pipeline_stages(fase)`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '10. Busca produto_data Atual',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3640, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 11. Merge Dados
    {
      parameters: { jsCode: CODE_MERGE_DADOS, options: {} },
      name: '11. Merge Dados',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3900, 200]
    },

    // 12. Atualiza Card (RPC)
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/update_card_from_ai_extraction`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ p_card_id: $json.card_id, p_produto_data: $json.produto_data, p_briefing_inicial: $json.briefing_inicial }) }}',
        options: {}
      },
      name: '12. Atualiza Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [4160, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 13. Atualiza Metadata Tarefa (skip if no meeting_id)
    {
      parameters: {
        jsCode: `// Skip se não tem meeting_id (WhatsApp, audio sem meeting)
const mergeData = $('11. Merge Dados').first().json;
if (!mergeData.meeting_id) {
  return [{ json: mergeData }];
}
// Passa adiante — a atualização de metadata será feita pelo 14. Log Activity
// (ou pode-se adicionar HTTP request inline se necessário)
return [{ json: mergeData }];`,
        options: {}
      },
      name: '13. Atualiza Metadata Tarefa',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [4420, 200]
    },

    // 14. Log Activity
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/activities`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
          card_id: $('11. Merge Dados').item.json.card_id,
          tipo: 'ai_extraction',
          descricao: 'IA extraiu campos (' + $('11. Merge Dados').item.json.source + ': ' + Object.keys($('11. Merge Dados').item.json.campos_atualizados || {}).length + ' campos)',
          metadata: {
            campos_extraidos: Object.keys($('11. Merge Dados').item.json.campos_atualizados || {}),
            briefing_length: ($('11. Merge Dados').item.json.briefing_text || '').length,
            source: $('11. Merge Dados').item.json.source,
            meeting_id: $('11. Merge Dados').item.json.meeting_id || null,
            _meta: $('11. Merge Dados').item.json._meta || null
          },
          created_by: $('8. Valida Output').item.json.user_id || null
        }) }}`,
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Prefer', value: 'return=minimal' }] },
        options: {}
      },
      name: '14. Log Activity',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [4680, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 15. Sucesso
    {
      parameters: { jsCode: CODE_SUCESSO, options: {} },
      name: '15. Sucesso',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [4940, 200]
    },

    // 16. Sem Atualização
    {
      parameters: { jsCode: CODE_SEM_ATUALIZACAO, options: {} },
      name: '16. Sem Atualização',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3640, 480]
    },

    // R1. Respond Success
    {
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify($json) }}',
        options: { responseCode: 200 }
      },
      name: 'R1. Respond Success',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [5200, 200]
    },

    // R2. Respond No Update
    {
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify($json) }}',
        options: { responseCode: 200 }
      },
      name: 'R2. Respond No Update',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [3900, 480]
    },

    // 10b. Dry Run? (check if dry_run=true → return preview instead of applying)
    {
      parameters: {
        conditions: {
          boolean: [{ value1: '={{ $("1. Extrai Params").first().json.dry_run === "true" }}', value2: true }]
        }
      },
      name: '10b. Dry Run?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [3770, 50]
    },

    // 10c. Monta Preview (builds preview response for dry_run)
    {
      parameters: {
        jsCode: `// Monta preview para dry_run — retorna campos extraídos + atuais + config sem aplicar
const validationData = $('8. Valida Output').first().json;
const currentCard = $('10. Busca produto_data Atual').first().json;
const contextData = $('6. Monta Contexto').first().json;
const fase = contextData.fase;

const currentProdutoData = currentCard.produto_data || {};
const currentBriefing = currentCard.briefing_inicial || {};

// Fonte dos campos atuais baseada na fase
let tripSource = {};
let obsSource = {};
if (fase === 'SDR') {
  tripSource = currentBriefing;
  obsSource = currentBriefing.observacoes || {};
} else if (fase === 'Planner') {
  tripSource = currentProdutoData;
  obsSource = currentProdutoData.observacoes_criticas || {};
} else {
  tripSource = currentProdutoData;
  obsSource = currentProdutoData.observacoes_pos_venda || {};
}

// Montar campos atuais para comparação
const config = validationData.field_config;
const fields = config.fields || [];
const camposAtuais = {};
for (const field of fields) {
  const source = field.section === 'trip_info' ? tripSource : obsSource;
  camposAtuais[field.key] = source[field.key] || null;
}

return [{ json: {
  status: 'preview',
  card_id: validationData.card_id,
  source: validationData.source,
  campos_extraidos: validationData.campos_extraidos,
  campos_atuais: camposAtuais,
  briefing_text: validationData.briefing_text || '',
  field_config: config,
  _meta: validationData._meta || null,
  fase: fase,
  transcription: validationData.transcription || ''
}}];`,
        options: {}
      },
      name: '10c. Monta Preview',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3950, -50]
    },

    // R3. Respond Preview
    {
      parameters: {
        respondWith: 'json',
        responseBody: '={{ JSON.stringify($input.first().json) }}',
        options: { responseCode: 200 }
      },
      name: 'R3. Respond Preview',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [4200, -50]
    }
  ];

  const connections = {
    'Webhook': {
      main: [[{ node: '1. Extrai Params', type: 'main', index: 0 }]]
    },
    '1. Extrai Params': {
      main: [[{ node: '2. Router', type: 'main', index: 0 }]]
    },
    // Router outputs: 0=briefing_audio, 1=whatsapp, 2=meeting_transcript
    '2. Router': {
      main: [
        [{ node: '3a1. Prepara Audio', type: 'main', index: 0 }],     // briefing_audio
        [{ node: '3w0. Processa Mídias', type: 'main', index: 0 }],   // whatsapp
        [{ node: '4. Busca Card', type: 'main', index: 0 }]           // meeting_transcript
      ]
    },
    // Audio branch
    '3a1. Prepara Audio': {
      main: [[{ node: '3a2. Whisper API', type: 'main', index: 0 }]]
    },
    '3a2. Whisper API': {
      main: [[{ node: '3a3. Extrai Transcrição', type: 'main', index: 0 }]]
    },
    '3a3. Extrai Transcrição': {
      main: [[{ node: '4. Busca Card', type: 'main', index: 0 }]]
    },
    // WhatsApp branch
    '3w0. Processa Mídias': {
      main: [[{ node: '4. Busca Card', type: 'main', index: 0 }]]
    },
    // All branches → Busca Card → Busca Config + Busca Contatos (parallel)
    '4. Busca Card': {
      main: [[
        { node: '5. Busca Config', type: 'main', index: 0 },
        { node: '5w. Busca Contatos', type: 'main', index: 0 }
      ]]
    },
    '5. Busca Config': {
      main: [[
        { node: '6am. Monta Contexto Audio/Meeting', type: 'main', index: 0 }
      ]]
    },
    // WhatsApp sub-branch: Contatos → Monta IDs → Busca WhatsApp + Busca Outros Cards
    '5w. Busca Contatos': {
      main: [[{ node: '5w2. Monta Contact IDs', type: 'main', index: 0 }]]
    },
    '5w2. Monta Contact IDs': {
      main: [[
        { node: '3w. Busca WhatsApp', type: 'main', index: 0 },
        { node: '3x. Busca Outros Cards', type: 'main', index: 0 }
      ]]
    },
    '3w. Busca WhatsApp': {
      main: [[{ node: '6w. Formata WhatsApp', type: 'main', index: 0 }]]
    },
    // Both Monta Contexto nodes → 6. Monta Contexto (merge/picker)
    '6w. Formata WhatsApp': {
      main: [[{ node: '6. Monta Contexto', type: 'main', index: 0 }]]
    },
    '6am. Monta Contexto Audio/Meeting': {
      main: [[{ node: '6. Monta Contexto', type: 'main', index: 0 }]]
    },
    '6. Monta Contexto': {
      main: [[{ node: '7. AI Extrator', type: 'main', index: 0 }]]
    },
    '7. AI Extrator': {
      main: [[{ node: '8. Valida Output', type: 'main', index: 0 }]]
    },
    'GPT-5.1': {
      ai_languageModel: [[{ node: '7. AI Extrator', type: 'ai_languageModel', index: 0 }]]
    },
    '8. Valida Output': {
      main: [[{ node: '9. Tem Atualização?', type: 'main', index: 0 }]]
    },
    '9. Tem Atualização?': {
      main: [
        [{ node: '10. Busca produto_data Atual', type: 'main', index: 0 }],
        [{ node: '16. Sem Atualização', type: 'main', index: 0 }]
      ]
    },
    '10. Busca produto_data Atual': {
      main: [[{ node: '10b. Dry Run?', type: 'main', index: 0 }]]
    },
    '10b. Dry Run?': {
      main: [
        [{ node: '10c. Monta Preview', type: 'main', index: 0 }],  // true → preview
        [{ node: '11. Merge Dados', type: 'main', index: 0 }]       // false → apply
      ]
    },
    '10c. Monta Preview': {
      main: [[{ node: 'R3. Respond Preview', type: 'main', index: 0 }]]
    },
    '11. Merge Dados': {
      main: [[{ node: '12. Atualiza Card', type: 'main', index: 0 }]]
    },
    '12. Atualiza Card': {
      main: [[{ node: '13. Atualiza Metadata Tarefa', type: 'main', index: 0 }]]
    },
    '13. Atualiza Metadata Tarefa': {
      main: [[{ node: '14. Log Activity', type: 'main', index: 0 }]]
    },
    '14. Log Activity': {
      main: [[{ node: '15. Sucesso', type: 'main', index: 0 }]]
    },
    '15. Sucesso': {
      main: [[{ node: 'R1. Respond Success', type: 'main', index: 0 }]]
    },
    '16. Sem Atualização': {
      main: [[{ node: 'R2. Respond No Update', type: 'main', index: 0 }]]
    }
  };

  return {
    name: 'Welcome CRM - AI Extractor Unified',
    nodes,
    connections,
    settings: { executionOrder: 'v1' }
  };
}

// ============================================================================
// DEPLOY
// ============================================================================

// Fixed workflow ID — set after first creation. Update here for re-deploys.
const WORKFLOW_ID = 'FidaxlMAXRb0tZKn';

async function main() {
  const workflow = buildWorkflow();

  let result;

  if (WORKFLOW_ID) {
    console.log(`📝 Atualizando workflow "${workflow.name}" (ID: ${WORKFLOW_ID})...`);
    const updateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings
      })
    });
    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error(`❌ Erro ao atualizar workflow: ${updateRes.status}`);
      console.error(errorText);
      process.exit(1);
    }
    result = await updateRes.json();
    console.log(`✅ Workflow atualizado: ${result.id}`);
  } else {
    console.log(`📝 Criando workflow "${workflow.name}"...`);
    const createRes = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflow)
    });
    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error(`❌ Erro ao criar workflow: ${createRes.status}`);
      console.error(errorText);
      process.exit(1);
    }
    result = await createRes.json();
    console.log(`✅ Workflow criado: ${result.id}`);
    console.log(`⚠️  IMPORTANTE: Atualize WORKFLOW_ID no script para "${result.id}"`);
  }

  // Activate
  const activateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${result.id}/activate`, {
    method: 'POST',
    headers: { 'x-n8n-api-key': API_KEY }
  });
  const activateData = await activateRes.json();
  console.log(`⚡ Workflow ${activateData.active ? 'ativado' : 'inativo'}`);
  console.log(`\n🔗 Webhook URL: ${N8N_API_URL}/webhook/ai-extraction-unified`);
  console.log(`📋 Editor: ${N8N_API_URL}/workflow/${result.id}`);
  console.log(`\n⚠️  IMPORTANTE: Salve o ID "${result.id}" — será necessário para re-deploys futuros`);
  console.log(`\n📌 Pré-requisitos:`);
  console.log(`   1. Credential "WelcomeSupabase" (supabaseApi)`);
  console.log(`   2. Credential "Vitor TESTE" (openAiApi) — Whisper + GPT-5.1`);
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
