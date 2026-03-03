#!/usr/bin/env node
/**
 * Create "Welcome CRM - Transcrição Reunião" workflow in n8n
 *
 * Receives meeting transcription text, extracts CRM fields using GPT-5.1,
 * and updates the card. Reuses the same safety layers as Briefing IA:
 *   - Dynamic field config (get_ai_extraction_config)
 *   - Stage visibility filtering (stage_field_config)
 *   - Locked fields respect
 *   - RPC update (no direct PATCH)
 *   - Activity logging
 *
 * Usage: source .env && node scripts/create-n8n-transcript-workflow.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';

// Workflow ID (fixed — redeploy updates this workflow instead of creating new)
const WORKFLOW_ID = 'mhQgSQQ2MMk8KxPE';

// Credential IDs (same as Briefing IA)
const SUPABASE_CREDENTIAL = { id: 'SXzk2uSaw8b7BcaN', name: 'WelcomeSupabase' };
const OPENAI_CREDENTIAL = { id: 'ZLg8WpP4UNXepE8g', name: 'Vitor TESTE' };

if (!API_KEY) {
  console.error('❌ N8N_API_KEY is required.');
  console.error('Usage: source .env && node scripts/create-n8n-transcript-workflow.js');
  process.exit(1);
}

// ============================================================================
// AI PROMPTS
// ============================================================================

const SYSTEM_PROMPT = `Você é um assistente de CRM especializado em viagens de alto padrão, trabalhando para a Welcome Trips — uma agência premium de planejamento de viagens personalizadas.

Sua função é processar transcrições de reuniões entre consultores e clientes e transformá-las em dados estruturados para o CRM.

## REGRAS ABSOLUTAS

1. EXTRAIA APENAS informações mencionadas explicitamente pelo CLIENTE na transcrição
2. NUNCA invente ou infira informações não ditas
3. Se houver ambiguidade, NÃO inclua o campo
4. Respeite os formatos e valores permitidos de cada campo
5. Campos com dados existentes: SOMENTE atualize se trouxe informação NOVA ou DIFERENTE
6. Se o campo NÃO foi mencionado, NÃO o inclua (mantém o existente)
7. Transcrição pode ter erros de reconhecimento: "maldives" = "Maldivas", etc. Use bom senso
8. Números devem ser números puros (sem formatação)
9. Booleanos devem ser true ou false
10. Para campos select/multiselect, use APENAS os valores permitidos

## QUALIDADE
- Prefira não extrair a extrair informação duvidosa
- Se vago, não inclua
- Se houver contradição, use a informação mais recente

## SAÍDA
Responda APENAS com JSON válido. Nenhum texto antes ou depois. Sem markdown.`;

// ============================================================================
// CODE NODE SCRIPTS
// ============================================================================

const CODE_MONTA_CONTEXTO = `// Monta contexto para o AI (filtra por visibilidade do stage)
const cardData = $('2. Busca Card').first().json;
const config = $('3. Busca Config').first().json;
const webhookData = $('1. Extrai Params').first().json;

// Busca campos ocultos no stage atual
const hiddenFieldsRaw = $('3b. Busca Visibilidade').all().map(i => i.json);
const hiddenKeys = new Set(hiddenFieldsRaw.map(r => r.field_key).filter(Boolean));
console.log('[Transcript] Campos ocultos no stage: ' + (hiddenKeys.size > 0 ? [...hiddenKeys].join(', ') : '(nenhum)'));

const transcription = webhookData.transcription;
const card_id = webhookData.card_id;
const meeting_id = webhookData.meeting_id;

if (!transcription || transcription.trim().length < 50) {
  return [{
    json: {
      card_id, meeting_id,
      status: 'no_update',
      message: 'Transcrição muito curta',
      skip_ai: true
    }
  }];
}

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
  console.log('[Transcript] Removidos ' + removedCount + ' campos ocultos. Restam ' + fields.length + ' campos visíveis.');
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
const camposAtuais = {};
for (const field of fields) {
  const source = field.section === 'trip_info' ? tripSource : obsSource;
  camposAtuais[field.key] = source[field.key] || null;
}

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

// Config filtrada — passada para validação downstream
const filteredConfig = { ...config, fields };

return [{ json: {
  card_id,
  meeting_id,
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
  skip_ai: false
}}];`;

const CODE_VALIDA_OUTPUT = `// Valida e estrutura output do AI (respeita visibilidade)
const aiOutput = $('5. AI Extrator').first().json.output || '{}';
const contextData = $('4. Monta Contexto').first().json;
const config = contextData.field_config;
const card_id = contextData.card_id;
const meeting_id = contextData.meeting_id;
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
  console.log('[Transcript] Erro ao parsear JSON do AI:', e.message);
  parsed = {};
}

const briefingText = parsed.briefing_text || '';
const camposRaw = parsed.campos || parsed.extracted_fields || {};

// Validação DINÂMICA baseada na config
const fieldMap = {};
for (const f of fields) {
  fieldMap[f.key] = f;
}

const camposValidados = {};
for (const [key, value] of Object.entries(camposRaw)) {
  if (value === undefined || value === null || value === '') continue;

  // Safety net: rejeitar campos ocultos
  if (hiddenFields.has(key)) {
    console.log('[Transcript] Campo oculto rejeitado: ' + key);
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

    case 'boolean':
      if (typeof value === 'boolean') camposValidados[key] = value;
      break;

    case 'text':
    default:
      const str = String(value).trim();
      if (str.length > 0 && str.length < 5000) camposValidados[key] = str;
      break;
  }
}

const temCampos = Object.keys(camposValidados).length > 0;
const temBriefing = briefingText.length > 20;
const temAtualizacao = temCampos || temBriefing;

console.log('[Transcript] Briefing: ' + briefingText.length + ' chars, Campos: ' + Object.keys(camposValidados).length);

return [{ json: {
  card_id,
  meeting_id,
  transcription,
  briefing_text: briefingText,
  campos_extraidos: camposValidados,
  campos_extraidos_keys: Object.keys(camposValidados),
  tem_atualizacao: temAtualizacao,
  field_config: config,
  hidden_fields: [...hiddenFields],
  ai_raw_output: aiOutput
}}];`;

const CODE_MERGE_DADOS = `// Merge dados extraídos com dados atuais do card (respeita visibilidade + locked)
const validationData = $('6. Valida Output').first().json;
const camposExtraidos = validationData.campos_extraidos;
const briefingText = validationData.briefing_text;
const config = validationData.field_config;
const card_id = validationData.card_id;
const meeting_id = validationData.meeting_id;
const hiddenFields = new Set(validationData.hidden_fields || []);
const fields = config.fields || [];

const currentCard = $('8. Busca produto_data').first().json;
const currentProdutoData = currentCard.produto_data || {};
const currentBriefing = currentCard.briefing_inicial || {};
const lockedFields = currentCard.locked_fields || {};
const fase = $('4. Monta Contexto').first().json.fase;

// Construir mapa de seções DINAMICAMENTE
const fieldSectionMap = {};
for (const f of fields) {
  fieldSectionMap[f.key] = f.section;
}

// Separar campos por seção, respeitando locked_fields
const tripInfoUpdate = {};
const observacoesUpdate = {};
const camposAtualizados = {};

for (const [key, value] of Object.entries(camposExtraidos)) {
  if (lockedFields[key] === true) {
    console.log('[Transcript] Campo bloqueado, ignorando: ' + key);
    continue;
  }
  if (hiddenFields.has(key)) {
    console.log('[Transcript] Campo oculto, ignorando: ' + key);
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
    if (value.total) return { tipo: 'total', valor: value.total, display: formatCurrency(value.total) };
    if (value.por_pessoa) {
      const qtd = contextData.quantidade_viajantes || 2;
      const total = value.por_pessoa * qtd;
      return { tipo: 'por_pessoa', valor: value.por_pessoa, total_calculado: total, display: formatCurrency(value.por_pessoa) + '/pessoa' };
    }
    return value;
  }
  if (typeof value === 'number') {
    return { tipo: 'total', valor: value, display: formatCurrency(value) };
  }
  return value;
}

function convertEpoca(value) {
  if (typeof value === 'object' && value !== null && value.tipo) return value;
  if (typeof value === 'string') {
    const parts = value.toLowerCase().split(/[-–a]/);
    if (parts.length >= 2) {
      const m1 = MESES[parts[0].trim()];
      const m2 = MESES[parts[parts.length-1].trim()];
      if (m1 && m2) {
        return {
          tipo: 'range_meses',
          mes_inicio: m1, mes_fim: m2,
          ano: new Date().getFullYear(),
          display: MESES_NOMES[m1] + ' a ' + MESES_NOMES[m2]
        };
      }
    }
    const single = MESES[value.toLowerCase().trim()];
    if (single) {
      return {
        tipo: 'mes',
        mes: single,
        ano: new Date().getFullYear(),
        display: MESES_NOMES[single] + ' ' + new Date().getFullYear()
      };
    }
  }
  return value;
}

function convertDuracao(value) {
  if (typeof value === 'object' && value !== null && value.tipo) return value;
  if (typeof value === 'number') {
    return { tipo: 'fixo', dias: value, display: value + ' dias' };
  }
  if (typeof value === 'string') {
    const match = value.match(/(\\d+)/);
    if (match) {
      const dias = parseInt(match[1]);
      return { tipo: 'fixo', dias, display: dias + ' dias' };
    }
  }
  return value;
}

// Apply conversions
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
// MERGE: Deep merge com dados atuais (baseado na fase)
// ============================================================

let newProdutoData, newBriefing;

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

// Normalizar campos calculados (para relatórios)
if (tripInfoUpdate.orcamento) {
  const orc = newProdutoData.orcamento || newBriefing.orcamento;
  if (orc && typeof orc === 'object' && orc.tipo === 'total') {
    if (fase === 'SDR') {
      newBriefing.valor_estimado = orc.valor;
    } else {
      newProdutoData.valor_estimado = orc.valor;
    }
  }
}

console.log('[Transcript] Merge completo. Campos atualizados: ' + Object.keys(camposAtualizados).join(', '));

return [{ json: {
  card_id,
  meeting_id,
  produto_data: newProdutoData,
  briefing_inicial: newBriefing,
  campos_atualizados: camposAtualizados,
  briefing_text: briefingText
}}];`;

const CODE_SUCESSO = `const mergeData = $('9. Merge Dados').first().json;

return [{ json: {
  status: 'success',
  card_id: mergeData.card_id,
  meeting_id: mergeData.meeting_id,
  briefing_text: mergeData.briefing_text || '',
  campos_atualizados: mergeData.campos_atualizados,
  campos_extraidos: Object.keys(mergeData.campos_atualizados || {}),
  timestamp: new Date().toISOString()
}}];`;

const CODE_SEM_ATUALIZACAO = `const contextData = $('4. Monta Contexto').first().json;

// Check if skip_ai (too short or empty)
if (contextData.skip_ai) {
  return [{ json: {
    status: 'no_update',
    message: contextData.message || 'Transcrição insuficiente',
    card_id: contextData.card_id,
    meeting_id: contextData.meeting_id,
    campos_extraidos: [],
    timestamp: new Date().toISOString()
  }}];
}

const validationData = $('6. Valida Output').first().json;

return [{ json: {
  status: 'no_update',
  message: 'IA não encontrou informações novas na transcrição da reunião',
  card_id: validationData.card_id,
  meeting_id: validationData.meeting_id,
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
        path: 'transcript-process',
        responseMode: 'lastNode',
        options: {}
      },
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 300],
      webhookId: 'transcript-process'
    },

    // 1. Set: Extract params from webhook body
    {
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            { id: 'card_id', name: 'card_id', value: '={{ $json.body.card_id }}', type: 'string' },
            { id: 'meeting_id', name: 'meeting_id', value: '={{ $json.body.meeting_id }}', type: 'string' },
            { id: 'transcription', name: 'transcription', value: '={{ $json.body.transcription }}', type: 'string' }
          ]
        },
        options: {}
      },
      name: '1. Extrai Params',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [260, 300]
    },

    // 2. HTTP Request: Busca Card (with stage join for fase detection)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $json.card_id }}&select=id,titulo,produto_data,briefing_inicial,pipeline_stage_id,locked_fields,pipeline_stages(fase,nome)`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '2. Busca Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [520, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 3. HTTP Request: Busca Config (dynamic field definitions)
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/get_ai_extraction_config`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '3. Busca Config',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [780, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 3b. HTTP Request: Busca campos ocultos no stage do card
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/stage_field_config?stage_id=eq.{{ $('2. Busca Card').item.json.pipeline_stage_id }}&is_visible=eq.false&select=field_key`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '3b. Busca Visibilidade',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1040, 300],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 4. Code: Monta Contexto (filters visible fields, builds prompt data)
    {
      parameters: {
        jsCode: CODE_MONTA_CONTEXTO,
        options: {}
      },
      name: '4. Monta Contexto',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1300, 300]
    },

    // 5. Agent: AI Extrator (GPT-5.1 with meeting transcription prompt)
    {
      parameters: {
        promptType: 'define',
        text: `=# CONTEXTO

Esta é uma transcrição de uma REUNIÃO DE VENDAS entre um consultor da Welcome Trips e um cliente potencial.
Identifique quem é o consultor (da Welcome Trips / agência) e quem é o cliente.
Extraia informações que o **CLIENTE** mencionou sobre sua viagem.

## TRANSCRIÇÃO DA REUNIÃO
"""
{{ $json.transcription }}
"""

## DADOS ATUAIS DO CARD
Título: {{ $json.titulo }}
Fase do Pipeline: {{ $json.fase }} (Etapa: {{ $json.stage_name }})
Seção de dados: {{ $json.section_info.obsLabel }}

⚠️ REGRA DE FASE: Este card está na fase **{{ $json.fase }}**. Apenas os campos listados abaixo estão HABILITADOS para este estágio — NÃO extraia campos que não estão na lista.

Campos já preenchidos:
{{ JSON.stringify($json.campos_atuais, null, 2) }}

---

# TAREFA 1: BRIEFING (campo "briefing_text")

Gere um resumo executivo e profissional da reunião.

**Regras do briefing:**
- Escreva em terceira pessoa e tom profissional: "O cliente deseja...", "A cliente planeja..."
- Organize por temas: perfil do viajante, destino, época/duração, orçamento, preferências, restrições
- Seja CONCISO: máximo 200 palavras. O briefing é um RESUMO rápido, não um relatório detalhado
- Se houver próximos passos, liste em uma frase
- NÃO invente informações que não foram mencionadas
- IMPORTANTE: Priorize CAMPOS ESTRUTURADOS (Tarefa 2) sobre o briefing. Os campos são o objetivo principal

# TAREFA 2: CAMPOS ESTRUTURADOS

Extraia dados para os campos disponíveis abaixo. Foque nas informações do CLIENTE.

**Exemplos de interpretação:**
- Cliente: "Quero ir pra Itália" → destinos: ["Itália"]
- Cliente: "Nosso orçamento é uns 50 mil" → orcamento: 50000
- Cliente: "Somos 2, eu e minha amiga" → quantidade_viajantes: 2
- Cliente: "Queremos ir em maio ou junho" → epoca_viagem: "maio-junho"

## CAMPOS DISPONÍVEIS
{{ $json.field_definitions }}

# REGRAS DE EXTRAÇÃO (CRÍTICO — siga à risca)
1. APENAS informações explicitamente mencionadas pelo CLIENTE na transcrição
2. NÃO INVENTE ou INFIRA informações não ditas
3. NÃO repita dados que já estão nos "Campos já preenchidos" — extraia SOMENTE dados NOVOS desta transcrição
4. Se o cliente diz que NÃO DECIDIU algo ("não sei", "talvez", "ainda não definimos"), NÃO extraia esse campo
5. Se o cliente responde "não" a uma pergunta (ex: "tem algo especial?" → "não"), NÃO extraia o campo com uma negativa
6. Para números incertos ("2 ou 3 pessoas"), use o valor CONFIRMADO (menor/mais conservador)
7. Para faixas de valor ("entre 30 e 50 mil"), use o valor INFERIOR da faixa
8. Respeite formatos e valores permitidos dos campos
9. Transcrição pode ter erros de reconhecimento — use bom senso para nomes de destinos
10. Sugestões do CONSULTOR ("já pensou em Itália?") NÃO contam como escolha do cliente

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
      name: '5. AI Extrator',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 2.2,
      position: [1560, 300]
    },

    // 5b. LLM: GPT-5.1
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
      position: [1560, 520],
      credentials: { openAiApi: OPENAI_CREDENTIAL }
    },

    // 6. Code: Valida Output
    {
      parameters: {
        jsCode: CODE_VALIDA_OUTPUT,
        options: {}
      },
      name: '6. Valida Output',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1820, 300]
    },

    // 7. If: Tem Atualização?
    {
      parameters: {
        conditions: {
          boolean: [
            { value1: '={{ $json.tem_atualizacao }}', value2: true }
          ]
        }
      },
      name: '7. Tem Atualização?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [2080, 300]
    },

    // 8. HTTP Request: Busca produto_data (true branch - refetch for merge)
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $('6. Valida Output').item.json.card_id }}&select=produto_data,briefing_inicial,locked_fields,pipeline_stages(fase)`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {}
      },
      name: '8. Busca produto_data',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2340, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 9. Code: Merge Dados
    {
      parameters: {
        jsCode: CODE_MERGE_DADOS,
        options: {}
      },
      name: '9. Merge Dados',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2600, 200]
    },

    // 10. HTTP Request: Atualiza Card (via RPC — no outbound sync trigger)
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
      name: '10. Atualiza Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2860, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 11. HTTP Request: Atualiza transcricao_metadata na tarefa
    {
      parameters: {
        method: 'PATCH',
        url: `=${SUPABASE_URL}/rest/v1/tarefas?id=eq.{{ $('9. Merge Dados').item.json.meeting_id }}`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ transcricao_metadata: { processed_at: new Date().toISOString(), campos_extraidos: Object.keys($('9. Merge Dados').item.json.campos_atualizados || {}) } }) }}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Prefer', value: 'return=minimal' }
          ]
        },
        options: {}
      },
      name: '11. Atualiza Metadata Tarefa',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3120, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 12. HTTP Request: Log Activity
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/activities`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
          card_id: $('9. Merge Dados').item.json.card_id,
          tipo: 'briefing_ia',
          descricao: 'Campos extraídos da transcrição de reunião (' + Object.keys($('9. Merge Dados').item.json.campos_atualizados || {}).length + ' campos)',
          metadata: {
            campos_extraidos: Object.keys($('9. Merge Dados').item.json.campos_atualizados || {}),
            briefing_length: ($('9. Merge Dados').item.json.briefing_text || '').length,
            meeting_id: $('9. Merge Dados').item.json.meeting_id,
            source: 'meeting_transcription'
          }
        }) }}`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Prefer', value: 'return=minimal' }
          ]
        },
        options: {}
      },
      name: '12. Log Activity',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3380, 200],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL }
    },

    // 13. Code: Sucesso
    {
      parameters: {
        jsCode: CODE_SUCESSO,
        options: {}
      },
      name: '13. Sucesso',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3640, 200]
    },

    // 14. Code: Sem Atualização (false branch)
    {
      parameters: {
        jsCode: CODE_SEM_ATUALIZACAO,
        options: {}
      },
      name: '14. Sem Atualização',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2340, 480]
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
        { node: '2. Busca Card', type: 'main', index: 0 }
      ]]
    },
    '2. Busca Card': {
      main: [[
        { node: '3. Busca Config', type: 'main', index: 0 }
      ]]
    },
    '3. Busca Config': {
      main: [[
        { node: '3b. Busca Visibilidade', type: 'main', index: 0 }
      ]]
    },
    '3b. Busca Visibilidade': {
      main: [[
        { node: '4. Monta Contexto', type: 'main', index: 0 }
      ]]
    },
    '4. Monta Contexto': {
      main: [[
        { node: '5. AI Extrator', type: 'main', index: 0 }
      ]]
    },
    '5. AI Extrator': {
      main: [[
        { node: '6. Valida Output', type: 'main', index: 0 }
      ]]
    },
    'GPT-5.1': {
      ai_languageModel: [[
        { node: '5. AI Extrator', type: 'ai_languageModel', index: 0 }
      ]]
    },
    '6. Valida Output': {
      main: [[
        { node: '7. Tem Atualização?', type: 'main', index: 0 }
      ]]
    },
    '7. Tem Atualização?': {
      main: [
        // true branch
        [{ node: '8. Busca produto_data', type: 'main', index: 0 }],
        // false branch
        [{ node: '14. Sem Atualização', type: 'main', index: 0 }]
      ]
    },
    '8. Busca produto_data': {
      main: [[
        { node: '9. Merge Dados', type: 'main', index: 0 }
      ]]
    },
    '9. Merge Dados': {
      main: [[
        { node: '10. Atualiza Card', type: 'main', index: 0 }
      ]]
    },
    '10. Atualiza Card': {
      main: [[
        { node: '11. Atualiza Metadata Tarefa', type: 'main', index: 0 }
      ]]
    },
    '11. Atualiza Metadata Tarefa': {
      main: [[
        { node: '12. Log Activity', type: 'main', index: 0 }
      ]]
    },
    '12. Log Activity': {
      main: [[
        { node: '13. Sucesso', type: 'main', index: 0 }
      ]]
    }
  };

  return {
    name: 'Welcome CRM - Transcrição Reunião',
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
  let result;

  // Try to update existing workflow by fixed ID first
  console.log(`📝 Atualizando workflow ${WORKFLOW_ID}...`);
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

  if (updateRes.ok) {
    result = await updateRes.json();
    console.log(`✅ Workflow atualizado: ${result.id}`);
  } else {
    // Workflow doesn't exist (deleted?) — create new
    console.log(`⚠️  Workflow ${WORKFLOW_ID} não encontrado. Criando novo...`);
    const createRes = await fetch(`${N8N_API_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflow)
    });
    result = await createRes.json();
    console.log(`✅ Workflow criado: ${result.id}`);
    console.log(`⚠️  ATENÇÃO: Novo ID gerado. Atualize WORKFLOW_ID no script e CLAUDE.md`);
  }

  // Activate
  const workflowId = result.id || target?.id;
  if (workflowId) {
    const activateRes = await fetch(`${N8N_API_URL}/api/v1/workflows/${workflowId}/activate`, {
      method: 'POST',
      headers: { 'x-n8n-api-key': API_KEY }
    });
    const activateData = await activateRes.json();
    console.log(`⚡ Workflow ${activateData.active ? 'ativado' : 'inativo'}`);
    console.log(`\n🔗 Webhook URL: ${N8N_API_URL}/webhook/transcript-process`);
    console.log(`📋 Editor: ${N8N_API_URL}/workflow/${workflowId}`);
  }

  console.log('\n📌 Pré-requisitos:');
  console.log('   1. Credential "WelcomeSupabase" (supabaseApi) configurada');
  console.log('   2. Credential "Vitor TESTE" (openAiApi) para GPT-5.1');
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
