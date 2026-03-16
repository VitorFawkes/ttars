#!/usr/bin/env node
/**
 * Create "Briefing IA" workflow in n8n
 *
 * Receives audio from consultant, transcribes via Whisper,
 * generates briefing text and extracts CRM fields using the
 * same dynamic field config as the existing AI Extractor.
 *
 * Prerequisites:
 *   - OPENAI_API_KEY must be set as n8n environment variable
 *     (Settings → Variables → OPENAI_API_KEY) or as server env var
 *
 * Usage: source .env && node scripts/create-n8n-briefing-ia.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';
const TARGET_WORKFLOW_ID = 'fezRqL6GQFaGyJNG'; // Existing Briefing IA workflow to update

// Credential IDs from existing workflows
const SUPABASE_CREDENTIAL = { id: 'SXzk2uSaw8b7BcaN', name: 'WelcomeSupabase' };
const OPENAI_CREDENTIAL = { id: 'ZLg8WpP4UNXepE8g', name: 'Vitor TESTE' };

if (!API_KEY) {
  console.error('❌ N8N_API_KEY is required.');
  console.error('Usage: source .env && node scripts/create-n8n-briefing-ia.js');
  process.exit(1);
}

// ============================================================================
// AI PROMPTS
// ============================================================================

const SYSTEM_PROMPT = `Você é um assistente de CRM especializado em viagens de alto padrão, trabalhando para a Welcome Trips — uma agência premium de planejamento de viagens personalizadas.

Sua função é processar relatórios verbais de consultores de viagem e transformá-los em dados estruturados para o CRM.

## REGRAS ABSOLUTAS

1. EXTRAIA APENAS informações mencionadas explicitamente na transcrição
2. NUNCA invente ou infira informações não ditas pelo consultor
3. Se houver ambiguidade, NÃO inclua o campo
4. Respeite os formatos e valores permitidos de cada campo
5. Campos com dados existentes: SOMENTE atualize se o consultor trouxe informação NOVA ou DIFERENTE
6. Se o consultor NÃO mencionou um campo, NÃO o inclua (mantém o existente)
7. Transcrição de áudio pode ter erros de reconhecimento: "maldives" = "Maldivas", "tailândia" pode estar como "tailando", etc. Use bom senso
8. Números devem ser números puros (sem formatação)
9. Booleanos devem ser true ou false
10. Para campos select/multiselect, use APENAS os valores permitidos

## QUALIDADE
- Prefira não extrair a extrair informação duvidosa
- Se o consultor for vago, não inclua
- Se houver contradição na transcrição, use a informação mais recente

## SAÍDA
Responda APENAS com JSON válido. Nenhum texto antes ou depois. Sem markdown.`;

// ============================================================================
// CODE NODE SCRIPTS
// ============================================================================

const CODE_PREPARA_AUDIO = `// Converte base64 para binary data no item (para HTTP Request node)
const items = $input.all();
const audio_base64 = items[0].json.audio_base64;
let audio_mime_type = items[0].json.audio_mime_type || 'audio/webm';
const card_id = items[0].json.card_id;
const user_id = items[0].json.user_id;

if (!audio_base64 || audio_base64.length < 100) {
  throw new Error('Audio base64 vazio ou muito curto.');
}

// Normalizar MIME types não-padrão que o Whisper não reconhece
if (audio_mime_type === 'audio/m4a' || audio_mime_type === 'audio/x-m4a') {
  audio_mime_type = 'audio/mp4';
}
// Remover codecs do MIME (ex: audio/webm;codecs=opus → audio/webm)
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
console.log('[BriefingIA] Audio: ' + fileSizeKB + 'KB, tipo: ' + audio_mime_type + ', ext: ' + ext);

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

const CODE_EXTRAI_TRANSCRICAO = `// Extrai texto da resposta do Whisper e normaliza output
const whisperResponse = $input.first().json;
const card_id = $('1. Extrai Params').first().json.card_id;
const user_id = $('1. Extrai Params').first().json.user_id;

const transcription = (whisperResponse.text || '').trim();
console.log('[BriefingIA] Transcrição: ' + transcription.length + ' caracteres');

if (!transcription || transcription.length < 10) {
  return [{ json: {
    card_id, user_id,
    transcription: '',
    status: 'transcription_empty',
    error: 'Transcrição vazia ou muito curta. Verifique o áudio.'
  }}];
}

return [{ json: {
  card_id,
  user_id,
  transcription
}}];`;

const CODE_MONTA_CONTEXTO = `// Monta contexto para o AI Briefing (filtra por visibilidade do stage)
const transcriptionData = $('3b. Extrai Transcrição').first().json;
const cardData = $('4. Busca Card').first().json;
const config = $('5. Busca Config').first().json;
const mode = $('1. Extrai Params').first().json.mode || 'atualizar';
console.log('[BriefingIA] Modo: ' + mode);

// Busca campos ocultos no stage atual (retorno do step 5b)
const hiddenFieldsRaw = $('5b. Busca Visibilidade').all().map(i => i.json);
const hiddenKeys = new Set(hiddenFieldsRaw.map(r => r.field_key).filter(Boolean));
console.log('[BriefingIA] Campos ocultos no stage: ' + (hiddenKeys.size > 0 ? [...hiddenKeys].join(', ') : '(nenhum)'));

// Se a transcrição falhou, retornar erro direto
if (transcriptionData.status === 'transcription_empty') {
  return [{ json: {
    ...transcriptionData,
    skip_ai: true
  }}];
}

const transcription = transcriptionData.transcription;
const card_id = transcriptionData.card_id;
const user_id = transcriptionData.user_id;
const produtoData = cardData.produto_data || {};
const briefingData = cardData.briefing_inicial || {};
const fase = cardData.pipeline_stages?.fase || 'SDR';
const stageName = cardData.pipeline_stages?.nome || '';
const stageId = cardData.pipeline_stage_id || '';
const allFields = config.fields || [];
const sections = config.sections || {};

// FILTRAR: remover campos ocultos no stage atual
const fields = allFields.filter(f => !hiddenKeys.has(f.key));
const removedCount = allFields.length - fields.length;
if (removedCount > 0) {
  console.log('[BriefingIA] Removidos ' + removedCount + ' campos ocultos. Restam ' + fields.length + ' campos visíveis.');
}

// Mapa de seções por fase
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

// Monta campos atuais DINAMICAMENTE (apenas visíveis)
// Em modo 'novo', não envia dados existentes — IA trabalha do zero
const camposAtuais = {};
if (mode !== 'novo') {
  for (const field of fields) {
    const source = field.section === 'trip_info' ? tripSource : obsSource;
    camposAtuais[field.key] = source[field.key] || null;
  }
}

// Briefing anterior (para modo 'atualizar' — IA incorpora no novo texto)
const briefingAnterior = mode !== 'novo' ? (tripSource.resumo_consultor || '') : '';

// Monta definições de campos para o prompt (apenas visíveis)
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

// Config filtrada (apenas campos visíveis) — passada para validação downstream
const filteredConfig = { ...config, fields };

return [{ json: {
  card_id,
  user_id,
  titulo: cardData.titulo,
  fase,
  stage_name: stageName,
  stage_id: stageId,
  section_info: sectionInfo,
  transcription,
  campos_atuais: camposAtuais,
  field_definitions: fieldDefs,
  field_config: filteredConfig,
  hidden_fields: [...hiddenKeys],
  skip_ai: false,
  mode,
  briefing_anterior: briefingAnterior
}}];`;

const CODE_VALIDA_OUTPUT = `// Valida e estrutura output do AI (respeita visibilidade)
const aiOutput = $('7. AI Briefing').first().json.output || '{}';
const contextData = $('6. Monta Contexto').first().json;
const config = contextData.field_config;
const card_id = contextData.card_id;
const user_id = contextData.user_id;
const transcription = contextData.transcription;
const hiddenFields = new Set(contextData.hidden_fields || []);
const fields = config.fields || [];

// Parse AI JSON
let parsed = {};
try {
  let clean = aiOutput;
  if (typeof clean === 'string') {
    clean = clean.replace(/\\\`\\\`\\\`json\\n?/g, '').replace(/\\\`\\\`\\\`\\n?/g, '').trim();
    parsed = JSON.parse(clean);
  } else {
    parsed = clean;
  }
} catch (e) {
  console.log('[BriefingIA] Erro ao parsear JSON do AI:', e.message);
  parsed = {};
}

const briefingText = parsed.briefing_text || '';
const camposRaw = parsed.campos || parsed.extracted_fields || {};

// Validação DINÂMICA baseada na config (mesmo padrão do Atualizador Campos)
const fieldMap = {};
for (const f of fields) {
  fieldMap[f.key] = f;
}

const camposValidados = {};
for (const [key, value] of Object.entries(camposRaw)) {
  if (value === undefined || value === null || value === '') continue;

  // Safety net: rejeitar campos ocultos no stage atual
  if (hiddenFields.has(key)) {
    console.log('[BriefingIA] Campo oculto rejeitado na validação: ' + key);
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
      // Objects pass through to converters (e.g., epoca_viagem JSON {mes, ano})
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

console.log('[BriefingIA] Briefing: ' + briefingText.length + ' chars, Campos: ' + Object.keys(camposValidados).length);

return [{ json: {
  card_id,
  user_id,
  transcription,
  briefing_text: briefingText,
  campos_extraidos: camposValidados,
  campos_extraidos_keys: Object.keys(camposValidados),
  tem_atualizacao: temAtualizacao,
  field_config: config,
  hidden_fields: [...hiddenFields],
  ai_raw_output: aiOutput
}}];`;

const CODE_MERGE_DADOS = `// Merge dados extraídos com dados atuais do card (respeita visibilidade)
const validationData = $('8. Valida Output').first().json;
const camposExtraidos = validationData.campos_extraidos;
const briefingText = validationData.briefing_text;
const config = validationData.field_config;
const fields = config.fields || [];
const card_id = validationData.card_id;
const hiddenFields = new Set(validationData.hidden_fields || []);

const currentCard = $('10. Busca produto_data').first().json;
const currentProdutoData = currentCard.produto_data || {};
const currentBriefing = currentCard.briefing_inicial || {};
const lockedFields = currentCard.locked_fields || {};
const fase = $('6. Monta Contexto').first().json.fase;

// Construir mapa de seções DINAMICAMENTE
const fieldSectionMap = {};
for (const f of fields) {
  fieldSectionMap[f.key] = f.section;
}

// Separar campos extraídos por seção, respeitando locked_fields
const tripInfoUpdate = {};
const observacoesUpdate = {};
const camposAtualizados = {};

for (const [key, value] of Object.entries(camposExtraidos)) {
  // Respeitar campos bloqueados
  if (lockedFields[key] === true) {
    console.log('[BriefingIA] Campo bloqueado, ignorando: ' + key);
    continue;
  }
  // Respeitar campos ocultos no stage
  if (hiddenFields.has(key)) {
    console.log('[BriefingIA] Campo oculto no stage, ignorando: ' + key);
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

// ============================================================
// CONVERSÃO DE FORMATOS: simples → estruturado (para o frontend)
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
  if (typeof value === 'number') {
    return { tipo: 'total', valor: value, total_calculado: value, display: formatCurrency(value) };
  }
  return value;
}

function convertEpoca(value) {
  if (typeof value === 'object' && value !== null && value.tipo) return value;
  const thisYear = new Date().getFullYear();
  // Objeto estruturado do GPT: {mes: 12, ano: 2026} ou {mes_inicio: 6, mes_fim: 8, ano: 2026}
  if (typeof value === 'object' && value !== null) {
    if (value.mes_inicio && value.mes_fim) {
      const ano = value.ano || thisYear;
      return {
        tipo: 'range_meses',
        mes_inicio: value.mes_inicio, mes_fim: value.mes_fim,
        ano: ano,
        display: MESES_NOMES[value.mes_inicio] + ' a ' + MESES_NOMES[value.mes_fim] + ' ' + ano
      };
    }
    if (value.mes) {
      const ano = value.ano || thisYear;
      return {
        tipo: 'mes',
        mes: value.mes,
        ano: ano,
        display: MESES_NOMES[value.mes] + ' ' + ano
      };
    }
  }
  // String "indefinido"
  if (typeof value === 'string' && value.toLowerCase().trim() === 'indefinido') {
    return { tipo: 'indefinido', display: 'Não definido' };
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    // Tentar extrair mês e ano de texto: "dezembro 2026", "março de 2027"
    for (const [nome, num] of Object.entries(MESES)) {
      if (lower.includes(nome)) {
        const anoMatch = value.match(/(20\\d{2})/);
        const ano = anoMatch ? parseInt(anoMatch[1]) : thisYear;
        // Verificar se há range: "junho a setembro", "junho-setembro"
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
          tipo: 'mes',
          mes: num,
          ano: ano,
          display: MESES_NOMES[num] + ' ' + ano
        };
      }
    }
    // Último fallback: NUNCA retornar string crua — envolver em indefinido com display
    return { tipo: 'indefinido', display: value.substring(0, 100) };
  }
  return { tipo: 'indefinido', display: 'Não definido' };
}

function convertDuracao(value) {
  if (typeof value === 'object' && value !== null && value.tipo) return value;
  if (typeof value === 'object' && value !== null && value.min && value.max) {
    return { tipo: 'range', dias_min: value.min, dias_max: value.max, display: value.min + ' a ' + value.max + ' dias' };
  }
  if (typeof value === 'number') {
    return { tipo: 'fixo', dias_min: value, dias_max: value, display: value + ' dias' };
  }
  if (typeof value === 'string') {
    const match = value.match(/(\\d+)/);
    if (match) {
      const dias = parseInt(match[1]);
      return { tipo: 'fixo', dias_min: dias, dias_max: dias, display: dias + ' dias' };
    }
  }
  return value;
}

// Apply conversions to specific fields
if (tripInfoUpdate.orcamento) {
  tripInfoUpdate.orcamento = convertOrcamento(tripInfoUpdate.orcamento, { ...currentProdutoData, ...tripInfoUpdate });
}
if (tripInfoUpdate.epoca_viagem) {
  tripInfoUpdate.epoca_viagem = convertEpoca(tripInfoUpdate.epoca_viagem);
}
if (tripInfoUpdate.duracao_viagem) {
  tripInfoUpdate.duracao_viagem = convertDuracao(tripInfoUpdate.duracao_viagem);
}

// ============================================================
// MERGE: Deep merge com dados atuais (baseado na fase e modo)
// ============================================================

const mode = $('6. Monta Contexto').first().json.mode || 'atualizar';
console.log('[BriefingIA] Merge modo: ' + mode);

let newProdutoData, newBriefing;

if (mode === 'novo') {
  // MODO NOVO: limpa a seção e usa apenas dados da IA
  // Preserva locked_fields restaurando seus valores
  if (fase === 'SDR') {
    newBriefing = { ...tripInfoUpdate };
    newBriefing.observacoes = { ...observacoesUpdate };
    if (briefingText) {
      newBriefing.observacoes.briefing = briefingText;
      newBriefing.resumo_consultor = briefingText;
      newBriefing.resumo_consultor_at = new Date().toISOString();
    }
    // Restaurar campos bloqueados
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
    // Limpar trip_info fields e reescrever com os da IA
    for (const f of fields) {
      if (f.section === 'trip_info' && !lockedFields[f.key]) delete newProdutoData[f.key];
    }
    Object.assign(newProdutoData, tripInfoUpdate);
    newProdutoData.observacoes_criticas = { ...observacoesUpdate };
    const lockedObs = currentProdutoData.observacoes_criticas || {};
    for (const [key, val] of Object.entries(lockedObs)) {
      if (lockedFields[key] === true) newProdutoData.observacoes_criticas[key] = val;
    }
    if (briefingText) {
      newProdutoData.observacoes_criticas.briefing = briefingText;
      newProdutoData.resumo_consultor = briefingText;
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
    if (briefingText) {
      newProdutoData.observacoes_pos_venda.briefing = briefingText;
      newProdutoData.resumo_consultor = briefingText;
      newProdutoData.resumo_consultor_at = new Date().toISOString();
    }
    newBriefing = currentBriefing;
  }
} else {
  // MODO ATUALIZAR: spread merge normal (a IA já retorna valores finais corretos)
  if (fase === 'SDR') {
    newBriefing = { ...currentBriefing, ...tripInfoUpdate };
    const obsBase = currentBriefing.observacoes || {};
    const obsUpdated = { ...obsBase, ...observacoesUpdate };
    if (briefingText) {
      obsUpdated.briefing = briefingText;
      newBriefing.resumo_consultor = briefingText;
      newBriefing.resumo_consultor_at = new Date().toISOString();
    }
    newBriefing.observacoes = obsUpdated;
    newProdutoData = currentProdutoData;
  } else if (fase === 'Planner') {
    newProdutoData = { ...currentProdutoData, ...tripInfoUpdate };
    const obsBase = currentProdutoData.observacoes_criticas || {};
    const obsUpdated = { ...obsBase, ...observacoesUpdate };
    if (briefingText) {
      obsUpdated.briefing = briefingText;
      newProdutoData.resumo_consultor = briefingText;
      newProdutoData.resumo_consultor_at = new Date().toISOString();
    }
    newProdutoData.observacoes_criticas = obsUpdated;
    newBriefing = currentBriefing;
  } else {
    newProdutoData = { ...currentProdutoData, ...tripInfoUpdate };
    const obsBase = currentProdutoData.observacoes_pos_venda || {};
    const obsUpdated = { ...obsBase, ...observacoesUpdate };
    if (briefingText) {
      obsUpdated.briefing = briefingText;
      newProdutoData.resumo_consultor = briefingText;
      newProdutoData.resumo_consultor_at = new Date().toISOString();
    }
    newProdutoData.observacoes_pos_venda = obsUpdated;
    newBriefing = currentBriefing;
  }
}

// Normalizar campos calculados (para relatórios)
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

console.log('[BriefingIA] Merge completo. Campos atualizados: ' + Object.keys(camposAtualizados).join(', '));

return [{ json: {
  card_id,
  produto_data: newProdutoData,
  briefing_inicial: newBriefing,
  campos_atualizados: camposAtualizados,
  briefing_text: briefingText
}}];`;

const CODE_SUCESSO = `const mergeData = $('11. Merge Dados').first().json;
const validationData = $('8. Valida Output').first().json;

return [{ json: {
  status: 'success',
  card_id: mergeData.card_id,
  briefing_text: mergeData.briefing_text || '',
  campos_atualizados: mergeData.campos_atualizados,
  campos_extraidos: Object.keys(mergeData.campos_atualizados || {}),
  transcription: validationData.transcription || '',
  timestamp: new Date().toISOString()
}}];`;

const CODE_SEM_ATUALIZACAO = `const validationData = $('8. Valida Output').first().json;

return [{ json: {
  status: 'no_update',
  message: 'IA não encontrou informações novas no áudio do consultor',
  card_id: validationData.card_id,
  transcription: validationData.transcription || '',
  briefing_text: validationData.briefing_text || '',
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
        path: 'briefing-ia',
        responseMode: 'lastNode',
        options: {}
      },
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'briefing-ia'
    },

    // 1. Set: Extract params
    {
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'card_id', name: 'card_id', value: '={{ $json.body.card_id }}', type: 'string' },
            { id: 'audio_base64', name: 'audio_base64', value: '={{ $json.body.audio_base64 }}', type: 'string' },
            { id: 'audio_mime_type', name: 'audio_mime_type', value: '={{ $json.body.audio_mime_type || "audio/webm" }}', type: 'string' },
            { id: 'user_id', name: 'user_id', value: '={{ $json.body.user_id }}', type: 'string' },
            { id: 'mode', name: 'mode', value: '={{ $json.body.mode || "atualizar" }}', type: 'string' }
          ]
        },
        options: {}
      },
      name: '1. Extrai Params',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [260, 300]
    },

    // 2. Code: Prepara Audio Binary (base64 → binary data)
    {
      parameters: {
        jsCode: CODE_PREPARA_AUDIO,
        options: {}
      },
      name: '2. Prepara Audio',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [520, 300]
    },

    // 3. HTTP Request: Whisper API (transcription with OpenAI credential)
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
      name: '3. Whisper API',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [780, 300],
      credentials: { openAiApi: OPENAI_CREDENTIAL }
    },

    // 3b. Code: Extrai Transcrição (normaliza output do Whisper)
    {
      parameters: {
        jsCode: CODE_EXTRAI_TRANSCRICAO,
        options: {}
      },
      name: '3b. Extrai Transcrição',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1040, 300]
    },

    // 4. HTTP Request: Busca Card
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $('3b. Extrai Transcrição').item.json.card_id }}&select=id,titulo,produto_data,briefing_inicial,pipeline_stage_id,locked_fields,pipeline_stages(fase,nome)`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '4. Busca Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1300, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 5. HTTP Request: Busca Config
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/get_ai_extraction_config`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '5. Busca Config',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1560, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 5b. HTTP Request: Busca campos ocultos no stage do card
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/stage_field_config?stage_id=eq.{{ $('4. Busca Card').item.json.pipeline_stage_id }}&is_visible=eq.false&select=field_key`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '5b. Busca Visibilidade',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1690, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 6. Code: Monta Contexto
    {
      parameters: {
        jsCode: CODE_MONTA_CONTEXTO,
        options: {}
      },
      name: '6. Monta Contexto',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1950, 300]
    },

    // 7. Agent: AI Briefing
    {
      parameters: {
        promptType: 'define',
        text: `=# CONTEXTO

Um CONSULTOR da Welcome Trips acabou de gravar um áudio relatando o que conversou com o cliente.
⚠️ IMPORTANTE: Esta é uma transcrição de ÁUDIO do CONSULTOR, não do cliente diretamente. O consultor está RELATANDO em terceira pessoa o que foi discutido.

## TRANSCRIÇÃO DO CONSULTOR
"""
{{ $json.transcription }}
"""

## DADOS ATUAIS DO CARD
Título: {{ $json.titulo }}
Fase do Pipeline: {{ $json.fase }} (Etapa: {{ $json.stage_name }})
Seção de dados: {{ $json.section_info.obsLabel }}

⚠️ REGRA DE FASE: Este card está na fase **{{ $json.fase }}**. Salve os dados na seção correta para essa fase. Apenas os campos listados abaixo estão HABILITADOS para este estágio — NÃO extraia campos que não estão na lista.

{{ $json.mode === 'novo' ? '⚠️ MODO: NOVO BRIEFING — Extraia TUDO que o consultor mencionou, como se fosse um card completamente novo. Ignore qualquer dado pre-existente.' : '⚠️ MODO: ATUALIZAR BRIEFING — O consultor esta COMPLEMENTANDO ou CORRIGINDO um briefing existente. Retorne o valor FINAL DESEJADO de cada campo que precisa mudar. Para arrays (destinos): se diz tambem quer X, retorne lista COMPLETA com existentes + X. Se diz nao e mais Y agora e Z, retorne lista SEM Y e COM Z. Se NAO menciona um campo, NAO o inclua.' }}

{{ $json.mode !== 'novo' && $json.briefing_anterior ? '## BRIEFING ANTERIOR\\n' + $json.briefing_anterior : '' }}

{{ $json.mode !== 'novo' ? 'Campos ja preenchidos:\\n' + JSON.stringify($json.campos_atuais, null, 2) : '' }}

---

# TAREFA 1: BRIEFING (campo "briefing_text")

{{ $json.mode === 'novo' ? 'Gere um resumo executivo e profissional do que foi relatado pelo consultor.' : 'Gere um resumo executivo e profissional ATUALIZADO que incorpore tanto o briefing anterior quanto as novas informacoes deste audio. O resultado deve ser um texto unico e coeso.' }}

**Regras do briefing:**
- Escreva em terceira pessoa e tom profissional: "O cliente deseja...", "O casal planeja..."
- Organize por temas: perfil do viajante, destino, época/duração, orçamento, preferências, restrições
- Inclua TODOS os detalhes relevantes mencionados, sem omitir nada importante
- Limpe repetições e hesitações típicas de fala transcrita, mas preserve toda a informação
- Se o consultor mencionou ações pendentes ("preciso enviar proposta", "vou agendar reunião"), registre como "Próximos Passos" no final
- Máximo 600 palavras
- NÃO invente informações que o consultor não mencionou

# TAREFA 2: CAMPOS ESTRUTURADOS

Extraia dados para os campos disponíveis abaixo. Lembre-se: o consultor está RELATANDO o que o cliente disse.

**Exemplos de interpretação:**
- Consultor: "Ele quer ir pra Itália" → destinos: ["Itália"]
- Consultor: "Orçamento deles é uns 50 mil" → orcamento: 50000
- Consultor: "Entre 80 e 100 mil de orçamento" → orcamento: {"min": 80000, "max": 100000}
- Consultor: "Uns 15 mil por pessoa" → orcamento: {"por_pessoa": 15000}
- Consultor: "Viagem de 7 a 10 dias" → duracao_viagem: {"min": 7, "max": 10}
- Consultor: "São 4 pessoas, o casal e dois filhos" → quantidade_viajantes: 4
- Consultor: "Querem ir em setembro ou outubro" → epoca_viagem: "setembro-outubro"
- Consultor: "Ela é vegetariana" → restricoes_alimentares: "vegetariana"
- Consultor: "É a primeira viagem internacional deles" → observação relevante

## CAMPOS DISPONÍVEIS
{{ $json.field_definitions }}

# REGRAS DE EXTRAÇÃO
1. APENAS informações explicitamente mencionadas na transcrição
2. NÃO INVENTE ou INFIRA informações não ditas
3. Se ambíguo, NÃO inclua
4. Respeite formatos e valores permitidos
{{ $json.mode === 'novo' ? '5. Extraia TODOS os campos mencionados na transcricao, independente de dados anteriores' : '5. Se o campo ja tem valor preenchido e a transcricao traz o MESMO dado, NAO repita. Mas se traz dado DIFERENTE, ATUALIZE. Para arrays: retorne a lista FINAL COMPLETA (existentes + novos, ou existentes - removidos + novos)' }}
6. Transcrições de áudio podem ter erros — use bom senso para nomes de destinos
7. Para FAIXAS de valor ("entre 80 e 100 mil"), retorne {"min": 80000, "max": 100000}. Para valor POR PESSOA ("15 mil por pessoa"), retorne {"por_pessoa": 15000}. Para valor único total ("uns 50 mil"), retorne número: 50000
8. Para FAIXAS de duração ("7 a 10 dias"), retorne objeto {"min": 7, "max": 10}. Para valor fixo ("10 dias"), retorne número: 10

# FORMATO DE SAÍDA (JSON estrito)
{
  "briefing_text": "Texto do briefing aqui...",
  "campos": {
    "campo_key": "valor extraído",
    ...somente campos com dados novos
  }
}

RETORNE APENAS o JSON. Sem texto, sem markdown, sem explicações.`,
        options: {
          systemMessage: SYSTEM_PROMPT
        }
      },
      name: '7. AI Briefing',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 2.2,
      position: [2210, 300]
    },

    // 7b. LLM: GPT-5.1
    {
      parameters: {
        model: { __rl: true, value: 'gpt-5.1', mode: 'list', cachedResultName: 'gpt-5.1' },
        options: {
          responseFormat: 'json_object',
          temperature: 0.1
        }
      },
      name: 'GPT-5.1',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.2,
      position: [2210, 520],
      credentials: { openAiApi: OPENAI_CREDENTIAL }
    },

    // 8. Code: Valida Output
    {
      parameters: {
        jsCode: CODE_VALIDA_OUTPUT,
        options: {}
      },
      name: '8. Valida Output',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2470, 300]
    },

    // 9. If: Tem Atualização?
    {
      parameters: {
        conditions: {
          boolean: [
            { value1: '={{ $json.tem_atualizacao }}', value2: true }
          ]
        }
      },
      name: '9. Tem Atualização?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [2730, 300]
    },

    // 10. HTTP Request: Busca produto_data (true branch)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $('8. Valida Output').item.json.card_id }}&select=produto_data,briefing_inicial,locked_fields,pipeline_stages(fase)`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '10. Busca produto_data',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2990, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 11. Code: Merge Dados
    {
      parameters: {
        jsCode: CODE_MERGE_DADOS,
        options: {}
      },
      name: '11. Merge Dados',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3250, 200]
    },

    // 12. HTTP Request: Atualiza Card (RPC)
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
      position: [3510, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 13. HTTP Request: Log Activity
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
          tipo: 'briefing_ia',
          descricao: 'Briefing IA gerado via áudio do consultor (' + Object.keys($('11. Merge Dados').item.json.campos_atualizados || {}).length + ' campos)',
          metadata: {
            campos_extraidos: Object.keys($('11. Merge Dados').item.json.campos_atualizados || {}),
            briefing_length: ($('11. Merge Dados').item.json.briefing_text || '').length,
            source: 'briefing_ia_audio',
            mode: $('6. Monta Contexto').item.json.mode || 'atualizar'
          },
          created_by: $('8. Valida Output').item.json.user_id
        }) }}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Prefer', value: 'return=minimal' }
          ]
        },
        options: {}
      },
      name: '13. Log Activity',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3770, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 14. Code: Sucesso
    {
      parameters: {
        jsCode: CODE_SUCESSO,
        options: {}
      },
      name: '14. Sucesso',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [4030, 200]
    },

    // 15. Code: Sem Atualização (false branch)
    {
      parameters: {
        jsCode: CODE_SEM_ATUALIZACAO,
        options: {}
      },
      name: '15. Sem Atualização',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2990, 480]
    }
  ];

  const connections = {
    'Webhook': {
      main: [[
        { node: '1. Extrai Params', type: 'main', index: 0 }
      ]]
    },
    '1. Extrai Params': {
      main: [[
        { node: '2. Prepara Audio', type: 'main', index: 0 }
      ]]
    },
    '2. Prepara Audio': {
      main: [[
        { node: '3. Whisper API', type: 'main', index: 0 }
      ]]
    },
    '3. Whisper API': {
      main: [[
        { node: '3b. Extrai Transcrição', type: 'main', index: 0 }
      ]]
    },
    '3b. Extrai Transcrição': {
      main: [[
        { node: '4. Busca Card', type: 'main', index: 0 }
      ]]
    },
    '4. Busca Card': {
      main: [[
        { node: '5. Busca Config', type: 'main', index: 0 }
      ]]
    },
    '5. Busca Config': {
      main: [[
        { node: '5b. Busca Visibilidade', type: 'main', index: 0 }
      ]]
    },
    '5b. Busca Visibilidade': {
      main: [[
        { node: '6. Monta Contexto', type: 'main', index: 0 }
      ]]
    },
    '6. Monta Contexto': {
      main: [[
        { node: '7. AI Briefing', type: 'main', index: 0 }
      ]]
    },
    '7. AI Briefing': {
      main: [[
        { node: '8. Valida Output', type: 'main', index: 0 }
      ]]
    },
    'GPT-5.1': {
      ai_languageModel: [[
        { node: '7. AI Briefing', type: 'ai_languageModel', index: 0 }
      ]]
    },
    '8. Valida Output': {
      main: [[
        { node: '9. Tem Atualização?', type: 'main', index: 0 }
      ]]
    },
    '9. Tem Atualização?': {
      main: [
        // true branch
        [{ node: '10. Busca produto_data', type: 'main', index: 0 }],
        // false branch
        [{ node: '15. Sem Atualização', type: 'main', index: 0 }]
      ]
    },
    '10. Busca produto_data': {
      main: [[
        { node: '11. Merge Dados', type: 'main', index: 0 }
      ]]
    },
    '11. Merge Dados': {
      main: [[
        { node: '12. Atualiza Card', type: 'main', index: 0 }
      ]]
    },
    '12. Atualiza Card': {
      main: [[
        { node: '13. Log Activity', type: 'main', index: 0 }
      ]]
    },
    '13. Log Activity': {
      main: [[
        { node: '14. Sucesso', type: 'main', index: 0 }
      ]]
    }
  };

  return {
    name: 'Welcome CRM - Briefing IA',
    nodes,
    connections,
    settings: {
      executionOrder: 'v1'
    }
  };
}

// ============================================================================
// DEPLOY
// ============================================================================

async function main() {
  const workflow = buildWorkflow();

  console.log(`📝 Atualizando workflow "${workflow.name}" (ID: ${TARGET_WORKFLOW_ID})...`);

  let result;

  // Try to update existing workflow by fixed ID
  const updateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${TARGET_WORKFLOW_ID}`, {
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

  if (updateRes.ok) {
    result = await updateRes.json();
    console.log(`✅ Workflow atualizado: ${result.id}`);
  } else {
    console.log(`⚠️  Workflow ${TARGET_WORKFLOW_ID} não encontrado. Criando novo...`);
    const res = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflow)
    });
    result = await res.json();
    console.log(`✅ Workflow criado: ${result.id}`);
    console.log(`⚠️  ATENÇÃO: Novo ID gerado. Atualize TARGET_WORKFLOW_ID no script e CLAUDE.md`);
  }

  // Activate
  const workflowId = result.id;
  if (workflowId) {
    const activateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}/activate`, {
      method: 'POST',
      headers: { 'x-n8n-api-key': API_KEY }
    });
    const activateData = await activateRes.json();
    console.log(`⚡ Workflow ${activateData.active ? 'ativado' : 'inativo'}`);
    console.log(`\n🔗 Webhook URL: ${N8N_API_URL}/webhook/briefing-ia`);
    console.log(`📋 Editor: ${N8N_API_URL}/workflow/${workflowId}`);
  }

  console.log('\n📌 Pré-requisitos:');
  console.log('   1. Credential "WelcomeSupabase" (supabaseApi) configurada');
  console.log('   2. Credential "Vitor TESTE" (openAiApi) configurada (usado para Whisper API + Agent GPT-5.1)');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
