#!/usr/bin/env node
/**
 * Update "Welcome CRM - Atualizador Campos" workflow in n8n
 *
 * Fix: Process media (audio transcription, image analysis, document extraction)
 * BEFORE running AI field extraction, so the extractor sees full conversation
 * context instead of "(mídia)" placeholders.
 *
 * Changes from original:
 *   1. Topology: Webhook → Processa Mídias → extraction chain (was parallel)
 *   2. Busca WhatsApp: now fetches media_content + message_type
 *   3. Monta Contexto: uses media_content when available with type prefix
 *   4. AI prompt: instructs to extract from both CLIENTE and AGENTE context
 *
 * Usage: source .env && node scripts/create-n8n-atualizador-campos.js
 */

const N8N_API_URL = 'https://n8n-n8n.ymnmx7.easypanel.host';
const API_KEY = process.env.N8N_API_KEY;
const SUPABASE_URL = 'https://szyrzxvlptqqheizyrxu.supabase.co';
const TARGET_WORKFLOW_ID = '23ejdco9jnuFB3IkazEp5';

const SUPABASE_CREDENTIAL = { id: 'SXzk2uSaw8b7BcaN', name: 'WelcomeSupabase' };
const OPENAI_CREDENTIAL = { id: 'ZLg8WpP4UNXepE8g', name: 'Vitor TESTE' };

if (!API_KEY) {
  console.error('❌ N8N_API_KEY is required.');
  console.error('Usage: source .env && node scripts/create-n8n-atualizador-campos.js');
  process.exit(1);
}

// ============================================================================
// AI PROMPT
// ============================================================================

const AI_USER_PROMPT = `# TAREFA: Atualizar CRM de agência de viagens com informações da conversa WhatsApp

## DADOS ATUAIS DO CARD
Título: {{ $json.titulo }}
Fase: {{ $json.fase }}
Campos já preenchidos:
{{ JSON.stringify($json.campos_atuais, null, 2) }}

## HISTÓRICO DA CONVERSA ({{ $json.total_mensagens }} mensagens)
{{ $json.historico_conversa }}

---

# QUEM VOCÊ É

Você é a Julia, assistente de IA da Welcome Trips — uma agência premium de viagens.
Seu trabalho: ler conversas de WhatsApp entre consultora e cliente, entender o contexto como alguém de agência de viagens entenderia, e atualizar os campos do CRM com as informações importantes.

## COMO PENSAR

Leia a conversa como uma consultora de viagens leria. Entenda:
- Para onde o cliente quer ir, quando, com quem, qual o orçamento
- O que o cliente pediu, o que a consultora confirmou, decisões tomadas
- Detalhes operacionais: seguros, vouchers, passaportes, reservas, transfers
- Preferências, medos, restrições, pedidos especiais

Se tem um campo específico para a informação (ex: "destinos", "data_exata_da_viagem"), coloque lá.
Se NÃO tem campo específico, coloque em **briefing** (sobre a viagem) ou **observacoes** (lembrete interno).

## FONTES DE INFORMAÇÃO

1. **CLIENTE** — tudo que o cliente disse é dado primário
2. **CONSULTORA** — o que a consultora diz/confirma é dado válido (ex: "seu seguro foi emitido" = seguro contratado)
3. **[Transcrição]** — áudios transcritos. LEIA COM ATENÇÃO — contêm o contexto mais rico
4. **[Imagem]/[Documento]** — descrições de mídia. Extraia dados de passaportes, reservas, itinerários
5. **TÍTULO DO CARD** — "{{ $json.titulo }}" geralmente contém destino e época. Use como referência

## REGRAS CRÍTICAS DE ATUALIZAÇÃO

### NÃO substitua — ADICIONE
- Se um campo já tem conteúdo, NÃO sobrescreva com informação equivalente ou mais pobre
- Só substitua se a informação é CLARAMENTE diferente/atualizada (ex: cliente mudou a data)
- Para campos de texto livre (briefing, observacoes): NUNCA apague o que já existe. Se precisa adicionar, inclua o texto existente + a novidade

### briefing vs observacoes
- **briefing**: sobre a VIAGEM — o que o cliente quer, destinos, roteiro, preferências, estilo de viagem, interesses
- **observacoes**: lembretes INTERNOS da consultora — "cliente tem medo de avião", "pediu para não ligar antes das 10h", "marido não sabe da surpresa", "atenção: passaporte vence em set/2026"

### Destinos — regra especial
- **destinos**: Lugares que o cliente QUER VISITAR nesta viagem. Se o título diz "Alemanha" e a conversa confirma "Nápoles" e "Sorrento" como destinos, extraia.
  - NÃO extraia: cidade onde o cliente mora, referências/comparações, conexões sem pernoite, destinos de viagens passadas, sugestões não confirmadas
- **datas**: data mencionada pelo cliente vai em data_exata_da_viagem. Mês/época vai em epoca_viagem
- Se a informação da conversa JÁ está corretamente preenchida no campo, NÃO repita

### Postura
- Extraia tudo que é relevante para uma agência de viagens. Na dúvida, extraia.
- NÃO invente. Se não está na conversa/título, não coloque.
- Se a conversa é só saudação ou não tem info útil, retorne {}

---

# CAMPOS DISPONÍVEIS (visíveis nesta etapa)

{{ (() => {
  const config = $json.field_config;
  const fields = config.fields || [];
  const sections = config.sections || {};
  let prompt = '';
  let currentSection = '';
  let fieldNum = 1;

  for (const f of fields) {
    if (f.section !== currentSection) {
      currentSection = f.section;
      const sectionLabel = sections[f.section] || f.section;
      prompt += '\\n## SEÇÃO: ' + sectionLabel + '\\n\\n';
    }

    prompt += '### ' + fieldNum + '. ' + f.key + ' (' + f.type + ')\\n';
    prompt += '**Pergunta:** ' + f.question + '\\n';
    if (f.format) prompt += '**Formato:** ' + f.format + '\\n';
    if (f.examples) prompt += '**Exemplos válidos:** ' + f.examples + '\\n';
    if (f.extract_when) prompt += '**Extrair quando:** ' + f.extract_when + '\\n';
    if (f.allowed_values && f.allowed_values.length > 0) {
      prompt += '**Valores permitidos:** ' + JSON.stringify(f.allowed_values) + '\\n';
    }
    prompt += '\\n';
    fieldNum++;
  }

  return prompt;
})() }}

---

# FORMATO DE SAÍDA

Retorne APENAS um JSON válido com os campos que devem ser ATUALIZADOS.
- NÃO inclua campos que já estão corretos — só o que é novo ou diferente
- NÃO inclua campos vazios, null ou sem informação
- Para briefing/observacoes: se já existe conteúdo, inclua o texto EXISTENTE + a novidade concatenada
- Se não há nada novo para extrair, retorne: {}`;

// ============================================================================
// NODE: Monta Contexto (updated to use media_content)
// ============================================================================

const MONTA_CONTEXTO_CODE = `// Dados do card
const cardData = $('2. Busca Card').first().json || {};
const produtoData = cardData.produto_data || {};
const briefingData = cardData.briefing_inicial || {};

// Config dinâmica de campos (v2 — filtrada por stage visibility)
const config = $('0. Busca Config').first().json;
const allFields = config.fields || [];
// Filtrar apenas campos VISÍVEIS na etapa atual
const fields = allFields.filter(f => f.is_visible !== false);

// Fase do card (SDR, Planner, Pós-venda)
const fase = cardData.pipeline_stages?.fase || 'SDR';

// Mensagens do WhatsApp
const allItems = $('3. Busca WhatsApp').all();
const messages = allItems.map(item => item.json);

if (!Array.isArray(messages) || messages.length === 0) {
  return [{
    json: {
      card_id: cardData.id,
      titulo: cardData.titulo,
      fase: fase,
      campos_atuais: {},
      historico_conversa: "(Nenhuma mensagem encontrada)",
      total_mensagens: 0,
      field_config: { ...config, fields: fields }
    }
  }];
}

const messagesChronological = [...messages].reverse();
const historico = messagesChronological.map(msg => {
  const who = msg.is_from_me ? 'AGENTE' : 'CLIENTE';
  const date = msg.created_at ? new Date(msg.created_at).toLocaleString('pt-BR') : '';

  // Use media_content with type prefix when available, fallback to body
  let content = '';
  const msgType = msg.message_type || 'text';

  if (msg.media_content && msgType !== 'text') {
    // Media was processed — use rich content
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
    // Regular text message or already-transcribed body
    content = msg.body;
  } else {
    content = '(mídia não processada)';
  }

  return '[' + date + '] ' + who + ': ' + content;
}).join('\\n');

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

// Monta campos atuais DINAMICAMENTE a partir da config
const camposAtuais = {};
for (const field of fields) {
  const source = field.section === 'trip_info' ? tripSource : obsSource;
  camposAtuais[field.key] = source[field.key] || null;
}

// Config com apenas campos visíveis (para o AI prompt)
const visibleConfig = { ...config, fields: fields };

return [{
  json: {
    card_id: cardData.id,
    titulo: cardData.titulo,
    fase: fase,
    campos_atuais: camposAtuais,
    historico_conversa: historico,
    total_mensagens: messages.length,
    field_config: visibleConfig,
    total_campos_visiveis: fields.length,
    total_campos_total: allFields.length,
    pipeline_stage_id: cardData.pipeline_stage_id
  }
}];`;

// ============================================================================
// NODE: Valida Output (unchanged)
// ============================================================================

const VALIDA_OUTPUT_CODE = `// Pega o output do AI Agent
const aiOutput = $('5. AI Extrator').first().json.output || '{}';
const config = $('4. Monta Contexto').first().json.field_config;
const fields = config.fields || [];

// Tenta parsear o JSON
let extracted = {};
try {
  let cleanOutput = aiOutput;
  if (typeof cleanOutput === 'string') {
    cleanOutput = cleanOutput.replace(/\\\`\\\`\\\`json\\n?/g, '').replace(/\\\`\\\`\\\`\\n?/g, '').trim();
    extracted = JSON.parse(cleanOutput);
  } else {
    extracted = cleanOutput;
  }
} catch (e) {
  console.log('Erro ao parsear JSON:', e.message);
  extracted = {};
}

// Validação DINÂMICA baseada na config
const fieldMap = {};
for (const f of fields) {
  fieldMap[f.key] = f;
}

const validatedOutput = {};
for (const [key, value] of Object.entries(extracted)) {
  if (value === undefined || value === null || value === '') continue;

  const fieldDef = fieldMap[key];
  if (!fieldDef) continue;

  switch (fieldDef.type) {
    case 'array':
      if (typeof value === 'string') {
        const items = value.split(/[,e]/).map(d => d.trim()).filter(d => d.length > 0);
        if (items.length > 0) validatedOutput[key] = items;
      } else if (Array.isArray(value) && value.length > 0) {
        validatedOutput[key] = value;
      }
      break;

    case 'multiselect':
      if (Array.isArray(value) && fieldDef.allowed_values) {
        const valid = value.filter(v => fieldDef.allowed_values.includes(v));
        if (valid.length > 0) validatedOutput[key] = valid;
      }
      break;

    case 'select':
      if (fieldDef.allowed_values && fieldDef.allowed_values.includes(value)) {
        validatedOutput[key] = value;
      }
      break;

    case 'number':
    case 'currency':
      const num = Number(value);
      if (!isNaN(num) && num > 0) validatedOutput[key] = num;
      break;

    case 'boolean':
      if (typeof value === 'boolean') validatedOutput[key] = value;
      break;

    case 'text':
    default:
      validatedOutput[key] = value;
      break;
  }
}

const temAtualizacao = Object.keys(validatedOutput).length > 0;

return [{
  json: {
    card_id: $('4. Monta Contexto').first().json.card_id,
    tem_atualizacao: temAtualizacao,
    campos_extraidos: validatedOutput,
    total_campos: Object.keys(validatedOutput).length,
    ai_raw_output: aiOutput,
    field_config: config
  }
}];`;

// ============================================================================
// NODE: Merge Dados (unchanged from original)
// ============================================================================

const MERGE_DADOS_CODE = `// Dados extraídos pelo AI
const camposExtraidos = $('6. Valida Output').first().json.campos_extraidos;
const cardId = $('6. Valida Output').first().json.card_id;
const config = $('6. Valida Output').first().json.field_config;
const fields = config.fields || [];
const fase = $('4. Monta Contexto').first().json.fase;

// Dados atuais do banco
const currentCard = $('8. Busca produto_data Atual').first().json;
const currentProdutoData = currentCard.produto_data || {};
const currentBriefing = currentCard.briefing_inicial || {};

// Construir mapa de seções DINAMICAMENTE
const fieldSectionMap = {};
for (const f of fields) {
  fieldSectionMap[f.key] = f.section;
}

// Separar campos extraídos por seção
const tripInfoUpdate = {};
const observacoesUpdate = {};

for (const [key, value] of Object.entries(camposExtraidos)) {
  const section = fieldSectionMap[key];
  if (section === 'trip_info') {
    tripInfoUpdate[key] = value;
  } else if (section === 'observacoes') {
    observacoesUpdate[key] = value;
  }
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
    if (value.por_pessoa) return { tipo: 'por_pessoa', valor: value.por_pessoa, display: formatCurrency(value.por_pessoa) + '/pessoa' };
    return value;
  }
  if (typeof value === 'number' && value > 0) {
    const viajantes = contextData.quantidade_viajantes || 1;
    const obj = {
      tipo: 'total',
      valor: value,
      quantidade_viajantes: viajantes,
      total_calculado: value,
      por_pessoa_calculado: Math.round(value / viajantes),
      display: formatCurrency(value)
    };
    if (viajantes > 1) {
      obj.display += ' (' + formatCurrency(Math.round(value / viajantes)) + '/pessoa)';
    }
    return obj;
  }
  return value;
}

function convertDuracao(value) {
  if (typeof value === 'object' && value !== null && value.tipo) return value;
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

function convertEpoca(value) {
  if (typeof value === 'object' && value !== null && value.tipo) return value;
  // Legacy {inicio, fim} format
  if (typeof value === 'object' && value !== null && value.inicio) {
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
  // AI returns {data_inicio, data_fim} format
  if (typeof value === 'object' && value !== null && value.data_inicio) {
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
  // AI returns {ano, mes} format (e.g. {"ano": 2026, "mes": 6})
  if (typeof value === 'object' && value !== null && value.ano && value.mes) {
    const mes = value.mes;
    return {
      tipo: 'mes',
      mes_inicio: mes,
      mes_fim: value.mes_fim || mes,
      ano: value.ano,
      display: MESES_NOMES[mes] + ' ' + value.ano,
      flexivel: value.flexivel || false
    };
  }
  // AI returns {ano, mes_inicio, mes_fim} range format
  if (typeof value === 'object' && value !== null && value.ano && value.mes_inicio) {
    return {
      tipo: value.mes_inicio === value.mes_fim ? 'mes' : 'range_meses',
      mes_inicio: value.mes_inicio,
      mes_fim: value.mes_fim || value.mes_inicio,
      ano: value.ano,
      display: value.mes_inicio === value.mes_fim
        ? MESES_NOMES[value.mes_inicio] + ' ' + value.ano
        : MESES_NOMES[value.mes_inicio] + ' a ' + MESES_NOMES[value.mes_fim] + ' ' + value.ano,
      flexivel: value.flexivel || false
    };
  }
  if (typeof value === 'string') {
    const text = value.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    const currentYear = new Date().getFullYear();

    const foundMonths = [];
    for (const [name, num] of Object.entries(MESES)) {
      const normalized = name.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
      if (text.includes(normalized)) {
        if (!foundMonths.includes(num)) foundMonths.push(num);
      }
    }
    foundMonths.sort((a, b) => a - b);

    const yearMatch = value.match(/20\\d{2}/);
    let ano = yearMatch ? parseInt(yearMatch[0]) : currentYear;
    if (!yearMatch && (text.includes('esse ano') || text.includes('este ano') || text.includes('desse ano') || text.includes('deste ano'))) {
      ano = currentYear;
    }

    const flexivel = /\\b(ou|entre|por volta|aproximadamente|mais ou menos|flexivel|flexível)\\b/.test(value.toLowerCase());

    if (foundMonths.length === 0) {
      return { tipo: 'indefinido', display: value, flexivel: true };
    }

    if (foundMonths.length === 1) {
      return {
        tipo: 'mes',
        mes_inicio: foundMonths[0],
        mes_fim: foundMonths[0],
        ano: ano,
        display: MESES_NOMES[foundMonths[0]] + ' ' + ano,
        flexivel: flexivel
      };
    }

    const minMonth = foundMonths[0];
    const maxMonth = foundMonths[foundMonths.length - 1];
    return {
      tipo: 'range_meses',
      mes_inicio: minMonth,
      mes_fim: maxMonth,
      ano: ano,
      display: MESES_NOMES[minMonth] + ' a ' + MESES_NOMES[maxMonth] + ' ' + ano,
      flexivel: flexivel
    };
  }
  return value;
}

function convertDataExata(value) {
  // Already structured with display
  if (typeof value === 'object' && value !== null && value.display) return value;
  // Object {data_inicio, data_fim} from AI
  if (typeof value === 'object' && value !== null && (value.data_inicio || value.data_fim)) {
    const inicio = value.data_inicio || value.data_fim;
    const fim = value.data_fim || value.data_inicio;
    const formatDate = (d) => {
      const parts = d.split('-');
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    };
    return {
      data_inicio: inicio,
      data_fim: fim,
      display: inicio === fim ? formatDate(inicio) : formatDate(inicio) + ' a ' + formatDate(fim)
    };
  }
  // String date "26/04/2026" or "2026-04-26"
  if (typeof value === 'string' && value.trim()) {
    // Try to detect ISO format
    const isoMatch = value.match(/(\\d{4})-(\\d{2})-(\\d{2})/);
    if (isoMatch) {
      return {
        data_inicio: value,
        data_fim: value,
        display: isoMatch[3] + '/' + isoMatch[2] + '/' + isoMatch[1]
      };
    }
    // Already in display format
    return { display: value };
  }
  return value;
}

function applyFormatConversion(data, allData) {
  const result = { ...data };
  if (result.orcamento !== undefined) {
    result.orcamento = convertOrcamento(result.orcamento, allData);
  }
  if (result.duracao_viagem !== undefined) {
    result.duracao_viagem = convertDuracao(result.duracao_viagem);
  }
  if (result.epoca_viagem !== undefined) {
    result.epoca_viagem = convertEpoca(result.epoca_viagem);
  }
  if (result.data_exata_da_viagem !== undefined) {
    result.data_exata_da_viagem = convertDataExata(result.data_exata_da_viagem);
  }
  return result;
}

// ============================================================
// SMART MERGE — preserva texto existente, só adiciona/atualiza
// ============================================================

// Campos de texto livre que devem fazer APPEND, nunca replace
const TEXT_LIBRE_KEYS = ['briefing', 'observacoes', 'observacoes_criticas', 'observacoes_pos_venda'];

// Para campos de texto livre: se já tem conteúdo, append com separador
// Para outros: só atualiza se o atual é vazio/null OU se é claramente diferente
function smartMergeField(key, newValue, currentValue, fieldType) {
  // Se não tem valor atual, sempre aceita o novo
  if (currentValue === null || currentValue === undefined || currentValue === '') {
    return newValue;
  }

  // Campos de texto livre: APPEND (nunca sobrescreve)
  if (TEXT_LIBRE_KEYS.includes(key) || fieldType === 'textarea') {
    const currentStr = typeof currentValue === 'string' ? currentValue.trim() : '';
    const newStr = typeof newValue === 'string' ? newValue.trim() : '';
    if (!newStr) return currentValue;
    if (!currentStr) return newStr;
    // Se o novo texto já está contido no atual, não duplicar
    if (currentStr.includes(newStr)) return currentValue;
    return currentStr + '\\n\\n' + newStr;
  }

  // Arrays (ex: destinos): merge sem duplicatas
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

  // Outros campos: aceita o novo (AI já foi instruída a só enviar se diferente)
  return newValue;
}

// Mapa de tipos dos campos
const fieldTypeMap = {};
for (const f of fields) {
  fieldTypeMap[f.key] = f.type;
}

let produtoDataFinal = { ...currentProdutoData };
let briefingFinal = { ...currentBriefing };

const convertedTripInfo = applyFormatConversion(tripInfoUpdate, { ...currentBriefing, ...currentProdutoData, ...tripInfoUpdate });

if (fase === 'SDR') {
  // Smart merge trip_info into briefing_inicial
  for (const [key, value] of Object.entries(convertedTripInfo)) {
    briefingFinal[key] = smartMergeField(key, value, briefingFinal[key], fieldTypeMap[key]);
  }
  // Smart merge observacoes
  const currentObs = currentBriefing.observacoes || {};
  const mergedObs = { ...currentObs };
  for (const [key, value] of Object.entries(observacoesUpdate)) {
    mergedObs[key] = smartMergeField(key, value, currentObs[key], fieldTypeMap[key]);
  }
  briefingFinal.observacoes = mergedObs;

} else if (fase === 'Planner') {
  for (const [key, value] of Object.entries(convertedTripInfo)) {
    produtoDataFinal[key] = smartMergeField(key, value, produtoDataFinal[key], fieldTypeMap[key]);
  }
  const currentObs = currentProdutoData.observacoes_criticas || {};
  const mergedObs = { ...currentObs };
  for (const [key, value] of Object.entries(observacoesUpdate)) {
    mergedObs[key] = smartMergeField(key, value, currentObs[key], fieldTypeMap[key]);
  }
  produtoDataFinal.observacoes_criticas = mergedObs;

} else if (fase === 'Pós-venda') {
  for (const [key, value] of Object.entries(convertedTripInfo)) {
    produtoDataFinal[key] = smartMergeField(key, value, produtoDataFinal[key], fieldTypeMap[key]);
  }
  const currentObs = currentProdutoData.observacoes_pos_venda || {};
  const mergedObs = { ...currentObs };
  for (const [key, value] of Object.entries(observacoesUpdate)) {
    mergedObs[key] = smartMergeField(key, value, currentObs[key], fieldTypeMap[key]);
  }
  produtoDataFinal.observacoes_pos_venda = mergedObs;
}

return [{
  json: {
    card_id: cardId,
    fase: fase,
    produto_data: produtoDataFinal,
    briefing_inicial: briefingFinal,
    campos_atualizados: Object.keys(camposExtraidos),
    trip_info_updated: Object.keys(tripInfoUpdate),
    observacoes_updated: Object.keys(observacoesUpdate)
  }
}];`;

// ============================================================================
// NODE: Sucesso (unchanged)
// ============================================================================

const SUCESSO_CODE = `const validationData = $('6. Valida Output').first().json;

return [{
  json: {
    status: 'success',
    card_id: validationData.card_id,
    campos_atualizados: $('9. Merge Dados').first().json.campos_atualizados,
    resultado_patch: $('10. Atualiza Card').first().json,
    timestamp: new Date().toISOString()
  }
}];`;

// ============================================================================
// NODE: Sem Atualização (unchanged)
// ============================================================================

const SEM_ATUALIZACAO_CODE = `return [{
  json: {
    status: 'no_update',
    message: 'Nenhuma informação nova extraída da conversa',
    card_id: $('6. Valida Output').first().json.card_id,
    ai_raw_output: $('6. Valida Output').first().json.ai_raw_output,
    timestamp: new Date().toISOString()
  }
}];`;

// ============================================================================
// WORKFLOW DEFINITION
// ============================================================================

const workflow = {
  name: 'Welcome CRM - Atualizador Campos',
  nodes: [
    // Webhook entry point
    {
      parameters: { path: 'ai-extraction', httpMethod: 'POST', responseMode: 'lastNode', options: {} },
      id: 'webhook',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 304],
      webhookId: 'ai-extraction',
    },
    // 13. Processa Mídias — NOW runs FIRST (sequential before extraction)
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/functions/v1/process-whatsapp-media`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendHeaders: true,
        headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
        sendBody: true,
        bodyParameters: { parameters: [{ name: 'card_id', value: '={{ $json.body.card_id }}' }] },
        options: {
          response: { response: { neverError: true } },
          timeout: 120000,
        },
      },
      id: 'process-media',
      name: '13. Processa Mídias',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [224, 304],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
      onError: 'continueRegularOutput',
    },
    // 0. Busca Config — runs AFTER Busca Card to get stage-aware field visibility
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/get_ai_extraction_config_v2`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ p_stage_id: $json.pipeline_stage_id }) }}',
        options: {},
      },
      id: 'busca-config',
      name: '0. Busca Config',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [896, 112],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
    },
    // 1. Dados de Teste — extracts card_id from webhook body
    {
      parameters: {
        assignments: {
          assignments: [
            { id: 'card_id', name: 'card_id', value: '={{ $("Webhook").first().json.body.card_id }}', type: 'string' },
          ],
        },
        options: {},
      },
      id: 'dados-teste',
      name: '1. Dados de Teste',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [448, 304],
    },
    // 2. Busca Card
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $json.card_id }}&select=id,titulo,produto_data,briefing_inicial,pipeline_stage_id,pipeline_stages(fase)`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {},
      },
      id: 'busca-card',
      name: '2. Busca Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [672, 304],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
    },
    // 3. Busca WhatsApp — NOW includes media_content and message_type
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/whatsapp_messages?card_id=eq.{{ $('1. Dados de Teste').item.json.card_id }}&order=created_at.desc&limit=50&select=id,body,media_content,message_type,direction,is_from_me,sender_name,created_at`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {},
      },
      id: 'busca-whatsapp',
      name: '3. Busca WhatsApp',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [896, 304],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
    },
    // 4. Monta Contexto — UPDATED to use media_content
    {
      parameters: { jsCode: MONTA_CONTEXTO_CODE },
      id: 'monta-contexto',
      name: '4. Monta Contexto',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1104, 304],
    },
    // 5. AI Extrator
    {
      parameters: {
        promptType: 'define',
        text: '=' + AI_USER_PROMPT,
        systemMessage: 'Você é a Julia, assistente de IA da Welcome Trips (agência premium de viagens). Leia conversas de WhatsApp como uma consultora de viagens leria — entenda destinos, datas, preferências, orçamentos, serviços e detalhes operacionais. Atualize campos do CRM com informações novas. NUNCA substitua informação existente por equivalente — só atualize se é claramente diferente. Para texto livre (briefing, observações), PRESERVE o conteúdo existente e adicione a novidade. Retorne sempre JSON válido.',
        options: {},
      },
      id: 'ai-extrator',
      name: '5. AI Extrator',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 2.2,
      position: [1328, 304],
    },
    // GPT-5.1 model
    {
      parameters: {
        model: { __rl: true, value: 'gpt-5.1', mode: 'list', cachedResultName: 'gpt-5.1' },
        options: { responseFormat: 'json_object', temperature: 0.3 },
      },
      id: 'gpt-model',
      name: 'GPT-5.1',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.2,
      position: [1328, 528],
      credentials: { openAiApi: OPENAI_CREDENTIAL },
    },
    // 6. Valida Output
    {
      parameters: { jsCode: VALIDA_OUTPUT_CODE },
      id: 'valida-output',
      name: '6. Valida Output',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1600, 304],
    },
    // 7. Tem Atualização?
    {
      parameters: {
        conditions: { boolean: [{ value1: '={{ $json.tem_atualizacao }}', value2: true }] },
      },
      id: 'tem-atualizacao',
      name: '7. Tem Atualização?',
      type: 'n8n-nodes-base.if',
      typeVersion: 1,
      position: [1776, 304],
    },
    // 8. Busca produto_data Atual
    {
      parameters: {
        url: `=${SUPABASE_URL}/rest/v1/cards?id=eq.{{ $json.card_id }}&select=produto_data,briefing_inicial,pipeline_stages(fase)`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {},
      },
      id: 'busca-produto-data',
      name: '8. Busca produto_data Atual',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1984, 208],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
    },
    // 9. Merge Dados
    {
      parameters: { jsCode: MERGE_DADOS_CODE },
      id: 'merge-dados',
      name: '9. Merge Dados',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2208, 208],
    },
    // 10. Atualiza Card
    {
      parameters: {
        method: 'POST',
        url: `${SUPABASE_URL}/rest/v1/rpc/update_card_from_ai_extraction`,
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ p_card_id: $json.card_id, p_produto_data: $json.produto_data, p_briefing_inicial: $json.briefing_inicial }) }}',
        options: {},
      },
      id: 'atualiza-card',
      name: '10. Atualiza Card',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2448, 208],
      credentials: { supabaseApi: SUPABASE_CREDENTIAL },
    },
    // 11. Sucesso
    {
      parameters: { jsCode: SUCESSO_CODE },
      id: 'sucesso',
      name: '11. Sucesso',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2656, 208],
    },
    // 12. Sem Atualização
    {
      parameters: { jsCode: SEM_ATUALIZACAO_CODE },
      id: 'sem-atualizacao',
      name: '12. Sem Atualização',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1984, 400],
    },
  ],
  connections: {
    // Webhook → Processa Mídias (sequential, media processed first)
    'Webhook': {
      main: [[
        { node: '13. Processa Mídias', type: 'main', index: 0 },
      ]],
    },
    // Processa Mídias → Dados de Teste (starts extraction chain AFTER media processing)
    '13. Processa Mídias': {
      main: [[
        { node: '1. Dados de Teste', type: 'main', index: 0 },
      ]],
    },
    // Dados de Teste → Busca Card
    '1. Dados de Teste': {
      main: [[{ node: '2. Busca Card', type: 'main', index: 0 }]],
    },
    // Busca Card → Busca Config (v2 with stage_id) + Busca WhatsApp (parallel)
    '2. Busca Card': {
      main: [[
        { node: '0. Busca Config', type: 'main', index: 0 },
        { node: '3. Busca WhatsApp', type: 'main', index: 0 },
      ]],
    },
    '3. Busca WhatsApp': {
      main: [[{ node: '4. Monta Contexto', type: 'main', index: 0 }]],
    },
    '4. Monta Contexto': {
      main: [[{ node: '5. AI Extrator', type: 'main', index: 0 }]],
    },
    '5. AI Extrator': {
      main: [[{ node: '6. Valida Output', type: 'main', index: 0 }]],
    },
    'GPT-5.1': {
      ai_languageModel: [[{ node: '5. AI Extrator', type: 'ai_languageModel', index: 0 }]],
    },
    '6. Valida Output': {
      main: [[{ node: '7. Tem Atualização?', type: 'main', index: 0 }]],
    },
    '7. Tem Atualização?': {
      main: [
        [{ node: '8. Busca produto_data Atual', type: 'main', index: 0 }],
        [{ node: '12. Sem Atualização', type: 'main', index: 0 }],
      ],
    },
    '8. Busca produto_data Atual': {
      main: [[{ node: '9. Merge Dados', type: 'main', index: 0 }]],
    },
    '9. Merge Dados': {
      main: [[{ node: '10. Atualiza Card', type: 'main', index: 0 }]],
    },
    '10. Atualiza Card': {
      main: [[{ node: '11. Sucesso', type: 'main', index: 0 }]],
    },
  },
  settings: {
    executionOrder: 'v1',
  },
};

// ============================================================================
// DEPLOY
// ============================================================================

async function deploy() {
  console.log('📡 Updating workflow:', TARGET_WORKFLOW_ID);

  const response = await fetch(`${N8N_API_URL}/api/v1/workflows/${TARGET_WORKFLOW_ID}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Failed to update workflow: ${response.status}`);
    console.error(errorText);
    process.exit(1);
  }

  const result = await response.json();
  console.log(`✅ Workflow updated: ${result.name}`);
  console.log(`   ID: ${result.id}`);
  console.log(`   Active: ${result.active}`);
  console.log('');
  console.log('Changes:');
  console.log('  1. Processa Mídias now runs BEFORE extraction (was parallel)');
  console.log('  2. Busca WhatsApp now fetches media_content + message_type');
  console.log('  3. Monta Contexto uses transcribed audio/image/document content');
  console.log('  4. AI prompt updated to extract from agent confirmations + media');
  console.log('  5. Busca Config now uses v2 RPC with stage_id — only visible fields extracted');
  console.log('  6. Busca Config runs AFTER Busca Card (needs pipeline_stage_id)');
}

deploy().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
